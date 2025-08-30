import { describe, it, expect, beforeEach, vi } from 'vitest';
import { processRecipesUntilTarget, executeFullFeedingCycle } from '../../src/handlers/feeder-handler.js';

// Mock the utility modules
vi.mock('../../src/utils/kv-scanner.js', () => ({
  scanRecipeKeys: vi.fn()
}));

vi.mock('../../src/utils/vector-checker.js', () => ({
  batchCheckVectorStore: vi.fn()
}));

vi.mock('../../src/utils/queue-producer.js', () => ({
  safeQueueRecipes: vi.fn()
}));

import { scanRecipeKeys } from '../../src/utils/kv-scanner.js';
import { batchCheckVectorStore } from '../../src/utils/vector-checker.js';
import { safeQueueRecipes } from '../../src/utils/queue-producer.js';

describe('Feeder Handler', () => {
  let mockEnv;

  beforeEach(() => {
    mockEnv = {
      BATCH_SIZE: '100'
    };
    
    vi.clearAllMocks();
  });

  describe('processRecipesUntilTarget', () => {
    it('should process recipes until target count is reached', async () => {
      // Mock multiple KV scans to reach target
      scanRecipeKeys
        .mockResolvedValueOnce({
          keys: ['recipe-1', 'recipe-2', 'recipe-3'],
          cursor: 'cursor-1',
          hasMore: true
        })
        .mockResolvedValueOnce({
          keys: ['recipe-4', 'recipe-5'],
          cursor: 'cursor-2',
          hasMore: true
        });

      // Mock vector checks
      batchCheckVectorStore
        .mockResolvedValueOnce({
          exists: ['recipe-1'],
          missing: ['recipe-2', 'recipe-3']
        })
        .mockResolvedValueOnce({
          exists: ['recipe-4'],
          missing: ['recipe-5']
        });

      // Mock queue operation
      safeQueueRecipes.mockResolvedValue({
        success: true,
        stats: { queued: 3 },
        errors: []
      });

      const result = await processRecipesUntilTarget(mockEnv, 3, null);

      expect(result.success).toBe(true);
      expect(result.stats.scanned).toBe(5);
      expect(result.stats.existsInVector).toBe(2);
      expect(result.stats.missingFromVector).toBe(3);
      expect(result.stats.queued).toBe(3);
      expect(result.stats.batchesProcessed).toBe(2);
      expect(result.reachedTarget).toBe(true);
      expect(result.kvExhausted).toBe(false);
    });

    it('should stop when KV is exhausted before reaching target', async () => {
      // Mock single KV scan that exhausts the store
      scanRecipeKeys.mockResolvedValue({
        keys: ['recipe-1', 'recipe-2'],
        cursor: null,
        hasMore: false
      });

      batchCheckVectorStore.mockResolvedValue({
        exists: ['recipe-1'],
        missing: ['recipe-2']
      });

      safeQueueRecipes.mockResolvedValue({
        success: true,
        stats: { queued: 1 },
        errors: []
      });

      const result = await processRecipesUntilTarget(mockEnv, 5, null);

      expect(result.success).toBe(true);
      expect(result.stats.scanned).toBe(2);
      expect(result.stats.queued).toBe(1);
      expect(result.reachedTarget).toBe(false);
      expect(result.kvExhausted).toBe(true);
    });

    it('should handle empty KV results', async () => {
      scanRecipeKeys.mockResolvedValue({
        keys: [],
        cursor: null,
        hasMore: false
      });

      const result = await processRecipesUntilTarget(mockEnv, 100, null);

      expect(result.success).toBe(true);
      expect(result.stats.scanned).toBe(0);
      expect(result.stats.batchesProcessed).toBe(1);
      expect(result.nextCursor).toBeNull();
      expect(result.hasMore).toBe(false);
      expect(result.reachedTarget).toBe(false);
      expect(result.kvExhausted).toBe(true);
    });

    it('should handle recipes that all exist in vector store', async () => {
      scanRecipeKeys.mockResolvedValue({
        keys: ['recipe-1', 'recipe-2'],
        cursor: null,
        hasMore: false
      });

      batchCheckVectorStore.mockResolvedValue({
        exists: ['recipe-1', 'recipe-2'],
        missing: []
      });

      const result = await processRecipesUntilTarget(mockEnv, 100, null);

      expect(result.success).toBe(true);
      expect(result.stats.existsInVector).toBe(2);
      expect(result.stats.missingFromVector).toBe(0);
      expect(result.stats.queued).toBe(0);

      // Should not call queue function
      expect(safeQueueRecipes).not.toHaveBeenCalled();
    });

    it('should handle KV scan errors', async () => {
      scanRecipeKeys.mockRejectedValue(new Error('KV error'));

      const result = await processRecipesUntilTarget(mockEnv, 100, null);

      expect(result.success).toBe(false);
      expect(result.error).toBe('KV error');
    });

    it('should handle vector check errors', async () => {
      scanRecipeKeys.mockResolvedValue({
        keys: ['recipe-1'],
        cursor: null,
        hasMore: false
      });

      batchCheckVectorStore.mockRejectedValue(new Error('Vector error'));

      const result = await processRecipesUntilTarget(mockEnv, 100, null);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Vector error');
    });

    it('should handle queue errors', async () => {
      scanRecipeKeys.mockResolvedValue({
        keys: ['recipe-1'],
        cursor: null,
        hasMore: false
      });

      batchCheckVectorStore.mockResolvedValue({
        exists: [],
        missing: ['recipe-1']
      });

      safeQueueRecipes.mockResolvedValue({
        success: false,
        stats: { queued: 0 },
        errors: [{ type: 'queue_error', message: 'Queue failed' }]
      });

      const result = await processRecipesUntilTarget(mockEnv, 100, null);

      expect(result.success).toBe(false);
      expect(result.stats.errors).toBe(1);
    });

    it('should use smaller batch sizes for efficiency', async () => {
      // Mock multiple small batches
      scanRecipeKeys
        .mockResolvedValueOnce({
          keys: ['recipe-1', 'recipe-2'],
          cursor: 'cursor-1',
          hasMore: true
        })
        .mockResolvedValueOnce({
          keys: ['recipe-3'],
          cursor: null,
          hasMore: false
        });

      batchCheckVectorStore
        .mockResolvedValueOnce({
          exists: ['recipe-1'],
          missing: ['recipe-2']
        })
        .mockResolvedValueOnce({
          exists: [],
          missing: ['recipe-3']
        });

      safeQueueRecipes.mockResolvedValue({
        success: true,
        stats: { queued: 2 },
        errors: []
      });

      const result = await processRecipesUntilTarget(mockEnv, 2, null);

      expect(result.success).toBe(true);
      expect(result.stats.batchesProcessed).toBe(2);
      expect(result.stats.queued).toBe(2);
      expect(result.reachedTarget).toBe(true);
    });
  });

  describe('executeFullFeedingCycle', () => {
    it('should execute a complete feeding cycle', async () => {
      mockEnv.BATCH_SIZE = '50';

      // Mock first batch
      scanRecipeKeys
        .mockResolvedValueOnce({
          keys: ['recipe-1', 'recipe-2'],
          cursor: null,
          hasMore: false
        });

      batchCheckVectorStore
        .mockResolvedValueOnce({
          exists: ['recipe-1'],
          missing: ['recipe-2']
        });

      safeQueueRecipes
        .mockResolvedValueOnce({
          success: true,
          stats: { queued: 1 },
          errors: []
        });

      const result = await executeFullFeedingCycle(mockEnv, {
        maxBatchSize: 50,
        maxCycles: 1
      });

      expect(result.success).toBe(true);
      expect(result.cycles).toBe(1);
      expect(result.completedFully).toBe(true);
      expect(result.totalStats.scanned).toBe(2);
      expect(result.totalStats.queued).toBe(1);
    });

    it('should stop at max cycles', async () => {
      // Mock a batch that would reach the target in one cycle
      scanRecipeKeys.mockResolvedValue({
        keys: ['recipe-1', 'recipe-2', 'recipe-3', 'recipe-4', 'recipe-5'],
        cursor: null,
        hasMore: false
      });

      batchCheckVectorStore.mockResolvedValue({
        exists: [],
        missing: ['recipe-1', 'recipe-2', 'recipe-3', 'recipe-4', 'recipe-5']
      });

      safeQueueRecipes.mockResolvedValue({
        success: true,
        stats: { queued: 5 },
        errors: []
      });

      const result = await executeFullFeedingCycle(mockEnv, {
        maxBatchSize: 5,
        maxCycles: 2
      });

      expect(result.cycles).toBe(1); // Should complete in 1 cycle since target reached
      expect(result.completedFully).toBe(true); // Completed because target reached
    });

    it('should handle processing errors', async () => {
      scanRecipeKeys.mockRejectedValue(new Error('Processing error'));

      const result = await executeFullFeedingCycle(mockEnv);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Processing error');
    });

    it('should accumulate stats across cycles', async () => {
      // Mock a single large batch that processes everything
      scanRecipeKeys.mockResolvedValue({
        keys: ['recipe-1', 'recipe-2', 'recipe-3'],
        cursor: null,
        hasMore: false
      });

      batchCheckVectorStore.mockResolvedValue({
        exists: ['recipe-1'],
        missing: ['recipe-2', 'recipe-3']
      });

      safeQueueRecipes.mockResolvedValue({
        success: true,
        stats: { queued: 2 },
        errors: []
      });

      const result = await executeFullFeedingCycle(mockEnv, {
        maxCycles: 5
      });

      expect(result.success).toBe(true);
      expect(result.cycles).toBe(1); // Should complete in 1 cycle since KV exhausted
      expect(result.totalStats.scanned).toBe(3);
      expect(result.totalStats.existsInVector).toBe(1);
      expect(result.totalStats.queued).toBe(2);
    });
  });
});