import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker from '../../src/index.js';
import { mockAI } from '../__mocks__/ai-mock.js';
import { mockR2Bucket } from '../__mocks__/r2-mock.js';

describe('AI Image Generation Worker Integration', () => {
  let env;
  let ctx;

  beforeEach(() => {
    env = {
      ENVIRONMENT: 'test',
      IMAGE_DOMAIN: 'https://test-images.example.com',
      AI: mockAI,
      RECIPE_IMAGES: mockR2Bucket
    };
    
    ctx = {
      waitUntil: vi.fn()
    };
  });

  describe('GET /', () => {
    it('should return service information', async () => {
      const request = new Request('https://worker.example.com/');
      const response = await worker.fetch(request, env, ctx);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.service).toBe('AI Image Generation Worker');
      expect(data.endpoints).toBeDefined();
    });
  });

  describe('GET /health', () => {
    it('should return healthy status', async () => {
      const request = new Request('https://worker.example.com/health');
      const response = await worker.fetch(request, env, ctx);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('healthy');
    });
  });

  describe('POST /generate', () => {
    it('should generate image for valid recipe', async () => {
      const recipe = {
        title: 'Test Recipe',
        description: 'A delicious test recipe',
        ingredients: ['ingredient1', 'ingredient2', 'ingredient3']
      };

      const request = new Request('https://worker.example.com/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe })
      });

      const response = await worker.fetch(request, env, ctx);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.imageUrl).toContain('https://test-images.example.com');
      expect(data.imageId).toContain('recipe-test-recipe');
      expect(data.metadata).toBeDefined();
    });

    it('should handle custom style and aspect ratio', async () => {
      const recipe = {
        name: 'Artistic Dish',
        ingredients: ['art', 'food', 'creativity']
      };

      const request = new Request('https://worker.example.com/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          recipe,
          style: 'artistic',
          aspectRatio: '16:9'
        })
      });

      const response = await worker.fetch(request, env, ctx);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.metadata.style).toBe('artistic');
      expect(data.metadata.aspectRatio).toBe('16:9');
    });

    it('should reject invalid recipe', async () => {
      const request = new Request('https://worker.example.com/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          recipe: {
            // Missing required fields
          }
        })
      });

      const response = await worker.fetch(request, env, ctx);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid recipe data');
      expect(data.details).toBeDefined();
    });

    it('should handle missing request body', async () => {
      const request = new Request('https://worker.example.com/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await worker.fetch(request, env, ctx);
      
      expect(response.status).toBe(500);
    });
  });

  describe('404 handling', () => {
    it('should return 404 for unknown routes', async () => {
      const request = new Request('https://worker.example.com/unknown');
      const response = await worker.fetch(request, env, ctx);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Not found');
    });
  });

  describe('Error handling', () => {
    it('should handle AI service errors gracefully', async () => {
      // Override AI mock to simulate error
      env.AI = {
        run: async () => {
          throw new Error('AI service unavailable');
        }
      };

      const recipe = {
        title: 'Test Recipe',
        ingredients: ['ingredient1']
      };

      const request = new Request('https://worker.example.com/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe })
      });

      const response = await worker.fetch(request, env, ctx);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to generate image');
    });
  });
});