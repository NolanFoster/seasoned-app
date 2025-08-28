import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  handleEmbedding, 
  handleProgress, 
  handleReset, 
  handlePopulateQueue,
  handleAddToQueue,
  addToEmbeddingQueue,
  addBulkToEmbeddingQueue,
  handleQueueMessage
} from '../src/handlers/embedding-handler.js';

// Mock environment
const createMockEnv = () => ({
  RECIPE_STORAGE: {
    get: vi.fn(),
    put: vi.fn(),
    list: vi.fn()
  },
  RECIPE_VECTORS: {
    getByIds: vi.fn(),
    query: vi.fn(),
    upsert: vi.fn()
  },
  AI: {
    run: vi.fn()
  },
  EMBEDDING_QUEUE: {
    send: vi.fn(),
    sendBatch: vi.fn()
  },
  ENVIRONMENT: 'test'
});

// Mock CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
  'Access-Control-Allow-Headers': 'Content-Type'
};

describe('Cloudflare Queue Embedding System', () => {
  let mockEnv;
  let mockRequest;

  beforeEach(() => {
    mockEnv = createMockEnv();
    mockRequest = new Request('https://example.com/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduled: false })
    });

    // Reset all mocks
    vi.clearAllMocks();
  });

  describe('Queue Management', () => {
    it('should add recipe to Cloudflare Queue successfully', async () => {
      mockEnv.EMBEDDING_QUEUE.send.mockResolvedValue(undefined);

      const result = await addToEmbeddingQueue(mockEnv, 'recipe1', 'high');

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('recipe1');
      expect(mockEnv.EMBEDDING_QUEUE.send).toHaveBeenCalledWith({
        type: 'recipe_embedding',
        recipeId: 'recipe1',
        priority: 'high',
        timestamp: expect.any(Number),
        attempts: 0
      });
    });

    it('should add multiple recipes to Cloudflare Queue in bulk', async () => {
      mockEnv.EMBEDDING_QUEUE.sendBatch.mockResolvedValue(undefined);

      const recipeIds = ['recipe1', 'recipe2', 'recipe3'];
      const result = await addBulkToEmbeddingQueue(mockEnv, recipeIds, 'normal');

      expect(result.success).toBe(true);
      expect(result.count).toBe(3);
      expect(mockEnv.EMBEDDING_QUEUE.sendBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'recipe_embedding',
            recipeId: 'recipe1',
            priority: 'normal'
          }),
          expect.objectContaining({
            type: 'recipe_embedding',
            recipeId: 'recipe2',
            priority: 'normal'
          }),
          expect.objectContaining({
            type: 'recipe_embedding',
            recipeId: 'recipe3',
            priority: 'normal'
          })
        ])
      );
    });

    it('should handle bulk queue errors gracefully', async () => {
      mockEnv.EMBEDDING_QUEUE.sendBatch.mockRejectedValue(new Error('Queue error'));

      const recipeIds = ['recipe1', 'recipe2'];
      const result = await addBulkToEmbeddingQueue(mockEnv, recipeIds, 'normal');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Queue error');
    });
  });

  describe('Queue Message Processing', () => {
    it('should process queue messages successfully', async () => {
      const mockBatch = {
        messages: [
          {
            body: {
              type: 'recipe_embedding',
              recipeId: 'recipe1',
              priority: 'normal',
              attempts: 0
            },
            ack: vi.fn()
          }
        ]
      };

      // Mock recipe data
      mockEnv.RECIPE_STORAGE.get.mockResolvedValue(JSON.stringify({
        id: 'recipe1',
        data: { name: 'Test Recipe', ingredients: ['ingredient1'] }
      }));

      // Mock existing embedding check
      mockEnv.RECIPE_VECTORS.getByIds.mockResolvedValue([]);
      mockEnv.RECIPE_VECTORS.query.mockResolvedValue({ matches: [] });

      // Mock AI embedding generation
      mockEnv.AI.run.mockResolvedValue({
        data: [Array.from({ length: 384 }, () => Math.random())]
      });

      // Mock vector storage
      mockEnv.RECIPE_VECTORS.upsert.mockResolvedValue(undefined);

      // Mock queue stats
      mockEnv.RECIPE_STORAGE.get
        .mockResolvedValueOnce(JSON.stringify({
          id: 'recipe1',
          data: { name: 'Test Recipe', ingredients: ['ingredient1'] }
        }))
        .mockResolvedValueOnce(JSON.stringify({
          total: 1,
          pending: 1,
          processing: 0,
          completed: 0,
          failed: 0,
          skipped: 0,
          lastUpdated: Date.now()
        }));

      const results = await handleQueueMessage(mockBatch, mockEnv);

      expect(results.processed).toBe(1);
      expect(results.skipped).toBe(0);
      expect(results.failed).toBe(0);
      expect(mockBatch.messages[0].ack).toHaveBeenCalled();
    });

    it('should handle failed recipes with retry logic', async () => {
      const mockBatch = {
        messages: [
          {
            body: {
              type: 'recipe_embedding',
              recipeId: 'recipe1',
              priority: 'normal',
              attempts: 0
            },
            ack: vi.fn()
          }
        ]
      };

      // Mock AI embedding generation failure
      mockEnv.AI.run.mockRejectedValue(new Error('AI service unavailable'));

      // Mock recipe data
      mockEnv.RECIPE_STORAGE.get.mockResolvedValue(JSON.stringify({
        id: 'recipe1',
        data: { name: 'Test Recipe', ingredients: ['ingredient1'] }
      }));

      // Mock existing embedding check
      mockEnv.RECIPE_VECTORS.getByIds.mockResolvedValue([]);
      mockEnv.RECIPE_VECTORS.query.mockResolvedValue({ matches: [] });

      // Mock queue stats
      mockEnv.RECIPE_STORAGE.get
        .mockResolvedValueOnce(JSON.stringify({
          id: 'recipe1',
          data: { name: 'Test Recipe', ingredients: ['ingredient1'] }
        }))
        .mockResolvedValueOnce(JSON.stringify({
          total: 1,
          pending: 1,
          processing: 0,
          completed: 0,
          failed: 0,
          skipped: 0,
          lastUpdated: Date.now()
        }));

      const results = await handleQueueMessage(mockBatch, mockEnv);

      expect(results.processed).toBe(0);
      expect(results.failed).toBe(1);
      expect(mockBatch.messages[0].ack).toHaveBeenCalled();
    });

    it('should skip recipes that already have embeddings', async () => {
      const mockBatch = {
        messages: [
          {
            body: {
              type: 'recipe_embedding',
              recipeId: 'recipe1',
              priority: 'normal',
              attempts: 0
            },
            ack: vi.fn()
          }
        ]
      };

      // Mock existing embedding
      mockEnv.RECIPE_VECTORS.getByIds.mockResolvedValue([{ id: 'recipe1' }]);

      // Mock queue stats
      mockEnv.RECIPE_STORAGE.get.mockResolvedValue(JSON.stringify({
        total: 1,
        pending: 1,
        processing: 0,
        completed: 0,
        failed: 0,
        skipped: 0,
        lastUpdated: Date.now()
      }));

      const results = await handleQueueMessage(mockBatch, mockEnv);

      expect(results.processed).toBe(0);
      expect(results.skipped).toBe(1);
      expect(mockBatch.messages[0].ack).toHaveBeenCalled();
    });
  });

  describe('API Endpoints', () => {
    it('should handle embedding generation initiation', async () => {
      mockEnv.RECIPE_STORAGE.get.mockResolvedValue(JSON.stringify({
        total: 0,
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        skipped: 0,
        lastUpdated: null
      }));

      const response = await handleEmbedding(mockRequest, mockEnv, corsHeaders);
      const result = await response.json();

      expect(result.message).toBe('Embedding generation initiated');
      expect(result.note).toBe('Recipes are processed via Cloudflare Queue consumer');
      expect(result.queueStats).toBeDefined();
    });

    it('should handle queue population', async () => {
      const recipeKeys = ['recipe1', 'recipe2'];
      
      mockEnv.RECIPE_STORAGE.get
        .mockResolvedValueOnce(JSON.stringify([])) // Empty queue stats
        .mockResolvedValueOnce(null) // No existing embedding for recipe1
        .mockResolvedValueOnce(null); // No existing embedding for recipe2

      mockEnv.RECIPE_STORAGE.list.mockResolvedValue({
        keys: recipeKeys.map(key => ({ name: key })),
        list_complete: true
      });

      mockEnv.RECIPE_VECTORS.getByIds.mockResolvedValue([]);
      mockEnv.RECIPE_VECTORS.query.mockResolvedValue({ matches: [] });

      mockEnv.EMBEDDING_QUEUE.sendBatch.mockResolvedValue(undefined);

      const populateRequest = new Request('https://example.com/populate-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority: 'normal' })
      });

      const response = await handlePopulateQueue(populateRequest, mockEnv, corsHeaders);
      const result = await response.json();

      expect(result.checked).toBe(2);
      expect(result.found).toBe(2);
      expect(result.addedToQueue).toBe(2);
    });

    it('should handle direct recipe addition to queue', async () => {
      mockEnv.EMBEDDING_QUEUE.send.mockResolvedValue(undefined);

      const addRequest = new Request('https://example.com/queue/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipeId: 'recipe1', priority: 'high' })
      });

      const response = await handleAddToQueue(addRequest, mockEnv, corsHeaders);
      const result = await response.json();

      expect(result.status).toBe('success');
      expect(result.recipeId).toBe('recipe1');
      expect(result.priority).toBe('high');
      expect(result.messageId).toBe('recipe1');
    });

    it('should validate queue addition parameters', async () => {
      const addRequest = new Request('https://example.com/queue/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority: 'high' }) // Missing recipeId
      });

      const response = await handleAddToQueue(addRequest, mockEnv, corsHeaders);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.error).toBe('Missing recipeId parameter');
    });

    it('should validate priority values', async () => {
      const addRequest = new Request('https://example.com/queue/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipeId: 'recipe1', priority: 'invalid' })
      });

      const response = await handleAddToQueue(addRequest, mockEnv, corsHeaders);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.error).toBe('Invalid priority. Must be one of: low, normal, high');
    });
  });

  describe('Progress and Status', () => {
    it('should return queue statistics', async () => {
      const queueStats = {
        total: 5,
        pending: 2,
        processing: 0,
        completed: 1,
        failed: 1,
        skipped: 1,
        lastUpdated: Date.now()
      };

      mockEnv.RECIPE_STORAGE.get
        .mockResolvedValueOnce(JSON.stringify(queueStats)) // Queue stats
        .mockResolvedValueOnce(null); // Recipe count

      mockEnv.RECIPE_STORAGE.list.mockResolvedValue({
        keys: [{ name: 'recipe1' }],
        list_complete: true
      });

      const progressRequest = new Request('https://example.com/progress', { method: 'GET' });
      const response = await handleProgress(progressRequest, mockEnv, corsHeaders);
      const result = await response.json();

      expect(result.status).toBe('success');
      expect(result.progress.queueStats.total).toBe(5);
      expect(result.progress.queueStats.pending).toBe(2);
      expect(result.progress.note).toBe('Queue processing is handled automatically by Cloudflare Queues');
    });

    it('should show processing status when queue has pending items', async () => {
      const queueStats = {
        total: 3,
        pending: 2,
        processing: 0,
        completed: 0,
        failed: 0,
        skipped: 1,
        lastUpdated: Date.now()
      };

      mockEnv.RECIPE_STORAGE.get
        .mockResolvedValueOnce(JSON.stringify(queueStats))
        .mockResolvedValueOnce(null);

      mockEnv.RECIPE_STORAGE.list.mockResolvedValue({
        keys: [],
        list_complete: true
      });

      const progressRequest = new Request('https://example.com/progress', { method: 'GET' });
      const response = await handleProgress(progressRequest, mockEnv, corsHeaders);
      const result = await response.json();

      expect(result.progress.status).toBe('processing');
    });
  });

  describe('Queue Reset', () => {
    it('should reset queue statistics', async () => {
      mockEnv.RECIPE_STORAGE.put.mockResolvedValue(undefined);

      const resetRequest = new Request('https://example.com/reset', { method: 'DELETE' });
      const response = await handleReset(resetRequest, mockEnv, corsHeaders);
      const result = await response.json();

      expect(result.status).toBe('success');
      expect(result.message).toBe('Embedding queue statistics reset successfully');
      expect(result.note).toContain('Cloudflare Queue messages are managed automatically');
      expect(mockEnv.RECIPE_STORAGE.put).toHaveBeenCalledWith(
        'embedding_queue_stats',
        expect.stringContaining('"total":0')
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle queue processing errors gracefully', async () => {
      const mockBatch = {
        messages: [
          {
            body: {
              type: 'recipe_embedding',
              recipeId: 'recipe1',
              priority: 'normal',
              attempts: 0
            },
            ack: vi.fn()
          }
        ]
      };

      // Mock an error during processing - this will be caught by getRecipeFromKV
      mockEnv.RECIPE_STORAGE.get.mockRejectedValue(new Error('Storage error'));

      const results = await handleQueueMessage(mockBatch, mockEnv);

      // The error is caught by getRecipeFromKV and treated as "no data", resulting in skipped status
      expect(results.skipped).toBe(1);
      expect(results.failed).toBe(0);
      expect(mockBatch.messages[0].ack).toHaveBeenCalled();
      expect(results.details[0].status).toBe('skipped');
      expect(results.details[0].reason).toBe('no_data');
    });

    it('should handle malformed queue messages', async () => {
      const mockBatch = {
        messages: [
          {
            body: null, // Malformed message
            ack: vi.fn()
          }
        ]
      };

      const results = await handleQueueMessage(mockBatch, mockEnv);

      expect(results.failed).toBe(1);
      expect(mockBatch.messages[0].ack).toHaveBeenCalled();
    });
  });
});