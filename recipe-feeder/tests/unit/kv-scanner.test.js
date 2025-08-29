import { describe, it, expect, beforeEach, vi } from 'vitest';
import { scanRecipeKeys, getRecipeKeysBatch, estimateRecipeCount } from '../../src/utils/kv-scanner.js';

describe('KV Scanner', () => {
  let mockEnv;

  beforeEach(() => {
    mockEnv = {
      RECIPE_STORAGE: {
        list: vi.fn()
      }
    };
  });

  describe('scanRecipeKeys', () => {
    it('should scan KV storage successfully', async () => {
      const mockKeys = [
        { name: 'recipe-1' },
        { name: 'recipe-2' },
        { name: 'recipe-3' }
      ];

      mockEnv.RECIPE_STORAGE.list.mockResolvedValue({
        keys: mockKeys,
        cursor: 'next-cursor',
        list_complete: false
      });

      const result = await scanRecipeKeys(mockEnv, 10, null);

      expect(result).toEqual({
        keys: ['recipe-1', 'recipe-2', 'recipe-3'],
        cursor: 'next-cursor',
        hasMore: true,
        totalScanned: 3
      });

      expect(mockEnv.RECIPE_STORAGE.list).toHaveBeenCalledWith({
        limit: 10
      });
    });

    it('should handle cursor pagination', async () => {
      mockEnv.RECIPE_STORAGE.list.mockResolvedValue({
        keys: [{ name: 'recipe-4' }],
        cursor: null,
        list_complete: true
      });

      const result = await scanRecipeKeys(mockEnv, 10, 'existing-cursor');

      expect(mockEnv.RECIPE_STORAGE.list).toHaveBeenCalledWith({
        limit: 10,
        cursor: 'existing-cursor'
      });

      expect(result.hasMore).toBe(false);
      expect(result.cursor).toBeNull();
    });

    it('should handle KV storage errors', async () => {
      mockEnv.RECIPE_STORAGE.list.mockRejectedValue(new Error('KV error'));

      await expect(scanRecipeKeys(mockEnv, 10)).rejects.toThrow('Failed to scan KV storage: KV error');
    });

    it('should handle empty results', async () => {
      mockEnv.RECIPE_STORAGE.list.mockResolvedValue({
        keys: [],
        cursor: null,
        list_complete: true
      });

      const result = await scanRecipeKeys(mockEnv, 10);

      expect(result.keys).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.totalScanned).toBe(0);
    });
  });

  describe('getRecipeKeysBatch', () => {
    it('should return formatted batch result', async () => {
      mockEnv.RECIPE_STORAGE.list.mockResolvedValue({
        keys: [{ name: 'recipe-1' }],
        cursor: 'next-cursor',
        list_complete: false
      });

      const result = await getRecipeKeysBatch(mockEnv, 5, 'start-cursor');

      expect(result).toEqual({
        keys: ['recipe-1'],
        nextCursor: 'next-cursor',
        hasMore: true
      });
    });
  });

  describe('estimateRecipeCount', () => {
    it('should return exact count when list is complete', async () => {
      mockEnv.RECIPE_STORAGE.list.mockResolvedValue({
        keys: [
          { name: 'recipe-1' },
          { name: 'recipe-2' }
        ],
        list_complete: true
      });

      const count = await estimateRecipeCount(mockEnv);

      expect(count).toBe(2);
      expect(mockEnv.RECIPE_STORAGE.list).toHaveBeenCalledWith({
        limit: 1000
      });
    });

    it('should return estimate when list is incomplete', async () => {
      mockEnv.RECIPE_STORAGE.list.mockResolvedValue({
        keys: new Array(1000).fill(0).map((_, i) => ({ name: `recipe-${i}` })),
        list_complete: false
      });

      const count = await estimateRecipeCount(mockEnv);

      expect(count).toBe(1000);
    });

    it('should handle errors gracefully', async () => {
      mockEnv.RECIPE_STORAGE.list.mockRejectedValue(new Error('KV error'));

      const count = await estimateRecipeCount(mockEnv);

      expect(count).toBe(0);
    });
  });
});