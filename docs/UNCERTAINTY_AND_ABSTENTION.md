# Uncertainty and selective abstention

Seasoned recipes can be useful without being factually cleared. The uncertainty
contract makes that distinction explicit: it reports what the deterministic
checks could verify, and asks the cook to review the rest. It is not a medical
confidence score and it never replaces the allergen or food-process safety
gates.

## Rollout

The worker flag `UNCERTAINTY_GUARDS_V1` is **off by default**, including in
production. Enable it only after the gold fixtures and UI copy have been
reviewed. The app flag uses the same contract as `uncertainty_guards_v1` and
also defaults to false.

When enabled, successful `/generate` and `/adapt` responses include the same
`uncertaintySummary` at the response root and on `recipe`:

```json
{
  "schemaVersion": "1.0",
  "checked": true,
  "level": "medium",
  "confidence": 0.65,
  "abstained": false,
  "needs_review": true,
  "reasons": ["nutrition_is_estimated"],
  "evidence_refs": [],
  "dimensions": {
    "nutrition": {
      "dimension": "nutrition",
      "level": "medium",
      "confidence": 0.65,
      "reasons": ["nutrition_is_estimated"],
      "evidence_refs": []
    }
  }
}
```

The response contains all dimensions, even when a dimension is `high`:

- `nutrition`
- `allergen_coverage`
- `process_safety`
- `authenticity`
- `technique`
- `timing`
- `product_identity`
- `general`

`high` means the available evidence passed the deterministic check; it does
not mean the recipe is guaranteed. `medium` means the UI should explain the
gap and recommend review. `low` means evidence is weak. `abstain` means the
system cannot make that claim from the available evidence.

## Safety hierarchy

- An allergen or process **BLOCK** remains a hard failure and never crosses an
  API boundary as a recipe.
- An allergen or process dimension at `low` or `abstain` is never styled as a
  passed safety check.
- Nutrition `abstain` means the app must not claim that a daily nutrition goal
  was met. Missing macros are shown as missing, not estimated from fluency.
- Uncertainty does not weaken `enforceAllergenSafety` or
  `enforceProcessSafety`; it only describes the evidence after those gates.
- Uncertainty reasons are short, user-facing categories. Do not put model
  chain-of-thought, raw pantry contents, or private prompt material in
  `reasons` or `evidence_refs`.

## v1 deterministic signals

The v1 summary uses existing recipe metadata:

- allergen graph matches, opaque ingredient terms, unknown custom allergens,
  and ingredient-data availability;
- process-safety status, warnings, and cook gate;
- labeled versus estimated nutrition and ingredient coverage;
- timing-field completeness and prep/cook/total consistency;
- packaged-product terms without a resolved product identity;
- whether content is generated and whether the quality bar needs review.

These are conservative heuristics, not calibrated model probabilities. Add a
fixture before adding a new reason or changing a level threshold. Keep safety
fixtures fail-closed and document any intentional false-positive tradeoff.

## Client behavior

`UncertaintyBanner` uses human-centered copy and is visually distinct from
hard safety notices. It should state what is unknown and what the cook can do
next (verify a label, add a weight, scan a barcode, or consult a tested
process). Recipe planning is disabled when the enabled summary reports low or
abstained allergen/process evidence. Cooking and editing remain available so
the user can inspect and correct the recipe, unless an existing hard safety
gate has blocked cooking.

When sharing or adding another client, preserve the summary instead of
flattening it to a single numeric score. In particular, never turn an
`allergen_coverage` or `process_safety` `low`/`abstain` value into a green
`PASSED` badge.
