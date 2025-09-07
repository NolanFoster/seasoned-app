/**
 * Tests for KV enrichment functionality in recommendation service
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  getRecipeFromKV, 
  getRecipesFromKV, 
  mergeSearchResultsWithKV 
} from '../src/recommendation-service.js';

// Mock the shared KV storage library
vi.mock('../../shared/kv-storage.js', () => ({
  getRecipeFromKV: vi.fn()
}));

describe('KV Enrichment Functions', () => {
  let mockEnv;
  let mockKV;
  let mockGetRecipeFromKV;
  const requestId = 'test-request-123';

  beforeEach(async () => {
    mockKV = {
      get: vi.fn()
    };
    
    mockEnv = {
      RECIPE_STORAGE: mockKV
    };

    // Get the mocked function
    const kvStorageModule = await import('../../shared/kv-storage.js');
    mockGetRecipeFromKV = kvStorageModule.getRecipeFromKV;
  });

  describe('getRecipeFromKV', () => {
    it('should retrieve recipe from KV storage successfully', async () => {
      const recipeId = 'recipe-123';
      const mockRecipeData = {
        name: 'Test Recipe',
        description: 'A delicious test recipe',
        ingredients: ['ingredient1', 'ingredient2'],
        instructions: ['step1', 'step2'],
        prepTime: '15 minutes',
        cookTime: '30 minutes',
        servings: 4
      };
      const mockRecipeRecord = {
        id: recipeId,
        url: 'https://example.com/recipe',
        data: mockRecipeData,
        scrapedAt: new Date().toISOString(),
        version: '1.0'
      };

      // Mock the shared library function to return the expected structure
      mockGetRecipeFromKV.mockResolvedValue({ success: true, recipe: mockRecipeRecord });

      const result = await getRecipeFromKV(recipeId, mockEnv, requestId);

      expect(mockGetRecipeFromKV).toHaveBeenCalledWith(mockEnv, recipeId);
      expect(result).toEqual(mockRecipeData);
    });

    it('should return null when recipe not found in KV', async () => {
      const recipeId = 'nonexistent-recipe';
      mockGetRecipeFromKV.mockResolvedValue({ success: false, error: 'Recipe not found' });

      const result = await getRecipeFromKV(recipeId, mockEnv, requestId);

      expect(mockGetRecipeFromKV).toHaveBeenCalledWith(mockEnv, recipeId);
      expect(result).toBeNull();
    });

    it('should return null when KV binding is not available', async () => {
      const recipeId = 'recipe-123';
      const envWithoutKV = {};

      const result = await getRecipeFromKV(recipeId, envWithoutKV, requestId);

      expect(result).toBeNull();
    });

    it('should handle shared library errors gracefully', async () => {
      const recipeId = 'recipe-123';
      mockGetRecipeFromKV.mockResolvedValue({ success: false, error: 'Invalid recipe data format' });

      const result = await getRecipeFromKV(recipeId, mockEnv, requestId);

      expect(mockGetRecipeFromKV).toHaveBeenCalledWith(mockEnv, recipeId);
      expect(result).toBeNull();
    });
  });

  describe('getRecipesFromKV', () => {
    it('should retrieve multiple recipes from KV storage', async () => {
      const recipeIds = ['recipe-1', 'recipe-2', 'recipe-3'];
      const mockRecipes = {
        'recipe-1': { id: 'recipe-1', name: 'Recipe 1' },
        'recipe-2': { id: 'recipe-2', name: 'Recipe 2' },
        'recipe-3': { id: 'recipe-3', name: 'Recipe 3' }
      };

      // Mock the shared library to return different results for each recipe
      mockGetRecipeFromKV
        .mockResolvedValueOnce({ success: true, recipe: { data: mockRecipes['recipe-1'] } })
        .mockResolvedValueOnce({ success: true, recipe: { data: mockRecipes['recipe-2'] } })
        .mockResolvedValueOnce({ success: true, recipe: { data: mockRecipes['recipe-3'] } });

      const result = await getRecipesFromKV(recipeIds, mockEnv, requestId);

      expect(mockGetRecipeFromKV).toHaveBeenCalledTimes(3);
      expect(result).toEqual(mockRecipes);
    });

    it('should handle missing recipes gracefully', async () => {
      const recipeIds = ['recipe-1', 'recipe-2', 'recipe-3'];
      
      mockGetRecipeFromKV
        .mockResolvedValueOnce({ success: true, recipe: { data: { id: 'recipe-1', name: 'Recipe 1' } } })
        .mockResolvedValueOnce({ success: false, error: 'Recipe not found' }) // recipe-2 not found
        .mockResolvedValueOnce({ success: true, recipe: { data: { id: 'recipe-3', name: 'Recipe 3' } } });

      const result = await getRecipesFromKV(recipeIds, mockEnv, requestId);

      expect(result).toEqual({
        'recipe-1': { id: 'recipe-1', name: 'Recipe 1' },
        'recipe-3': { id: 'recipe-3', name: 'Recipe 3' }
      });
    });

    it('should return empty object when no recipe IDs provided', async () => {
      const result = await getRecipesFromKV([], mockEnv, requestId);
      expect(result).toEqual({});
    });

    it('should return empty object when KV binding not available', async () => {
      const recipeIds = ['recipe-1', 'recipe-2'];
      const envWithoutKV = {};

      const result = await getRecipesFromKV(recipeIds, envWithoutKV, requestId);
      expect(result).toEqual({});
    });
  });

  describe('mergeSearchResultsWithKV', () => {
    it('should merge search results with KV data successfully', () => {
      const searchResults = [
        {
          id: 'recipe-1',
          name: 'Search Recipe 1',
          description: 'Search description',
          yield: null,
          prepTime: null,
          image_url: null
        },
        {
          id: 'recipe-2',
          name: 'Search Recipe 2',
          description: 'Search description 2',
          yield: '2 servings',
          prepTime: '10 minutes',
          image_url: 'search-image.jpg'
        }
      ];

      const kvRecipes = {
        'recipe-1': {
          id: 'recipe-1',
          name: 'KV Recipe 1',
          description: 'KV description',
          yield: '4 servings',
          prepTime: '15 minutes',
          ingredients: ['ingredient1', 'ingredient2'],
          instructions: ['step1', 'step2']
        },
        'recipe-2': {
          id: 'recipe-2',
          name: 'KV Recipe 2',
          description: 'KV description 2',
          yield: '6 servings',
          prepTime: '20 minutes',
          ingredients: ['ingredient3', 'ingredient4']
        }
      };

      const result = mergeSearchResultsWithKV(searchResults, kvRecipes, requestId);

      expect(result).toHaveLength(2);
      
      // First recipe should be enriched with KV data
      expect(result[0]).toMatchObject({
        id: 'recipe-1',
        name: 'Search Recipe 1', // Search data takes precedence for name
        description: 'Search description', // Search data takes precedence for description
        yield: '4 servings', // KV data fills missing field
        prepTime: '15 minutes', // KV data fills missing field
        image_url: null, // Search data (null) takes precedence
        ingredients: ['ingredient1', 'ingredient2'], // Additional KV data
        instructions: ['step1', 'step2'], // Additional KV data
        kvEnriched: true,
        source: 'search_database_kv_enriched'
      });

      // Second recipe should be enriched with KV data
      expect(result[1]).toMatchObject({
        id: 'recipe-2',
        name: 'Search Recipe 2', // Search data takes precedence
        description: 'Search description 2', // Search data takes precedence
        yield: '2 servings', // Search data takes precedence
        prepTime: '10 minutes', // Search data takes precedence
        image_url: 'search-image.jpg', // Search data takes precedence
        ingredients: ['ingredient3', 'ingredient4'], // Additional KV data
        kvEnriched: true,
        source: 'search_database_kv_enriched'
      });
    });

    it('should handle recipes without KV data', () => {
      const searchResults = [
        {
          id: 'recipe-1',
          name: 'Search Recipe 1',
          description: 'Search description',
          yield: '2 servings'
        },
        {
          id: 'recipe-2',
          name: 'Search Recipe 2',
          description: 'Search description 2',
          yield: '4 servings'
        }
      ];

      const kvRecipes = {
        'recipe-1': {
          id: 'recipe-1',
          name: 'KV Recipe 1',
          ingredients: ['ingredient1']
        }
        // recipe-2 not in KV
      };

      const result = mergeSearchResultsWithKV(searchResults, kvRecipes, requestId);

      expect(result).toHaveLength(2);
      
      // First recipe should be enriched
      expect(result[0]).toMatchObject({
        id: 'recipe-1',
        name: 'Search Recipe 1',
        ingredients: ['ingredient1'],
        kvEnriched: true,
        source: 'search_database_kv_enriched'
      });

      // Second recipe should not be enriched
      expect(result[1]).toMatchObject({
        id: 'recipe-2',
        name: 'Search Recipe 2',
        kvEnriched: false,
        source: 'search_database_only'
      });
    });

    it('should handle empty search results', () => {
      const result = mergeSearchResultsWithKV([], {}, requestId);
      expect(result).toEqual([]);
    });

    it('should handle errors gracefully and return original search results', () => {
      const searchResults = [
        {
          id: 'recipe-1',
          name: 'Search Recipe 1'
        }
      ];

      // Mock console.error to avoid test output noise
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Force an error by passing invalid data
      const result = mergeSearchResultsWithKV(searchResults, null, requestId);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'recipe-1',
        name: 'Search Recipe 1',
        kvEnriched: false,
        source: 'search_database_only'
      });

      consoleSpy.mockRestore();
    });
  });
});
