import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleGenerate } from '../../src/handlers/generate-handler.js';
import { mockEnv, createPostRequest, assertCorsHeaders, assertJsonResponse } from '../setup.js';

describe('Generate Handler - Unit Tests', () => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  // Mock AI and RECIPE_VECTORS for tests
  const mockAI = {
    run: vi.fn()
  };

  const mockVectors = {
    query: vi.fn()
  };

  const mockKVStorage = {
    get: vi.fn()
  };

  const enhancedMockEnv = {
    ...mockEnv,
    AI: mockAI,
    RECIPE_VECTORS: mockVectors,
    RECIPE_STORAGE: mockKVStorage
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock responses
    mockAI.run.mockImplementation((model, _params) => {
      if (model === '@cf/baai/bge-base-en-v1.5') {
        return Promise.resolve({
          data: [[0.1, 0.2, 0.3, 0.4, 0.5]] // Mock embedding
        });
      } else if (model === '@cf/meta/llama-3-8b-instruct') {
        return Promise.resolve({
          response: `Chicken Rice Bowl

Ingredients:
- 2 cups cooked rice
- 1 lb chicken breast, diced
- 2 tbsp olive oil
- 1 onion, chopped
- Salt and pepper to taste

Instructions:
1. Heat olive oil in a large pan
2. Cook chicken until golden brown
3. Add onion and cook until soft
4. Serve over rice

Prep time: 10 minutes
Cook time: 15 minutes
Serves: 4`
        });
      }
    });

    mockVectors.query.mockResolvedValue({
      matches: [
        {
          id: 'recipe-1',
          score: 0.9,
          metadata: {
            title: 'Similar Chicken Recipe',
            description: 'A delicious chicken dish'
          }
        }
      ]
    });

    // Mock KV storage responses
    mockKVStorage.get.mockResolvedValue(JSON.stringify({
      data: {
        name: 'Mock Chicken Recipe',
        description: 'A test recipe',
        ingredients: ['1 lb chicken breast', '2 cups rice', '1 tbsp oil'],
        instructions: ['Cook chicken', 'Prepare rice', 'Combine and serve'],
        prepTime: '10 minutes',
        cookTime: '20 minutes',
        recipeYield: '4'
      }
    }));
  });

  describe('Recipe Generation', () => {
    it('should generate recipe successfully with valid ingredients', async () => {
      const requestBody = {
        ingredients: ['chicken', 'rice'],
        cuisine: 'italian'
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, enhancedMockEnv, corsHeaders);

      expect(response.status).toBe(200);
      assertJsonResponse(response);
      assertCorsHeaders(response);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
      expect(data.recipe.name).toBeDefined();
      expect(data.recipe.ingredients).toBeInstanceOf(Array);
      expect(data.recipe.instructions).toBeInstanceOf(Array);
      expect(data.environment).toBe('test');

      // Verify AI calls were made
      expect(mockAI.run).toHaveBeenCalledWith('@cf/baai/bge-base-en-v1.5', expect.any(Object));
      expect(mockAI.run).toHaveBeenCalledWith('@cf/meta/llama-3-8b-instruct', expect.any(Object));
      expect(mockVectors.query).toHaveBeenCalled();
    });

    it('should handle complex request with all optional fields', async () => {
      const requestBody = {
        ingredients: ['chicken', 'rice', 'vegetables'],
        cuisine: 'asian',
        dietary: ['gluten-free', 'low-sodium'],
        servings: 4,
        maxCookTime: 30,
        mealType: 'dinner',
        cookingMethod: 'stir-fry'
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, enhancedMockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
      expect(data.recipe.cuisine).toBe('asian');
      expect(data.recipe.dietary).toEqual(['gluten-free', 'low-sodium']);
    });

    it('should handle minimal request with only ingredients', async () => {
      const requestBody = {
        ingredients: ['pasta']
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, enhancedMockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe.sourceIngredients).toEqual(['pasta']);
    });

    it('should reject requests without recipeName or ingredients', async () => {
      const requestBody = {
        cuisine: 'italian'
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, enhancedMockEnv, corsHeaders);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Either recipeName or ingredients field is required. ingredients must be a non-empty array if provided.');
    });

    it('should reject requests with empty ingredients array', async () => {
      const requestBody = {
        ingredients: []
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, enhancedMockEnv, corsHeaders);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Either recipeName or ingredients field is required. ingredients must be a non-empty array if provided.');
    });

    it('should handle AI embedding failure gracefully', async () => {
      mockAI.run.mockImplementation((model) => {
        if (model === '@cf/baai/bge-base-en-v1.5') {
          return Promise.resolve(null); // Simulate embedding failure
        }
        return Promise.resolve({ response: 'Default recipe' });
      });

      const requestBody = {
        ingredients: ['chicken', 'rice']
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, enhancedMockEnv, corsHeaders);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Failed to process recipe generation request');
    });

    it('should handle LLaMA failure gracefully', async () => {
      mockAI.run.mockImplementation((model) => {
        if (model === '@cf/baai/bge-base-en-v1.5') {
          return Promise.resolve({ data: [[0.1, 0.2, 0.3]] });
        }
        return Promise.reject(new Error('LLaMA failed'));
      });

      const requestBody = {
        ingredients: ['chicken', 'rice']
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, enhancedMockEnv, corsHeaders);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Failed to process recipe generation request');
    });

    it('should work without similar recipes', async () => {
      mockVectors.query.mockResolvedValue({ matches: [] });

      const requestBody = {
        ingredients: ['exotic-ingredient']
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, enhancedMockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe.similarRecipesFound).toBe(0);
    });

    it('should generate recipe using recipeName', async () => {
      const requestBody = {
        recipeName: 'Chicken Teriyaki Bowl'
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, enhancedMockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
      expect(data.recipe.name).toBeDefined();
    });

    it('should work with mixed recipeName and additional constraints', async () => {
      const requestBody = {
        recipeName: 'Healthy Pasta Salad',
        dietary: ['vegetarian'],
        servings: 6
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, enhancedMockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe.dietary).toEqual(['vegetarian']);
    });
  });

  describe('Content-Type validation', () => {
    it('should reject requests without Content-Type header', async () => {
      const request = new Request('https://test.com/generate', {
        method: 'POST',
        body: JSON.stringify({ ingredients: ['chicken'] })
      });

      const response = await handleGenerate(request, mockEnv, corsHeaders);

      expect(response.status).toBe(400);
      assertJsonResponse(response);
      assertCorsHeaders(response);
      const data = await response.json();
      expect(data.error).toBe('Content-Type must be application/json');
    });

    it('should reject requests with non-JSON Content-Type', async () => {
      const request = new Request('https://test.com/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain'
        },
        body: 'some text'
      });

      const response = await handleGenerate(request, mockEnv, corsHeaders);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Content-Type must be application/json');
    });

    it('should accept Content-Type with charset', async () => {
      const requestBody = { ingredients: ['chicken'] };
      const request = new Request('https://test.com/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8'
        },
        body: JSON.stringify(requestBody)
      });

      const response = await handleGenerate(request, enhancedMockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
      expect(data.recipe.sourceIngredients).toEqual(requestBody.ingredients);
    });
  });

  describe('Error handling', () => {
    it('should handle malformed JSON gracefully', async () => {
      const request = new Request('https://test.com/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: 'invalid json {'
      });

      const response = await handleGenerate(request, mockEnv, corsHeaders);

      expect(response.status).toBe(500);
      assertJsonResponse(response);
      assertCorsHeaders(response);
      const data = await response.json();
      expect(data.error).toBe('Failed to process recipe generation request');
      expect(data.details).toBeDefined();
    });

    it('should handle empty JSON object', async () => {
      const request = createPostRequest('/generate', {});
      const response = await handleGenerate(request, enhancedMockEnv, corsHeaders);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Either recipeName or ingredients field is required. ingredients must be a non-empty array if provided.');
    });

    it('should log errors to console', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const request = new Request('https://test.com/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: 'invalid json'
      });

      await handleGenerate(request, mockEnv, corsHeaders);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error processing recipe generation request:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Environment handling', () => {
    it('should use development environment when ENVIRONMENT is not set', async () => {
      const requestBody = { ingredients: ['chicken'] };
      const request = createPostRequest('/generate', requestBody);

      const envWithoutEnvironment = {
        AI: mockAI,
        RECIPE_VECTORS: mockVectors,
        RECIPE_STORAGE: mockKVStorage
      };

      const response = await handleGenerate(request, envWithoutEnvironment, corsHeaders);

      const data = await response.json();
      expect(data.environment).toBe('development');
    });

    it('should use provided environment variable', async () => {
      const requestBody = { ingredients: ['chicken'] };
      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, enhancedMockEnv, corsHeaders);

      const data = await response.json();
      expect(data.environment).toBe('test');
    });
  });
});
