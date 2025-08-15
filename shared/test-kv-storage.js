/**
 * Unit tests for shared KV storage library
 * Tests all functions to ensure they work correctly after refactoring
 */

import { 
  generateRecipeId, 
  compressData, 
  decompressData, 
  saveRecipeToKV, 
  getRecipeFromKV, 
  deleteRecipeFromKV, 
  listRecipesFromKV, 
  recipeExistsInKV, 
  getRecipeMetadata 
} from './kv-storage.js';

// Mock environment for testing
const mockEnv = {
  RECIPE_STORAGE: {
    put: jest.fn(),
    get: jest.fn(),
    delete: jest.fn(),
    list: jest.fn()
  }
};

// Test data
const testUrl = 'https://www.allrecipes.com/recipe/24074/alysias-basic-meat-lasagna/';
const testRecipeData = {
  name: 'Test Recipe',
  ingredients: ['ingredient 1', 'ingredient 2'],
  instructions: ['step 1', 'step 2'],
  description: 'A test recipe for unit testing'
};

describe('KV Storage Library Tests', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe('generateRecipeId', () => {
    test('should generate consistent hash for same URL', async () => {
      const id1 = await generateRecipeId(testUrl);
      const id2 = await generateRecipeId(testUrl);
      
      expect(id1).toBe(id2);
      expect(typeof id1).toBe('string');
      expect(id1.length).toBe(64); // SHA-256 hash length
    });

    test('should generate different hashes for different URLs', async () => {
      const id1 = await generateRecipeId(testUrl);
      const id2 = await generateRecipeId('https://different-url.com/recipe');
      
      expect(id1).not.toBe(id2);
    });

    test('should handle empty URL', async () => {
      const id = await generateRecipeId('');
      expect(typeof id).toBe('string');
      expect(id.length).toBe(64);
    });
  });

  describe('compressData', () => {
    test('should compress data and return base64 string', async () => {
      const compressed = await compressData(testRecipeData);
      
      expect(typeof compressed).toBe('string');
      expect(compressed.length).toBeGreaterThan(0);
      // Base64 should only contain valid characters
      expect(compressed).toMatch(/^[A-Za-z0-9+/]*={0,2}$/);
    });

    test('should compress different data types', async () => {
      const stringData = 'test string';
      const arrayData = [1, 2, 3, 'test'];
      const objectData = { key: 'value', number: 42 };
      
      const compressedString = await compressData(stringData);
      const compressedArray = await compressData(arrayData);
      const compressedObject = await compressData(objectData);
      
      expect(typeof compressedString).toBe('string');
      expect(typeof compressedArray).toBe('string');
      expect(typeof compressedObject).toBe('string');
    });

    test('should handle empty data', async () => {
      const compressed = await compressData({});
      expect(typeof compressed).toBe('string');
    });
  });

  describe('decompressData', () => {
    test('should decompress data correctly', async () => {
      const compressed = await compressData(testRecipeData);
      const decompressed = await decompressData(compressed);
      
      expect(decompressed).toEqual(testRecipeData);
    });

    test('should handle different data types', async () => {
      const testCases = [
        'test string',
        [1, 2, 3, 'test'],
        { key: 'value', number: 42 },
        null,
        undefined
      ];

      for (const testCase of testCases) {
        const compressed = await compressData(testCase);
        const decompressed = await decompressData(compressed);
        expect(decompressed).toEqual(testCase);
      }
    });

    test('should throw error for invalid base64', async () => {
      await expect(decompressData('invalid-base64!@#')).rejects.toThrow();
    });
  });

  describe('saveRecipeToKV', () => {
    test('should save recipe successfully', async () => {
      mockEnv.RECIPE_STORAGE.put.mockResolvedValue();
      
      const recipeId = await generateRecipeId(testUrl);
      const result = await saveRecipeToKV(mockEnv, recipeId, {
        url: testUrl,
        data: testRecipeData
      });
      
      expect(result.success).toBe(true);
      expect(result.id).toBe(recipeId);
      expect(mockEnv.RECIPE_STORAGE.put).toHaveBeenCalledWith(recipeId, expect.any(String));
    });

    test('should handle KV storage errors', async () => {
      mockEnv.RECIPE_STORAGE.put.mockRejectedValue(new Error('KV error'));
      
      const recipeId = await generateRecipeId(testUrl);
      const result = await saveRecipeToKV(mockEnv, recipeId, {
        url: testUrl,
        data: testRecipeData
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('KV error');
    });

    test('should create proper recipe record structure', async () => {
      mockEnv.RECIPE_STORAGE.put.mockResolvedValue();
      
      const recipeId = await generateRecipeId(testUrl);
      await saveRecipeToKV(mockEnv, recipeId, {
        url: testUrl,
        data: testRecipeData
      });
      
      // Verify the compressed data contains the expected structure
      const compressedData = mockEnv.RECIPE_STORAGE.put.mock.calls[0][1];
      const decompressed = await decompressData(compressedData);
      
      expect(decompressed).toHaveProperty('id', recipeId);
      expect(decompressed).toHaveProperty('url', testUrl);
      expect(decompressed).toHaveProperty('data', testRecipeData);
      expect(decompressed).toHaveProperty('scrapedAt');
      expect(decompressed).toHaveProperty('version', '1.1');
    });
  });

  describe('getRecipeFromKV', () => {
    test('should retrieve recipe successfully', async () => {
      const recipeId = await generateRecipeId(testUrl);
      const recipeRecord = {
        id: recipeId,
        url: testUrl,
        data: testRecipeData,
        scrapedAt: new Date().toISOString(),
        version: '1.1'
      };
      const compressedData = await compressData(recipeRecord);
      
      mockEnv.RECIPE_STORAGE.get.mockResolvedValue(compressedData);
      
      const result = await getRecipeFromKV(mockEnv, recipeId);
      
      expect(result.success).toBe(true);
      expect(result.recipe).toEqual(recipeRecord);
      expect(mockEnv.RECIPE_STORAGE.get).toHaveBeenCalledWith(recipeId);
    });

    test('should handle recipe not found', async () => {
      mockEnv.RECIPE_STORAGE.get.mockResolvedValue(null);
      
      const result = await getRecipeFromKV(mockEnv, 'nonexistent-id');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Recipe not found');
    });

    test('should handle uncompressed data (backward compatibility)', async () => {
      const recipeId = await generateRecipeId(testUrl);
      const recipeRecord = {
        id: recipeId,
        url: testUrl,
        data: testRecipeData,
        scrapedAt: new Date().toISOString(),
        version: '1.0'
      };
      const jsonData = JSON.stringify(recipeRecord);
      
      mockEnv.RECIPE_STORAGE.get.mockResolvedValue(jsonData);
      
      const result = await getRecipeFromKV(mockEnv, recipeId);
      
      expect(result.success).toBe(true);
      expect(result.recipe).toEqual(recipeRecord);
    });

    test('should handle corrupted data', async () => {
      mockEnv.RECIPE_STORAGE.get.mockResolvedValue('corrupted-data');
      
      const result = await getRecipeFromKV(mockEnv, 'test-id');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid recipe data format');
    });
  });

  describe('deleteRecipeFromKV', () => {
    test('should delete recipe successfully', async () => {
      mockEnv.RECIPE_STORAGE.delete.mockResolvedValue();
      
      const result = await deleteRecipeFromKV(mockEnv, 'test-id');
      
      expect(result.success).toBe(true);
      expect(mockEnv.RECIPE_STORAGE.delete).toHaveBeenCalledWith('test-id');
    });

    test('should handle deletion errors', async () => {
      mockEnv.RECIPE_STORAGE.delete.mockRejectedValue(new Error('Delete failed'));
      
      const result = await deleteRecipeFromKV(mockEnv, 'test-id');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Delete failed');
    });
  });

  describe('listRecipesFromKV', () => {
    test('should list recipes with pagination', async () => {
      const recipe1 = {
        id: 'id1',
        url: 'url1',
        data: { name: 'Recipe 1' },
        scrapedAt: new Date().toISOString(),
        version: '1.1'
      };
      const recipe2 = {
        id: 'id2',
        url: 'url2',
        data: { name: 'Recipe 2' },
        scrapedAt: new Date().toISOString(),
        version: '1.1'
      };
      
      const compressed1 = await compressData(recipe1);
      const compressed2 = await compressData(recipe2);
      
      mockEnv.RECIPE_STORAGE.list.mockResolvedValue({
        keys: [{ name: 'id1' }, { name: 'id2' }],
        cursor: 'next-cursor',
        list_complete: false
      });
      mockEnv.RECIPE_STORAGE.get
        .mockResolvedValueOnce(compressed1)
        .mockResolvedValueOnce(compressed2);
      
      const result = await listRecipesFromKV(mockEnv, null, 2);
      
      expect(result.success).toBe(true);
      expect(result.recipes).toHaveLength(2);
      expect(result.recipes).toEqual([recipe1, recipe2]);
      expect(result.cursor).toBe('next-cursor');
      expect(result.list_complete).toBe(false);
    });

    test('should handle empty list', async () => {
      mockEnv.RECIPE_STORAGE.list.mockResolvedValue({
        keys: [],
        cursor: null,
        list_complete: true
      });
      
      const result = await listRecipesFromKV(mockEnv);
      
      expect(result.success).toBe(true);
      expect(result.recipes).toHaveLength(0);
      expect(result.list_complete).toBe(true);
    });

    test('should handle corrupted recipes in list', async () => {
      const validRecipe = {
        id: 'id1',
        url: 'url1',
        data: { name: 'Valid Recipe' },
        scrapedAt: new Date().toISOString(),
        version: '1.1'
      };
      const compressedValid = await compressData(validRecipe);
      
      mockEnv.RECIPE_STORAGE.list.mockResolvedValue({
        keys: [{ name: 'id1' }, { name: 'id2' }],
        cursor: null,
        list_complete: true
      });
      mockEnv.RECIPE_STORAGE.get
        .mockResolvedValueOnce(compressedValid)
        .mockResolvedValueOnce('corrupted-data');
      
      const result = await listRecipesFromKV(mockEnv);
      
      expect(result.success).toBe(true);
      expect(result.recipes).toHaveLength(1);
      expect(result.recipes[0]).toEqual(validRecipe);
    });
  });

  describe('recipeExistsInKV', () => {
    test('should return true for existing recipe', async () => {
      mockEnv.RECIPE_STORAGE.get.mockResolvedValue('some-data');
      
      const result = await recipeExistsInKV(mockEnv, 'existing-id');
      
      expect(result.success).toBe(true);
      expect(result.exists).toBe(true);
      expect(mockEnv.RECIPE_STORAGE.get).toHaveBeenCalledWith('existing-id');
    });

    test('should return false for non-existing recipe', async () => {
      mockEnv.RECIPE_STORAGE.get.mockResolvedValue(null);
      
      const result = await recipeExistsInKV(mockEnv, 'non-existing-id');
      
      expect(result.success).toBe(true);
      expect(result.exists).toBe(false);
    });

    test('should handle errors', async () => {
      mockEnv.RECIPE_STORAGE.get.mockRejectedValue(new Error('KV error'));
      
      const result = await recipeExistsInKV(mockEnv, 'test-id');
      
      expect(result.success).toBe(false);
      expect(result.exists).toBe(false);
      expect(result.error).toBe('KV error');
    });
  });

  describe('getRecipeMetadata', () => {
    test('should return metadata for existing recipe', async () => {
      const recipeRecord = {
        id: 'test-id',
        url: testUrl,
        data: testRecipeData,
        scrapedAt: '2024-01-01T12:00:00.000Z',
        version: '1.1'
      };
      const compressedData = await compressData(recipeRecord);
      
      mockEnv.RECIPE_STORAGE.get.mockResolvedValue(compressedData);
      
      const result = await getRecipeMetadata(mockEnv, 'test-id');
      
      expect(result.success).toBe(true);
      expect(result.metadata).toEqual({
        id: 'test-id',
        url: testUrl,
        scrapedAt: '2024-01-01T12:00:00.000Z',
        version: '1.1',
        name: 'Test Recipe',
        hasIngredients: true,
        hasInstructions: true,
        ingredientCount: 2,
        instructionCount: 2
      });
    });

    test('should handle recipe not found', async () => {
      mockEnv.RECIPE_STORAGE.get.mockResolvedValue(null);
      
      const result = await getRecipeMetadata(mockEnv, 'non-existing-id');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Recipe not found');
    });

    test('should handle missing recipe data fields', async () => {
      const recipeRecord = {
        id: 'test-id',
        url: testUrl,
        data: { name: 'Test Recipe' }, // Missing ingredients and instructions
        scrapedAt: '2024-01-01T12:00:00.000Z',
        version: '1.1'
      };
      const compressedData = await compressData(recipeRecord);
      
      mockEnv.RECIPE_STORAGE.get.mockResolvedValue(compressedData);
      
      const result = await getRecipeMetadata(mockEnv, 'test-id');
      
      expect(result.success).toBe(true);
      expect(result.metadata.hasIngredients).toBe(false);
      expect(result.metadata.hasInstructions).toBe(false);
      expect(result.metadata.ingredientCount).toBe(0);
      expect(result.metadata.instructionCount).toBe(0);
    });
  });

  describe('Integration Tests', () => {
    test('should save and retrieve recipe correctly', async () => {
      const recipeId = await generateRecipeId(testUrl);
      
      // Save recipe
      mockEnv.RECIPE_STORAGE.put.mockResolvedValue();
      const saveResult = await saveRecipeToKV(mockEnv, recipeId, {
        url: testUrl,
        data: testRecipeData
      });
      expect(saveResult.success).toBe(true);
      
      // Retrieve recipe
      const compressedData = mockEnv.RECIPE_STORAGE.put.mock.calls[0][1];
      mockEnv.RECIPE_STORAGE.get.mockResolvedValue(compressedData);
      
      const getResult = await getRecipeFromKV(mockEnv, recipeId);
      expect(getResult.success).toBe(true);
      expect(getResult.recipe.data).toEqual(testRecipeData);
    });

    test('should check existence and get metadata', async () => {
      const recipeId = await generateRecipeId(testUrl);
      const recipeRecord = {
        id: recipeId,
        url: testUrl,
        data: testRecipeData,
        scrapedAt: new Date().toISOString(),
        version: '1.1'
      };
      const compressedData = await compressData(recipeRecord);
      
      // Check existence
      mockEnv.RECIPE_STORAGE.get.mockResolvedValue(compressedData);
      const existsResult = await recipeExistsInKV(mockEnv, recipeId);
      expect(existsResult.exists).toBe(true);
      
      // Get metadata
      const metadataResult = await getRecipeMetadata(mockEnv, recipeId);
      expect(metadataResult.success).toBe(true);
      expect(metadataResult.metadata.name).toBe('Test Recipe');
    });
  });
});

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🧪 Running KV Storage Library Tests...\n');
  
  // Simple test runner for Node.js environment
  const runTests = async () => {
    try {
      // Test basic functionality
      console.log('Testing generateRecipeId...');
      const id1 = await generateRecipeId(testUrl);
      const id2 = await generateRecipeId(testUrl);
      console.log('✅ generateRecipeId:', id1 === id2 ? 'PASS' : 'FAIL');
      
      console.log('Testing compression...');
      const compressed = await compressData(testRecipeData);
      const decompressed = await decompressData(compressed);
      console.log('✅ compression:', JSON.stringify(decompressed) === JSON.stringify(testRecipeData) ? 'PASS' : 'FAIL');
      
      console.log('\n🎉 Basic tests completed successfully!');
      console.log('For full test suite, use a proper testing framework like Jest.');
      
    } catch (error) {
      console.error('❌ Test failed:', error.message);
      process.exit(1);
    }
  };
  
  runTests();
}
