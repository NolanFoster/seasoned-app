# Composition gap-fill V1 (#635)

`shared/composition-gap-fill.js` provides a conservative, opt-in estimate for selected nutrition-database misses. An estimate is never an authoritative database match, never fills an allergen or dietary field, and never clears a safety result. The feature defaults to **off** and makes no network or storage calls on import.

## Data path and rollout

The optional path is called only after `groundRecipeNutrition` has failed to resolve a valid-quantity ingredient. `unmatched`, `low_confidence`, and `provider_error` misses can be sampled. Invalid ingredients and `ambiguous_quantity` misses remain uncertain; their quantity must be corrected in the grounding path rather than guessed here.

Set `COMPOSITION_GAP_FILL_V1` to:

- `off` (default): no sampling, cache, queue, or output changes.
- `shadow`: sample/cache and emit aggregate telemetry, but do not change nutrition totals, provenance, uncertainty, or rendered recipe data.
- `on` (also `true`, `1`, or `enabled`): append admitted estimates separately under `nutritionProvenance.filled_ingredients`.

The existing `NUTRITION_DB_GROUNDING_V1` gate must also be enabled by the caller. In the recipe-save worker, the opt-in path requires injected Workers AI and the existing `RECIPE_STORAGE` KV ports; if either is unavailable, gap filling is skipped and the authoritative-only path remains intact. The AI binding is only invoked after explicit opt-in. Sampling and queueing are injected ports; tests use deterministic fixtures.

One call to `sampleField(name, form, field, { sampleCount, temperature })` is made for each of eight numeric fields. The default is five samples per field, capped at seven, at a non-zero temperature. The Worker AI adapter runs one short inference per numeric sample: 40 model calls for a default uncached ingredient, up to 56 at the sample cap. The per-recipe cap is eight ingredient fill attempts (320 model calls at the default, 448 at the maximum). This is intentionally off by default; monitor AI usage and latency in shadow mode before enabling it broadly. At most one fill record is reused per normalized name/form during its TTL.

## Estimation and admission

Fields are elicited independently: calories, protein, carbohydrate, fat, saturated fat, sugar, sodium, and fiber. Non-numeric, non-finite, and negative replies are dropped. Each field uses the median and median absolute deviation (MAD); fewer than three numeric samples for any field abstains. The model's own confidence text is not used.

Admission checks the following, in order:

| Check | Rule | Failure behavior |
|---|---|---|
| Required fields | All eight values are finite and nonnegative | Abstain `invalid_nutrients` or `insufficient_samples` |
| Atwater bounds | Protein, carbohydrate, and fat each in [0, 100] g/100 g; their sum ≤ 100 | Abstain `atwater_bounds` |
| Calories bounds | 0–900 kcal/100 g | Abstain `calories_bounds` |
| Semantic-zero denylist | Water, ice, salt, baking powder, and baking soda must have ≤1 kcal and ≤0.1 g protein per 100 g | Abstain `semantic_zero_violation`; never reconcile the denied field. Even values inside the trace ceiling abstain rather than being altered if they would need a reconciliation |
| Energy identity | Compare calories with `4 × protein + 4 × carbohydrate + 9 × fat` | >30% deviation abstains; a >5% through 30% deviation reconciles calories only to the macro-derived energy, recorded as `reconciled_minor`; ≤5% passes unchanged |

The 5% no-change band avoids rewriting trivial rounding differences; the 15% safety band is still respected because any larger deviation is reconciled or abstained before display. Reconciliation does not alter a semantic-zero ingredient, sodium, fiber, or any independently sampled macro. Any post-reconcile calorie value must still satisfy the 900 kcal bound.

Major energy failures and Atwater/calorie bound failures send the median candidate record to the injected review queue. The cook path does not browse the web and never asks the model to repair its own contradiction. A reviewer can use `reviewCompositionGapFill` to attach at most two HTTPS evidence URLs and recheck an edited nutrient record; the record is admitted only if the same invariant guard passes.

## Cache, provenance, and UI contract

Cache keys use normalized ingredient name plus form, with punctuation, embedded numeric quantities, and common count words removed. The Workers KV key prefix is `composition-gap-fill:v1:`. Admitted records live for 90 days; abstentions live for 7 days. The value contains only the median/MAD record, invariant result, and provenance — never prompts, model transcripts, or user identifiers. Review items have their own namespaced key and a 30-day TTL.

When enabled, authoritative `grounded_ingredients` remain untouched and `coverage_pct` continues to mean the percentage resolved by a food database. Estimates appear only in `filled_ingredients` with `source: llm_estimate`, per-100-g values, dispersion, invariants, and provenance. `display_coverage_pct` is a separate optional measure; it must not replace authoritative coverage. Any included model estimate sets `estimated: true`.

The recipe card labels each USDA-grounded line `USDA FoodData Central` and each admitted model estimate `Model estimate · not a lab value`. It states the count of database-resolved, estimated, and omitted ingredients. Unadmitted ingredients remain visible by name without nutrient values. The displayed nutrition total includes admitted fills, so the existing overtrust traffic lights evaluate the displayed total and carry an `estimated inputs` marker; estimate-backed results cannot receive a high-confidence label solely because authoritative coverage is high.

This feature does not replace the regulatory-tolerance claim gate (#605) or nutrition overtrust friction (#538). A model estimate is not a USDA match; it cannot raise `coverage_pct`, establish a health claim, or soften a traffic-light result. It does not affect allergen or food-process-safety checks.

## Non-claims

Seasoned does not claim that these values are certified, clinically precise, or safe for a medical condition. They are estimates, not lab values. The paper's reported metrics and costs are not a Seasoned performance guarantee. Verify package labels and ingredient quantities, especially for allergies or medical dietary needs.
