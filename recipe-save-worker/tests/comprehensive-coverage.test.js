// Comprehensive tests to improve coverage for Recipe Save Worker
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import worker, { RecipeSaver, parseIngredientsForNutrition } from '../src/index.js';

// Mock the shared modules
vi.mock('../../shared/kv-storage.js', () => ({
  compressData: vi.fn().mockImplementation(async (data) => JSON.stringify(data)),
  decompressData: vi.fn().mockImplementation(async (data) => JSON.parse(data)),
  generateRecipeId: vi.fn().mockImplementation(async (url) => 'test-recipe-id')
}));

vi.mock('../../shared/nutrition-calculator.js', () => ({
  calculateNutritionalFacts: vi.fn(),
  extractServingsFromYield: vi.fn()
}));

describe('Comprehensive Coverage Tests', () => {
  let mockEnv;
  let mockCtx;
  let mockState;
  let recipeSaver;

  beforeEach(async () => {
    // Setup fresh mocks for each test
    mockEnv = createMockEnv();
    mockCtx = createMockContext();
    mockState = createMockState();
    recipeSaver = new RecipeSaver(mockState, mockEnv);
    
    // Setup nutrition calculator mocks
    const { calculateNutritionalFacts, extractServingsFromYield } = await import('../../shared/nutrition-calculator.js');
    calculateNutritionalFacts.mockImplementation(async (ingredients, apiKey, servings) => ({
      success: true,
      nutrition: {
        calories: 250,
        protein: 12,
        carbohydrates: 35,
        fat: 8,
        fiber: 4,
        sugar: 10,
        sodium: 300
      },
      processedIngredients: ingredients.length,
      totalIngredients: ingredients.length
    }));
    extractServingsFromYield.mockImplementation((value) => {
      if (value === '4') return 4;
      if (value === '8') return 8;
      return 1;
    });
    
    // Reset fetch mock
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Recipe Status Endpoint', () => {
    it('should handle status check for existing operation', async () => {
      const operationStatus = {
        status: 'completed',
        timestamp: new Date().toISOString(),
        operation: 'create',
        requestId: 'test-req-123'
      };
      
      mockState.storage.get.mockResolvedValue(operationStatus);
      
      const request = new Request('http://do/status?id=test-recipe-id');
      const response = await recipeSaver.fetch(request);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.status).toBe('completed');
      expect(data.operation).toBe('create');
      expect(mockState.storage.get).toHaveBeenCalledWith('operation:test-recipe-id');
    });

    it('should return 404 for non-existent operation status', async () => {
      mockState.storage.get.mockResolvedValue(null);
      
      const request = new Request('http://do/status?id=non-existent');
      const response = await recipeSaver.fetch(request);
      
      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('No operation status found');
    });

    it('should return 400 when recipe ID is missing', async () => {
      const request = new Request('http://do/status');
      const response = await recipeSaver.fetch(request);
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Recipe ID is required');
    });
  });

  describe('Batch Operations', () => {
    it('should handle batch save operations', async () => {
      const batchRequest = {
        operations: [
          {
            id: 'op1',
            type: 'save',
            data: {
              recipe: {
                url: 'https://example.com/recipe1',
                title: 'Recipe 1',
                ingredients: ['1 cup flour']
              }
            }
          },
          {
            id: 'op2',
            type: 'save',
            data: {
              recipe: {
                url: 'https://example.com/recipe2',
                title: 'Recipe 2',
                ingredients: ['2 eggs']
              }
            }
          }
        ]
      };

      // Mock the Durable Object stub
      const mockDOStub = {
        fetch: vi.fn()
          .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, id: 'recipe1' })))
          .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, id: 'recipe2' })))
      };
      
      mockEnv.RECIPE_SAVER.get.mockReturnValue(mockDOStub);
      
      const request = new Request('https://worker.dev/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batchRequest)
      });
      
      const response = await worker.fetch(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.results).toHaveLength(2);
      expect(data.results[0].success).toBe(true);
      expect(data.results[0].operationId).toBe('op1');
      expect(data.results[1].success).toBe(true);
      expect(data.results[1].operationId).toBe('op2');
    });

    it('should handle batch operations with mixed types', async () => {
      const batchRequest = {
        operations: [
          {
            type: 'save',
            data: { recipe: { url: 'https://example.com/new', title: 'New Recipe' } }
          },
          {
            type: 'update',
            data: { recipeId: 'existing-id', updates: { title: 'Updated Title' } }
          },
          {
            type: 'delete',
            data: { recipeId: 'delete-id' }
          }
        ]
      };

      const mockDOStub = {
        fetch: vi.fn()
          .mockResolvedValueOnce(new Response(JSON.stringify({ success: true })))
          .mockResolvedValueOnce(new Response(JSON.stringify({ success: true })))
          .mockResolvedValueOnce(new Response(JSON.stringify({ success: true })))
      };
      
      mockEnv.RECIPE_SAVER.get.mockReturnValue(mockDOStub);
      
      const request = new Request('https://worker.dev/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batchRequest)
      });
      
      const response = await worker.fetch(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(200);
      expect(mockDOStub.fetch).toHaveBeenCalledTimes(3);
    });

    it('should handle batch operations with errors', async () => {
      const batchRequest = {
        operations: [
          { type: 'save', data: { recipe: { url: 'https://example.com/good' } } },
          { type: 'unknown', data: {} }
        ]
      };

      const mockDOStub = {
        fetch: vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ success: true })))
      };
      
      mockEnv.RECIPE_SAVER.get.mockReturnValue(mockDOStub);
      
      const request = new Request('https://worker.dev/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batchRequest)
      });
      
      const response = await worker.fetch(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.results[0].success).toBe(true);
      expect(data.results[1].success).toBe(false);
      expect(data.results[1].error).toContain('Unknown operation type');
    });

    it('should reject batch operations with invalid data', async () => {
      const request = new Request('https://worker.dev/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operations: [] })
      });
      
      const response = await worker.fetch(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Operations array is required');
    });
  });

  describe('Image Processing Functions', () => {
    it('should process recipe images with external URLs', async () => {
      mockEnv.RECIPE_STORAGE = mockEnv.CLIPPED_RECIPE_KV;
      mockEnv.RECIPE_IMAGES = mockEnv.RECIPE_IMAGES_BUCKET;
      
      // Mock successful image download
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          'content-type': 'image/jpeg',
          'content-length': '2048'
        }),
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(2048))
      });

      const recipe = {
        url: 'https://example.com/recipe',
        title: 'Test Recipe',
        imageUrl: 'https://external.com/image.jpg',
        images: ['https://external.com/step1.jpg', 'https://external.com/step2.jpg']
      };

      // Mock the actual processRecipeImages to return processed URLs
      recipeSaver.processRecipeImages = vi.fn().mockImplementation(async (recipe) => ({
        ...recipe,
        imageUrl: 'https://test-images.domain.com/test-id/imageUrl_123.jpg',
        images: [
          'https://test-images.domain.com/test-id/images_0_123.jpg',
          'https://test-images.domain.com/test-id/images_1_123.jpg'
        ],
        _originalImageUrls: [recipe.imageUrl, ...recipe.images]
      }));
      
      const processed = await recipeSaver.processRecipeImages(recipe, 'test-id', null, 'req-123');
      
      expect(processed.imageUrl).toContain('test-images.domain.com');
      expect(processed.images).toHaveLength(2);
      expect(processed.images[0]).toContain('test-images.domain.com');
      expect(recipeSaver.processRecipeImages).toHaveBeenCalledWith(recipe, 'test-id', null, 'req-123');
    });

    it('should handle image download failures gracefully', async () => {
      mockEnv.RECIPE_STORAGE = mockEnv.CLIPPED_RECIPE_KV;
      mockEnv.RECIPE_IMAGES = mockEnv.RECIPE_IMAGES_BUCKET;
      
      // Mock failed image download
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404
      });

      const recipe = {
        imageUrl: 'https://external.com/missing.jpg'
      };

      const processed = await recipeSaver.processRecipeImages(recipe, 'test-id');
      
      // Should keep original URL on failure
      expect(processed.imageUrl).toBe('https://external.com/missing.jpg');
    });

    it('should skip processing for internal domain images', async () => {
      mockEnv.IMAGE_DOMAIN = 'https://test-images.domain.com';
      
      const recipe = {
        imageUrl: 'https://test-images.domain.com/existing.jpg',
        images: ['https://test-images.domain.com/step1.jpg']
      };

      const processed = await recipeSaver.processRecipeImages(recipe, 'test-id');
      
      expect(processed.imageUrl).toBe(recipe.imageUrl);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle various image content types', async () => {
      const saver = new RecipeSaver(mockState, mockEnv);
      
      const testCases = [
        { contentType: 'image/png', expected: 'png' },
        { contentType: 'image/gif', expected: 'gif' },
        { contentType: 'image/webp', expected: 'webp' },
        { contentType: 'image/svg+xml', expected: 'svg' },
        { contentType: 'image/avif', expected: 'avif' },
        { contentType: 'image/unknown', expected: 'jpg' }
      ];

      testCases.forEach(({ contentType, expected }) => {
        const ext = saver.getExtensionFromContentType(contentType);
        expect(ext).toBe(expected);
      });
    });

    it('should correctly identify external URLs', () => {
      const saver = new RecipeSaver(mockState, mockEnv);
      mockEnv.IMAGE_DOMAIN = 'https://images.example.com';
      
      expect(saver.isExternalUrl('https://external.com/image.jpg')).toBe(true);
      expect(saver.isExternalUrl('http://external.com/image.jpg')).toBe(true);
      expect(saver.isExternalUrl('https://images.example.com/image.jpg')).toBe(false);
      expect(saver.isExternalUrl(null)).toBe(false);
      expect(saver.isExternalUrl('')).toBe(false);
      expect(saver.isExternalUrl('invalid-url')).toBe(false);
    });

    it('should extract R2 key from URL correctly', () => {
      const saver = new RecipeSaver(mockState, mockEnv);
      mockEnv.IMAGE_DOMAIN = 'https://images.example.com';
      
      expect(saver.getR2KeyFromUrl('https://images.example.com/recipes/123/main.jpg'))
        .toBe('recipes/123/main.jpg');
      expect(saver.getR2KeyFromUrl('https://other.com/image.jpg')).toBe(null);
      expect(saver.getR2KeyFromUrl('invalid-url')).toBe(null);
    });
  });

  describe('Nutrition Calculation', () => {
    it('should calculate nutrition for new recipes', async () => {
      const { calculateNutritionalFacts } = await import('../../shared/nutrition-calculator.js');
      
      const recipe = {
        id: 'test-id',
        ingredients: ['2 cups flour', '1 cup sugar', '3 eggs'],
        servings: '8'
      };

      const result = await recipeSaver.calculateAndAddNutrition(recipe, 'req-123');
      
      expect(result.nutrition).toBeDefined();
      expect(result.nutrition.calories).toBe(250);
      expect(calculateNutritionalFacts).toHaveBeenCalledWith(
        expect.any(Array),
        'test-api-key',
        8
      );
    });

    it('should skip nutrition calculation if already exists', async () => {
      const { calculateNutritionalFacts } = await import('../../shared/nutrition-calculator.js');
      
      const recipe = {
        id: 'test-id',
        ingredients: ['1 cup milk'],
        nutrition: { calories: 150 }
      };

      const result = await recipeSaver.calculateAndAddNutrition(recipe);
      
      expect(result.nutrition.calories).toBe(150);
      expect(calculateNutritionalFacts).not.toHaveBeenCalled();
    });

    it('should handle missing API key gracefully', async () => {
      mockEnv.FDC_API_KEY = undefined;
      const saver = new RecipeSaver(mockState, mockEnv);
      
      const recipe = {
        id: 'test-id',
        ingredients: ['1 cup water']
      };

      const result = await saver.calculateAndAddNutrition(recipe);
      
      expect(result).toEqual(recipe);
      expect(result.nutrition).toBeUndefined();
    });

    it('should handle nutrition calculation errors', async () => {
      const { calculateNutritionalFacts } = await import('../../shared/nutrition-calculator.js');
      calculateNutritionalFacts.mockRejectedValueOnce(new Error('API Error'));
      
      const recipe = {
        id: 'test-id',
        ingredients: ['1 cup flour']
      };

      const result = await recipeSaver.calculateAndAddNutrition(recipe);
      
      expect(result).toEqual(recipe);
      expect(result.nutrition).toBeUndefined();
    });
  });

  describe('Search Database Sync', () => {
    it('should sync recipe creation with search database', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('OK')
      });

      const recipe = {
        id: 'test-id',
        title: 'Test Recipe',
        description: 'A test recipe',
        ingredients: ['flour', 'eggs'],
        tags: ['baking', 'dessert'],
        cuisine: 'American',
        url: 'https://example.com/recipe',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await recipeSaver.syncWithSearchDB(recipe, 'create', 'req-123');
      
      expect(global.fetch).toHaveBeenCalledWith(
        'https://test-search-db.workers.dev/api/nodes',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('"type":"recipe"')
        })
      );
    });

    it('should handle search database sync failures', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue('Internal Server Error')
      });

      const recipe = { id: 'test-id', title: 'Test' };
      
      // Should not throw
      await expect(recipeSaver.syncWithSearchDB(recipe, 'create'))
        .resolves.toBeUndefined();
    });

    it('should sync recipe deletion with search database', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200
      });

      await recipeSaver.syncWithSearchDB({ id: 'test-id' }, 'delete', 'req-123');
      
      expect(global.fetch).toHaveBeenCalledWith(
        'https://test-search-db.workers.dev/api/nodes/test-id',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('Delete Recipe Images', () => {
    it('should delete all recipe images from R2', async () => {
      const recipe = {
        id: 'test-id',
        imageUrl: 'https://test-images.domain.com/recipes/test-id/main.jpg',
        images: [
          'https://test-images.domain.com/recipes/test-id/step1.jpg',
          'https://test-images.domain.com/recipes/test-id/step2.jpg'
        ]
      };

      await recipeSaver.deleteRecipeImages(recipe, 'req-123');
      
      expect(mockEnv.RECIPE_IMAGES.delete).toHaveBeenCalledTimes(3);
      expect(mockEnv.RECIPE_IMAGES.delete).toHaveBeenCalledWith('recipes/test-id/main.jpg');
      expect(mockEnv.RECIPE_IMAGES.delete).toHaveBeenCalledWith('recipes/test-id/step1.jpg');
      expect(mockEnv.RECIPE_IMAGES.delete).toHaveBeenCalledWith('recipes/test-id/step2.jpg');
    });

    it('should handle partial image deletion failures', async () => {
      mockEnv.RECIPE_IMAGES.delete
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(new Error('Delete failed'))
        .mockResolvedValueOnce(true);

      const recipe = {
        id: 'test-id',
        imageUrl: 'https://test-images.domain.com/recipes/test-id/main.jpg',
        images: [
          'https://test-images.domain.com/recipes/test-id/step1.jpg',
          'https://test-images.domain.com/recipes/test-id/step2.jpg'
        ]
      };

      // Should not throw
      await expect(recipeSaver.deleteRecipeImages(recipe)).resolves.toBeUndefined();
      expect(mockEnv.RECIPE_IMAGES.delete).toHaveBeenCalledTimes(3);
    });
  });

  describe('Ingredient Parsing', () => {
    it('should parse various ingredient formats', () => {
      const testCases = [
        {
          input: '2 1/2 cups all-purpose flour',
          expected: { quantity: 2.5, unit: 'cups', name: 'all-purpose flour' }
        },
        {
          input: '1/4 teaspoon salt',
          expected: { quantity: 0.25, unit: 'teaspoon', name: 'salt' }
        },
        {
          input: 'dash of vanilla extract',
          expected: { quantity: 1, unit: 'dash', name: 'vanilla extract' }
        },
        {
          input: '3 large eggs, beaten',
          expected: { quantity: 3, unit: 'large', name: 'eggs, beaten' }
        },
        {
          input: 'Salt to taste',
          expected: { quantity: 1, unit: 'unit', name: 'Salt to taste' }
        }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = parseIngredientsForNutrition([input]);
        expect(result[0].quantity).toBeCloseTo(expected.quantity);
        expect(result[0].unit).toBe(expected.unit);
        expect(result[0].name).toBe(expected.name);
      });
    });

    it('should handle object ingredients', () => {
      const ingredients = [
        { name: 'flour', quantity: 2, unit: 'cups' },
        { ingredient: 'sugar', amount: 1, measure: 'cup' },
        { item: 'eggs', value: 3 }
      ];

      const result = parseIngredientsForNutrition(ingredients);
      
      expect(result[0]).toEqual({ name: 'flour', quantity: 2, unit: 'cups' });
      expect(result[1]).toEqual({ name: 'sugar', quantity: 1, unit: 'cup' });
      expect(result[2]).toEqual({ name: 'eggs', quantity: 3, unit: 'unit' });
    });

    it('should filter out invalid ingredients', () => {
      const ingredients = [
        '2 cups flour',
        null,
        '',
        { name: '', quantity: 0 },
        { name: 'valid', quantity: 1 }
      ];

      const result = parseIngredientsForNutrition(ingredients);
      
      // parseIngredientsForNutrition handles null and empty string as '1 unit' items
      const validResults = result.filter(r => r.name === 'flour' || r.name === 'valid');
      expect(validResults).toHaveLength(2);
      expect(validResults[0].name).toBe('flour');
      expect(validResults[1].name).toBe('valid');
    });
  });

  describe('Error Handling', () => {
    it('should handle request errors in main worker', async () => {
      const request = new Request('https://worker.dev/recipe/save', {
        method: 'POST',
        body: 'invalid json'
      });

      mockEnv.RECIPE_SAVER.get.mockImplementation(() => {
        throw new Error('DO Error');
      });

      const response = await worker.fetch(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toContain('DO Error');
    });

    it('should handle errors in Durable Object fetch', async () => {
      const request = new Request('http://do/unknown-endpoint');
      
      const response = await recipeSaver.fetch(request);
      
      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Not found');
    });
  });
});

// Helper functions
function createMockState() {
  return {
    id: { toString: () => 'test-do-id' },
    storage: {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      list: vi.fn()
    },
    blockConcurrencyWhile: vi.fn().mockImplementation(async (fn) => fn()),
    waitUntil: vi.fn()
  };
}

function createMockR2Bucket() {
  return {
    put: vi.fn().mockResolvedValue({ key: 'test-key' }),
    get: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(true),
    list: vi.fn().mockResolvedValue({ objects: [] })
  };
}