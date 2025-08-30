import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  queueRecipesForEmbedding,
  queueRecipesInChunks,
  validateRecipeIds,
  safeQueueRecipes
} from '../../src/utils/queue-producer.js';

describe('Queue Producer', () => {
  let mockEnv;

  beforeEach(() => {
    mockEnv = {
      EMBEDDING_QUEUE: {
        sendBatch: vi.fn()
      }
    };
  });

  describe('queueRecipesForEmbedding', () => {
    it('should queue recipes successfully', async () => {
      mockEnv.EMBEDDING_QUEUE.sendBatch.mockResolvedValue();

      const result = await queueRecipesForEmbedding(mockEnv, ['recipe-1', 'recipe-2']);

      expect(result).toEqual({
        success: true,
        queued: 2,
        errors: []
      });

      expect(mockEnv.EMBEDDING_QUEUE.sendBatch).toHaveBeenCalledWith([
        { body: 'recipe-1' },
        { body: 'recipe-2' }
      ]);
    });

    it('should handle empty recipe list', async () => {
      const result = await queueRecipesForEmbedding(mockEnv, []);

      expect(result).toEqual({
        success: true,
        queued: 0,
        errors: []
      });

      expect(mockEnv.EMBEDDING_QUEUE.sendBatch).not.toHaveBeenCalled();
    });

    it('should handle queue errors', async () => {
      mockEnv.EMBEDDING_QUEUE.sendBatch.mockRejectedValue(new Error('Queue error'));

      const result = await queueRecipesForEmbedding(mockEnv, ['recipe-1']);

      expect(result.success).toBe(false);
      expect(result.queued).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('queue_error');
    });

    it('should include message options when provided', async () => {
      mockEnv.EMBEDDING_QUEUE.sendBatch.mockResolvedValue();

      const options = {
        messageOptions: {
          delaySeconds: 10
        }
      };

      await queueRecipesForEmbedding(mockEnv, ['recipe-1'], options);

      expect(mockEnv.EMBEDDING_QUEUE.sendBatch).toHaveBeenCalledWith([
        { body: 'recipe-1', delaySeconds: 10 }
      ]);
    });
  });

  describe('queueRecipesInChunks', () => {
    it('should queue recipes in chunks', async () => {
      mockEnv.EMBEDDING_QUEUE.sendBatch.mockResolvedValue();

      const recipeIds = ['recipe-1', 'recipe-2', 'recipe-3', 'recipe-4'];
      const result = await queueRecipesInChunks(mockEnv, recipeIds, 2);

      expect(result).toEqual({
        success: true,
        totalQueued: 4,
        errors: []
      });

      // Should have been called twice (2 chunks of 2)
      expect(mockEnv.EMBEDDING_QUEUE.sendBatch).toHaveBeenCalledTimes(2);
    });

    it('should handle chunk errors', async () => {
      mockEnv.EMBEDDING_QUEUE.sendBatch
        .mockResolvedValueOnce() // First chunk succeeds
        .mockRejectedValueOnce(new Error('Chunk error')); // Second chunk fails

      const recipeIds = ['recipe-1', 'recipe-2', 'recipe-3', 'recipe-4'];
      const result = await queueRecipesInChunks(mockEnv, recipeIds, 2);

      expect(result.success).toBe(false);
      expect(result.totalQueued).toBe(2);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('queue_error');
    });

    it('should handle empty recipe list', async () => {
      const result = await queueRecipesInChunks(mockEnv, []);

      expect(result).toEqual({
        success: true,
        totalQueued: 0,
        errors: []
      });
    });
  });

  describe('validateRecipeIds', () => {
    it('should validate recipe IDs correctly', () => {
      const recipeIds = [
        'valid-recipe-1',
        '  valid-recipe-2  ', // with whitespace
        '',
        null,
        undefined,
        123,
        'valid-recipe-3'
      ];

      const result = validateRecipeIds(recipeIds);

      expect(result.valid).toEqual([
        'valid-recipe-1',
        'valid-recipe-2',
        'valid-recipe-3'
      ]);

      expect(result.invalid).toEqual([
        '',
        null,
        undefined,
        123
      ]);
    });

    it('should handle empty input', () => {
      const result = validateRecipeIds([]);

      expect(result.valid).toEqual([]);
      expect(result.invalid).toEqual([]);
    });

    it('should handle all valid inputs', () => {
      const result = validateRecipeIds(['recipe-1', 'recipe-2']);

      expect(result.valid).toEqual(['recipe-1', 'recipe-2']);
      expect(result.invalid).toEqual([]);
    });
  });

  describe('safeQueueRecipes', () => {
    it('should queue valid recipes successfully', async () => {
      mockEnv.EMBEDDING_QUEUE.sendBatch.mockResolvedValue();

      const recipeIds = ['recipe-1', 'recipe-2', ''];
      const result = await safeQueueRecipes(mockEnv, recipeIds);

      expect(result.success).toBe(false); // Because of invalid ID
      expect(result.stats.input).toBe(3);
      expect(result.stats.validated).toBe(2);
      expect(result.stats.invalid).toBe(1);
      expect(result.stats.queued).toBe(2);
    });

    it('should skip validation when requested', async () => {
      mockEnv.EMBEDDING_QUEUE.sendBatch.mockResolvedValue();

      const recipeIds = ['recipe-1', 'recipe-2'];
      const result = await safeQueueRecipes(mockEnv, recipeIds, { validate: false });

      expect(result.success).toBe(true);
      expect(result.stats.validated).toBe(2);
      expect(result.stats.invalid).toBe(0);
    });

    it('should use custom chunk size', async () => {
      mockEnv.EMBEDDING_QUEUE.sendBatch.mockResolvedValue();

      const recipeIds = ['recipe-1', 'recipe-2', 'recipe-3'];
      await safeQueueRecipes(mockEnv, recipeIds, { chunkSize: 1 });

      // Should have been called 3 times (chunk size 1)
      expect(mockEnv.EMBEDDING_QUEUE.sendBatch).toHaveBeenCalledTimes(3);
    });

    it('should handle queue errors', async () => {
      mockEnv.EMBEDDING_QUEUE.sendBatch.mockRejectedValue(new Error('Queue error'));

      const result = await safeQueueRecipes(mockEnv, ['recipe-1']);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
    });
  });
});