"""Utilities for Opik grocery-list prompt evaluation."""

from __future__ import annotations

import json
import random
from collections import Counter
from difflib import SequenceMatcher
from typing import Any

ALLOWED_CATEGORIES = {
    "Produce",
    "Dairy",
    "Meat & Seafood",
    "Bakery",
    "Pantry Staples",
    "Frozen",
    "Beverages",
    "Other",
}


def duplicate_input_text_group_count(rows: list[dict[str, Any]]) -> int:
    """
    Count how many distinct normalized input_text values appear in more than one row.
    Normalization matches optimize.py dataset validation: strip + casefold (via lower).
    Rows without a non-empty string input_text are ignored.
    """
    seen: Counter[str] = Counter()
    for row in rows:
        if not isinstance(row, dict):
            continue
        input_text = row.get("input_text")
        if isinstance(input_text, str) and input_text.strip():
            seen[input_text.strip().lower()] += 1
    return sum(1 for _, count in seen.items() if count > 1)


BASELINE_PROMPT = """You are a grocery list aggregator. Given the raw ingredient lines below, you must:
1. Normalize ingredient names (e.g. "all-purpose flour" and "flour" are the same thing).
2. Deduplicate: merge identical or near-identical ingredients into ONE line per name (never list the same ingredient twice in the same category).
3. Sum quantities where units match: two "1 cup mayonnaise" lines must become one entry with "2 cups mayonnaise" — never output chained sums like "1 cup + 1 cup" when the unit is the same. When units differ or cannot be summed, use one clear phrase (e.g. "1 can + 2 cups").
4. Quantities must come from the ingredient lines. Do not use "not specified" or similar placeholders — if a line has no amount, use wording from that line (e.g. "as needed", "to taste") or a reasonable default from context.
5. Use each category name at most once: exactly one JSON object per category, with every item for that aisle in its "items" array (e.g. never two separate "Pantry Staples" objects).
6. Assign each ingredient to exactly one category. Allowed categories: Produce, Dairy, Meat & Seafood, Bakery, Pantry Staples, Frozen, Beverages, Other.
   - Jarred/canned condiments (salsa, mayo, ketchup, pickles, taco seasoning) → Pantry Staples unless the line explicitly says frozen.
   - Lemon juice, lime juice, vinegar, oils for cooking → Pantry Staples. Beverages is for drink products (juice cartons, soda, wine). Frozen is only for frozen goods or when the recipe clearly means the frozen product.
   - Fresh produce and fresh herbs → Produce; keep the word "fresh" in the name when the source does (e.g. "fresh cilantro").
7. Mark isStaple: true only for common household staples (salt, pepper, basic spices many homes keep, flour, sugar, baking powder/soda, soy sauce, garlic, onion, eggs, butter, common oils/vinegar).
8. Return ONLY valid JSON — no markdown fences, no explanation text before or after.

Ingredient lines:
{{ingredient_lines}}

Output ONLY this JSON structure:
[
  {
    "category": "string",
    "items": [
      { "name": "string", "quantity": "string", "isStaple": false }
    ]
  }
]"""


def _normalize_output_text(output: Any) -> str:
    if output is None:
        return ""
    if isinstance(output, str):
        return output
    try:
        return json.dumps(output, sort_keys=True)
    except Exception:
        return str(output)


def parse_categories(output: Any) -> list[dict[str, Any]] | None:
    """Parse model output into a category array, tolerating fenced JSON."""
    raw = _normalize_output_text(output).strip()
    if not raw:
        return None

    if raw.startswith("```"):
        raw = raw.replace("```json", "").replace("```", "").strip()

    parsed: Any
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        start = raw.find("[")
        end = raw.rfind("]")
        if start == -1 or end == -1 or end < start:
            return None
        try:
            parsed = json.loads(raw[start : end + 1])
        except json.JSONDecodeError:
            return None

    if isinstance(parsed, list):
        return parsed
    if isinstance(parsed, dict) and "category" in parsed and "items" in parsed:
        return [parsed]
    return None


def format_validity_score(output: Any) -> float:
    """Returns 1.0 only when JSON list parses successfully."""
    return 1.0 if parse_categories(output) is not None else 0.0


