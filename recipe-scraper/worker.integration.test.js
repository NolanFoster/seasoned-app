/**
 * Integration tests for Recipe Scraper Worker
 * These tests focus on testing the fetch handler with minimal mocking
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import worker from './worker.js';

// Mock the shared KV storage module
jest.mock('../shared/kv-storage.js', () => ({
  generateRecipeId: jest.fn().mockResolvedValue('mock-id'),
  saveRecipeToKV: jest.fn().mockResolvedValue({ success: true }),
  getRecipeFromKV: jest.fn().mockResolvedValue({ success: false }),
  listRecipesFromKV: jest.fn().mockResolvedValue({ 
    success: true,
    recipes: [],
    total: 0,
    cursor: null
  }),
  deleteRecipeFromKV: jest.fn().mockResolvedValue({ success: true })
}));

describe('Worker Integration Tests', () => {
  let env;
  let ctx;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Mock environment with KV namespace
    env = {
      RECIPES_DB: {}
    };

    // Mock context
    ctx = {
      waitUntil: jest.fn()
    };

    // Mock global APIs used by the worker
    global.HTMLRewriter = jest.fn().mockImplementation(() => ({
      on: jest.fn().mockReturnThis(),
      transform: jest.fn().mockImplementation(() => ({
        text: jest.fn().mockResolvedValue('')
      }))
    }));
  });

  const createRequest = (method, url, body = null) => {
    return new Request(url, {
      method,
      headers: {
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : null
    });
  };

  describe('Health endpoint', () => {
    test('should return health status', async () => {
      const request = createRequest('GET', 'https://example.com/health');
      const response = await worker.fetch(request, env, ctx);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        status: 'healthy',
        service: 'recipe-scraper',
        features: ['scraping', 'kv-storage']
      });
    });
  });

  describe('Root endpoint', () => {
    test('should return API documentation', async () => {
      const request = createRequest('GET', 'https://example.com/');
      const response = await worker.fetch(request, env, ctx);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.service).toBe('Recipe Scraper with KV Storage');
      expect(data.endpoints).toBeDefined();
    });
  });

  describe('CORS', () => {
    test('should handle OPTIONS requests', async () => {
      const request = createRequest('OPTIONS', 'https://example.com/scrape');
      const response = await worker.fetch(request, env, ctx);

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });

  describe('GET /scrape validation', () => {
    test('should require url parameter', async () => {
      const request = createRequest('GET', 'https://example.com/scrape');
      const response = await worker.fetch(request, env, ctx);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Missing url parameter');
    });
  });

  describe('POST /scrape validation', () => {
    test('should handle invalid JSON', async () => {
      const request = new Request('https://example.com/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid'
      });
      const response = await worker.fetch(request, env, ctx);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid JSON in request body');
    });

    test('should require urls in body', async () => {
      const request = createRequest('POST', 'https://example.com/scrape', {
        notUrls: true
      });
      const response = await worker.fetch(request, env, ctx);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Missing url or urls in request body');
    });

    test('should handle empty urls array', async () => {
      const request = createRequest('POST', 'https://example.com/scrape', {
        urls: []
      });
      const response = await worker.fetch(request, env, ctx);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.summary.total).toBe(0);
    });
  });

  describe('GET /recipes', () => {
    test('should list recipes without ID', async () => {
      const { listRecipesFromKV } = await import('../shared/kv-storage.js');
      
      const request = createRequest('GET', 'https://example.com/recipes');
      const response = await worker.fetch(request, env, ctx);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.recipes).toBeDefined();
      expect(data.total).toBe(0);
    });

    test('should handle recipe not found', async () => {
      const { getRecipeFromKV } = await import('../shared/kv-storage.js');
      getRecipeFromKV.mockResolvedValueOnce({ success: false });
      
      const request = createRequest('GET', 'https://example.com/recipes?id=notfound');
      const response = await worker.fetch(request, env, ctx);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Recipe not found');
    });
  });

  describe('DELETE /recipes', () => {
    test('should require id parameter', async () => {
      const request = createRequest('DELETE', 'https://example.com/recipes');
      const response = await worker.fetch(request, env, ctx);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Missing id parameter');
    });

    test('should handle successful deletion', async () => {
      const request = createRequest('DELETE', 'https://example.com/recipes?id=test123');
      const response = await worker.fetch(request, env, ctx);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Error handling', () => {
    test('should catch and handle unexpected errors', async () => {
      const { getRecipeFromKV } = await import('../shared/kv-storage.js');
      getRecipeFromKV.mockRejectedValueOnce(new Error('KV Error'));
      
      const request = createRequest('GET', 'https://example.com/recipes?id=test');
      const response = await worker.fetch(request, env, ctx);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toContain('Internal server error');
    });
  });
});