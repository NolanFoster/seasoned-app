# Nutrition DB grounding (NutritionGroundingV1)

Seasoned's nutrition numbers are estimates. `shared/nutrition-grounding.js` provides the first version of the authoritative-composition contract used to replace model-invented macros with values resolved from a food database.

## Contract

A grounding provider implements one method:

```js
async resolveIngredient({ name, quantity, unit })
```

It returns candidate records with:

```js
{
  foodCode: "...",
  foodName: "...",
  confidence: 0.0, // 0..1
  source: "USDA FoodData Central",
  dbVersion: "FDC-2026-01",
  nutrientsPer100g: {
    calories: 52,
    proteinContent: 0.26
  }
}
```

The caller must choose a confidence policy. `groundRecipeNutrition` defaults to `0.8`; candidates below that threshold are reported as uncertain and contribute no nutrient values.

## USDA FoodData Central

The first provider is `USDAFoodDataCentralProvider`:

```js
import {
  createUSDAFoodDataCentralProvider,
  groundRecipeNutrition
} from '../shared/nutrition-grounding.js';

const provider = createUSDAFoodDataCentralProvider(env.FDC_API_KEY, {
  // Set this to the composition snapshot/version deployed by the worker.
  dbVersion: env.FDC_DB_VERSION || 'live'
});

const result = await groundRecipeNutrition(recipe.ingredients, {
  provider,
  servings: recipe.servings,
  coverageThreshold: 80
});
```

`USDANutritionClient` accepts an injected `fetchImpl`, which keeps provider tests deterministic and permits a future cache or regional routing layer without changing the provider contract.

## Provenance and honest coverage

Every result includes `nutritionProvenance`:

- `source` and `db_version` identify the composition source.
- `method` is currently `ingredient_search_weighted_sum`.
- `coverage_pct` is the percentage of input ingredient rows resolved at or above the confidence floor.
- `estimated` is `true` when coverage is below the configured threshold.
- `uncertain_ingredients` lists invalid, ambiguous-quantity, unmatched, low-confidence, or provider-error rows.
- `grounded_ingredients` records selected food codes and confidence without returning provider credentials.

When coverage is incomplete, known ingredients are still recomputed, but unknown or ambiguous-quantity ingredients are never assigned synthetic nutrient values. The UI should display an estimated/partial-coverage treatment rather than precise-looking clinical or dietary claims. The output is not medical advice.

`attachNutritionProvenance(recipe, options)` returns a new recipe object and adds `nutrition` plus `nutritionProvenance`; it does not mutate the input recipe.

## Rollout

The contract is additive and has no effect on existing nutrition calculation until a caller opts in. The recipe-save worker now supports the planned rollout flag `NUTRITION_DB_GROUNDING_V1`; it remains **off by default** until the evaluation pack establishes acceptable FoodData Central resolution and mean absolute error against known recipes. The same contract can be wired into generate/adapt handlers in a later rollout slice.

Recommended rollout:

1. Run grounding in shadow mode and compare it with the legacy nutrition result.
2. Record coverage, unresolved ingredients, confidence, and recomputation deltas.
3. Dogfood with the flag enabled and show source/coverage badges.
4. Enable by environment only after evaluation and safety review pass.

## Updating the database

When the provider's source snapshot changes:

1. Set `FDC_DB_VERSION` to the dated source/API snapshot used by the deployment.
2. Run the shared grounding tests and the recipe nutrition evaluation pack.
3. Compare coverage and nutrient deltas with the previous version.
4. Document the new version and rollback value in the deployment change record.

Do not place API keys or other credentials in source, fixtures, logs, provenance, or client responses. Store the FoodData Central key as a worker secret.
