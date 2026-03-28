"""Run Opik prompt evaluation and optimization for grocery-list generation.

Environment variables:
  OPIK_API_KEY             Required for Opik API access.
  OPIK_WORKSPACE           Optional, defaults to "recipe-generation".
  OPIK_GROCERY_DATASET     Optional, defaults to "Grocery List".
  OPIK_GROCERY_PROMPT      Optional, Opik prompt name for baseline (default: "Grocery List").
  OPIK_GROCERY_MODEL       Optional, defaults to "openrouter/meta-llama/llama-3.2-3b-instruct".
  OPIK_GROCERY_CANDIDATE   Optional candidate prompt text for comparison.
  OPENROUTER_API_KEY       Required when using an "openrouter/" model.
  OPIK_LITELLM_TIMEOUT     Optional per-request timeout seconds for OpenRouter (default: 180).
  OPIK_LITELLM_NUM_RETRIES Optional LiteLLM retries for OpenRouter (default: 4).
  OPIK_META_REASONING_MODEL Optional LiteLLM model for meta-prompt generation (defaults to eval model).

  With --meta-optimize and --push-prompt-to-opik, the saved best prompt is uploaded via Opik's
  create_prompt API as a new version when the template or metadata differs from the latest.
  The upload step rewrites the local placeholder (e.g. {input_text}) to {{input.ingredients}} for Opik.
  If meta-optimize completes 0 rounds, Opik upload is skipped by default (use --force-opik-prompt-push to override).
"""
# pyright: reportMissingImports=false

from __future__ import annotations

import argparse
import datetime as _dt
import json
import os
import re
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import opik
from opik.evaluation import evaluate_prompt
from opik.evaluation.metrics.score_result import ScoreResult
from opik.evaluation.models import LiteLLMChatModel

REPO_ROOT = Path(__file__).resolve().parent
HELPERS_DIR = REPO_ROOT / "recipe-generation-worker" / "scripts"
if str(HELPERS_DIR) not in sys.path:
    sys.path.append(str(HELPERS_DIR))

from grocery_opik_helpers import (  # noqa: E402
    ALLOWED_CATEGORIES,
    BASELINE_PROMPT,
    canonical_similarity_score,
    duplicate_input_text_group_count,
    format_validity_score,
    generate_synthetic_items,
    no_duplicate_entries_score,
    schema_adherence_score,
    starter_dataset_items,
)

RECOMMENDED_NB_SAMPLES = 40
# OpenRouter is sensitive to concurrency; fewer trials/threads avoids long hangs and rate limits.
RECOMMENDED_TRIAL_COUNT = 2
RECOMMENDED_TASK_THREADS = 3
RECOMMENDED_TEMPERATURE = 0.1

# Opik Mustache placeholder for ingredient lines when pushing prompts (matches nested input shape).
OPIK_UPLOAD_INGREDIENTS_PLACEHOLDER = "{{input.ingredients}}"


def grocery_optimizer_composite_metric(dataset_item: dict, llm_output: str) -> float:
    """
    Single scalar for MetaPromptOptimizer (higher is better).
    Aligns with evaluate_prompt: format, schema, duplicate-free entries, reference similarity.
    """
    expected = str(
        dataset_item.get("expected_output")
        or dataset_item.get("expected_json")
        or ""
    )
    fmt = format_validity_score(llm_output)
    sch = schema_adherence_score(llm_output)
    dedupe = no_duplicate_entries_score(llm_output)
    sim = canonical_similarity_score(expected, llm_output) if expected.strip() else 0.0
    return round(0.35 * fmt + 0.35 * sch + 0.15 * dedupe + 0.15 * sim, 6)


def _normalize_prompt_for_opik_optimizer(text: str, input_key: str) -> str:
    """
    ChatPrompt substitutes `{field}` from the dataset row. Opik UI often uses
    `{{input_text}}` or `{{input.ingredients}}` — those must become a single
    `{input_key}` or substitution never runs and meta-candidates break rules.
    """
    t = text
    brace_field = re.escape(input_key)
    replacements: list[tuple[str, str]] = [
        (r"\{\{\s*input\.ingredients\s*\}\}", "{" + input_key + "}"),
        (r"\{\{\s*input\.ingredientCount\s*\}\}", "{" + input_key + "}"),
        (r"\{\{\s*" + brace_field + r"\s*\}\}", "{" + input_key + "}"),
        (r"\{\{\s*ingredient_lines\s*\}\}", "{" + input_key + "}"),
    ]
    for pattern, repl in replacements:
        t = re.sub(pattern, repl, t, flags=re.IGNORECASE)
    t = t.replace("{{ingredient_lines}}", "{" + input_key + "}")
    t = t.replace("{{" + input_key + "}}", "{" + input_key + "}")
    return t


def _sanitize_saved_meta_prompt(text: str, input_key: str) -> str:
    """Fix common bad placeholders the meta-model invents before saving."""
    return _normalize_prompt_for_opik_optimizer(text, input_key)


def _prompt_body_for_opik_mustache(text: str, input_key: str) -> str:
    """
    Local/meta files use a single-brace dataset field (e.g. {input_text}). Opik stored prompts expect
    Mustache {{input.ingredients}} for the ingredient block.
    """
    target = OPIK_UPLOAD_INGREDIENTS_PLACEHOLDER
    single = "{" + input_key + "}"
    double_key = "{{" + input_key + "}}"
    out = text
    if single in out:
        out = out.replace(single, target)
    if double_key in out and double_key != target:
        out = out.replace(double_key, target)
    out = out.replace("{{ingredient_lines}}", target)
    return out


