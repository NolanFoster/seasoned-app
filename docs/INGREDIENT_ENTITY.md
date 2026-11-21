# Computable ingredient entities (v1)

`shared/ingredient-entity.js` adds an opt-in, deterministic representation for each generated or clipped ingredient line. It parses existing recipe text; it does not call a model, make a network request, or replace the original `ingredients` array.

## Contract

Each line becomes an `ingredient-entity-v1` record with its source `raw` text, zero-based `index`, seven optional typed attributes (`name`, `state`, `quantity`, `unit`, `size`, `temperature`, `dryFresh`), a reviewed category, `parseStatus`, and `unparsedSpans`. The parser keeps display/source wording in `raw`; `attributes.name` is normalized for exact lexicon lookup. An unknown name is categorized as `unknown`. It is never fuzzy-matched to the nearest staple. When an existing nutrition-grounding hit is present, `groundingIndex` points to its original ingredient index; the entity never creates a second food-database match.

Quantity and unit parsing reuse `parseIngredientString` from `nutrition-grounding.js`, which is backed by the existing `UnitConverter` unit tables. If the legacy parser estimates a fallback quantity, entity quantity and unit are `null` and the entity is `partial`; the public entity never promotes that fallback to `1 unit`. Unsupported ambiguous measures such as `1 dash of something` are partial as well. Degree expressions are recorded as `temperature_deferred_to_step` and are not treated as ingredient temperatures.

`shared/fixtures/ingredient-categories.json` is the reviewed, exact-match v1 vocabulary. Every row must remain `reviewed: true`. `other` rows need explicit `dietBlocks` for dietary derivation; an `other` row without them makes the result `undetermined`. Honey, gelatin, rennet, and fish sauce are intentionally represented as `other` with explicit blocks.

## Derived dietary styles

`deriveDietaryStyles(entities)` returns every passing style: `vegan`, `vegetarian`, `pescatarian`, and `non_vegetarian`. Vegan excludes dairy, egg, meat, poultry, fish, shellfish, and explicit lexicon blocks; vegetarian excludes meat, poultry, fish, shellfish, and explicit blocks; pescatarian excludes meat and poultry and explicit blocks; non-vegetarian requires an animal-category ingredient. Any unknown, partial, abstained, or unreviewed `other` line yields only `undetermined`. An empty recipe is also undetermined.

`compareRequestedDiet` retains the request separately from the derived styles and reports `verified`, `not_verified`, `not_requested`, or `not_evaluated`. A mismatch includes blocking line names and reasons. Requested tags are never copied into the derived field. These are culinary descriptors, not medical advice or certification.

## Provenance and display

`resolveGeoCultural` only accepts explicit request/user context or a caller-supplied reviewed host map. Its source is `request_brief`, `clip_host_map`, `user_set`, or `absent`; confidence is capped at 0.6 for a request brief and 0.4 for a mapped host, and is 1 only for `user_set`. A free-form cuisine string is kept separate and is never used to infer a region or country. The host map is empty by default; no GeoIP or model guess is used.

When fields exist, the recipe card may disclose non-null line attributes, an evidence-based dietary chip with its other passing styles/reasons, and a provenance chip with the source. The provenance chip must only use neutral context wording. Copy blacklist: `authentic`, `traditional`, `real`, `original`, `certified`. Do not use color as the sole indication of status. Existing allergen and food-process checks remain authoritative and unchanged; this schema is not an allergen certificate or a nutrition source.

## Rollout

Set `ingredient_entity_v1` to:

- `off` (default): omit entity fields.
- `shadow`: compute and emit counts/ratios only (`total`, `parsed`, `partial`, `abstained`, `unknown_category`, `derived_style`, `parse_rate`, `undetermined_rate`, `requested_mismatch`); `parse_rate` is `(parsed + partial) / total` and `undetermined_rate` is a per-recipe 0/1 value. Do not return or render annotations. Logs must not contain ingredient text.
- `on`: return and persist `ingredientEntities`, `derivedDietaryStyles`, `dietaryComparison`, and `geoCultural`.

Grounding continues through the existing nutrition path. For an entity with explicit quantity and unit, grounding receives that parsed `{ name, quantity, unit }`; a partial line is passed through unchanged so the existing grounding/gap-fill logic can still reject an ambiguous quantity. Entity categories never affect allergen checks, USDA matching, or composition gap-fill.
