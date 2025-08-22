// Image Processing Tests for Recipe Save Worker
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RecipeSaver } from '../src/index.js';

// Mock the shared modules
vi.mock('../../shared/kv-storage.js', () => ({
  compressData: vi.fn().mockImplementation(async (data) => JSON.stringify(data)),
  decompressData: vi.fn().mockImplementation(async (data) => JSON.parse(data)),
  generateRecipeId: vi.fn().mockImplementation(async (url) => 'test-recipe-id')
}));

vi.mock('../../shared/nutrition-calculator.js', () => ({
  calculateNutritionalFacts: vi.fn().mockImplementation(async (ingredients) => ({
    calories: 200,
    protein: 10,
    carbohydrates: 30,
    fat: 5
  }))
}));

describe('Image Processing', () => {
  let mockEnv;
  let mockState;
  let recipeSaver;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create mock environment
    mockEnv = {
      CLIPPED_RECIPE_KV: createMockKVNamespace(),
      RECIPE_METADATA_KV: createMockKVNamespace(),
      RECIPE_IMAGE_KV: createMockKVNamespace(),
      RECIPE_IMAGES_BUCKET: createMockR2Bucket(),
      RECIPE_STORAGE: null, // Will be set to CLIPPED_RECIPE_KV in tests
      SEARCH_DB_URL: 'https://test-search-db.workers.dev',
      IMAGE_DOMAIN: 'https://test-images.domain.com',
      ENVIRONMENT: 'test'
    };

    // Create mock state
    mockState = {
      storage: {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn()
      },
      waitUntil: vi.fn(),
      blockConcurrencyWhile: vi.fn().mockImplementation(async (fn) => fn())
    };

    // Create recipe saver instance
    recipeSaver = new RecipeSaver(mockState, mockEnv);
  });

  describe('Recipe Save with Images', () => {
    it('should save recipe with image URL', async () => {
      const imageUrl = 'https://example.com/recipe.jpg';
      
      // Mock fetch for potential image processing
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          'content-type': 'image/jpeg'
        }),
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(2048))
      });

      const request = new Request('http://do/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipe: {
            url: 'https://example.com/test-recipe',
            title: 'Test Recipe with Image',
            imageUrl: imageUrl,
            ingredients: ['1 cup flour', '2 eggs'],
            instructions: ['Mix ingredients', 'Bake']
          },
          options: {}
        })
      });

      mockEnv.RECIPE_STORAGE = mockEnv.CLIPPED_RECIPE_KV;
      mockEnv.RECIPE_STORAGE.get.mockResolvedValue(null);
      mockEnv.RECIPE_STORAGE.put.mockResolvedValue();
      
      // Mock image processing
      recipeSaver.processRecipeImages = vi.fn().mockImplementation(async (recipe) => ({
        ...recipe,
        imageUrl: `https://test-images.domain.com/recipe-images/test-recipe-id/main.webp`
      }));
      recipeSaver.calculateAndAddNutrition = vi.fn().mockImplementation(async (recipe) => recipe);
      recipeSaver.syncWithSearchDB = vi.fn().mockResolvedValue();

      const response = await recipeSaver.fetch(request);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.id).toBe('test-recipe-id');
      
      // Verify image processing was called
      expect(recipeSaver.processRecipeImages).toHaveBeenCalled();
    });

    it('should save recipe with multiple images', async () => {
      const request = new Request('http://do/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipe: {
            url: 'https://example.com/test-recipe',
            title: 'Recipe with Multiple Images',
            imageUrl: 'https://example.com/main.jpg',
            images: [
              'https://example.com/step1.jpg',
              'https://example.com/step2.jpg'
            ],
            ingredients: ['3 eggs', '1 cup milk']
          }
        })
      });

      mockEnv.RECIPE_STORAGE = mockEnv.CLIPPED_RECIPE_KV;
      mockEnv.RECIPE_STORAGE.get.mockResolvedValue(null);
      mockEnv.RECIPE_STORAGE.put.mockResolvedValue();
      
      // Mock processing multiple images
      recipeSaver.processRecipeImages = vi.fn().mockImplementation(async (recipe) => ({
        ...recipe,
        imageUrl: `https://test-images.domain.com/recipe-images/test-recipe-id/main.webp`,
        images: [
          `https://test-images.domain.com/recipe-images/test-recipe-id/main.webp`,
          `https://test-images.domain.com/recipe-images/test-recipe-id/step1.webp`,
          `https://test-images.domain.com/recipe-images/test-recipe-id/step2.webp`
        ]
      }));
      recipeSaver.calculateAndAddNutrition = vi.fn().mockImplementation(async (recipe) => recipe);
      recipeSaver.syncWithSearchDB = vi.fn().mockResolvedValue();

      const response = await recipeSaver.fetch(request);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      
      // Verify multiple images were processed
      const processedRecipe = recipeSaver.processRecipeImages.mock.calls[0][0];
      expect(processedRecipe.images).toHaveLength(2);
    });

    it('should handle recipes without images', async () => {
      const request = new Request('http://do/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipe: {
            url: 'https://example.com/test-recipe',
            title: 'Recipe without Image',
            ingredients: ['1 cup water'],
            instructions: ['Boil water']
          }
        })
      });

      mockEnv.RECIPE_STORAGE = mockEnv.CLIPPED_RECIPE_KV;
      mockEnv.RECIPE_STORAGE.get.mockResolvedValue(null);
      mockEnv.RECIPE_STORAGE.put.mockResolvedValue();
      
      recipeSaver.processRecipeImages = vi.fn().mockImplementation(async (recipe) => recipe);
      recipeSaver.calculateAndAddNutrition = vi.fn().mockImplementation(async (recipe) => recipe);
      recipeSaver.syncWithSearchDB = vi.fn().mockResolvedValue();

      const response = await recipeSaver.fetch(request);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });
  });

  describe('Recipe Update with Images', () => {
    it('should update recipe with new image', async () => {
      const existingRecipe = {
        id: 'test-recipe-id',
        title: 'Existing Recipe',
        imageUrl: 'https://old-image.com/old.jpg',
        ingredients: ['1 cup flour'],
        version: 1
      };
      
      const request = new Request('http://do/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipeId: 'test-recipe-id',
          updates: {
            imageUrl: 'https://example.com/new-image.jpg'
          }
        })
      });

      mockEnv.RECIPE_STORAGE = mockEnv.CLIPPED_RECIPE_KV;
      mockEnv.RECIPE_STORAGE.get.mockResolvedValue(JSON.stringify(existingRecipe));
      mockEnv.RECIPE_STORAGE.put.mockResolvedValue();
      
      recipeSaver.processRecipeImages = vi.fn().mockImplementation(async (updates, recipeId, existing) => ({
        ...updates,
        imageUrl: `https://test-images.domain.com/recipe-images/test-recipe-id/main-v2.webp`
      }));
      recipeSaver.calculateAndAddNutrition = vi.fn().mockImplementation(async (recipe) => recipe);
      recipeSaver.syncWithSearchDB = vi.fn().mockResolvedValue();

      const response = await recipeSaver.fetch(request);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      
      // Verify the recipe was updated
      const storedData = mockEnv.RECIPE_STORAGE.put.mock.calls[0][1];
      const updatedRecipe = JSON.parse(storedData);
      expect(updatedRecipe.version).toBe(2);
      expect(updatedRecipe.imageUrl).toContain('main-v2.webp');
    });
  });

  describe('Recipe Retrieval with Images', () => {
    it('should retrieve recipe with image data', async () => {
      const mockRecipe = {
        id: 'test-recipe-id',
        title: 'Test Recipe',
        imageUrl: 'https://test-images.domain.com/recipe-images/test-recipe-id/main.webp',
        ingredients: ['1 cup milk'],
        nutrition: {
          calories: 150
        }
      };

      mockEnv.RECIPE_STORAGE = mockEnv.CLIPPED_RECIPE_KV;
      mockEnv.RECIPE_STORAGE.get.mockResolvedValue(JSON.stringify(mockRecipe));

      const request = new Request('http://do/get?id=test-recipe-id');
      const response = await recipeSaver.fetch(request);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.imageUrl).toBeDefined();
      expect(data.imageUrl).toBe(mockRecipe.imageUrl);
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