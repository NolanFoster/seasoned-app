# Allergen safety

Seasoned treats allergy preferences as a safety constraint, not as a recipe
label. The shared `shared/allergen-graph.js` module detects the FDA major
allergen set (milk, eggs, fish, shellfish, tree nuts, peanuts, wheat, soy, and
sesame) using canonical IDs and explainable ingredient synonyms.

## Request flow

1. Culinary profile and request overrides are normalized by
   `buildGenerationConstraints`.
2. The generation worker adds hard allergens to retrieval and model prompts.
   Similar recipes containing a blocked allergen are excluded before they can
   become model context.
3. Generated and elevated recipes are checked after the model response is
   normalized. The response includes `allergenSummary` and
   `allergenValidation: "PASSED"` only after the check succeeds.
4. The recommendation worker accepts the same `hardAllergens`/profile input.
   It only returns recipes with ingredient data that pass the shared checker;
   name-only fallbacks and unverified AI-only names are omitted when a hard
   allergen policy is active.

## Fail-closed behavior

A recipe containing a requested hard allergen is never returned. The generate
endpoint responds with HTTP `422` and a payload like:

```json
{
  "error": "Recipe failed allergen safety validation",
  "code": "ALLERGEN_SAFETY_BLOCK",
  "allergenSummary": {
    "checked": true,
    "safe": false,
    "contains": ["peanuts"],
    "blocked": ["peanuts"],
    "may_contain_uncertain": []
  }
}
```

Opaque terms such as broth, seasoning blends, natural flavors, and shared
facility statements are reported in `may_contain_uncertain`. When a user has
any hard allergen configured, uncertainty also fails closed so it cannot be
silently mistaken for an allergen-free result. Custom hard-allergen tags that
are outside the canonical graph are likewise marked unverified.

Every summary is an audit aid, not a medical guarantee. The app should continue
to display a clear reminder that AI can miss allergens and cross-contact and
that users must verify packaging and preparation conditions with the
manufacturer or a qualified professional.

## Adding synonyms

Add a lowercase term to `ALLERGEN_TERMS` in `shared/allergen-graph.js`, then add
a focused test demonstrating the ingredient phrase and expected canonical ID.
Prefer specific phrases over broad terms to reduce false positives. Plant-based
milk exceptions are intentionally handled separately because coconut, oat,
rice, hemp, pea, and cashew milk should not be classified as dairy milk (their
own allergen mappings still apply where appropriate).

## Validation checklist

- Run shared allergen graph tests.
- Run generation worker unit tests, including the 422 fail-closed path.
- Run recommendation filtering tests with both blocked and safe recipes.
- Verify a recipe with only opaque ingredient terms is not returned when a hard
  allergen profile is active.
- Keep the user-facing copy factual: allergen detection reduces risk but does
  not detect cross-contact or replace label verification.
