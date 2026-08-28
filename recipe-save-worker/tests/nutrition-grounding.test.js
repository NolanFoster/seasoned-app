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
