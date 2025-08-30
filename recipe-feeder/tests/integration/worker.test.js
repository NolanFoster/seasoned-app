import { describe, it, expect, beforeEach, vi } from 'vitest';

// Import the worker
import worker from '../../src/index.js';

describe('Recipe Feeder Worker Integration', () => {
  let mockEnv;
  let mockCtx;

  beforeEach(() => {
    mockEnv = {
      ENVIRONMENT: 'test',
      BATCH_SIZE: '10',
      RECIPE_STORAGE: {
        list: vi.fn()
      },
      RECIPE_VECTORS: {
        query: vi.fn()
      },
      EMBEDDING_QUEUE: {
        sendBatch: vi.fn()
      }
    };

    mockCtx = {
      waitUntil: vi.fn()
    };

    vi.clearAllMocks();
  });

  describe('HTTP fetch handler', () => {
    it('should return health check on root path', async () => {
      const request = new Request('http://localhost/');
      
      const response = await worker.fetch(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.service).toBe('recipe-feeder');
      expect(data.status).toBe('healthy');
      expect(data.environment).toBe('test');
    });

    it('should return status information', async () => {
      const request = new Request('http://localhost/status');
      
      const response = await worker.fetch(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.service).toBe('recipe-feeder');
      expect(data.description).toContain('Feeds recipes');
      expect(data.features).toBeInstanceOf(Array);
    });

    it('should handle manual trigger', async () => {
      // Mock successful processing
      mockEnv.RECIPE_STORAGE.list.mockResolvedValue({
        keys: [{ name: 'recipe-1' }],
        cursor: null,
        list_complete: true
      });

      mockEnv.RECIPE_VECTORS.query.mockResolvedValue({
        matches: [] // Recipe doesn't exist in vector store
      });

      mockEnv.EMBEDDING_QUEUE.sendBatch.mockResolvedValue();

      const request = new Request('http://localhost/trigger');
      
      const response = await worker.fetch(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.triggered).toBe(true);
      expect(data.result).toBeDefined();
    });

    it('should return 404 for unknown paths', async () => {
      const request = new Request('http://localhost/unknown');
      
      const response = await worker.fetch(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(404);
    });

    it('should return 405 for non-GET methods', async () => {
      const request = new Request('http://localhost/', { method: 'POST' });
      
      const response = await worker.fetch(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(405);
    });

    it('should handle fetch errors gracefully', async () => {
      // Mock an error in the trigger endpoint
      mockEnv.RECIPE_STORAGE.list.mockRejectedValue(new Error('KV error'));

      const request = new Request('http://localhost/trigger');
      
      const response = await worker.fetch(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(500);
      
      const data = await response.json();
      expect(data.error).toBe('Internal server error');
    });
  });

  describe('Scheduled cron handler', () => {
    it('should handle scheduled execution successfully', async () => {
      const mockController = {
        scheduledTime: Date.now()
      };

      // Mock successful processing
      mockEnv.RECIPE_STORAGE.list.mockResolvedValue({
        keys: [
          { name: 'recipe-1' },
          { name: 'recipe-2' }
        ],
        cursor: null,
        list_complete: true
      });

      mockEnv.RECIPE_VECTORS.query
        .mockResolvedValueOnce({ matches: [{ id: 'recipe-1' }] }) // exists
        .mockResolvedValueOnce({ matches: [] }); // missing

      mockEnv.EMBEDDING_QUEUE.sendBatch.mockResolvedValue();

      await expect(
        worker.scheduled(mockController, mockEnv, mockCtx)
      ).resolves.not.toThrow();

      expect(mockEnv.RECIPE_STORAGE.list).toHaveBeenCalled();
      expect(mockEnv.RECIPE_VECTORS.query).toHaveBeenCalledTimes(2);
      expect(mockEnv.EMBEDDING_QUEUE.sendBatch).toHaveBeenCalledWith([
        { body: 'recipe-2' }
      ]);
    });

    it('should handle scheduled execution errors', async () => {
      const mockController = {
        scheduledTime: Date.now()
      };

      // Mock KV error
      mockEnv.RECIPE_STORAGE.list.mockRejectedValue(new Error('KV error'));

      await expect(
        worker.scheduled(mockController, mockEnv, mockCtx)
      ).rejects.toThrow('KV error');
    });

    it('should process empty KV storage', async () => {
      const mockController = {
        scheduledTime: Date.now()
      };

      // Mock empty KV storage
      mockEnv.RECIPE_STORAGE.list.mockResolvedValue({
        keys: [],
        cursor: null,
        list_complete: true
      });

      await expect(
        worker.scheduled(mockController, mockEnv, mockCtx)
      ).resolves.not.toThrow();

      expect(mockEnv.RECIPE_STORAGE.list).toHaveBeenCalled();
      expect(mockEnv.RECIPE_VECTORS.query).not.toHaveBeenCalled();
      expect(mockEnv.EMBEDDING_QUEUE.sendBatch).not.toHaveBeenCalled();
    });

    it('should handle all recipes existing in vector store', async () => {
      const mockController = {
        scheduledTime: Date.now()
      };

      mockEnv.RECIPE_STORAGE.list.mockResolvedValue({
        keys: [{ name: 'recipe-1' }],
        cursor: null,
        list_complete: true
      });

      // Recipe exists in vector store
      mockEnv.RECIPE_VECTORS.query.mockResolvedValue({
        matches: [{ id: 'recipe-1' }]
      });

      await expect(
        worker.scheduled(mockController, mockEnv, mockCtx)
      ).resolves.not.toThrow();

      expect(mockEnv.EMBEDDING_QUEUE.sendBatch).not.toHaveBeenCalled();
    });
  });

  describe('Full workflow integration', () => {
    it('should complete full workflow: scan -> check -> queue', async () => {
      // Setup test data
      const recipes = [
        { name: 'recipe-1' },
        { name: 'recipe-2' },
        { name: 'recipe-3' }
      ];

      mockEnv.RECIPE_STORAGE.list.mockResolvedValue({
        keys: recipes,
        cursor: null,
        list_complete: true
      });

      // recipe-1 exists, recipe-2 and recipe-3 are missing
      mockEnv.RECIPE_VECTORS.query
        .mockResolvedValueOnce({ matches: [{ id: 'recipe-1' }] })
        .mockResolvedValueOnce({ matches: [] })
        .mockResolvedValueOnce({ matches: [] });

      mockEnv.EMBEDDING_QUEUE.sendBatch.mockResolvedValue();

      // Execute via manual trigger
      const request = new Request('http://localhost/trigger');
      const response = await worker.fetch(request, mockEnv, mockCtx);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.result.success).toBe(true);
      expect(data.result.totalStats.scanned).toBe(3);
      expect(data.result.totalStats.existsInVector).toBe(1);
      expect(data.result.totalStats.queued).toBe(2);

      // Verify queue was called with missing recipes
      expect(mockEnv.EMBEDDING_QUEUE.sendBatch).toHaveBeenCalledWith([
        { body: 'recipe-2' },
        { body: 'recipe-3' }
      ]);
    });

    it('should handle large batch processing', async () => {
      // Create 150 recipes to test batching
      const recipes = Array.from({ length: 150 }, (_, i) => ({ name: `recipe-${i}` }));

      mockEnv.RECIPE_STORAGE.list.mockResolvedValue({
        keys: recipes,
        cursor: null,
        list_complete: true
      });

      // All recipes are missing from vector store
      mockEnv.RECIPE_VECTORS.query.mockResolvedValue({ matches: [] });

      mockEnv.EMBEDDING_QUEUE.sendBatch.mockResolvedValue();

      const request = new Request('http://localhost/trigger');
      const response = await worker.fetch(request, mockEnv, mockCtx);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.result.success).toBe(true);
      expect(data.result.totalStats.scanned).toBe(150); // Scans all recipes to find target
      expect(data.result.totalStats.queued).toBe(10); // Should queue up to BATCH_SIZE (10)

      // Should have been called once since we're processing in one batch
      expect(mockEnv.EMBEDDING_QUEUE.sendBatch).toHaveBeenCalledTimes(1);
    });
  });
});