def _push_prompt_template_to_opik(
    client: opik.Opik,
    *,
    name: str,
    template: str,
    input_key: str,
    local_path: str,
) -> Any:
    """Create a new Opik prompt version if template or metadata differs from latest."""
    mustache_body = _prompt_body_for_opik_mustache(template, input_key)
    metadata = {
        "source": "recipe-app optimize.py",
        "local_path": local_path,
        "pushed_at": _dt.datetime.now(tz=_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    return client.create_prompt(name=name, prompt=mustache_body, metadata=metadata)


def _run_meta_prompt_optimizer(
    client: opik.Opik, args: argparse.Namespace, dataset: Any, baseline_text: str
) -> int:
    try:
        from opik_optimizer import ChatPrompt, MetaPromptOptimizer
    except ImportError as exc:
        raise RuntimeError(
            "MetaPromptOptimizer requires the opik_optimizer package. "
            "Install with: pip install opik-optimizer"
        ) from exc

    user_prompt = _normalize_prompt_for_opik_optimizer(baseline_text, args.input_key)
    if "{" + args.input_key + "}" not in user_prompt:
        print(
            f"Warning: optimized prompt text has no '{{{args.input_key}}}' placeholder; "
            "MetaPromptOptimizer requires a dataset field placeholder. Check your Opik prompt."
        )

    project = os.getenv("OPIK_WORKSPACE", "recipe-generation")
    chat_prompt = ChatPrompt(
        name="grocery-list-meta",
        user=user_prompt,
        project_name=project,
        model=args.model,
        temperature=args.temperature,
    )

    reasoning = (args.reasoning_model or "").strip() or None
    optimizer = MetaPromptOptimizer(
        model=args.model,
        reasoning_model=reasoning,
        rounds=args.meta_rounds,
        num_prompts_per_round=args.meta_prompts_per_round,
        n_threads=args.meta_n_threads,
        verbose=args.eval_verbose if args.eval_verbose > 0 else 1,
        enable_context=True,
        seed=args.meta_seed,
        temperature=args.temperature,
    )

    print(
        f"\n=== MetaPromptOptimizer ===\n"
        f"Dataset: {args.dataset} | n_samples: {args.meta_n_samples} | "
        f"rounds: {args.meta_rounds} | prompts/round: {args.meta_prompts_per_round} | "
        f"threads: {args.meta_n_threads}\n"
        f"Eval model: {args.model}\n"
        f"Reasoning model: {reasoning or args.model}\n"
    )

    result = optimizer.optimize_prompt(
        prompt=chat_prompt,
        dataset=dataset,
        metric=grocery_optimizer_composite_metric,
        n_samples=args.meta_n_samples,
        experiment_config={
            "optimizer": "MetaPromptOptimizer",
            "metric": grocery_optimizer_composite_metric.__name__,
            "temperature": args.temperature,
        },
    )
    result.display()

    rounds_done = len(result.details.get("rounds", []) or [])
    if rounds_done == 0:
        ik = args.input_key
        opik_ph = OPIK_UPLOAD_INGREDIENTS_PLACEHOLDER
        print(
            f"\n*** MetaPromptOptimizer completed 0 rounds ***\n"
            "Nothing was optimized: the rewriter did not finish any round (bad JSON from the reasoning model, "
            "or every candidate failed / scored empty).\n\n"
            "What to change next (try in order):\n"
            "  1. Stronger rewriter only:  --reasoning-model openrouter/openai/gpt-4o-mini\n"
            "  2. Surface errors:  export PYTHONWARNINGS=default  and  --eval-verbose 2\n"
            "  3. Less load on the rewriter:  --meta-prompts-per-round 2\n"
            "  4. Faster scoring loop while debugging:  --meta-n-samples 10\n\n"
            f"If you pasted the prompt instead of loading from Opik, the seed must contain `{{{ik}}}` "
            f"(one brace) for ingredient lines. Opik uses `{opik_ph}`; "
            f"`--opik-prompt-name` converts that to `{{{ik}}}` on load.\n\n"
            "The script still writes a snapshot file below (usually the seed prompt), not an improved prompt.\n"
            "Opik upload is skipped when 0 rounds unless you pass --force-opik-prompt-push.\n"
        )
    elif isinstance(result.initial_score, (int, float)) and isinstance(result.score, (int, float)):
        if result.score <= result.initial_score + 1e-9:
            print(
                "\n*** MetaPromptOptimizer: no improvement over baseline ***\n"
                f"All {rounds_done} round(s) ran; no candidate scored higher than the seed prompt on "
                "grocery_optimizer_composite_metric (initial == best is normal if the Opik baseline is already strong).\n"
                "Next: add harder dataset examples, adjust metric weights in optimize.py, or edit the prompt "
                "surgically and use npm run opik:grocery:compare.\n"
            )

    out_path = Path(args.meta_output_path).expanduser()
    lines: list[str] = []
    for msg in result.prompt or []:
        if isinstance(msg, dict) and msg.get("role") == "user":
            lines.append(str(msg.get("content", "")))
    body = "\n\n".join(lines) if lines else json.dumps(result.prompt, indent=2)
    body = _sanitize_saved_meta_prompt(body, args.input_key)
    if "{" + args.input_key + "}" not in body:
        print(
            f"Warning: saved prompt still has no '{{{args.input_key}}}' placeholder after sanitization."
        )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(body, encoding="utf-8")
    if rounds_done == 0:
        print(
            f"\nSaved prompt snapshot to: {out_path.resolve()} "
            "(0 meta rounds — not an optimized prompt; use after a successful run for the real best version)."
        )
    else:
        print(f"\nSaved best prompt (user message) to: {out_path.resolve()}")

    if args.push_prompt_to_opik:
        if rounds_done == 0 and not args.force_opik_prompt_push:
            print(
                "\nSkipped Opik prompt upload: 0 optimization rounds completed. "
                "Fix the issues above and re-run with --push-prompt-to-opik, or pass "
                "--force-opik-prompt-push to upload this snapshot anyway."
            )
            return 0
        push_name = (args.opik_upload_prompt_name or "").strip() or args.opik_prompt_name
        try:
            prompt_obj = _push_prompt_template_to_opik(
                client,
                name=push_name,
                template=body,
                input_key=args.input_key,
                local_path=str(out_path.resolve()),
            )
            commit = getattr(prompt_obj, "commit", None) or "?"
            print(
                f"Uploaded new Opik prompt version for {push_name!r} "
                f"(commit={commit}). Open the prompt in Opik to review or set as default."
            )
            proj_url = getattr(client, "get_project_url", None)
            if callable(proj_url):
                try:
                    print(f"Project URL: {proj_url()}")
                except Exception:
                    pass
        except Exception as exc:
            print(f"Error: could not push prompt to Opik ({push_name!r}): {exc}")
            return 1

    return 0


@dataclass
class GroceryMetric:
    """Opik-compatible metric object with a score() method."""

    name: str

    def score(self, **kwargs: Any) -> float:
        raise NotImplementedError


class JsonFormatValidityMetric(GroceryMetric):
    def __init__(self) -> None:
        super().__init__(name="json_format_validity")

    def score(self, output: str = "", **kwargs: Any) -> ScoreResult:  # noqa: ARG002
        value = format_validity_score(output)
        return ScoreResult(name=self.name, value=value)


class GrocerySchemaAdherenceMetric(GroceryMetric):
    def __init__(self) -> None:
        super().__init__(name="grocery_schema_adherence")

    def score(self, output: str = "", **kwargs: Any) -> ScoreResult:  # noqa: ARG002
        value = schema_adherence_score(output)
        return ScoreResult(name=self.name, value=value)


class GroceryNoDuplicateEntriesMetric(GroceryMetric):
    def __init__(self) -> None:
        super().__init__(name="grocery_no_duplicate_entries")

    def score(self, output: str = "", **kwargs: Any) -> ScoreResult:  # noqa: ARG002
        value = no_duplicate_entries_score(output)
        return ScoreResult(name=self.name, value=value)


class GroceryReferenceSimilarityMetric(GroceryMetric):
    def __init__(self) -> None:
        super().__init__(name="grocery_reference_similarity")

    def score(
        self,
        output: str = "",
        expected_output: str = "",
        reference: str = "",
        **kwargs: Any,  # noqa: ARG002
    ) -> ScoreResult:
        ref_value = expected_output or reference
        value = canonical_similarity_score(ref_value, output)
        return ScoreResult(name=self.name, value=value)


def _require_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required env var: {name}")
    return value


def _get_dataset(client: opik.Opik, dataset_name: str):
    try:
        return client.get_or_create_dataset(dataset_name)
    except AttributeError:
        # Backward compatibility for SDK variants.
        return client.get_or_create_dataset(name=dataset_name)


def _seed_dataset(dataset: Any, overwrite: bool) -> None:
    examples = starter_dataset_items()
    if overwrite:
        try:
            dataset.clear()
        except Exception:
            # Some SDK variants do not expose clear(); best-effort only.
            pass

    records = []
    for item in examples:
        ingredients = [line.strip() for line in item["ingredient_lines"].splitlines() if line.strip()]
        records.append(
            {
                "input": {
                    "ingredientCount": len(ingredients),
                    "ingredients": ingredients,
                },
                "input_text": "\n".join(ingredients),
                "expected_output": _normalize_expected_output(item.get("expected_json")),
                "ingredient_lines": item["ingredient_lines"],
                "expected_json": _normalize_expected_output(item.get("expected_json")),
                "tags": item.get("tags", []),
            }
        )

    dataset.insert(records)


def _insert_examples(dataset: Any, items: list[dict[str, Any]]) -> int:
    records = []
    for item in items:
        ingredients = [line.strip() for line in item["ingredient_lines"].splitlines() if line.strip()]
        records.append(
            {
                "input": {
                    "ingredientCount": len(ingredients),
                    "ingredients": ingredients,
                },
                "input_text": "\n".join(ingredients),
                "expected_output": _normalize_expected_output(item.get("expected_json")),
                "ingredient_lines": item["ingredient_lines"],
                "expected_json": _normalize_expected_output(item.get("expected_json")),
                "tags": item.get("tags", []),
            }
        )
    if not records:
        return 0
    dataset.insert(records)
    return len(records)


def _normalize_ingredients_from_item(item: dict[str, Any]) -> list[str]:
    input_obj = item.get("input")
    if isinstance(input_obj, dict):
        maybe_ingredients = input_obj.get("ingredients")
        if isinstance(maybe_ingredients, list):
            return [str(v).strip() for v in maybe_ingredients if str(v).strip()]
    if isinstance(item.get("ingredients"), list):
        return [str(v).strip() for v in item["ingredients"] if str(v).strip()]
    if isinstance(item.get("ingredient_lines"), str):
        return [line.strip() for line in item["ingredient_lines"].splitlines() if line.strip()]
    if isinstance(item.get("input_text"), str):
        return [line.strip() for line in item["input_text"].splitlines() if line.strip()]
    return []


def _normalize_expected_output(value: Any) -> str:
    """Normalize expected output into category-array JSON string."""
    alias_map = {
        "Condiments & Jars": "Pantry Staples",
        "Condiments": "Pantry Staples",
        "Jars": "Pantry Staples",
        "Pantry": "Pantry Staples",
        "Meat and Seafood": "Meat & Seafood",
    }

    raw = value
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except Exception:
            return raw

    categories: list[dict[str, Any]] = []
    if isinstance(raw, list):
        categories = raw
    elif isinstance(raw, dict):
        maybe_categories = raw.get("categories")
        if isinstance(maybe_categories, list):
            categories = maybe_categories
        elif "category" in raw and "items" in raw:
            categories = [raw]

    normalized_categories: list[dict[str, Any]] = []
    for cat in categories:
        if not isinstance(cat, dict):
            continue
        label = str(cat.get("category", "")).strip()
        if not label:
            continue
        label = alias_map.get(label, label)
        if label not in ALLOWED_CATEGORIES:
            label = "Other"

        items = cat.get("items")
        if not isinstance(items, list):
            continue

        normalized_items: list[dict[str, Any]] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name", "")).strip()
            if not name:
                continue
            quantity = str(item.get("quantity", "")).strip()
            normalized_items.append(
                {
                    "name": name,
                    "quantity": quantity,
                    "isStaple": bool(item.get("isStaple", False)),
                }
            )

        if normalized_items:
            normalized_categories.append({"category": label, "items": normalized_items})

    return json.dumps(normalized_categories)


def _migrate_existing_entries(dataset: Any, update_all: bool = False) -> int:
    items = dataset.get_items()
    updates: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue

        has_input_text = isinstance(item.get("input_text"), str) and bool(item.get("input_text").strip())
        if has_input_text and not update_all:
            continue

        ingredients = _normalize_ingredients_from_item(item)
        if not ingredients:
            continue

        update_payload: dict[str, Any] = {
            "id": item.get("id"),
            "input": {
                "ingredientCount": len(ingredients),
                "ingredients": ingredients,
            },
            "input_text": "\n".join(ingredients),
        }
        expected_src = item.get("expected_output", item.get("expected_json"))
        if expected_src is not None:
            normalized_expected = _normalize_expected_output(expected_src)
            update_payload["expected_output"] = normalized_expected
            update_payload["expected_json"] = normalized_expected
        for passthrough in ("expected_output", "expected_json", "ingredient_lines", "tags"):
            if passthrough in item and passthrough not in update_payload:
                update_payload[passthrough] = item[passthrough]
        updates.append(update_payload)

    if not updates:
        return 0
    dataset.insert(updates)
    return len(updates)


def _validate_dataset(dataset: Any, max_examples: int = 10) -> dict[str, Any]:
    """Validate existing dataset rows and return summary stats."""
    items = dataset.get_items()
    total = len(items)
    missing_input_text = 0
    invalid_expected = 0
    invalid_categories = 0
    empty_items = 0
    bad_row_ids: list[str] = []
    input_keys: list[str] = []

    for row in items:
        if not isinstance(row, dict):
            continue

        row_id = str(row.get("id", "unknown"))
        input_keys.extend(list(row.keys()))
        input_text = row.get("input_text")
        if not isinstance(input_text, str) or not input_text.strip():
            missing_input_text += 1
            if len(bad_row_ids) < max_examples:
                bad_row_ids.append(row_id)

        expected_src = row.get("expected_output", row.get("expected_json"))
        normalized = _normalize_expected_output(expected_src)
        try:
            parsed = json.loads(normalized)
        except Exception:
            invalid_expected += 1
            if len(bad_row_ids) < max_examples:
                bad_row_ids.append(row_id)
            continue

        if not isinstance(parsed, list):
            invalid_expected += 1
            if len(bad_row_ids) < max_examples:
                bad_row_ids.append(row_id)
            continue

        for cat in parsed:
            if not isinstance(cat, dict):
                invalid_expected += 1
                if len(bad_row_ids) < max_examples:
                    bad_row_ids.append(row_id)
                break
            label = str(cat.get("category", "")).strip()
            if label not in ALLOWED_CATEGORIES:
                invalid_categories += 1
                if len(bad_row_ids) < max_examples:
                    bad_row_ids.append(row_id)
            items_list = cat.get("items")
            if not isinstance(items_list, list) or len(items_list) == 0:
                empty_items += 1
                if len(bad_row_ids) < max_examples:
                    bad_row_ids.append(row_id)

    duplicate_input_text = duplicate_input_text_group_count(items)
    most_common_keys = [k for k, _ in Counter(input_keys).most_common(8)]

    return {
        "total_rows": total,
        "missing_input_text": missing_input_text,
        "invalid_expected_json": invalid_expected,
        "invalid_categories": invalid_categories,
        "empty_category_items": empty_items,
        "duplicate_input_text_groups": duplicate_input_text,
        "sample_problem_row_ids": bad_row_ids[:max_examples],
        "top_row_keys": most_common_keys,
    }


def _build_eval_model(
    model_name: str,
    litellm_timeout: float,
    litellm_num_retries: int,
) -> Any:
    """Use LiteLLM with explicit timeout/retries for OpenRouter to avoid long stalls."""
    if model_name.startswith("openrouter/"):
        return LiteLLMChatModel(
            model_name=model_name,
            timeout=litellm_timeout,
            num_retries=litellm_num_retries,
        )
    return model_name


def _eval_scope_label(nb_samples: int | None, trial_count: int) -> str:
    if nb_samples is None:
        return f"all dataset rows × {trial_count} trials each"
    return f"{nb_samples} rows × {trial_count} trials each (~{nb_samples * trial_count} LLM calls per phase)"


def _run_experiment(
    dataset: Any,
    prompt_content: str,
    model: Any,
    experiment_name: str,
    nb_samples: int | None,
    trial_count: int,
    task_threads: int,
    temperature: float,
    verbose: int,
) -> Any:
    return evaluate_prompt(
        dataset=dataset,
        messages=[{"role": "user", "content": prompt_content}],
        model=model,
        scoring_metrics=[
            JsonFormatValidityMetric(),
            GrocerySchemaAdherenceMetric(),
            GroceryNoDuplicateEntriesMetric(),
            GroceryReferenceSimilarityMetric(),
        ],
        experiment_name=experiment_name,
        nb_samples=nb_samples,
        trial_count=trial_count,
        task_threads=task_threads,
        experiment_config={"temperature": temperature},
        verbose=verbose,
    )


def _extract_prompt_content(prompt_obj: Any) -> str:
    """Best-effort extraction of prompt text from Opik prompt objects."""
    if prompt_obj is None:
        return ""
    if isinstance(prompt_obj, str):
        return prompt_obj

    # SDK prompt class may expose get_messages() -> list[{role, content}]
    get_messages = getattr(prompt_obj, "get_messages", None)
    if callable(get_messages):
        try:
            messages = get_messages()
            if isinstance(messages, list):
                for msg in messages:
                    if isinstance(msg, dict) and msg.get("role") == "user" and isinstance(msg.get("content"), str):
                        return msg["content"]
                if messages and isinstance(messages[0], dict) and isinstance(messages[0].get("content"), str):
                    return messages[0]["content"]
        except Exception:
            pass

    # REST style dictionary/object fallbacks
    if isinstance(prompt_obj, dict):
        for key in ("prompt", "content", "template"):
            value = prompt_obj.get(key)
            if isinstance(value, str) and value.strip():
                return value
        messages = prompt_obj.get("messages")
        if isinstance(messages, list):
            for msg in messages:
                if isinstance(msg, dict) and msg.get("role") == "user" and isinstance(msg.get("content"), str):
                    return msg["content"]

    for key in ("prompt", "content", "template", "text"):
        value = getattr(prompt_obj, key, None)
        if isinstance(value, str) and value.strip():
            return value
    return ""


def _load_baseline_prompt_from_opik(client: opik.Opik, prompt_name: str) -> str:
    """Load baseline prompt content by prompt name from Opik."""
    # High-level SDK path if available.
    get_prompt = getattr(client, "get_prompt", None)
    if callable(get_prompt):
        try:
            prompt_obj = get_prompt(prompt_name)
            content = _extract_prompt_content(prompt_obj)
            if content:
                return content
        except Exception:
            pass

    # REST client fallback.
    rest_client = getattr(client, "rest_client", None)
    prompts_client = getattr(rest_client, "prompts", None) if rest_client else None
    get_prompts = getattr(prompts_client, "get_prompts", None) if prompts_client else None
    if callable(get_prompts):
        try:
            page = get_prompts(name=prompt_name)
            rows = getattr(page, "data", None)
            if rows is None and isinstance(page, dict):
                rows = page.get("data")
            if isinstance(rows, list):
                for row in rows:
                    content = _extract_prompt_content(row)
                    if content:
                        return content
        except Exception:
            pass
    return ""


def _coerce_aggregate_scores(experiment_result: Any) -> dict[str, float]:
    """Best-effort extraction for varied Opik SDK return types."""
    if experiment_result is None:
        return {}

    if isinstance(experiment_result, dict):
        for key in ("aggregate_scores", "scores", "metrics"):
            if key in experiment_result and isinstance(experiment_result[key], dict):
                return {
                    str(k): float(v)
                    for k, v in experiment_result[key].items()
                    if isinstance(v, (int, float))
                }

    for attr in ("aggregate_scores", "scores", "metrics"):
        value = getattr(experiment_result, attr, None)
        if isinstance(value, dict):
            return {str(k): float(v) for k, v in value.items() if isinstance(v, (int, float))}

    # Opik EvaluationResult: aggregate_evaluation_scores() -> aggregated_scores[name].mean
    agg_fn = getattr(experiment_result, "aggregate_evaluation_scores", None)
    if callable(agg_fn):
        try:
            view = agg_fn()
            raw = getattr(view, "aggregated_scores", None)
            if isinstance(raw, dict):
                out: dict[str, float] = {}
                for name, stats in raw.items():
                    mean_val = getattr(stats, "mean", None)
                    if isinstance(mean_val, (int, float)):
                        out[str(name)] = float(mean_val)
                if out:
                    return out
        except Exception:
            pass

    return {}


def _print_delta(base_scores: dict[str, float], candidate_scores: dict[str, float]) -> None:
    keys = sorted(set(base_scores.keys()) | set(candidate_scores.keys()))
    if not keys:
        print("No aggregate metric deltas available from SDK result object.")
        return

    print("\n=== Aggregate Metric Deltas (candidate - baseline) ===")
    for key in keys:
        base = base_scores.get(key, 0.0)
        cand = candidate_scores.get(key, 0.0)
        delta = cand - base
        print(f"- {key}: baseline={base:.4f}, candidate={cand:.4f}, delta={delta:+.4f}")


def _print_prompt_recommendation(
    base_scores: dict[str, float],
    cand_scores: dict[str, float],
    baseline_label: str,
    candidate_label: str,
) -> None:
    """
    Pick a winner using lexicographic order: json_format_validity, then
    grocery_schema_adherence, then grocery_no_duplicate_entries, then
    grocery_reference_similarity (weak tie-breaker).
    """
    if not base_scores and not cand_scores:
        print(
            "\n=== Recommendation ===\n"
            "Could not read aggregate scores from the SDK result. "
            "Compare experiments in the Opik UI instead.\n"
        )
        return

    fmt_b = base_scores.get("json_format_validity", 0.0)
    fmt_c = cand_scores.get("json_format_validity", 0.0)
    sch_b = base_scores.get("grocery_schema_adherence", 0.0)
    sch_c = cand_scores.get("grocery_schema_adherence", 0.0)
    dedupe_b = base_scores.get("grocery_no_duplicate_entries", 0.0)
    dedupe_c = cand_scores.get("grocery_no_duplicate_entries", 0.0)
    sim_b = base_scores.get("grocery_reference_similarity", 0.0)
    sim_c = cand_scores.get("grocery_reference_similarity", 0.0)

    quad_b = (fmt_b, sch_b, dedupe_b, sim_b)
    quad_c = (fmt_c, sch_c, dedupe_c, sim_c)

    print(
        "\n=== Recommendation (higher is better; order: format, schema, no-duplicate-entries, ref-similarity) ==="
    )
    print(f"Baseline  {baseline_label!r}: {quad_b}")
    print(f"Candidate {candidate_label!r}: {quad_c}")

    if quad_c > quad_b:
        print(f"\nPromote **candidate** ({candidate_label}).")
        print(
            "Next step: copy that prompt into Opik as a new version (Prompts UI) and re-run eval, "
            "or re-run meta-optimize with --push-prompt-to-opik to upload the optimized prompt."
        )
    elif quad_b > quad_c:
        print(f"\nKeep **baseline** ({baseline_label}).")
        print("Next step: iterate the candidate file and run compare again, or edit the Opik prompt directly.")
    else:
        print("\n**Tie** on aggregate metrics. Keep baseline unless you prefer candidate on manual spot-checks.")

    if fmt_c < 1.0 or sch_c < 1.0:
        print(
            "\nNote: Any prompt with format/schema below 1.0 still has systematic failures; "
            "fix those before trusting reference_similarity."
        )
    if dedupe_c < 1.0:
        print(
            "\nNote: grocery_no_duplicate_entries below 1.0 means repeated ingredient names in the model output; "
            "check deduplication in the prompt."
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate and compare grocery-list prompts with Opik.")
    parser.add_argument(
        "--dataset",
        default=os.getenv("OPIK_GROCERY_DATASET", "Grocery List"),
        help="Opik dataset name to create/update and evaluate.",
    )
    parser.add_argument(
        "--opik-prompt-name",
        default=os.getenv("OPIK_GROCERY_PROMPT", "Grocery List"),
        help="Opik baseline prompt name (default: Grocery List).",
    )
    parser.add_argument(
        "--model",
        default=os.getenv("OPIK_GROCERY_MODEL", "openrouter/meta-llama/llama-3.2-3b-instruct"),
        help="Model string for Opik evaluate_prompt.",
    )
    parser.add_argument(
        "--candidate-prompt-file",
        default="",
        help="Path to a candidate prompt file for baseline vs candidate comparison.",
    )
    parser.add_argument(
        "--input-key",
        default=os.getenv("OPIK_GROCERY_INPUT_KEY", "input_text"),
        help="Dataset field used in prompt template (default: input_text).",
    )
    parser.add_argument(
        "--seed-dataset",
        action="store_true",
        help="Insert curated starter records into the dataset before evaluation.",
    )
    parser.add_argument(
        "--overwrite-dataset",
        action="store_true",
        help="Attempt to clear dataset before seeding (best-effort).",
    )
    parser.add_argument(
        "--generate-synthetic",
        type=int,
        default=0,
        help="Generate N synthetic examples and insert into dataset.",
    )
    parser.add_argument(
        "--synthetic-seed",
        type=int,
        default=42,
        help="Random seed for synthetic example generation.",
    )
    parser.add_argument(
        "--generate-only",
        action="store_true",
        help="Only seed/generate dataset items; skip prompt evaluation runs.",
    )
    parser.add_argument(
        "--migrate-existing",
        action="store_true",
        help="Backfill input_text/input shape for existing dataset entries.",
    )
    parser.add_argument(
        "--migrate-all",
        action="store_true",
        help="When migrating, rewrite all entries (not only missing input_text).",
    )
    parser.add_argument(
        "--nb-samples",
        type=int,
        default=int(os.getenv("OPIK_GROCERY_NB_SAMPLES", str(RECOMMENDED_NB_SAMPLES))),
        help=f"Number of dataset examples per experiment (recommended: {RECOMMENDED_NB_SAMPLES}).",
    )
    parser.add_argument(
        "--trial-count",
        type=int,
        default=int(os.getenv("OPIK_GROCERY_TRIAL_COUNT", str(RECOMMENDED_TRIAL_COUNT))),
        help=f"Trials per sample to reduce variance (recommended: {RECOMMENDED_TRIAL_COUNT}).",
    )
    parser.add_argument(
        "--task-threads",
        type=int,
        default=int(os.getenv("OPIK_GROCERY_TASK_THREADS", str(RECOMMENDED_TASK_THREADS))),
        help=f"Parallel eval workers (recommended: {RECOMMENDED_TASK_THREADS}).",
    )
    parser.add_argument(
        "--temperature",
        type=float,
        default=float(os.getenv("OPIK_GROCERY_TEMPERATURE", str(RECOMMENDED_TEMPERATURE))),
        help=f"Model temperature for eval runs (recommended: {RECOMMENDED_TEMPERATURE}).",
    )
    parser.add_argument(
        "--litellm-timeout",
        type=float,
        default=float(os.getenv("OPIK_LITELLM_TIMEOUT", "180")),
        help="Per-request timeout (seconds) for OpenRouter via LiteLLM (default: 180).",
    )
    parser.add_argument(
        "--litellm-num-retries",
        type=int,
        default=int(os.getenv("OPIK_LITELLM_NUM_RETRIES", "4")),
        help="LiteLLM num_retries for OpenRouter completions (default: 4).",
    )
    parser.add_argument(
        "--fast",
        action="store_true",
        help="Set trial_count=1 for quicker runs (baseline + candidate each do one pass per row).",
    )
    parser.add_argument(
        "--eval-verbose",
        type=int,
        default=int(os.getenv("OPIK_GROCERY_EVAL_VERBOSE", "1")),
        choices=[0, 1, 2],
        help="Opik evaluate_prompt verbosity (0=silent, 1=progress, 2=more logs).",
    )
    parser.add_argument(
        "--validate-dataset",
        action="store_true",
        help="Validate dataset rows and print a quality report.",
    )
    parser.add_argument(
        "--validate-max-examples",
        type=int,
        default=10,
        help="Max row IDs to print for validation issues.",
    )
    parser.add_argument(
        "--meta-optimize",
        action="store_true",
        help="Run Opik MetaPromptOptimizer on the baseline prompt (requires opik_optimizer).",
    )
    parser.add_argument(
        "--meta-rounds",
        type=int,
        default=int(os.getenv("OPIK_META_ROUNDS", "3")),
        help="MetaPromptOptimizer rounds (default: 3).",
    )
    parser.add_argument(
        "--meta-prompts-per-round",
        type=int,
        default=int(os.getenv("OPIK_META_PROMPTS_PER_ROUND", "4")),
        help="Candidate prompts generated per round (default: 4).",
    )
    parser.add_argument(
        "--meta-n-samples",
        type=int,
        default=int(os.getenv("OPIK_META_N_SAMPLES", "20")),
        help="Dataset rows used per scoring pass during optimization (default: 20).",
    )
    parser.add_argument(
        "--meta-n-threads",
        type=int,
        default=int(os.getenv("OPIK_META_N_THREADS", "4")),
        help="Parallel threads for MetaPromptOptimizer evaluation (default: 4).",
    )
    parser.add_argument(
        "--meta-seed",
        type=int,
        default=int(os.getenv("OPIK_META_SEED", "42")),
        help="RNG seed for MetaPromptOptimizer (default: 42).",
    )
    parser.add_argument(
        "--reasoning-model",
        default=os.getenv("OPIK_META_REASONING_MODEL", ""),
        help="LiteLLM model id for prompt rewriting (default: same as --model).",
    )
    parser.add_argument(
        "--meta-output-path",
        default=os.getenv(
            "OPIK_META_OUTPUT_PATH",
            str(REPO_ROOT / "recipe-generation-worker" / "scripts" / "grocery_meta_optimized_prompt.txt"),
        ),
        help="Write best user prompt text to this file after optimization.",
    )
    parser.add_argument(
        "--push-prompt-to-opik",
        action="store_true",
        help=(
            "After --meta-optimize, upload the saved best prompt as a new Opik version "
            "(--opik-upload-prompt-name or --opik-prompt-name). Rewrites the local placeholder "
            f"to {OPIK_UPLOAD_INGREDIENTS_PLACEHOLDER!r} for Opik Mustache; "
            "a new version is created when the template or metadata differs from the latest. "
            "If meta completes 0 rounds, upload is skipped unless --force-opik-prompt-push."
        ),
    )
    parser.add_argument(
        "--force-opik-prompt-push",
        action="store_true",
        help=(
            "With --push-prompt-to-opik, upload even when MetaPromptOptimizer completed 0 rounds "
            "(publishes the saved snapshot, often the same as the seed)."
        ),
    )
    parser.add_argument(
        "--opik-upload-prompt-name",
        default=os.getenv("OPIK_UPLOAD_PROMPT_NAME", ""),
        help="Opik prompt name for upload (default: same as --opik-prompt-name).",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.push_prompt_to_opik and not args.meta_optimize:
        print("Error: --push-prompt-to-opik requires --meta-optimize.", file=sys.stderr)
        return 2
    if args.fast:
        args.trial_count = 1
        print("Fast mode: using trial_count=1 (one LLM completion per row per phase).")
    _require_env("OPIK_API_KEY")
    os.environ.setdefault("OPIK_WORKSPACE", os.getenv("OPIK_WORKSPACE", "recipe-generation"))
    if args.model.startswith("openrouter/"):
        _require_env("OPENROUTER_API_KEY")

    opik_client = opik.Opik()
    dataset = _get_dataset(opik_client, args.dataset)

    if args.seed_dataset:
        _seed_dataset(dataset, overwrite=args.overwrite_dataset)
        print(f"Seeded Opik dataset: {args.dataset}")
    if args.generate_synthetic > 0:
        synthetic_items = generate_synthetic_items(args.generate_synthetic, seed=args.synthetic_seed)
        inserted = _insert_examples(dataset, synthetic_items)
        print(f"Inserted {inserted} synthetic examples into dataset: {args.dataset}")
    if args.migrate_existing:
        updated = _migrate_existing_entries(dataset, update_all=args.migrate_all)
        print(f"Migrated {updated} existing dataset entries in: {args.dataset}")
    if args.validate_dataset:
        report = _validate_dataset(dataset, max_examples=args.validate_max_examples)
        print("Dataset validation report:")
        print(json.dumps(report, indent=2))
    if args.generate_only and not args.meta_optimize:
        return 0

    prompt_from_opik = _load_baseline_prompt_from_opik(opik_client, args.opik_prompt_name)
    baseline_prompt_raw = prompt_from_opik or BASELINE_PROMPT
    if prompt_from_opik:
        print(f"Loaded baseline prompt from Opik: {args.opik_prompt_name}")
    else:
        print(f"Using local baseline prompt (Opik prompt not found): {args.opik_prompt_name}")

    if args.meta_optimize:
        return _run_meta_prompt_optimizer(opik_client, args, dataset, baseline_prompt_raw)

    eval_model = _build_eval_model(
        args.model,
        litellm_timeout=args.litellm_timeout,
        litellm_num_retries=args.litellm_num_retries,
    )
    if args.model.startswith("openrouter/"):
        print(
            f"OpenRouter eval: timeout={args.litellm_timeout}s, "
            f"retries={args.litellm_num_retries}, threads={args.task_threads}, trials={args.trial_count}"
        )

    baseline_prompt = baseline_prompt_raw.replace("{{ingredient_lines}}", "{{" + args.input_key + "}}")

    candidate_prompt = os.getenv("OPIK_GROCERY_CANDIDATE", "").strip()
    if args.candidate_prompt_file:
        candidate_prompt = Path(args.candidate_prompt_file).read_text(encoding="utf-8").strip()
    if candidate_prompt:
        candidate_prompt = candidate_prompt.replace("{{ingredient_lines}}", "{{" + args.input_key + "}}")

    scope = _eval_scope_label(args.nb_samples, args.trial_count)
    total_phases = 2 if candidate_prompt else 1
    if candidate_prompt:
        print(
            "\nCompare mode: Opik will run TWO full evaluations (baseline, then candidate). "
            f"Each phase: {scope}. Progress bars are per trial, not per phase.\n"
        )

    print(f"\n=== Phase 1/{total_phases}: baseline ({scope}) ===\n")
    baseline_result = _run_experiment(
        dataset=dataset,
        prompt_content=baseline_prompt,
        model=eval_model,
        experiment_name="grocery-prompt-baseline",
        nb_samples=args.nb_samples,
        trial_count=args.trial_count,
        task_threads=args.task_threads,
        temperature=args.temperature,
        verbose=args.eval_verbose,
    )
    print("Completed baseline experiment: grocery-prompt-baseline")

    if not candidate_prompt:
        return 0

    print(f"\n=== Phase 2/{total_phases}: candidate ({scope}) ===\n")
    candidate_result = _run_experiment(
        dataset=dataset,
        prompt_content=candidate_prompt,
        model=eval_model,
        experiment_name="grocery-prompt-candidate",
        nb_samples=args.nb_samples,
        trial_count=args.trial_count,
        task_threads=args.task_threads,
        temperature=args.temperature,
        verbose=args.eval_verbose,
    )
    print("Completed candidate experiment: grocery-prompt-candidate")

    base_agg = _coerce_aggregate_scores(baseline_result)
    cand_agg = _coerce_aggregate_scores(candidate_result)
    _print_delta(base_scores=base_agg, candidate_scores=cand_agg)

    base_url = getattr(baseline_result, "experiment_url", None)
    cand_url = getattr(candidate_result, "experiment_url", None)
    if base_url or cand_url:
        print("\n=== Experiment links ===")
        if base_url:
            print(f"Baseline:  {base_url}")
        if cand_url:
            print(f"Candidate: {cand_url}")

    baseline_label = f'Opik prompt "{args.opik_prompt_name}"'
    candidate_label = (
        args.candidate_prompt_file.strip()
        if args.candidate_prompt_file.strip()
        else "OPIK_GROCERY_CANDIDATE"
    )
    _print_prompt_recommendation(base_agg, cand_agg, baseline_label, candidate_label)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
