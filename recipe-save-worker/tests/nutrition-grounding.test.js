import { beforeEach, describe, expect, test, vi } from 'vitest';
import { RecipeSaver } from '../src/index.js';

describe('recipe-save nutrition grounding rollout', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        foods: [{
          fdcId: 123,
          description: 'Apple, raw',
          foodNutrients: [
            { nutrientId: 1008, value: 52 },
            { nutrientId: 1003, value: 0.26 }
          ]
        }]
      })
    });
  });

  test('uses FoodData Central grounding only when the rollout flag is enabled', async () => {
    const env = {
      FDC_API_KEY: 'test-key',
      FDC_DB_VERSION: 'FDC-test',
      NUTRITION_DB_GROUNDING_V1: 'true'
    };
    const saver = new RecipeSaver({ id: { toString: () => 'test-state' } }, env);
    const recipe = {
      id: 'recipe-1',
      servings: '2 servings',
      ingredients: ['100 g apple', 'pepper to taste']
    };

    const result = await saver.calculateAndAddNutrition(recipe);

    expect(result.nutrition.calories).toBe('26');
    expect(result.nutritionProvenance).toMatchObject({
      source: 'USDA FoodData Central',
      db_version: 'FDC-test',
      coverage_pct: 50,
      estimated: true
    });
    expect(result.nutritionProvenance.uncertain_ingredients).toEqual([
      { index: 1, name: 'pepper to taste', reason: 'ambiguous_quantity' }
    ]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('replaces model-only nutrition with authoritative grounding when the flag is enabled', async () => {
    const env = {
      FDC_API_KEY: 'test-key',
      NUTRITION_DB_GROUNDING_V1: 'true'
    };
    const saver = new RecipeSaver({ id: { toString: () => 'test-state' } }, env);
    const recipe = {
      id: 'recipe-model-nutrition',
      nutrition: { calories: '999' },
      ingredients: ['100 g apple']
    };

    const result = await saver.calculateAndAddNutrition(recipe);

    expect(result.nutrition.calories).toBe('52');
    expect(result.nutritionProvenance).toMatchObject({
      schemaVersion: 'NutritionGroundingV1',
      coverage_pct: 100,
      estimated: false
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('keeps the legacy path as the default', async () => {
    const env = {
      FDC_API_KEY: 'test-key'
    };
    const saver = new RecipeSaver({ id: { toString: () => 'test-state' } }, env);
    const recipe = {
      id: 'recipe-2',
      nutrition: { calories: 99 },
      ingredients: ['100 g apple']
    };

    const result = await saver.calculateAndAddNutrition(recipe);

    expect(result).toBe(recipe);
    expect(result.nutrition).toEqual({ calories: 99 });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

test('uses the opt-in injected AI sampler and namespaced KV cache for eligible misses', async () => {
  const sampleByField = {
    calories: 210,
    proteinContent: 10,
    carbohydrateContent: 20,
    fatContent: 10,
    saturatedFatContent: 2,
    sugarContent: 5,
    sodiumContent: 100,
    fiberContent: 3
  };
  const kv = {
    get: vi.fn(async () => null),
    put: vi.fn(async () => undefined)
  };
  const env = {
    FDC_API_KEY: 'test-key',
    NUTRITION_DB_GROUNDING_V1: 'true',
    COMPOSITION_GAP_FILL_V1: 'on',
    RECIPE_STORAGE: kv,
    AI: {
      run: vi.fn(async (_model, options) => {
        const { field } = JSON.parse(options.messages[1].content);
        return { response: JSON.stringify({ value: sampleByField[field] }) };
      })
    }
  };
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ foods: [] })
  });
  const saver = new RecipeSaver({ id: { toString: () => 'test-state' } }, env);
  const recipe = {
    id: 'recipe-with-gap',
    servings: '1 serving',
    ingredients: [{ name: 'berbere', quantity: 100, unit: 'g', form: 'ground spice blend' }]
  };

  const result = await saver.calculateAndAddNutrition(recipe);

  expect(result.nutrition.calories).toBe('210');
  expect(result.nutritionProvenance).toMatchObject({
    coverage_pct: 0,
    display_coverage_pct: 100,
    estimated: true,
    filled_count: 1
  });
  expect(result.nutritionProvenance.grounded_ingredients).toEqual([]);
  expect(result.nutritionProvenance.filled_ingredients[0]).toMatchObject({
    name: 'berbere',
    source: 'llm_estimate',
    dispersion: { sampleCount: 5 }
  });
  expect(env.AI.run).toHaveBeenCalledTimes(40);
  expect(kv.put).toHaveBeenCalledWith(
    expect.stringMatching(/^composition-gap-fill:v1:/),
    expect.any(String),
    { expirationTtl: 90 * 24 * 60 * 60 }
  );
});