def schema_adherence_score(output: Any) -> float:
    """Checks category/item constraints from grocery-list contract."""
    categories = parse_categories(output)
    if not categories:
        return 0.0

    category_keys: set[str] = set()
    total_checks = 0
    passed_checks = 0

    for cat in categories:
        total_checks += 3
        if isinstance(cat, dict):
            if isinstance(cat.get("category"), str):
                passed_checks += 1
            if isinstance(cat.get("items"), list):
                passed_checks += 1
            if cat.get("category") in ALLOWED_CATEGORIES:
                passed_checks += 1

        label = str(cat.get("category", "")).strip().lower()
        if label:
            category_keys.add(label)

        items = cat.get("items", [])
        if not isinstance(items, list):
            continue

        for item in items:
            total_checks += 3
            if isinstance(item, dict):
                if isinstance(item.get("name"), str) and bool(item.get("name").strip()):
                    passed_checks += 1
                if isinstance(item.get("quantity"), str):
                    passed_checks += 1
                if isinstance(item.get("isStaple"), bool):
                    passed_checks += 1

    # Enforce "one object per category" rule.
    if len(category_keys) != len(categories):
        total_checks += 1
    else:
        total_checks += 1
        passed_checks += 1

    if total_checks == 0:
        return 0.0
    return round(passed_checks / total_checks, 4)


def no_duplicate_entries_score(output: Any) -> float:
    """
    How well the output avoids listing the same ingredient name more than once (globally).

    Uses normalized names (strip + lower) across all categories, matching the contract that
    each ingredient appears once. Score is (unique item rows) / (total named item rows): 1.0 when
    there are no duplicate names; lower when repeats appear. Unparseable output or no named
    items yields 0.0.
    """
    categories = parse_categories(output)
    if not categories:
        return 0.0

    seen: set[str] = set()
    total = 0
    duplicates = 0

    for cat in categories:
        if not isinstance(cat, dict):
            continue
        items = cat.get("items", [])
        if not isinstance(items, list):
            continue
        for item in items:
            if not isinstance(item, dict):
                continue
            name = item.get("name")
            if not isinstance(name, str):
                continue
            key = name.strip().lower()
            if not key:
                continue
            total += 1
            if key in seen:
                duplicates += 1
            else:
                seen.add(key)

    if total == 0:
        return 0.0
    return round((total - duplicates) / total, 4)


def canonical_similarity_score(reference_output: Any, model_output: Any) -> float:
    """String-level similarity against expected JSON."""
    ref = _normalize_output_text(reference_output)
    pred = _normalize_output_text(model_output)
    if not ref and not pred:
        return 1.0
    if not ref or not pred:
        return 0.0
    return round(SequenceMatcher(None, ref, pred).ratio(), 4)


def starter_dataset_items() -> list[dict[str, Any]]:
    """Seed examples for initial grocery prompt experiments."""
    return [
        {
            "id": "produce-basics",
            "ingredient_lines": "1 lime\n2 avocados\nfresh cilantro",
            "expected_json": json.dumps(
                [
                    {
                        "category": "Produce",
                        "items": [
                            {"name": "lime", "quantity": "1", "isStaple": False},
                            {"name": "avocados", "quantity": "2", "isStaple": False},
                            {"name": "fresh cilantro", "quantity": "as needed", "isStaple": False},
                        ],
                    }
                ]
            ),
            "tags": ["baseline", "produce"],
        },
        {
            "id": "dedupe-and-sum",
            "ingredient_lines": "1 cup mayonnaise\n1 cup mayo\n2 tbsp lime juice",
            "expected_json": json.dumps(
                [
                    {
                        "category": "Pantry Staples",
                        "items": [
                            {"name": "mayonnaise", "quantity": "2 cups", "isStaple": False},
                            {"name": "lime juice", "quantity": "2 tbsp", "isStaple": False},
                        ],
                    }
                ]
            ),
            "tags": ["dedupe", "pantry"],
        },
        {
            "id": "mixed-aisles",
            "ingredient_lines": "1 lb chicken breast\n6 tortillas\n1 cup shredded cheddar\n2 tbsp olive oil",
            "expected_json": json.dumps(
                [
                    {
                        "category": "Meat & Seafood",
                        "items": [{"name": "chicken breast", "quantity": "1 lb", "isStaple": False}],
                    },
                    {
                        "category": "Bakery",
                        "items": [{"name": "tortillas", "quantity": "6", "isStaple": False}],
                    },
                    {
                        "category": "Dairy",
                        "items": [{"name": "shredded cheddar", "quantity": "1 cup", "isStaple": False}],
                    },
                    {
                        "category": "Pantry Staples",
                        "items": [{"name": "olive oil", "quantity": "2 tbsp", "isStaple": True}],
                    },
                ]
            ),
            "tags": ["mixed", "schema"],
        },
    ]


