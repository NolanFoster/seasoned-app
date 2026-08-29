import {
  assertNutritionGroundingProvider,
  attachNutritionProvenance,
  createUSDAFoodDataCentralProvider,
  DEFAULT_NUTRITION_COVERAGE_THRESHOLD,
  isNutritionGroundingEnabled,
  groundRecipeNutrition,
  normalizeGroundingCandidate,
  normalizeGroundingIngredient,
  USDA_FDC_SOURCE,
  USDAFoodDataCentralProvider
} from '../nutrition-grounding.js';

const appleCandidate = {
  foodCode: '9001',
  foodName: 'Apple, raw',
  confidence: 0.95,
  source: 'Test Food Composition DB',
  dbVersion: '2026.01',
  nutrientsPer100g: {
    calories: 52,
    proteinContent: 0.26,
    carbohydrateContent: 13.81,
    fiberContent: 2.4
  }
};

function providerFor(candidatesByName) {
  return {
    resolveIngredient: vi.fn(async (ingredient) => candidatesByName[ingredient.name] || [])
  };
}

describe('nutrition grounding contract', () => {
  test('keeps the rollout flag opt-in by default', () => {
    expect(isNutritionGroundingEnabled()).toBe(false);
    expect(isNutritionGroundingEnabled({})).toBe(false);
    expect(isNutritionGroundingEnabled({ NUTRITION_DB_GROUNDING_V1: 'true' })).toBe(true);
    expect(isNutritionGroundingEnabled({ nutrition_db_grounding_v1: 'on' })).toBe(true);
    expect(isNutritionGroundingEnabled('false')).toBe(false);
  });

  test('normalizes structured and mixed-number ingredient inputs', () => {
    expect(normalizeGroundingIngredient({ name: ' oats ', amount: '1.5', measure: 'cup' }, 2)).toEqual({
      name: 'oats',
      quantity: 1.5,
      unit: 'cup',
      index: 2,
      valid: true
    });
    expect(normalizeGroundingIngredient('1 1/2 cups rolled oats')).toMatchObject({
      name: 'rolled oats',
      quantity: 1.5,
      unit: 'cups',
      valid: true
    });
    expect(normalizeGroundingIngredient('salt to taste')).toMatchObject({
      quantityEstimated: true,
      valid: true
    });
    expect(normalizeGroundingIngredient({ name: 'salt', quantity: 0 }, 4)).toMatchObject({
      index: 4,
      valid: false,
      reason: 'invalid_ingredient_quantity'
    });
  });

  test('normalizes candidates and clamps confidence without accepting malformed data', () => {
    expect(normalizeGroundingCandidate({
      id: 42,
      name: 'Food',
      confidence: 4,
      nutrition: { calories: '10', proteinContent: -1, fatContent: 2 },
      source: 'Example DB',
      db_version: 'v3'
    })).toEqual({
      foodCode: '42',
      foodName: 'Food',
      nutrientsPer100g: { calories: 10, fatContent: 2 },
      confidence: 1,
      source: 'Example DB',
      dbVersion: 'v3'
    });
    expect(normalizeGroundingCandidate({ id: 'missing-nutrients', name: 'Food' })).toBeNull();
  });

  test('recomputes per-serving nutrition and records database provenance', async () => {
    const provider = providerFor({ apple: [appleCandidate] });
    const result = await groundRecipeNutrition([
      { name: 'apple', quantity: 100, unit: 'g' }
    ], { provider, servings: '2 servings', coverageThreshold: 100 });

    expect(result.success).toBe(true);
    expect(result.nutrition.calories).toBe('26');
    expect(result.nutrition.proteinContent).toBe('0.1g');
    expect(result.nutritionProvenance).toMatchObject({
      schemaVersion: 'NutritionGroundingV1',
      source: 'Test Food Composition DB',
      db_version: '2026.01',
      method: 'ingredient_search_weighted_sum',
      coverage_pct: 100,
      estimated: false,
      uncertain_ingredients: []
    });
    expect(result.groundedIngredients[0]).toMatchObject({
      foodCode: '9001',
      weightGrams: 100
    });
    expect(provider.resolveIngredient).toHaveBeenCalledWith(expect.objectContaining({
      name: 'apple',
      quantity: 100,
      unit: 'g'
    }));
  });

  test('does not invent nutrients for unknown or low-confidence ingredients', async () => {
    const provider = providerFor({
      apple: [appleCandidate],
      mystery: [{ ...appleCandidate, foodCode: '9002', confidence: 0.4 }]
    });
    const result = await groundRecipeNutrition([
      { name: 'apple', quantity: 100, unit: 'g' },
      { name: 'mystery', quantity: 1, unit: 'piece' },
      { name: 'missing', quantity: 1, unit: 'piece' },
      'pepper to taste'
    ], { provider });

    expect(result.processedIngredients).toBe(1);
    expect(result.nutrition.calories).toBe('52');
    expect(result.nutritionProvenance.coverage_pct).toBe(25);
    expect(result.nutritionProvenance.estimated).toBe(true);
    expect(result.uncertainIngredients).toEqual([
      { index: 1, name: 'mystery', reason: 'no_confident_match' },
      { index: 2, name: 'missing', reason: 'no_confident_match' },
      { index: 3, name: 'pepper to taste', reason: 'ambiguous_quantity' }
    ]);
  });

  test('fails closed per ingredient when a provider request errors', async () => {
    const provider = {
      resolveIngredient: vi.fn(async () => {
        throw new Error('network failure');
      })
    };
    const result = await groundRecipeNutrition([
      { name: 'apple', quantity: 100, unit: 'g' }
    ], { provider });

    expect(result.success).toBe(false);
    expect(result.nutrition).toBeNull();
    expect(result.uncertainIngredients).toEqual([
      { index: 0, name: 'apple', reason: 'provider_error' }
    ]);
  });

  test('validates provider contract and required ingredient input', async () => {
    expect(() => assertNutritionGroundingProvider(null)).toThrow(/resolveIngredient/);
    await expect(groundRecipeNutrition([], { provider: { resolveIngredient: vi.fn() } }))
      .rejects.toThrow(/must not be empty/);
    expect(DEFAULT_NUTRITION_COVERAGE_THRESHOLD).toBe(80);
  });

  test('attaches provenance without mutating the source recipe', async () => {
    const provider = providerFor({ apple: [appleCandidate] });
    const recipe = {
      name: 'Apple bowl',
      servings: '2 servings',
      ingredients: [{ name: 'apple', quantity: 100, unit: 'g' }]
    };
    const grounded = await attachNutritionProvenance(recipe, { provider });

    expect(recipe.nutrition).toBeUndefined();
    expect(grounded.nutrition.calories).toBe('26');
    expect(grounded.nutritionProvenance.coverage_pct).toBe(100);
  });
});

