# Food-process safety

Seasoned's allergen graph answers whether a recipe *contains* something a user
must avoid. This is the other half: whether a recipe asks someone to *do*
something that is dangerous when improvised. Home canning schedules, anaerobic
ferments, oil infusions, wild mushroom identification, and leftover-holding
advice are all techniques a fluent model will describe confidently and wrongly,
and getting them wrong causes botulism, not a bad dinner.

The shared `shared/food-process-safety.js` module treats technique classes as
first-class constraints with explicit policies. It never authors a process
schedule; it withholds one and links to a tested guide.

## Hazard tags and policies

| Tag | Policy | Why |
|---|---|---|
| `home_canning_low_acid` | `block` | No safe improvised schedule exists for low-acid foods. |
| `wild_forage_id` | `block` | Toxic lookalikes cannot be ruled out from text. |
| `water_bath_preserve` | `force_template` | Tested high-acid schedules exist; ours would not be one. |
| `infused_oil_garlic` | `force_template` | Aromatics in oil are anaerobic; storage guidance must be exact. |
| `reheat_rice_cooling` | `strip_and_rewrite` | Unsafe cooling advice is replaced with correct guidance. |
| `fermentation_anaerobic` | `warn_needs_review` | Salt and temperature ranges need verification. |
| `sous_vide_low_temp_protein` | `warn_needs_review` | Safe only with a pasteurization hold. |
| `raw_high_risk_protein` | `warn_needs_review` | Raw poultry, pork, egg, shellfish, unpasteurized dairy. |
| `vacuum_bag_cook` | `warn_needs_review` | Anaerobic packaging held outside refrigeration. |

Policies escalate: the most restrictive detected policy decides the outcome.

- **`block`** — the recipe is never returned. The endpoint responds `422`.
- **`force_template`** — the offending steps are removed and replaced with a
  referral to an authoritative guide. The recipe is returned, but cook mode and
  the meal planner are gated.
- **`strip_and_rewrite`** — the unsafe step is replaced with correct guidance;
  the rest of the recipe is untouched.
- **`warn_needs_review`** — the recipe is returned intact with a banner.

## Request flow

1. Generated, elevated, and adapted recipes are checked after the model
   response is normalized, in the same place the allergen graph runs.
2. Allergens run first and stay primary. When both fire, the response is an
   allergen failure that also carries `processSafetySummary`.
3. Search results and clipped recipes are annotated client-side by
   `annotateRecipeForProfile`. Clipped recipes are **labelled, never rewritten** —
   the steps belong to whoever published them; Seasoned adds a warning and gates
   cook mode instead of editing someone else's page.

## Response shape

Safe recipes carry `processSafetyValidation: "PASSED"` and a summary:

```json
{
  "processSafetySummary": {
    "checked": true,
    "safe": false,
    "status": "blocked",
    "policy": "block",
    "tags": ["home_canning_low_acid"],
    "blocked": ["home_canning_low_acid"],
    "requires_template": [],
    "warnings": [],
    "policyActions": [{ "tag": "home_canning_low_acid", "policy": "block", "guidance": "..." }],
    "sources": [{ "id": "nchfp", "label": "USDA National Center for Home Food Preservation", "url": "https://nchfp.uga.edu/" }],
    "cook_gate": "block"
  }
}
```

A blocked generate request responds `422`:

```json
{
  "error": "Recipe failed food-process safety validation",
  "code": "PROCESS_SAFETY_BLOCK",
  "processSafetySummary": { "blocked": ["home_canning_low_acid"] }
}
```

## Fail-closed behavior

Numeric process schedules — PSI, pressure, jar processing times — must never
reach a client from the base model. Three things enforce that:

- Blocking hazards withhold the recipe entirely.
- `force_template` removes the steps that carried the schedule, and
  `withProcessSafetySummary` re-scans the result: if a schedule survived
  anywhere (for example in a description, which is never rewritten), the recipe
  escalates to `blocked` with `escalated: "residual_process_schedule"`.
- Quoted evidence in the summary has its numbers redacted, so a refusal can
  explain which step stopped it without repeating the invented schedule.

## Feature flag and break-glass

`PROCESS_SAFETY_V1` is on by default, including when it is unset.

- Outside production, `PROCESS_SAFETY_V1=false` disables the gates.
- In production the flag alone cannot disable them.
- `PROCESS_SAFETY_BREAK_GLASS=true` disables them anywhere. It is an incident
  tool: it logs a `process_safety.checked: false` record with the reason on
  every request, and should be reverted as soon as the incident is resolved.

## Observability

Every decision that finds something logs a structured record built by
`describeProcessSafetyDecision`: `process_safety.blocked`, `process_safety.status`,
`process_safety.tags`, `process_safety.blocked_tags`, `process_safety.warning_tags`,
`process_safety.rewritten_steps`, plus the surface (`generate`, `elevate`,
`adapt`). Records carry tag names only — never recipe text — so they are safe to
forward to Opik. Sample these weekly to confirm no blocked tag reaches a
returned recipe.

## Adding a hazard or pattern

1. Add the pattern and hazard definition in `shared/food-process-safety.js`.
   Detection is line-primary: the *technique* must appear on the line being
   examined, while the *food* it applies to may be read from anywhere in the
   recipe. This keeps a finding attached to the step that caused it.
2. Add a fixture to `shared/__tests__/fixtures/food-process-safety-fixtures.js`
   with its expected policy outcome — and add a `SAFE_FIXTURES` entry for the
   nearest ordinary recipe that uses the same vocabulary. Preserving,
   fermenting, and raw-protein words appear constantly in normal cooking; the
   safe fixtures are what keep the false-positive rate under 2%.
3. Prefer specific phrases over broad terms. Existing carve-outs worth
   preserving: refrigerator pickles and freezer jam are not canning, bulk-fermented
   dough is not a preserved ferment, a fermented pantry staple is not a
   fermentation process, and shop-bought wild mushrooms are not foraged.

## Limits

This is not a certification. It does not replace lab-tested process schedules,
does not detect every unsafe technique, and does not cover restaurant HACCP
cases. A pass means no mapped hazard was detected — not that a technique is safe
in a given kitchen. User-facing copy must keep saying so.

## Validation checklist

- Run the shared eval fixture pack and unit tests.
- Run generation worker tests, including the 422 block path and the flag matrix.
- Confirm no allergen regression on the shared suite.
- Verify a blocked recipe's payload contains no numeric process schedule.
- Verify the banner appears on the recipe card and at cooking-mode entry, and
  that a blocked recipe cannot be added to the meal planner.