def generate_synthetic_items(count: int, seed: int = 42) -> list[dict[str, Any]]:
    """Generate synthetic grocery examples with expected JSON."""
    rng = random.Random(seed)

    scenarios = [
        (
            "dedupe",
            [
                "1 cup mayonnaise",
                "1 cup mayo",
                "2 tbsp lime juice",
            ],
            [
                {
                    "category": "Pantry Staples",
                    "items": [
                        {"name": "mayonnaise", "quantity": "2 cups", "isStaple": False},
                        {"name": "lime juice", "quantity": "2 tbsp", "isStaple": False},
                    ],
                }
            ],
        ),
        (
            "produce",
            [
                "2 avocados",
                "1 lime",
                "fresh cilantro",
            ],
            [
                {
                    "category": "Produce",
                    "items": [
                        {"name": "avocados", "quantity": "2", "isStaple": False},
                        {"name": "lime", "quantity": "1", "isStaple": False},
                        {"name": "fresh cilantro", "quantity": "as needed", "isStaple": False},
                    ],
                }
            ],
        ),
        (
            "mixed_units",
            [
                "1 can black beans",
                "2 cups black beans",
                "1 tbsp olive oil",
            ],
            [
                {
                    "category": "Pantry Staples",
                    "items": [
                        {"name": "black beans", "quantity": "1 can + 2 cups", "isStaple": False},
                        {"name": "olive oil", "quantity": "1 tbsp", "isStaple": True},
                    ],
                }
            ],
        ),
        (
            "aisles",
            [
                "1 lb chicken breast",
                "8 flour tortillas",
                "1 cup shredded cheddar",
                "1 tbsp salsa",
            ],
            [
                {
                    "category": "Meat & Seafood",
                    "items": [{"name": "chicken breast", "quantity": "1 lb", "isStaple": False}],
                },
                {
                    "category": "Bakery",
                    "items": [{"name": "flour tortillas", "quantity": "8", "isStaple": False}],
                },
                {
                    "category": "Dairy",
                    "items": [{"name": "shredded cheddar", "quantity": "1 cup", "isStaple": False}],
                },
                {
                    "category": "Pantry Staples",
                    "items": [{"name": "salsa", "quantity": "1 tbsp", "isStaple": False}],
                },
            ],
        ),
        (
            "staples",
            [
                "1 tsp salt",
                "1 tsp black pepper",
                "2 cloves garlic",
                "1 onion",
            ],
            [
                {
                    "category": "Pantry Staples",
                    "items": [
                        {"name": "salt", "quantity": "1 tsp", "isStaple": True},
                        {"name": "black pepper", "quantity": "1 tsp", "isStaple": True},
                        {"name": "garlic", "quantity": "2 cloves", "isStaple": True},
                        {"name": "onion", "quantity": "1", "isStaple": True},
                    ],
                }
            ],
        ),
        (
            "beverage_vs_pantry",
            [
                "1 cup orange juice",
                "2 tbsp lemon juice",
                "1 tbsp apple cider vinegar",
            ],
            [
                {
                    "category": "Beverages",
                    "items": [{"name": "orange juice", "quantity": "1 cup", "isStaple": False}],
                },
                {
                    "category": "Pantry Staples",
                    "items": [
                        {"name": "lemon juice", "quantity": "2 tbsp", "isStaple": False},
                        {"name": "apple cider vinegar", "quantity": "1 tbsp", "isStaple": True},
                    ],
                },
            ],
        ),
    ]

    examples: list[dict[str, Any]] = []
    for i in range(count):
        scenario_name, lines, expected = rng.choice(scenarios)
        # Minor controlled variation in order to avoid exact duplicates.
        shuffled_lines = lines[:]
        rng.shuffle(shuffled_lines)
        ingredient_lines = "\n".join(shuffled_lines)
        examples.append(
            {
                "id": f"synthetic-{scenario_name}-{seed}-{i + 1:03d}",
                "ingredient_lines": ingredient_lines,
                "expected_json": json.dumps(expected),
                "tags": ["synthetic", scenario_name],
            }
        )

    return examples
