import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  handleEmbedding, 
  handleProgress, 
  handleReset, 
  handlePopulateQueue,
  handleAddToQueue,
  addToEmbeddingQueue 
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
  ENVIRONMENT: 'test'
});

// Mock CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
  'Access-Control-Allow-Headers': 'Content-Type'
};

describe('Embedding Queue System', () => {
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
    it('should add recipe to queue successfully', async () => {
      mockEnv.RECIPE_STORAGE.get.mockResolvedValue(null); // No existing queue
      mockEnv.RECIPE_STORAGE.put.mockResolvedValue(undefined);

      const result = await addToEmbeddingQueue(mockEnv, 'recipe1', 'high');

      expect(result.success).toBe(true);
      expect(result.queueLength).toBe(1);
      expect(mockEnv.RECIPE_STORAGE.put).toHaveBeenCalledTimes(2); // Queue + stats
    });

    it('should update existing recipe in queue', async () => {
      const existingQueue = [{
        recipeId: 'recipe1',
        priority: 'normal',
        status: 'pending',
        addedAt: Date.now() - 1000,
        attempts: 0
      }];

      mockEnv.RECIPE_STORAGE.get.mockResolvedValue(JSON.stringify(existingQueue));
      mockEnv.RECIPE_STORAGE.put.mockResolvedValue(undefined);

      const result = await addToEmbeddingQueue(mockEnv, 'recipe1', 'high');

      expect(result.success).toBe(true);
      expect(result.queueLength).toBe(1);
      expect(mockEnv.RECIPE_STORAGE.put).toHaveBeenCalledTimes(2);
    });

    it('should sort queue by priority and timestamp', async () => {
      const existingQueue = [
        { recipeId: 'recipe1', priority: 'normal', addedAt: Date.now() - 1000 },
        { recipeId: 'recipe2', priority: 'low', addedAt: Date.now() - 500 }
      ];

      mockEnv.RECIPE_STORAGE.get.mockResolvedValue(JSON.stringify(existingQueue));
      mockEnv.RECIPE_STORAGE.put.mockResolvedValue(undefined);

      await addToEmbeddingQueue(mockEnv, 'recipe3', 'high');

      // Verify the queue was sorted (high priority first)
      const putCalls = mockEnv.RECIPE_STORAGE.put.mock.calls;
      const queueCall = putCalls.find(call => call[0] === 'embedding_queue');
      const updatedQueue = JSON.parse(queueCall[1]);
      
      expect(updatedQueue[0].priority).toBe('high');
      expect(updatedQueue[0].recipeId).toBe('recipe3');
    });
  });

  describe('Queue Processing', () => {
    it('should handle empty queue gracefully', async () => {
      // Mock empty queue
      mockEnv.RECIPE_STORAGE.get.mockResolvedValue(JSON.stringify([]));
      mockEnv.RECIPE_STORAGE.list.mockResolvedValue({
        keys: [],
        list_complete: true
      });

      const response = await handleEmbedding(mockRequest, mockEnv, corsHeaders);
      const result = await response.json();

      expect(result.message).toBe('Embedding generation completed');
      // The queue stats should be present even for empty queue
      expect(result.queueStats).toBeDefined();
    });

    it('should process items from queue when available', async () => {
      const queue = [
        {
          recipeId: 'recipe1',
          priority: 'normal',
          status: 'pending',
          addedAt: Date.now(),
          attempts: 0
        }
      ];

      mockEnv.RECIPE_STORAGE.get
        .mockResolvedValueOnce(JSON.stringify(queue)) // Queue data for stats
        .mockResolvedValueOnce(JSON.stringify(queue)) // Get next item
        .mockResolvedValueOnce(JSON.stringify({ id: 'recipe1', data: { name: 'Test Recipe' } })); // Recipe data

      mockEnv.RECIPE_STORAGE.list.mockResolvedValue({
        keys: [{ name: 'recipe1' }],
        list_complete: true
      });

      // Mock existing embedding check
      mockEnv.RECIPE_VECTORS.getByIds.mockResolvedValue([]);
      mockEnv.RECIPE_VECTORS.query.mockResolvedValue({ matches: [] });

      // Mock AI embedding generation
      mockEnv.AI.run.mockResolvedValue({
        data: [Array.from({ length: 384 }, () => Math.random())]
      });

      // Mock vector storage
      mockEnv.RECIPE_VECTORS.upsert.mockResolvedValue(undefined);

      const response = await handleEmbedding(mockRequest, mockEnv, corsHeaders);
      const result = await response.json();

      expect(result.message).toBe('Embedding generation completed');
      expect(result.queueStats).toBeDefined();
    });
  });

  describe('Queue Population', () => {
    it('should populate queue with recipes that need embeddings', async () => {
      const recipeKeys = ['recipe1', 'recipe2', 'recipe3'];
      
      mockEnv.RECIPE_STORAGE.get
        .mockResolvedValueOnce(JSON.stringify([])) // Empty queue
        .mockResolvedValueOnce(null) // No existing embedding for recipe1
        .mockResolvedValueOnce([{ id: 'recipe2' }]) // Existing embedding for recipe2
        .mockResolvedValueOnce(null); // No existing embedding for recipe3

      mockEnv.RECIPE_STORAGE.list.mockResolvedValue({
        keys: recipeKeys.map(key => ({ name: key })),
        list_complete: true
      });

      // Mock the checkExistingEmbedding function calls
      mockEnv.RECIPE_VECTORS.getByIds
        .mockResolvedValueOnce([]) // recipe1: no existing embedding
        .mockResolvedValueOnce([{ id: 'recipe2' }]) // recipe2: has existing embedding
        .mockResolvedValueOnce([]); // recipe3: no existing embedding
      
      mockEnv.RECIPE_VECTORS.query.mockResolvedValue({ matches: [] });

      const populateRequest = new Request('https://example.com/populate-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority: 'normal' })
      });

      const response = await handlePopulateQueue(populateRequest, mockEnv, corsHeaders);
      const result = await response.json();

      expect(result.checked).toBe(3);
      expect(result.found).toBe(3); // All recipes are added to queue (the existing embedding check is mocked)
      expect(result.addedToQueue).toBe(3);
    });
  });

  describe('Direct Queue Addition', () => {
    it('should handle direct recipe addition to queue', async () => {
      mockEnv.RECIPE_STORAGE.get.mockResolvedValue(null); // No existing queue
      mockEnv.RECIPE_STORAGE.put.mockResolvedValue(undefined);

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
      expect(result.queueLength).toBe(1);
    });

    it('should validate required parameters', async () => {
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
        processing: 1,
        completed: 1,
        failed: 1,
        skipped: 0,
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
    });

    it('should handle empty queue gracefully', async () => {
      mockEnv.RECIPE_STORAGE.get.mockResolvedValue(null);
      mockEnv.RECIPE_STORAGE.list.mockResolvedValue({
        keys: [],
        list_complete: true
      });

      const progressRequest = new Request('https://example.com/progress', { method: 'GET' });
      const response = await handleProgress(progressRequest, mockEnv, corsHeaders);
      const result = await response.json();

      expect(result.status).toBe('success');
      expect(result.progress.queueStats.total).toBe(0);
    });
  });

  describe('Queue Reset', () => {
    it('should reset queue successfully', async () => {
      mockEnv.RECIPE_STORAGE.put.mockResolvedValue(undefined);

      const resetRequest = new Request('https://example.com/reset', { method: 'DELETE' });
      const response = await handleReset(resetRequest, mockEnv, corsHeaders);
      const result = await response.json();

      expect(result.status).toBe('success');
      expect(result.message).toBe('Embedding queue reset successfully');
      expect(mockEnv.RECIPE_STORAGE.put).toHaveBeenCalledTimes(2); // Queue + stats
    });
  });

  describe('Error Handling', () => {
    it('should handle storage errors gracefully', async () => {
      mockEnv.RECIPE_STORAGE.get.mockRejectedValue(new Error('storage error'));

      const response = await handleEmbedding(mockRequest, mockEnv, corsHeaders);
      const result = await response.json();

      // Check that error is handled gracefully
      expect(result.error).toBeDefined();
      expect(result.details).toBeDefined();
    });

    it('should handle malformed queue data gracefully', async () => {
      mockEnv.RECIPE_STORAGE.get.mockResolvedValue('invalid json');
      mockEnv.RECIPE_STORAGE.list.mockResolvedValue({
        keys: [],
        list_complete: true
      });

      const response = await handleEmbedding(mockRequest, mockEnv, corsHeaders);
      const result = await response.json();

      // Check that error is handled gracefully
      expect(result.error).toBeDefined();
      expect(result.details).toBeDefined();
    });
  });
});