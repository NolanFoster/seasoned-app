// Real Image Processing Tests for Recipe Save Worker (without mocks)
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RecipeSaver } from '../src/index.js';

// Mock the shared modules
vi.mock('../../shared/kv-storage.js', () => ({
  compressData: vi.fn().mockImplementation(async (data) => JSON.stringify(data)),
  decompressData: vi.fn().mockImplementation(async (data) => JSON.parse(data)),
  generateRecipeId: vi.fn().mockImplementation(async (url) => 'test-recipe-id')
}));

vi.mock('../../shared/nutrition-calculator.js', () => ({
  calculateNutritionalFacts: vi.fn().mockImplementation(async () => ({
    success: true,
    nutrition: { calories: 200 }
  }))
}));

describe('Real Image Processing Implementation', () => {
  let mockEnv;
  let mockState;
  let recipeSaver;

  beforeEach(() => {
    // Setup fresh mocks
    mockState = {
      id: { toString: () => 'test-do-id' },
      storage: {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn()
      },
      blockConcurrencyWhile: vi.fn().mockImplementation(async (fn) => fn())
    };

    mockEnv = {
      RECIPE_STORAGE: createMockKVNamespace(),
      RECIPE_IMAGES: createMockR2Bucket(),
      SEARCH_DB_URL: 'https://test-search-db.workers.dev',
      IMAGE_DOMAIN: 'https://test-images.domain.com',
      FDC_API_KEY: 'test-api-key'
    };

    recipeSaver = new RecipeSaver(mockState, mockEnv);
    
    // Reset fetch mock
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('processRecipeImages - Real Implementation', () => {
    it('should process external images and download them', async () => {
      // Mock successful image downloads
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({
            'content-type': 'image/jpeg',
            'content-length': '1024'
          }),
          arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(1024))
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({
            'content-type': 'image/png'
          }),
          arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(2048))
        });

      const recipe = {
        url: 'https://example.com/recipe',
        title: 'Test Recipe',
        imageUrl: 'https://external.com/main.jpg',
        images: ['https://external.com/step1.png']
      };

      // Call the real processRecipeImages method
      const processed = await recipeSaver.processRecipeImages(recipe, 'test-recipe-id', null, 'req-123');
      
      // Check that images were processed
      expect(processed.imageUrl).toContain('test-images.domain.com');
      expect(processed.imageUrl).toContain('test-recipe-id');
      expect(processed.imageUrl).toContain('.jpg');
      
      expect(processed.images).toHaveLength(1);
      expect(processed.images[0]).toContain('test-images.domain.com');
      expect(processed.images[0]).toContain('.png');
      
      // Verify R2 storage was called
      expect(mockEnv.RECIPE_IMAGES.put).toHaveBeenCalledTimes(2);
      
      // Verify the image data was stored with correct metadata
      const firstCall = mockEnv.RECIPE_IMAGES.put.mock.calls[0];
      expect(firstCall[0]).toContain('test-recipe-id/imageUrl_');
      expect(firstCall[2].httpMetadata.contentType).toBe('image/jpeg');
      expect(firstCall[2].customMetadata.recipeId).toBe('test-recipe-id');
      
      const secondCall = mockEnv.RECIPE_IMAGES.put.mock.calls[1];
      expect(secondCall[0]).toContain('test-recipe-id/images_0_');
      expect(secondCall[2].httpMetadata.contentType).toBe('image/png');
    });

    it('should handle download failures and keep original URLs', async () => {
      // Mock failed image download
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 404
        });

      const recipe = {
        imageUrl: 'https://external.com/missing.jpg'
      };

      const processed = await recipeSaver.processRecipeImages(recipe, 'test-recipe-id');
      
      // Should keep original URL on failure
      expect(processed.imageUrl).toBe('https://external.com/missing.jpg');
      expect(mockEnv.RECIPE_IMAGES.put).not.toHaveBeenCalled();
    });

    it('should skip internal domain images', async () => {
      const recipe = {
        imageUrl: 'https://test-images.domain.com/existing.jpg',
        images: ['https://test-images.domain.com/step1.jpg', 'https://external.com/step2.jpg']
      };

      // Only mock for the external image
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'image/jpeg' }),
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(1024))
      });

      const processed = await recipeSaver.processRecipeImages(recipe, 'test-recipe-id');
      
      // Internal URLs should remain unchanged
      expect(processed.imageUrl).toBe('https://test-images.domain.com/existing.jpg');
      expect(processed.images[0]).toBe('https://test-images.domain.com/step1.jpg');
      
      // External URL should be processed
      expect(processed.images[1]).toContain('test-images.domain.com');
      expect(processed.images[1]).toContain('test-recipe-id');
      
      // Only one image should be downloaded
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(mockEnv.RECIPE_IMAGES.put).toHaveBeenCalledTimes(1);
    });

    it('should handle mixed success/failure in batch processing', async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'image/jpeg' }),
          arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(1024))
        })
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'image/gif' }),
          arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(512))
        });

      const recipe = {
        imageUrl: 'https://external.com/main.jpg',
        images: [
          'https://external.com/step1.jpg',
          'https://external.com/step2.gif'
        ]
      };

      const processed = await recipeSaver.processRecipeImages(recipe, 'test-recipe-id');
      
      // First image should be processed successfully
      expect(processed.imageUrl).toContain('test-images.domain.com');
      
      // Second image should keep original URL due to error
      expect(processed.images[0]).toBe('https://external.com/step1.jpg');
      
      // Third image should be processed successfully
      expect(processed.images[1]).toContain('test-images.domain.com');
      expect(processed.images[1]).toContain('.gif');
      
      // Two successful uploads to R2
      expect(mockEnv.RECIPE_IMAGES.put).toHaveBeenCalledTimes(2);
    });

    it('should handle recipes with no images', async () => {
      const recipe = {
        title: 'No Image Recipe',
        ingredients: ['1 cup water']
      };

      const processed = await recipeSaver.processRecipeImages(recipe, 'test-recipe-id');
      
      expect(processed).toEqual(recipe);
      expect(global.fetch).not.toHaveBeenCalled();
      expect(mockEnv.RECIPE_IMAGES.put).not.toHaveBeenCalled();
    });

    it('should handle various image formats correctly', async () => {
      const imageTypes = [
        { url: 'image.webp', contentType: 'image/webp' },
        { url: 'image.avif', contentType: 'image/avif' },
        { url: 'image.svg', contentType: 'image/svg+xml' }
      ];

      for (const { url, contentType } of imageTypes) {
        global.fetch = vi.fn().mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': contentType }),
          arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(1024))
        });

        const recipe = { imageUrl: `https://external.com/${url}` };
        const processed = await recipeSaver.processRecipeImages(recipe, 'test-recipe-id');
        
        const extension = url.split('.')[1];
        expect(processed.imageUrl).toContain(`.${extension === 'svg' ? 'svg' : extension}`);
      }
    });
  });

  describe('downloadAndStoreImage - Edge Cases', () => {
    it('should handle network timeouts', async () => {
      const saver = new RecipeSaver(mockState, mockEnv);
      
      global.fetch = vi.fn().mockRejectedValue(new Error('Network timeout'));

      await expect(
        saver.downloadAndStoreImage('https://slow.com/image.jpg', 'recipe-id', 'imageUrl', 0)
      ).rejects.toThrow('Network timeout');
    });

    it('should handle missing content-type header', async () => {
      const saver = new RecipeSaver(mockState, mockEnv);
      
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({}), // No content-type
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(1024))
      });

      const r2Url = await saver.downloadAndStoreImage(
        'https://external.com/mystery',
        'recipe-id',
        'imageUrl',
        undefined
      );
      
      // Should default to jpg
      expect(r2Url).toContain('.jpg');
      expect(mockEnv.RECIPE_IMAGES.put).toHaveBeenCalledWith(
        expect.stringContaining('.jpg'),
        expect.any(ArrayBuffer),
        expect.objectContaining({
          httpMetadata: expect.objectContaining({
            contentType: 'image/jpeg'
          })
        })
      );
    });
  });

  describe('calculateAndAddNutrition - Real Implementation', () => {
    it('should add nutrition to recipes without it', async () => {
      const { calculateNutritionalFacts } = await import('../../shared/nutrition-calculator.js');
      calculateNutritionalFacts.mockResolvedValueOnce({
        success: true,
        nutrition: {
          calories: 350,
          protein: 15,
          carbohydrates: 45,
          fat: 12
        },
        processedIngredients: 3,
        totalIngredients: 3
      });

      const recipe = {
        id: 'test-recipe',
        ingredients: ['2 cups rice', '1 tbsp oil', '1 tsp salt'],
        servings: '4'
      };

      const result = await recipeSaver.calculateAndAddNutrition(recipe, 'req-123');
      
      expect(result.nutrition).toBeDefined();
      expect(result.nutrition.calories).toBe(350);
      expect(calculateNutritionalFacts).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ name: 'rice', quantity: 2, unit: 'cups' }),
          expect.objectContaining({ name: 'oil', quantity: 1, unit: 'tbsp' }),
          expect.objectContaining({ name: 'salt', quantity: 1, unit: 'tsp' })
        ]),
        'test-api-key',
        4
      );
    });

    it('should handle empty ingredients array', async () => {
      const recipe = {
        id: 'test-recipe',
        ingredients: []
      };

      const result = await recipeSaver.calculateAndAddNutrition(recipe);
      
      expect(result).toEqual(recipe);
      expect(result.nutrition).toBeUndefined();
    });

    it('should handle nutrition API returning no data', async () => {
      const { calculateNutritionalFacts } = await import('../../shared/nutrition-calculator.js');
      calculateNutritionalFacts.mockResolvedValueOnce({
        success: false,
        error: 'No data found'
      });

      const recipe = {
        id: 'test-recipe',
        ingredients: ['1 mystery ingredient']
      };

      const result = await recipeSaver.calculateAndAddNutrition(recipe);
      
      expect(result).toEqual(recipe);
      expect(result.nutrition).toBeUndefined();
    });
  });
});

// Helper to create mock KV namespace
function createMockKVNamespace() {
  return {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    list: vi.fn().mockResolvedValue({ keys: [] })
  };
}

// Helper to create mock R2 bucket
function createMockR2Bucket() {
  return {
    put: vi.fn().mockResolvedValue({ key: 'test-key' }),
    get: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(true),
    list: vi.fn().mockResolvedValue({ objects: [] })
  };
}