describe('USDA FoodData Central grounding provider', () => {
  test('maps authoritative FoodData Central search results to candidates', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        foods: [{
          fdcId: 123,
          description: 'Apple, raw, with skin',
          score: 99,
          foodNutrients: [
            { nutrientId: 1008, value: 52 },
            { nutrientId: 1003, value: 0.26 }
          ]
        }, null]
      })
    }));
    const provider = createUSDAFoodDataCentralProvider('test-key', {
      fetchImpl,
      dbVersion: 'FDC-2026-01'
    });
    const [candidate] = await provider.resolveIngredient({ name: 'apple' });

    expect(candidate).toMatchObject({
      foodCode: '123',
      foodName: 'Apple, raw, with skin',
      confidence: 0.9,
      source: USDA_FDC_SOURCE,
      dbVersion: 'FDC-2026-01',
      nutrientsPer100g: { calories: 52, proteinContent: 0.26 }
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toContain('/foods/search?');
  });

  test('accepts an injected client for alternate cache or regional routing', async () => {
    const client = { searchFood: vi.fn(async () => ({ foods: [] })) };
    const provider = new USDAFoodDataCentralProvider(null, { client, pageSize: 3 });
    await expect(provider.resolveIngredient({ name: 'rice' })).resolves.toEqual([]);
    expect(client.searchFood).toHaveBeenCalledWith('rice', 3);
  });
});
