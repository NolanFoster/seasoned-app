import { describe, it, expect, vi } from 'vitest';
import worker from './index.js';

describe('Recipe View Worker', () => {
  const mockEnv = {
    RECIPE_SAVE_WORKER_URL: 'https://test-save-worker.example.com'
  };

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
      expect(html).toContain('15 minutes');
      expect(html).toContain('Cook:');
      expect(html).toContain('30 minutes');
      
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
});