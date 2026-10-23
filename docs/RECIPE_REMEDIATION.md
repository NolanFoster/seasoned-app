# Recipe gate remediation (V1)

The generation worker can optionally make a bounded repair attempt when an
otherwise useful generated or adapted recipe fails an existing deterministic
allergen, food-process, or quality gate. The feature is disabled unless
`RECIPE_REMEDIATION_V1` is explicitly set to `shadow` or `on`.

## Safety contract

- The allergen graph, process-safety analyzer, and quality bar remain the only
  approvers. Model output is untrusted and is never returned unless the same
  deterministic gates pass again on the final recipe.
- The loop is bounded to **two revisions** (and at most two additional model
  calls). A normal recipe that passes its first gate makes no remediation call.
- The only automatic ingredient edits are finite, graph-checked substitutions
  and, where the line is not part of the dish identity or method, dropping an
  isolated violating ingredient. The model may revise only explicitly cited
  instruction lines; it cannot approve a recipe or author a free-text
  substitution.
- If no legal edit clears every gate, the endpoint abstains with violation
  codes and relevant lines, but never returns the unsafe draft.
- A title-changing substitution carries `reviewRequired: true`; it is surfaced
  for user review and is not saved to the user's library by these endpoints.

## Rollout modes

- `off` (default): preserve the existing reject behavior and do not run the
  remediation collector or make an additional model call.
- `shadow`: run the bounded evaluation, but return the existing rejection. Log
  only counts, gate names, and codes; never log recipe text, ingredient lines,
  or profile free-text.
- `on`: return a repaired recipe with `remediation.status: "repaired"` only
  after the deterministic re-check succeeds. If it does not, return HTTP 422
  with `code: "RECIPE_REMEDIATION_ABSTAIN"`, `attempts`, and `violations`.

## Scope and limits

V1 runs on generation and adaptation, not browse/search reads or a whole-week
plan fill. Food-process blocks abstain; existing process rewrite templates
continue to run through the normal gate. The graph covers the allergens and
terms it explicitly knows. A clean graph result is not a promise about an
unlisted allergen, cross-contact, labels, or manufacturing conditions.

This is **not a clinical checker** and does not interpret diagnoses,
pregnancy, infant, medication, or other medical constraints. Seasoned does not
claim that a recipe is safe for an unlisted allergy. Users with severe
allergies should verify labels and preparation conditions with authoritative
sources and should not rely on an AI-generated recipe as their sole safety
check.
