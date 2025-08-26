import { describe, it, expect } from 'vitest';
import { handleRoot } from '../src/handlers/root-handler.js';
import { handleGenerate } from '../src/handlers/generate-handler.js';
import index from '../src/index.js';

// Mock environment for testing
const mockEnv = {
  ENVIRONMENT: 'test'
  // No AI binding to trigger mock mode
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

describe('Coverage Improvement Tests', () => {
  describe('Root Handler Edge Cases', () => {
    it('should handle root handler with undefined environment', async () => {
      const envWithoutEnvironment = {};
      const request = new Request('http://localhost/');

      const response = await handleRoot(request, envWithoutEnvironment, corsHeaders);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.environment).toBe('development');
    });

    it('should handle root handler with null environment', async () => {
      const envWithNullEnvironment = { ENVIRONMENT: null };
      const request = new Request('http://localhost/');

      const response = await handleRoot(request, envWithNullEnvironment, corsHeaders);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.environment).toBe('development');
    });
  });

  describe('Index.js Route Coverage', () => {
    it('should handle 404 for unknown routes', async () => {
      const request = new Request('http://localhost/unknown-route');

      const response = await index.fetch(request, mockEnv);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Not Found');
      expect(data.message).toBe('The requested endpoint does not exist');
    });

    it('should handle OPTIONS preflight request', async () => {
      const request = new Request('http://localhost/generate', {
        method: 'OPTIONS'
      });

      const response = await index.fetch(request, mockEnv);

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS');
    });

    it('should handle GET request to generate endpoint (should 404)', async () => {
      const request = new Request('http://localhost/generate', {
        method: 'GET'
      });

      const response = await index.fetch(request, mockEnv);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Not Found');
    });

    it('should handle POST request to health endpoint (should 404)', async () => {
      const request = new Request('http://localhost/health', {
        method: 'POST'
      });

      const response = await index.fetch(request, mockEnv);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Not Found');
    });
  });

  describe('Mock Mode JSON-LD Tests', () => {
    it('should return JSON-LD in mock mode', async () => {
      const requestBody = {
        recipeName: 'Test Recipe'
      };

      const request = new Request('http://localhost/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      const response = await handleGenerate(request, mockEnv, corsHeaders);
      const responseData = await response.json();

      expect(responseData.success).toBe(true);
      expect(responseData.jsonLd).toBeDefined();
      expect(responseData.jsonLd['@context']).toBe('https://schema.org');
      expect(responseData.jsonLd['@type']).toBe('Recipe');
      expect(responseData.jsonLd.name).toContain('Test Recipe');
    });

    it('should handle mock recipe with all fields', async () => {
      const requestBody = {
        recipeName: 'Complete Recipe',
        servings: '6',
        cuisine: 'Italian',
        dietary: ['vegetarian']
      };

      const request = new Request('http://localhost/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      const response = await handleGenerate(request, mockEnv, corsHeaders);
      const responseData = await response.json();

      expect(responseData.success).toBe(true);
      expect(responseData.jsonLd).toBeDefined();
      expect(responseData.jsonLd.recipeYield).toBe('6');
      expect(responseData.jsonLd.recipeCuisine).toBe('Italian');
      expect(responseData.jsonLd.keywords).toBe('vegetarian');
      // Comment is optional, so we don't test for it
    });

    it('should handle mock recipe with source ingredients', async () => {
      const requestBody = {
        ingredients: ['chicken', 'rice', 'vegetables']
      };

      const request = new Request('http://localhost/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      const response = await handleGenerate(request, mockEnv, corsHeaders);
      const responseData = await response.json();

      expect(responseData.success).toBe(true);
      expect(responseData.jsonLd).toBeDefined();
      expect(responseData.jsonLd.keywords).toContain('chicken');
      expect(responseData.jsonLd.keywords).toContain('rice');
      expect(responseData.jsonLd.keywords).toContain('vegetables');
    });

    it('should handle mock recipe with timing information', async () => {
      const requestBody = {
        recipeName: 'Timed Recipe'
      };

      const request = new Request('http://localhost/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      const response = await handleGenerate(request, mockEnv, corsHeaders);
      const responseData = await response.json();

      expect(responseData.success).toBe(true);
      expect(responseData.jsonLd).toBeDefined();
      expect(responseData.jsonLd.prepTime).toBe('PT15M');
      expect(responseData.jsonLd.cookTime).toBe('PT20M');
      expect(responseData.jsonLd.totalTime).toBe('PT35M');
    });

    it('should handle mock recipe with difficulty and cuisine', async () => {
      const requestBody = {
        recipeName: 'Advanced Recipe',
        difficulty: 'Hard',
        cuisine: 'French'
      };

      const request = new Request('http://localhost/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      const response = await handleGenerate(request, mockEnv, corsHeaders);
      const responseData = await response.json();

      expect(responseData.success).toBe(true);
      expect(responseData.jsonLd).toBeDefined();
      expect(responseData.jsonLd.recipeCategory).toBe('Easy'); // Mock always uses 'Easy'
      expect(responseData.jsonLd.recipeCuisine).toBe('French');
    });

    it('should handle mock recipe with instructions and ingredients', async () => {
      const requestBody = {
        recipeName: 'Structured Recipe'
      };

      const request = new Request('http://localhost/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      const response = await handleGenerate(request, mockEnv, corsHeaders);
      const responseData = await response.json();

      expect(responseData.success).toBe(true);
      expect(responseData.jsonLd).toBeDefined();
      expect(responseData.jsonLd.recipeIngredient).toBeDefined();
      expect(responseData.jsonLd.recipeInstructions).toBeDefined();
      expect(responseData.jsonLd.recipeInstructions).toHaveLength(3);
      expect(responseData.jsonLd.recipeInstructions[0]['@type']).toBe('HowToStep');
    });
  });

  describe('Error Handling Edge Cases', () => {
    it('should handle request with missing content type', async () => {
      const requestBody = {
        recipeName: 'Test Recipe'
      };

      const request = new Request('http://localhost/generate', {
        method: 'POST',
        body: JSON.stringify(requestBody)
      });

      const response = await handleGenerate(request, mockEnv, corsHeaders);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData.error).toBe('Content-Type must be application/json');
    });

    it('should handle request with invalid content type', async () => {
      const requestBody = {
        recipeName: 'Test Recipe'
      };

      const request = new Request('http://localhost/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain'
        },
        body: JSON.stringify(requestBody)
      });

      const response = await handleGenerate(request, mockEnv, corsHeaders);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData.error).toBe('Content-Type must be application/json');
    });

    it('should handle request with no recipeName and no ingredients', async () => {
      const requestBody = {};

      const request = new Request('http://localhost/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      const response = await handleGenerate(request, mockEnv, corsHeaders);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData.error).toContain('Either recipeName or ingredients field is required');
    });

    it('should handle request with empty ingredients array', async () => {
      const requestBody = {
        ingredients: []
      };

      const request = new Request('http://localhost/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      const response = await handleGenerate(request, mockEnv, corsHeaders);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData.error).toContain('Either recipeName or ingredients field is required');
    });
  });
});
