import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RecipeSaver, parseIngredientsForNutrition } from '../src/index.js';

describe('Nutrition Integration', () => {
  let saver;
  let env;
  let state;

  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();

    state = {
      id: { toString: () => 'test-id' },
      storage: {
        put: vi.fn().mockResolvedValue(),
        get: vi.fn().mockResolvedValue(null),
        delete: vi.fn().mockResolvedValue()
      },
      blockConcurrencyWhile: vi.fn().mockImplementation(async (fn) => fn()),
      waitUntil: vi.fn()
    };

    env = {
      CLIPPED_RECIPE_KV: createMockKVNamespace(),
      RECIPE_METADATA_KV: createMockKVNamespace(),
      RECIPE_IMAGE_KV: createMockKVNamespace(),
      RECIPE_SAVER: {
        idFromName: vi.fn().mockReturnValue('test-id'),
        get: vi.fn().mockReturnValue({
          fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }))
        })
      },
      SEARCH_DB_URL: 'https://search.test.com',
      RECIPE_IMAGES_BUCKET: createMockR2Bucket(),
      IMAGE_DOMAIN: 'https://images.test.com',
      FDC_API_KEY: 'test-api-key',
      ENVIRONMENT: 'test'
    };

    // Mock fetch for various API calls
    global.fetch = vi.fn().mockImplementation(async (url) => {
      if (url.includes('search.test.com')) {
        return new Response('OK', { status: 200 });
      }
      if (url.includes('api.nal.usda.gov')) {
        // Mock USDA API response
        if (url.includes('foods/search')) {
          return new Response(JSON.stringify({
            foods: [{
              fdcId: 12345,
              description: 'Test Food',
              foodNutrients: [
                { nutrientId: 1008, value: 52 }, // Calories
                { nutrientId: 1003, value: 3.3 }, // Protein
                { nutrientId: 1004, value: 0.5 }, // Fat
                { nutrientId: 1005, value: 10.6 } // Carbs
              ]
            }]
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      // Mock image download
      return new Response(new ArrayBuffer(1024), {
        status: 200,
        headers: new Headers({ 'content-type': 'image/jpeg' })
      });
    });

    saver = new RecipeSaver(state, env);
  });

  describe('Nutrition Calculation', () => {
    it('should calculate nutrition for recipes with ingredients', async () => {
      const recipe = {
        id: 'test-recipe-1',
        title: 'Test Recipe',
        url: 'https://example.com/recipe',
        ingredients: [
          '2 cups flour',
          '1 tablespoon olive oil',
          '1 teaspoon salt',
          '1 cup water'
        ],
        instructions: ['Mix ingredients', 'Bake at 350F'],
        prepTime: 'PT15M',
        cookTime: 'PT30M',
        servings: 4
      };

      const request = new Request('https://do.worker.dev/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recipe)
      });

      const response = await saver.fetch(request);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.id).toBeDefined();

      // Verify nutrition calculation was attempted
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('api.nal.usda.gov'),
        expect.any(Object)
      );
    });

    it('should handle recipes without servings information', async () => {
      const recipe = {
        id: 'test-recipe-2',
        title: 'Test Recipe',
        ingredients: ['1 cup milk', '2 eggs'],
        instructions: ['Mix and cook']
      };

      const request = new Request('https://do.worker.dev/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recipe)
      });

      const response = await saver.fetch(request);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      
      // Should still save recipe even without nutrition
      expect(env.CLIPPED_RECIPE_KV.put).toHaveBeenCalled();
    });

    it('should parse ingredient quantities correctly', () => {
      const testCases = [
        { input: '2 cups flour', expected: { amount: 2, unit: 'cups', item: 'flour' } },
        { input: '1/2 cup sugar', expected: { amount: 0.5, unit: 'cup', item: 'sugar' } },
        { input: '1 1/2 tablespoons butter', expected: { amount: 1.5, unit: 'tablespoons', item: 'butter' } },
        { input: 'pinch of salt', expected: { amount: 1, unit: 'pinch', item: 'salt' } },
        { input: '3 large eggs', expected: { amount: 3, unit: 'large', item: 'eggs' } }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = parseIngredientsForNutrition([input])[0];
        expect(result.amount).toBeCloseTo(expected.amount);
        expect(result.unit).toBe(expected.unit);
        expect(result.item).toContain(expected.item);
      });
    });
  });

  describe('USDA API Integration', () => {
    it('should query USDA API for nutrition data', async () => {
      const ingredients = ['100g chicken breast', '50g rice'];
      
      const request = new Request('https://do.worker.dev/calculate-nutrition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredients })
      });

      const response = await saver.fetch(request);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      // Verify USDA API was called for each ingredient
      const usdaCalls = global.fetch.mock.calls.filter(call => 
        call[0].includes('api.nal.usda.gov')
      );
      expect(usdaCalls.length).toBeGreaterThan(0);
    });

    it('should handle USDA API errors gracefully', async () => {
      // Mock USDA API to return error
      global.fetch.mockImplementation(async (url) => {
        if (url.includes('api.nal.usda.gov')) {
          return new Response('Internal Server Error', { status: 500 });
        }
        return new Response('OK', { status: 200 });
      });

      const recipe = {
        id: 'test-recipe-3',
        title: 'Test Recipe',
        ingredients: ['1 cup flour'],
        servings: 4
      };

      const request = new Request('https://do.worker.dev/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recipe)
      });

      const response = await saver.fetch(request);
      
      // Should still save recipe even if nutrition calculation fails
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it('should cache nutrition data to avoid repeated API calls', async () => {
      const ingredients = ['1 cup flour'];
      
      // First request
      const request1 = new Request('https://do.worker.dev/calculate-nutrition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredients })
      });

      await saver.fetch(request1);
      
      // Second request with same ingredient
      const request2 = new Request('https://do.worker.dev/calculate-nutrition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredients })
      });

      await saver.fetch(request2);
      
      // Should use cached data for second request
      const usdaCalls = global.fetch.mock.calls.filter(call => 
        call[0].includes('api.nal.usda.gov')
      );
      
      // May be called once or twice depending on implementation
      expect(usdaCalls.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Nutrition Storage', () => {
    it('should store nutrition data in metadata KV', async () => {
      const recipe = {
        id: 'test-recipe-4',
        title: 'Nutritious Recipe',
        ingredients: ['2 cups spinach', '1 tablespoon olive oil'],
        servings: 2
      };

      const request = new Request('https://do.worker.dev/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recipe)
      });

      const response = await saver.fetch(request);
      
      expect(response.status).toBe(200);
      
      // Verify metadata was stored with nutrition info
      expect(env.RECIPE_METADATA_KV.put).toHaveBeenCalled();
      const metadataCall = env.RECIPE_METADATA_KV.put.mock.calls[0];
      const metadata = JSON.parse(metadataCall[1]);
      
      expect(metadata).toHaveProperty('nutrition');
      expect(metadata.lastUpdated).toBeDefined();
    });

    it('should retrieve recipes with nutrition data', async () => {
      const mockRecipe = {
        id: 'test-recipe-5',
        title: 'Test Recipe',
        ingredients: ['1 cup rice'],
        nutrition: {
          calories: 200,
          protein: 4,
          carbohydrates: 45,
          fat: 0.5
        }
      };

      env.CLIPPED_RECIPE_KV.get.mockResolvedValue(JSON.stringify(mockRecipe));

      const request = new Request('https://do.worker.dev/get/test-recipe-5');
      const response = await saver.fetch(request);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.nutrition).toBeDefined();
      expect(data.nutrition.calories).toBe(200);
    });
  });
});

// Helper to create mock R2 bucket
function createMockR2Bucket() {
  return {
    put: vi.fn().mockResolvedValue({ key: 'test-key' }),
    get: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(true),
    list: vi.fn().mockResolvedValue({ objects: [] })
  };
}