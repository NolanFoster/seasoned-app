import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index.js';

// Mock the shared utility functions
vi.mock('../../shared/utility-functions.js', () => ({
  formatDuration: vi.fn((duration) => {
    if (!duration) return '';
    // Simple mock implementation
    const match = duration?.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
    if (match) {
      const hours = match[1];
      const minutes = match[2];
      if (hours && minutes) return `${hours} hour${hours > 1 ? 's' : ''} ${minutes} minutes`;
      if (hours) return `${hours} hour${hours > 1 ? 's' : ''}`;
      if (minutes) return `${minutes} minutes`;
    }
    return duration;
  }),
  formatIngredientAmount: vi.fn((ingredient) => ingredient)
}));

// Mock environment
const mockEnv = {
  RECIPE_SAVE_WORKER_URL: 'https://mock-save-worker.test.dev'
};

// Mock fetch
global.fetch = vi.fn();

describe('Recipe View Worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('CORS handling', () => {
    it('should handle OPTIONS requests', async () => {
      const request = new Request('https://test.com/recipe/123', {
        method: 'OPTIONS'
      });

      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS');
    });
  });

  describe('Home page', () => {
    it('should return home page HTML on root path', async () => {
      const request = new Request('https://test.com/');
      
      const response = await worker.fetch(request, mockEnv);
      
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/html;charset=UTF-8');
      
      const html = await response.text();
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Recipe View Service');
    });
  });

  describe('Recipe viewing', () => {
    it('should fetch and display recipe when it exists', async () => {
      const mockRecipeId = 'test-recipe-123';
      const mockRecipe = {
        id: mockRecipeId,
        name: 'Test Recipe',
        title: 'Test Recipe',
        description: 'A test recipe',
        ingredients: ['ingredient 1', 'ingredient 2'],
        instructions: ['step 1', 'step 2'],
        prepTime: 'PT10M',
        cookTime: 'PT20M',
        totalTime: 'PT30M',
        servings: 4,
        imageUrl: 'https://test.com/image.jpg',
        nutrition: {
          calories: '200',
          proteinContent: '10g',
          fatContent: '5g'
        }
      };

      // Mock successful recipe fetch
      global.fetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockRecipe), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );

      const request = new Request(`https://test.com/recipe/${mockRecipeId}`);
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/html;charset=UTF-8');
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600');

      const html = await response.text();
      expect(html).toContain(mockRecipe.title);
      expect(html).toContain(mockRecipe.description);
      expect(html).toContain('ingredient 1');
      expect(html).toContain('step 1');
    });

    it('should return 404 when recipe not found', async () => {
      const mockRecipeId = 'non-existent-recipe';

      // Mock 404 response from save worker
      global.fetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Recipe not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        })
      );

      const request = new Request(`https://test.com/recipe/${mockRecipeId}`);
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(404);
      expect(response.headers.get('Content-Type')).toBe('text/html;charset=UTF-8');

      const html = await response.text();
      expect(html).toContain('Recipe not found');
    });

    it('should handle recipe data wrapped in data property', async () => {
      const mockRecipeId = 'test-recipe-456';
      const mockRecipe = {
        data: {
          id: mockRecipeId,
          name: 'Wrapped Recipe',
          title: 'Wrapped Recipe',
          ingredients: ['ingredient 1'],
          instructions: ['step 1']
        }
      };

      global.fetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockRecipe), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );

      const request = new Request(`https://test.com/recipe/${mockRecipeId}`);
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain('Wrapped Recipe');
    });

    it('should return 500 on fetch error', async () => {
      const mockRecipeId = 'error-recipe';

      // Mock network error
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      const request = new Request(`https://test.com/recipe/${mockRecipeId}`);
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(500);
      const html = await response.text();
      expect(html).toContain('Error loading recipe');
    });

    it('should use environment variable for save worker URL', async () => {
      const mockRecipeId = 'test-recipe-789';
      
      global.fetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ id: mockRecipeId, name: 'Test', title: 'Test' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );

      const request = new Request(`https://test.com/recipe/${mockRecipeId}`);
      await worker.fetch(request, mockEnv);

      expect(global.fetch).toHaveBeenCalledWith(
        `${mockEnv.RECIPE_SAVE_WORKER_URL}/recipe/get?id=${mockRecipeId}`,
        expect.objectContaining({
          headers: expect.objectContaining({
            'Accept': 'application/json'
          })
        })
      );
    });

    it('should use fallback URL when env variable not set', async () => {
      const mockRecipeId = 'test-recipe-fallback';
      
      global.fetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ id: mockRecipeId, name: 'Test', title: 'Test' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );

      const request = new Request(`https://test.com/recipe/${mockRecipeId}`);
      await worker.fetch(request, {}); // Empty env

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/recipe/get?id=${mockRecipeId}`),
        expect.any(Object)
      );
    });
  });

  describe('404 handling', () => {
    it('should return 404 for unknown routes', async () => {
      const request = new Request('https://test.com/unknown/path');
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(404);
      const html = await response.text();
      expect(html).toContain('Page not found');
    });
  });
});