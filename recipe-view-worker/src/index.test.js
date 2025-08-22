import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import worker from './index.js';

describe('Recipe View Worker', () => {
  const mockEnv = {
    RECIPE_SAVE_WORKER_URL: 'https://test-save-worker.example.com'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /', () => {
    it('should return the home page', async () => {
      const request = new Request('https://test.com/');
      const response = await worker.fetch(request, mockEnv);
      
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
      
      const html = await response.text();
      expect(html).toContain('Recipe View Service');
      expect(html).toContain('/recipe/:id');
    });
  });

  describe('GET /recipe/:id', () => {
    it('should fetch and render a recipe page', async () => {
      // Mock the fetch call to the recipe API
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'test123',
          name: 'Test Recipe',
          description: 'A delicious test recipe',
          prep_time: 'PT15M',
          cook_time: 'PT30M',
          recipe_yield: '4 servings',
          ingredients: ['1 cup flour', '2 eggs', '1/2 cup milk'],
          instructions: ['Mix ingredients', 'Bake for 30 minutes'],
          image_url: 'https://example.com/image.jpg',
          source_url: 'https://example.com/recipe'
        })
      });

      const request = new Request('https://test.com/recipe/test123');
      const response = await worker.fetch(request, mockEnv);
      
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
      expect(response.headers.get('cache-control')).toBe('public, max-age=3600');
      
      const html = await response.text();
      expect(html).toContain('Test Recipe');
      expect(html).toContain('A delicious test recipe');
      expect(html).toContain('1 cup flour');
      expect(html).toContain('Mix ingredients');
      expect(html).toContain('Prep:');
      expect(html).toMatch(/Prep:.*?(15 minutes|15 m|PT15M)/);
      expect(html).toContain('Cook:');
      expect(html).toMatch(/Cook:.*?(30 minutes|30 m|PT30M)/);
      
      // Verify API was called correctly
      expect(global.fetch).toHaveBeenCalledWith(
        'https://test-save-worker.example.com/recipe/get?id=test123',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Accept': 'application/json'
          })
        })
      );
    });

    it('should return 404 for non-existent recipe', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404
      });

      const request = new Request('https://test.com/recipe/notfound');
      const response = await worker.fetch(request, mockEnv);
      
      expect(response.status).toBe(404);
      expect(response.headers.get('content-type')).toContain('text/html');
      
      const html = await response.text();
      expect(html).toContain('Recipe not found');
    });

    it('should handle nested recipe data structure from save worker', async () => {
      // Mock the fetch call with nested data structure (as returned by save worker)
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'test123',
          url: 'https://example.com/recipe',
          data: {
            name: 'Nested Recipe',
            description: 'Recipe with nested data structure',
            prepTime: 'PT20M',
            cookTime: 'PT40M',
            recipeYield: '6 servings',
            ingredients: ['2 cups water', '1 tsp salt'],
            instructions: ['Boil water', 'Add salt'],
            image: 'https://example.com/nested-image.jpg',
            url: 'https://example.com/recipe'
          },
          scrapedAt: '2025-08-22T00:00:00Z',
          version: '1.1'
        })
      });

      const request = new Request('https://test.com/recipe/test123');
      const response = await worker.fetch(request, mockEnv);
      
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
      
      const html = await response.text();
      expect(html).toContain('Nested Recipe');
      expect(html).toContain('Recipe with nested data structure');
      expect(html).toContain('2 cups water');
      expect(html).toContain('Boil water');
    });

    it('should handle API errors gracefully', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const request = new Request('https://test.com/recipe/test123');
      const response = await worker.fetch(request, mockEnv);
      
      expect(response.status).toBe(500);
      expect(response.headers.get('content-type')).toContain('text/html');
      
      const html = await response.text();
      expect(html).toContain('Error loading recipe');
    });
  });

  describe('OPTIONS requests', () => {
    it('should handle CORS preflight', async () => {
      const request = new Request('https://test.com/recipe/test', {
        method: 'OPTIONS'
      });
      const response = await worker.fetch(request, mockEnv);
      
      expect(response.status).toBe(200);
      expect(response.headers.get('access-control-allow-origin')).toBe('*');
      expect(response.headers.get('access-control-allow-methods')).toContain('GET');
    });
  });

  describe('404 handling', () => {
    it('should return 404 for unknown routes', async () => {
      const request = new Request('https://test.com/unknown/path');
      const response = await worker.fetch(request, mockEnv);
      
      expect(response.status).toBe(404);
      expect(response.headers.get('content-type')).toContain('text/html');
      
      const html = await response.text();
      expect(html).toContain('Page not found');
    });
  });

  describe('Environment variable handling', () => {
    it('should use default URL when env var is not set', async () => {
      const envWithoutUrl = {};
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 'test', name: 'Test Recipe' })
      });

      const request = new Request('https://test.com/recipe/test123');
      await worker.fetch(request, envWithoutUrl);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://recipe-save-worker.recipesage2.workers.dev/recipe/get?id=test123',
        expect.any(Object)
      );
    });
  });

  describe('Recipe data variations', () => {
    it('should handle recipe with minimal data', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          name: 'Minimal Recipe'
        })
      });

      const request = new Request('https://test.com/recipe/minimal');
      const response = await worker.fetch(request, mockEnv);
      
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain('Minimal Recipe');
    });

    it('should handle recipe with empty name', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'test',
          ingredients: ['test ingredient']
        })
      });

      const request = new Request('https://test.com/recipe/noname');
      const response = await worker.fetch(request, mockEnv);
      
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain('Untitled Recipe');
    });

    it('should handle invalid recipe data', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => null
      });

      const request = new Request('https://test.com/recipe/invalid');
      const response = await worker.fetch(request, mockEnv);
      
      expect(response.status).toBe(404);
      const html = await response.text();
      expect(html).toContain('Invalid recipe');
    });
  });

  describe('Error scenarios', () => {
    it('should handle non-404 error status from API', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      const request = new Request('https://test.com/recipe/error');
      const response = await worker.fetch(request, mockEnv);
      
      expect(response.status).toBe(500);
      const html = await response.text();
      expect(html).toContain('Error loading recipe');
    });

    it('should handle JSON parsing errors', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => { throw new Error('Invalid JSON'); }
      });

      const request = new Request('https://test.com/recipe/badjson');
      const response = await worker.fetch(request, mockEnv);
      
      expect(response.status).toBe(500);
      const html = await response.text();
      expect(html).toContain('Error loading recipe');
    });

    it('should log errors to console', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      global.fetch = vi.fn().mockRejectedValue(new Error('Test error'));

      const request = new Request('https://test.com/recipe/test');
      await worker.fetch(request, mockEnv);

      expect(consoleSpy).toHaveBeenCalledWith('Error fetching recipe:', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });

  describe('CORS headers', () => {
    it('should include CORS headers in all responses', async () => {
      const testCases = [
        { url: '/', method: 'GET' },
        { url: '/recipe/test', method: 'GET' },
        { url: '/unknown', method: 'GET' },
        { url: '/recipe/test', method: 'OPTIONS' }
      ];

      for (const testCase of testCases) {
        const request = new Request(`https://test.com${testCase.url}`, {
          method: testCase.method
        });
        
        if (testCase.url === '/recipe/test' && testCase.method === 'GET') {
          global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ name: 'Test' })
          });
        }

        const response = await worker.fetch(request, mockEnv);
        
        expect(response.headers.get('access-control-allow-origin')).toBe('*');
        expect(response.headers.get('access-control-allow-methods')).toContain('GET');
        expect(response.headers.get('access-control-allow-headers')).toContain('Content-Type');
      }
    });
  });

  describe('URL pattern matching', () => {
    it('should match recipe URLs with various ID formats', async () => {
      const ids = ['abc123', '123-456', 'test_recipe', 'UPPERCASE', 'with.dots'];
      
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ name: 'Test Recipe' })
      });

      for (const id of ids) {
        const request = new Request(`https://test.com/recipe/${id}`);
        const response = await worker.fetch(request, mockEnv);
        
        expect(response.status).toBe(200);
        expect(global.fetch).toHaveBeenCalledWith(
          `https://test-save-worker.example.com/recipe/get?id=${id}`,
          expect.any(Object)
        );
      }
    });

    it('should not match recipe URLs with trailing slash', async () => {
      const request = new Request('https://test.com/recipe/test/');
      const response = await worker.fetch(request, mockEnv);
      
      expect(response.status).toBe(404);
    });

    it('should not match nested recipe paths', async () => {
      const request = new Request('https://test.com/recipe/test/edit');
      const response = await worker.fetch(request, mockEnv);
      
      expect(response.status).toBe(404);
    });
  });

  describe('Content-Type header', () => {
    it('should set correct charset in content-type', async () => {
      const request = new Request('https://test.com/');
      const response = await worker.fetch(request, mockEnv);
      
      expect(response.headers.get('content-type')).toBe('text/html;charset=UTF-8');
    });
  });

  describe('Caching', () => {
    it('should set cache headers for recipe pages', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ name: 'Cached Recipe' })
      });

      const request = new Request('https://test.com/recipe/cached');
      const response = await worker.fetch(request, mockEnv);
      
      expect(response.headers.get('cache-control')).toBe('public, max-age=3600');
    });

    it('should not set cache headers for error pages', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404
      });

      const request = new Request('https://test.com/recipe/notfound');
      const response = await worker.fetch(request, mockEnv);
      
      expect(response.headers.get('cache-control')).toBeNull();
    });
  });

  describe('Method handling', () => {
    it('should reject non-GET methods for recipe endpoints', async () => {
      const methods = ['POST', 'PUT', 'DELETE', 'PATCH'];
      
      for (const method of methods) {
        const request = new Request('https://test.com/recipe/test', { method });
        const response = await worker.fetch(request, mockEnv);
        
        expect(response.status).toBe(404);
      }
    });
  });

  describe('Home page content', () => {
    it('should include API documentation on home page', async () => {
      const request = new Request('https://test.com/');
      const response = await worker.fetch(request, mockEnv);
      const html = await response.text();

      expect(html).toContain('Recipe View Service');
      expect(html).toContain('GET');
      expect(html).toContain('/recipe/:id');
      expect(html).toContain('Returns a beautifully formatted HTML page');
      expect(html).toContain('Example: /recipe/abc123def456');
    });
  });

  describe('Error page content', () => {
    it('should include proper error styling', async () => {
      const request = new Request('https://test.com/notfound');
      const response = await worker.fetch(request, mockEnv);
      const html = await response.text();

      expect(html).toContain('error-container');
      expect(html).toContain('Go to Home');
      expect(html).toContain('linear-gradient');
    });
  });
});