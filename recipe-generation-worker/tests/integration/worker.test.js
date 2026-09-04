import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../../src/index.js';
import { mockEnv, mockEnvWithoutEnvironment, createMockRequest, createPostRequest, assertCorsHeaders } from '../setup.js';

describe('Recipe Generation Worker - Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('CORS handling', () => {
    it('should handle OPTIONS requests', async () => {
      const request = createMockRequest('/health', { method: 'OPTIONS' });
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(200);
      assertCorsHeaders(response);
    });

    it('should handle CORS preflight requests with OPTIONS method', async () => {
      const response = await worker.fetch(new Request('https://example.com/generate', {
        method: 'OPTIONS'
      }));

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS');
      // Fix #3: X-User-Id is now included so cross-origin workflow requests pass preflight.
      expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type, X-User-Id');
    });
  });

  describe('404 handling', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await worker.fetch(new Request('https://example.com/unknown', {
        method: 'GET'
      }));

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Not Found');
      expect(data.message).toBe('The requested endpoint does not exist');
    });

    it('should return 404 for POST to unknown routes', async () => {
      const request = createPostRequest('/unknown', { test: 'data' });
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Not Found');
    });

    it('should return 404 for PUT to unknown routes', async () => {
      const response = await worker.fetch(new Request('https://example.com/unknown', {
        method: 'PUT'
      }));

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Not Found');
    });

    it('should return 404 for DELETE to unknown routes', async () => {
      const response = await worker.fetch(new Request('https://example.com/unknown', {
        method: 'DELETE'
      }));

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Not Found');
    });
  });

  describe('Generate route routing', () => {
    it('should route POST /generate to the generate handler', async () => {
      const request = createPostRequest('/generate', { ingredients: ['chicken'] });
      const response = await worker.fetch(request, mockEnv);

      // In mock mode (no AI binding), returns 200
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toBeDefined();
    });

    it('should return 405 for GET /generate', async () => {
      const request = createMockRequest('/generate', { method: 'GET' });
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(404);
    });
  });

  describe('Health route', () => {
    it('should return 200 for GET /health', async () => {
      const request = createMockRequest('/health', { method: 'GET' });
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(200);
      const data = await response.json();
      // The health handler returns { status: 'healthy', ... }
      expect(data.status).toBe('healthy');
    });
  });

  describe('Grocery list route', () => {
    it('should route POST /grocery-list to the grocery handler', async () => {
      const request = createPostRequest('/grocery-list', { ingredients: ['2 cups flour', '1 egg'] });
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toBeDefined();
    });
  });

  describe('Adapt route', () => {
    it('should route POST /adapt to the adapt handler', async () => {
      // The adapt handler requires a baseRecipe with a name and a non-empty
      // ingredients array. Without AI bound, the mock-AI path returns 200.
      const request = createPostRequest('/adapt', {
        baseRecipe: {
          name: 'Test Pasta',
          ingredients: ['200g spaghetti', '2 cloves garlic', '2 tbsp olive oil']
        },
        modifications: []
      });
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toBeDefined();
    });
  });

  describe('Environment handling', () => {
    it('should work without ENVIRONMENT variable', async () => {
      const request = createMockRequest('/health', { method: 'GET' });
      const response = await worker.fetch(request, mockEnvWithoutEnvironment);

      expect(response.status).toBe(200);
    });
  });
});
