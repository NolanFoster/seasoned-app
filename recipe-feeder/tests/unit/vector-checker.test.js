import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  recipeExistsInVectorStore, 
  batchCheckVectorStore, 
  parallelBatchCheckVectorStore 
} from '../../src/utils/vector-checker.js';

describe('Vector Checker', () => {
  let mockEnv;

  beforeEach(() => {
    mockEnv = {
      RECIPE_VECTORS: {
        query: vi.fn()
      }
    };
  });

  describe('recipeExistsInVectorStore', () => {
    it('should return true when recipe exists', async () => {
      mockEnv.RECIPE_VECTORS.query.mockResolvedValue({
        matches: [{ id: 'recipe-1', score: 1.0 }]
      });

      const exists = await recipeExistsInVectorStore(mockEnv, 'recipe-1');

      expect(exists).toBe(true);
      expect(mockEnv.RECIPE_VECTORS.query).toHaveBeenCalledWith(
        expect.any(Array),
        {
          topK: 1,
          filter: { recipeId: { $eq: 'recipe-1' } }
        }
      );
    });

    it('should return false when recipe does not exist', async () => {
      mockEnv.RECIPE_VECTORS.query.mockResolvedValue({
        matches: []
      });

      const exists = await recipeExistsInVectorStore(mockEnv, 'recipe-1');

      expect(exists).toBe(false);
    });

    it('should return false on query error', async () => {
      mockEnv.RECIPE_VECTORS.query.mockRejectedValue(new Error('Vector store error'));

      const exists = await recipeExistsInVectorStore(mockEnv, 'recipe-1');

      expect(exists).toBe(false);
    });

    it('should handle null matches', async () => {
      mockEnv.RECIPE_VECTORS.query.mockResolvedValue({
        matches: null
      });

      const exists = await recipeExistsInVectorStore(mockEnv, 'recipe-1');

      expect(exists).toBe(false);
    });
  });

  describe('batchCheckVectorStore', () => {
    it('should check multiple recipes and categorize them', async () => {
      // Mock responses: recipe-1 exists, recipe-2 doesn't, recipe-3 exists
      mockEnv.RECIPE_VECTORS.query
        .mockResolvedValueOnce({ matches: [{ id: 'recipe-1' }] }) // exists
        .mockResolvedValueOnce({ matches: [] }) // doesn't exist
        .mockResolvedValueOnce({ matches: [{ id: 'recipe-3' }] }); // exists

      const result = await batchCheckVectorStore(mockEnv, ['recipe-1', 'recipe-2', 'recipe-3']);

      expect(result).toEqual({
        exists: ['recipe-1', 'recipe-3'],
        missing: ['recipe-2']
      });
    });

    it('should handle empty recipe list', async () => {
      const result = await batchCheckVectorStore(mockEnv, []);

      expect(result).toEqual({
        exists: [],
        missing: []
      });
    });

    it('should handle errors by marking recipes as missing', async () => {
      mockEnv.RECIPE_VECTORS.query
        .mockResolvedValueOnce({ matches: [{ id: 'recipe-1' }] }) // exists
        .mockRejectedValueOnce(new Error('Vector error')); // error -> missing

      const result = await batchCheckVectorStore(mockEnv, ['recipe-1', 'recipe-2']);

      expect(result).toEqual({
        exists: ['recipe-1'],
        missing: ['recipe-2']
      });
    });
  });

  describe('parallelBatchCheckVectorStore', () => {
    it('should process recipes in parallel chunks', async () => {
      // Mock all recipes as existing
      mockEnv.RECIPE_VECTORS.query.mockResolvedValue({
        matches: [{ id: 'recipe' }]
      });

      const recipeIds = ['recipe-1', 'recipe-2', 'recipe-3', 'recipe-4', 'recipe-5'];
      const result = await parallelBatchCheckVectorStore(mockEnv, recipeIds, 2);

      expect(result.exists).toHaveLength(5);
      expect(result.missing).toHaveLength(0);
      
      // Should have made 5 queries (one for each recipe)
      expect(mockEnv.RECIPE_VECTORS.query).toHaveBeenCalledTimes(5);
    });

    it('should handle mixed results in parallel processing', async () => {
      // Alternate between existing and missing
      mockEnv.RECIPE_VECTORS.query
        .mockResolvedValueOnce({ matches: [{ id: 'recipe-1' }] }) // exists
        .mockResolvedValueOnce({ matches: [] }) // missing
        .mockResolvedValueOnce({ matches: [{ id: 'recipe-3' }] }) // exists
        .mockResolvedValueOnce({ matches: [] }); // missing

      const result = await parallelBatchCheckVectorStore(mockEnv, 
        ['recipe-1', 'recipe-2', 'recipe-3', 'recipe-4'], 2);

      expect(result.exists).toEqual(['recipe-1', 'recipe-3']);
      expect(result.missing).toEqual(['recipe-2', 'recipe-4']);
    });

    it('should handle errors in parallel processing', async () => {
      mockEnv.RECIPE_VECTORS.query
        .mockResolvedValueOnce({ matches: [{ id: 'recipe-1' }] }) // exists
        .mockRejectedValueOnce(new Error('Vector error')); // error -> missing

      const result = await parallelBatchCheckVectorStore(mockEnv, ['recipe-1', 'recipe-2'], 2);

      expect(result.exists).toEqual(['recipe-1']);
      expect(result.missing).toEqual(['recipe-2']);
    });
  });
});