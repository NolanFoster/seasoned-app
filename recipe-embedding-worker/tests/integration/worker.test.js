import { describe, it, expect, vi } from 'vitest';
import worker from '../../src/index.js';

describe('Recipe Embedding Worker Integration', () => {
  const mockEnv = getMockEnv();

  describe('HTTP Routes', () => {
    it('should handle root endpoint', async () => {
      const request = createMockRequest('/');
      const response = await worker.fetch(request, mockEnv);
      const data = await parseResponse(response);

      expect(response.status).toBe(200);
      expect(data.service).toBe('Recipe Embedding Worker');
    });

    it('should handle health endpoint', async () => {
      const request = createMockRequest('/health');
      mockEnv.RECIPE_STORAGE.get.mockResolvedValue(null);

      const response = await worker.fetch(request, mockEnv);
      const data = await parseResponse(response);

      expect(response.status).toBe(200);
      expect(data.status).toBe('healthy');
    });

    it('should handle embedding endpoint', async () => {
      const request = createMockRequest('/embed', 'POST', {});

      // Mock empty KV list
      mockEnv.RECIPE_STORAGE.list.mockResolvedValue({
        keys: [],
        list_complete: true
      });

      const response = await worker.fetch(request, mockEnv);
      const data = await parseResponse(response);

      expect(response.status).toBe(200);
      expect(data.message).toBe('No recipes found in storage');
    });

    it('should handle CORS preflight requests', async () => {
      const request = createMockRequest('/', 'OPTIONS');
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    });

    it('should return 404 for unknown routes', async () => {
      const request = createMockRequest('/unknown');
      const response = await worker.fetch(request, mockEnv);
      const data = await parseResponse(response);

      expect(response.status).toBe(404);
      expect(data.error).toBe('Not Found');
    });
  });

  describe('Scheduled Events', () => {
    it('should handle scheduled embedding generation', async () => {
      // Mock the controller and context objects
      const controller = {
        scheduledTime: Date.now(),
        cron: '0 2 * * *'
      };
      const ctx = {
        waitUntil: vi.fn()
      };

      // Mock empty KV list for simplicity
      mockEnv.RECIPE_STORAGE.list.mockResolvedValue({
        keys: [],
        list_complete: true
      });

      // Call the scheduled handler
      await worker.scheduled(controller, mockEnv, ctx);

      // Verify that the scheduled task ran without throwing errors
      expect(mockEnv.RECIPE_STORAGE.list).toHaveBeenCalled();
    });

    it('should handle scheduled errors gracefully', async () => {
      const controller = {
        scheduledTime: Date.now(),
        cron: '0 2 * * *'
      };
      const ctx = {
        waitUntil: vi.fn()
      };

      // Mock KV list to throw error
      mockEnv.RECIPE_STORAGE.list.mockRejectedValue(new Error('Scheduled task error'));

      // Call the scheduled handler - should not throw
      await expect(worker.scheduled(controller, mockEnv, ctx)).resolves.not.toThrow();
    });
  });

  describe('End-to-End Embedding Flow', () => {
    it('should process complete embedding workflow', async () => {
      const request = createMockRequest('/embed', 'POST', {});

      const mockRecipe = {
        id: 'cookie-recipe',
        url: 'https://example.com/cookies',
        scrapedAt: '2024-01-01T00:00:00Z',
        data: {
          name: 'Chocolate Chip Cookies',
          description: 'Delicious homemade cookies',
          ingredients: ['flour', 'sugar', 'chocolate chips'],
          instructions: ['Mix dry ingredients', 'Add wet ingredients', 'Bake']
        }
      };

      // Mock KV operations
      mockEnv.RECIPE_STORAGE.list.mockResolvedValue({
        keys: [{ name: 'cookie-recipe' }],
        list_complete: true
      });
      mockEnv.RECIPE_STORAGE.get.mockResolvedValue(JSON.stringify(mockRecipe));

      // Mock vectorize operations
      mockEnv.RECIPE_VECTORS.query.mockResolvedValue({ matches: [] });
      mockEnv.RECIPE_VECTORS.upsert.mockResolvedValue(true);

      // Mock AI response
      mockEnv.AI.run.mockResolvedValue({
        data: [[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]]
      });

      const response = await worker.fetch(request, mockEnv);
      const data = await parseResponse(response);

      expect(response.status).toBe(200);
      expect(data.processed).toBe(1);
      expect(data.errors).toBe(0);

      // Verify the AI was called with the correct model
      expect(mockEnv.AI.run).toHaveBeenCalledWith('@cf/baai/bge-small-en-v1.5', {
        text: expect.stringContaining('Chocolate Chip Cookies')
      });

      // Verify the embedding was stored
      expect(mockEnv.RECIPE_VECTORS.upsert).toHaveBeenCalledWith([{
        id: 'cookie-recipe',
        values: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
        metadata: expect.objectContaining({
          title: 'Chocolate Chip Cookies',
          description: 'Delicious homemade cookies',
          url: 'https://example.com/cookies'
        })
      }]);
    });
  });
});
