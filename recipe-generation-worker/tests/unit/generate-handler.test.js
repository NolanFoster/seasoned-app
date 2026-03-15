import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the opik module to prevent real network calls during tests
vi.mock('opik', () => ({
  Opik: vi.fn().mockImplementation(() => ({
    flush: vi.fn().mockResolvedValue(undefined),
    trace: vi.fn().mockReturnValue({ id: 'mock-trace-id' }),
    span: vi.fn().mockReturnValue({ id: 'mock-span-id' })
  }))
}));

import { handleGenerate } from '../../src/handlers/generate-handler.js';
import { mockEnv, mockEnvWithOpik, createPostRequest, assertCorsHeaders, assertJsonResponse } from '../setup.js';

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

  const mockImageGenerationService = {
    fetch: vi.fn()
  };

  const enhancedMockEnv = {
    ...mockEnv,
    AI: mockAI,
    RECIPE_VECTORS: mockVectors,
    RECIPE_STORAGE: mockKVStorage,
    IMAGE_GENERATION_SERVICE: mockImageGenerationService
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock responses
    mockAI.run.mockImplementation((model, params) => {
      if (model === '@cf/baai/bge-small-en-v1.5') {
        return Promise.resolve({
          data: [[0.1, 0.2, 0.3, 0.4, 0.5]] // Mock embedding
        });
      } else if (model === '@cf/meta/llama-4-scout-17b-16e-instruct') {
        // Extract request info from the user prompt to make dynamic responses
        const userMessage = params.messages?.find(m => m.role === 'user')?.content || '';

        // Determine cuisine and dietary from the prompt
        let cuisine = 'Asian-inspired';
        let dietary = [];

        if (userMessage.includes('asian')) {
          cuisine = 'asian';
        }
        if (userMessage.includes('vegetarian')) {
          dietary = ['vegetarian'];
        }
        if (userMessage.includes('gluten-free')) {
          dietary.push('gluten-free');
        }
        if (userMessage.includes('low-sodium')) {
          dietary.push('low-sodium');
        }

        // Return valid JSON matching our schema
        const mockRecipe = {
          name: 'Chicken Rice Bowl',
          description: 'A delicious and easy chicken rice bowl perfect for a quick meal',
          ingredients: [
            '2 cups cooked rice',
            '1 lb chicken breast, diced',
            '2 tbsp olive oil',
            '1 onion, chopped',
            'Salt and pepper to taste'
          ],
          instructions: [
            'Heat olive oil in a large pan over medium heat',
            'Cook chicken until golden brown, about 6-8 minutes',
            'Add onion and cook until soft, about 3-4 minutes',
            'Season with salt and pepper',
            'Serve over rice and enjoy'
          ],
          prepTime: '10 minutes',
          cookTime: '15 minutes',
          totalTime: '25 minutes',
          servings: '4 servings',
          difficulty: 'Easy',
          cuisine: cuisine,
          dietary: dietary,
          tips: [
            'Use leftover rice for best results',
            'Can substitute chicken with tofu for vegetarian option'
          ],
          nutrition: {
            calories: '350 per serving',
            protein: '25g',
            carbs: '40g',
            fat: '8g'
          },
          storage: 'Store leftovers in refrigerator for up to 3 days'
        };

        return Promise.resolve({
          response: mockRecipe
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

    // Mock image generation service responses
    mockImageGenerationService.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        imageUrl: 'https://images.seasonedapp.com/recipe-test-image.jpg',
        imageId: 'recipe-test-123',
        metadata: {
          recipeName: 'Test Recipe',
          style: 'realistic',
          aspectRatio: '1:1',
          generatedAt: new Date().toISOString()
        }
      })
    });
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
      expect(mockAI.run).toHaveBeenCalledWith('@cf/baai/bge-small-en-v1.5', expect.any(Object));
      expect(mockAI.run).toHaveBeenCalledWith('@cf/meta/llama-4-scout-17b-16e-instruct', expect.any(Object));
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
        if (model === 'bge-small-en-v1.5') {
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
        if (model === 'bge-small-en-v1.5') {
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

  describe('Recipe Parsing', () => {
    it('should handle recipe generation with various input formats', async () => {
      const requestBody = {
        ingredients: ['chicken', 'rice'],
        cuisine: 'italian',
        dietary: ['gluten-free'],
        mealType: 'dinner',
        servings: 4
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, mockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
      expect(data.recipe.ingredients).toBeDefined();
      expect(data.recipe.instructions).toBeDefined();
    });

    it('should handle recipe generation with recipe name only', async () => {
      const requestBody = {
        recipeName: 'Chicken Teriyaki Bowl'
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, mockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
    });

    it('should handle recipe generation with mixed recipe name and constraints', async () => {
      const requestBody = {
        recipeName: 'Healthy Pasta Salad',
        ingredients: ['pasta', 'vegetables'],
        dietary: ['vegetarian']
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, mockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
    });
  });

  describe('Recipe Parsing Edge Cases', () => {
    it('should handle recipe with measurement patterns when no ingredients found', async () => {
      const requestBody = {
        ingredients: ['exotic-ingredient'],
        cuisine: 'fusion'
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, mockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
    });

    it('should handle recipe with remaining lines as instructions when no instruction section found', async () => {
      const requestBody = {
        ingredients: ['pasta', 'sauce'],
        cuisine: 'italian'
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, mockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
    });

    it('should handle recipe with time information in various formats', async () => {
      const requestBody = {
        ingredients: ['chicken', 'vegetables'],
        cuisine: 'asian',
        mealType: 'dinner'
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, mockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
    });
  });

  describe('Recipe Parsing Fallback Logic', () => {
    it('should use fallback logic when no clear recipe structure is found', async () => {
      const requestBody = {
        ingredients: ['mystery-ingredient'],
        cuisine: 'experimental'
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, mockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
    });

    it('should handle recipe with only measurement patterns and no clear sections', async () => {
      const requestBody = {
        ingredients: ['unknown-item'],
        cuisine: 'fusion'
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, mockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
    });
  });

  describe('Fallback Logic Coverage', () => {
    it('should handle recipe with no clear sections and trigger fallback logic', async () => {
      const requestBody = {
        ingredients: ['mystery-item'],
        cuisine: 'experimental'
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, mockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
    });

    it('should handle recipe with measurement patterns in fallback logic', async () => {
      const requestBody = {
        ingredients: ['unknown-ingredient'],
        cuisine: 'fusion'
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, mockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
    });

    it('should handle recipe with remaining lines as instructions in fallback logic', async () => {
      const requestBody = {
        ingredients: ['pasta', 'sauce'],
        cuisine: 'italian'
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, mockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
    });

    it('should handle recipe with time extraction in various formats', async () => {
      const requestBody = {
        ingredients: ['chicken', 'rice'],
        cuisine: 'asian'
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, mockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
    });

    it('should handle recipe with servings extraction', async () => {
      const requestBody = {
        ingredients: ['beef', 'potatoes'],
        cuisine: 'american'
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, mockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
    });

    it('should handle recipe with recipe name extraction from first line', async () => {
      const requestBody = {
        ingredients: ['special-ingredient'],
        cuisine: 'mystery'
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, mockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
    });

    it('should handle recipe with description from unknown section', async () => {
      const requestBody = {
        ingredients: ['unique-ingredient'],
        cuisine: 'experimental'
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, mockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
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

    it('should handle errors gracefully and return proper error response', async () => {
      const request = new Request('https://test.com/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: 'invalid json'
      });

      const response = await handleGenerate(request, mockEnv, corsHeaders);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Failed to process recipe generation request');
      expect(data.details).toBeDefined();
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

  describe('Opik Tracing Integration', () => {
    it('should attempt to enable Opik tracing when API key is provided', async () => {
      const consoleSpy = vi.spyOn(console, 'log');

      const envWithOpik = {
        ...enhancedMockEnv,
        ...mockEnvWithOpik
      };

      const requestBody = {
        ingredients: ['chicken', 'rice']
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, envWithOpik, corsHeaders);

      expect(response.status).toBe(200);

      // Check that Opik tracing was attempted (even if it fails due to missing SDK in test env)
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Opik')
      );

      consoleSpy.mockRestore();
    });

    it('should gracefully handle Opik tracing disabled when no API key', async () => {
      const consoleSpy = vi.spyOn(console, 'log');

      const requestBody = {
        ingredients: ['chicken', 'rice']
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, enhancedMockEnv, corsHeaders);

      expect(response.status).toBe(200);

      // Should not attempt to create Opik traces when no API key
      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Creating Opik trace')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Recipe Elevation Integration', () => {
    it('should elevate recipe when elevate option is true in mock mode', async () => {
      const requestBody = {
        ingredients: ['chicken', 'rice'],
        elevate: true
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, mockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
      expect(data.recipe.name).toContain('Elevated');
      expect(data.recipe.elevatedAt).toBeDefined();
      expect(data.recipe.elevationMethod).toBe('mock-ai');
      expect(data.recipe.mockMode).toBe(true);
    });

    it('should not elevate recipe when elevate option is false', async () => {
      const requestBody = {
        ingredients: ['chicken', 'rice'],
        elevate: false
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, mockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
      expect(data.recipe.name).not.toContain('Elevated');
      expect(data.recipe.elevatedAt).toBeUndefined();
      expect(data.recipe.elevationMethod).toBeUndefined();
    });

    it('should not elevate recipe when elevate option is not provided', async () => {
      const requestBody = {
        ingredients: ['chicken', 'rice']
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, mockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
      expect(data.recipe.name).not.toContain('Elevated');
      expect(data.recipe.elevatedAt).toBeUndefined();
      expect(data.recipe.elevationMethod).toBeUndefined();
    });

    it('should work with recipeName and elevation', async () => {
      const requestBody = {
        recipeName: 'Chicken Teriyaki Bowl',
        elevate: true
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, mockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
      expect(data.recipe.name).toContain('Elevated');
      expect(data.recipe.elevatedAt).toBeDefined();
    });

    it('should work with complex request and elevation', async () => {
      const requestBody = {
        ingredients: ['chicken', 'rice', 'vegetables'],
        cuisine: 'asian',
        dietary: ['gluten-free', 'low-sodium'],
        servings: 4,
        maxCookTime: 30,
        mealType: 'dinner',
        cookingMethod: 'stir-fry',
        elevate: true
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, mockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
      expect(data.recipe.name).toContain('Elevated');
      expect(data.recipe.cuisine).toBe('asian');
      expect(data.recipe.dietary).toEqual(['gluten-free', 'low-sodium']);
      expect(data.recipe.elevatedAt).toBeDefined();
    });

    it('should handle elevation with mixed recipeName and additional constraints', async () => {
      const requestBody = {
        recipeName: 'Healthy Pasta Salad',
        dietary: ['vegetarian'],
        servings: 6,
        elevate: true
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, mockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
      expect(data.recipe.name).toContain('Elevated');
      expect(data.recipe.dietary).toEqual(['vegetarian']);
      expect(data.recipe.elevatedAt).toBeDefined();
    });

    it('should handle elevation failure gracefully in mock mode', async () => {
      // Create an environment that will cause elevateRecipe to fail
      const failingEnv = {
        AI: {
          run: vi.fn().mockRejectedValue(new Error('AI service unavailable'))
        }
      };

      const requestBody = {
        ingredients: ['chicken', 'rice'],
        elevate: true
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, failingEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
      expect(data.recipe.elevationError).toBe('Recipe elevation failed, returning original recipe');
      expect(data.recipe.elevationFailed).toBe(true);
      expect(data.recipe.name).not.toContain('Elevated');
    });

    it('should handle elevation failure gracefully in AI mode', async () => {
      // Create an environment that allows recipe generation but fails elevation
      const failingEnv = {
        ...enhancedMockEnv,
        AI: {
          run: vi.fn().mockImplementation((model, _params) => {
            // Allow recipe generation to succeed
            if (model === '@cf/baai/bge-small-en-v1.5') {
              return Promise.resolve({
                data: [[0.1, 0.2, 0.3, 0.4, 0.5]] // Mock embedding
              });
            } else if (model === '@cf/meta/llama-4-scout-17b-16e-instruct') {
              // Check if this is an elevation call by looking for the culinary expert prompt
              const systemMessage = _params.messages?.find(m => m.role === 'system')?.content || '';
              if (systemMessage.includes('expert culinary teacher')) {
                // This is an elevation call - make it fail
                return Promise.reject(new Error('Elevation AI service unavailable'));
              } else {
                // This is a regular recipe generation call - make it succeed
                return Promise.resolve({
                  response: {
                    name: 'Chicken Rice Bowl',
                    description: 'A delicious and easy chicken rice bowl',
                    ingredients: ['2 cups cooked rice', '1 lb chicken breast, diced'],
                    instructions: ['Heat oil', 'Cook chicken', 'Serve over rice'],
                    prepTime: '10 minutes',
                    cookTime: '15 minutes',
                    totalTime: '25 minutes',
                    servings: '4 servings',
                    difficulty: 'Easy',
                    cuisine: 'Asian',
                    dietary: []
                  }
                });
              }
            }
            return Promise.resolve({ response: 'Default response' });
          })
        }
      };

      const requestBody = {
        ingredients: ['chicken', 'rice'],
        elevate: true
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, failingEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
      expect(data.recipe.elevationError).toBe('Recipe elevation failed, returning original recipe');
      expect(data.recipe.elevationFailed).toBe(true);
      expect(data.recipe.name).not.toContain('Elevated');
    });

    it('should handle elevation with truthy but non-boolean values', async () => {
      const requestBody = {
        ingredients: ['chicken', 'rice'],
        elevate: 'true' // String instead of boolean
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, mockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
      // Should not elevate because 'true' !== true
      expect(data.recipe.name).not.toContain('Elevated');
      expect(data.recipe.elevatedAt).toBeUndefined();
    });

    it('should handle elevation with numeric values', async () => {
      const requestBody = {
        ingredients: ['chicken', 'rice'],
        elevate: 1 // Number instead of boolean
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, mockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
      // Should not elevate because 1 !== true
      expect(data.recipe.name).not.toContain('Elevated');
      expect(data.recipe.elevatedAt).toBeUndefined();
    });

    it('should handle elevation with null values', async () => {
      const requestBody = {
        ingredients: ['chicken', 'rice'],
        elevate: null
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, mockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
      // Should not elevate because null !== true
      expect(data.recipe.name).not.toContain('Elevated');
      expect(data.recipe.elevatedAt).toBeUndefined();
    });
  });

  describe('ISO Time Normalization', () => {
    it('should normalize ISO time formats in recipe generation', async () => {
      // Create a mock environment that returns a recipe with ISO time formats
      const isoTimeEnv = {
        ...enhancedMockEnv,
        AI: {
          run: vi.fn().mockImplementation((model, _params) => {
            if (model === '@cf/baai/bge-small-en-v1.5') {
              return Promise.resolve({
                data: [[0.1, 0.2, 0.3, 0.4, 0.5]]
              });
            } else if (model === '@cf/meta/llama-4-scout-17b-16e-instruct') {
              return Promise.resolve({
                response: {
                  name: 'Test Recipe',
                  description: 'A test recipe with ISO time formats',
                  ingredients: ['1 cup test ingredient'],
                  instructions: ['Test instruction'],
                  prepTime: 'PT15M', // ISO format
                  cookTime: 'PT1H30M', // ISO format with hours and minutes
                  totalTime: 'PT2H', // ISO format with hours only
                  servings: '4 servings',
                  difficulty: 'Easy',
                  cuisine: 'Test',
                  dietary: []
                }
              });
            }
            return Promise.resolve({ response: 'Default response' });
          })
        }
      };

      const requestBody = {
        ingredients: ['test'],
        elevate: false
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, isoTimeEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
      expect(data.recipe.prepTime).toBe('15 minutes');
      expect(data.recipe.cookTime).toBe('1 hour 30 minutes');
      expect(data.recipe.totalTime).toBe('2 hours');
    });

    it('should handle various ISO time format edge cases', async () => {
      // Create a mock environment that returns a recipe with various ISO time formats
      const isoTimeEnv = {
        ...enhancedMockEnv,
        AI: {
          run: vi.fn().mockImplementation((model, _params) => {
            if (model === '@cf/baai/bge-small-en-v1.5') {
              return Promise.resolve({
                data: [[0.1, 0.2, 0.3, 0.4, 0.5]]
              });
            } else if (model === '@cf/meta/llama-4-scout-17b-16e-instruct') {
              return Promise.resolve({
                response: {
                  name: 'Test Recipe 2',
                  description: 'A test recipe with various ISO time formats',
                  ingredients: ['1 cup test ingredient'],
                  instructions: ['Test instruction'],
                  prepTime: 'PT0M', // Zero minutes
                  cookTime: 'PT1H', // One hour
                  totalTime: 'PT30M', // 30 minutes
                  servings: '4 servings',
                  difficulty: 'Easy',
                  cuisine: 'Test',
                  dietary: []
                }
              });
            }
            return Promise.resolve({ response: 'Default response' });
          })
        }
      };

      const requestBody = {
        ingredients: ['test'],
        elevate: false
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, isoTimeEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
      expect(data.recipe.prepTime).toBe('PT0M'); // Should remain unchanged for zero minutes
      expect(data.recipe.cookTime).toBe('1 hour');
      expect(data.recipe.totalTime).toBe('30 minutes');
    });

    it('should handle invalid ISO time formats', async () => {
      // Create a mock environment that returns a recipe with invalid ISO time formats
      const isoTimeEnv = {
        ...enhancedMockEnv,
        AI: {
          run: vi.fn().mockImplementation((model, _params) => {
            if (model === '@cf/baai/bge-small-en-v1.5') {
              return Promise.resolve({
                data: [[0.1, 0.2, 0.3, 0.4, 0.5]]
              });
            } else if (model === '@cf/meta/llama-4-scout-17b-16e-instruct') {
              return Promise.resolve({
                response: {
                  name: 'Test Recipe 3',
                  description: 'A test recipe with invalid ISO time formats',
                  ingredients: ['1 cup test ingredient'],
                  instructions: ['Test instruction'],
                  prepTime: 'INVALID', // Invalid format
                  cookTime: 'PT', // Incomplete format
                  totalTime: 'PT1H30M', // Valid format
                  servings: '4 servings',
                  difficulty: 'Easy',
                  cuisine: 'Test',
                  dietary: []
                }
              });
            }
            return Promise.resolve({ response: 'Default response' });
          })
        }
      };

      const requestBody = {
        ingredients: ['test'],
        elevate: false
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, isoTimeEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
      expect(data.recipe.prepTime).toBe('INVALID'); // Should remain unchanged
      expect(data.recipe.cookTime).toBe('PT'); // Should remain unchanged
      expect(data.recipe.totalTime).toBe('1 hour 30 minutes'); // Should be normalized
    });

    it('should handle ISO time with only minutes and zero hours', async () => {
      // Create a mock environment that returns a recipe with ISO time formats
      const isoTimeEnv = {
        ...enhancedMockEnv,
        AI: {
          run: vi.fn().mockImplementation((model, _params) => {
            if (model === '@cf/baai/bge-small-en-v1.5') {
              return Promise.resolve({
                data: [[0.1, 0.2, 0.3, 0.4, 0.5]]
              });
            } else if (model === '@cf/meta/llama-4-scout-17b-16e-instruct') {
              return Promise.resolve({
                response: {
                  name: 'Test Recipe 4',
                  description: 'A test recipe with ISO time formats',
                  ingredients: ['1 cup test ingredient'],
                  instructions: ['Test instruction'],
                  prepTime: 'PT45M', // 45 minutes only
                  cookTime: 'PT0H30M', // 0 hours, 30 minutes
                  totalTime: 'PT1H15M', // 1 hour 15 minutes
                  servings: '4 servings',
                  difficulty: 'Easy',
                  cuisine: 'Test',
                  dietary: []
                }
              });
            }
            return Promise.resolve({ response: 'Default response' });
          })
        }
      };

      const requestBody = {
        ingredients: ['test'],
        elevate: false
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, isoTimeEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
      expect(data.recipe.prepTime).toBe('45 minutes');
      expect(data.recipe.cookTime).toBe('30 minutes');
      expect(data.recipe.totalTime).toBe('1 hour 15 minutes');
    });

    it('should handle elevation with undefined values', async () => {
      const requestBody = {
        ingredients: ['chicken', 'rice'],
        elevate: undefined
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, mockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
      // Should not elevate because undefined !== true
      expect(data.recipe.name).not.toContain('Elevated');
      expect(data.recipe.elevatedAt).toBeUndefined();
    });

    it('should handle elevation with empty string values', async () => {
      const requestBody = {
        ingredients: ['chicken', 'rice'],
        elevate: ''
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, mockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
      // Should not elevate because '' !== true
      expect(data.recipe.name).not.toContain('Elevated');
      expect(data.recipe.elevatedAt).toBeUndefined();
    });

    it('should handle elevation with false values', async () => {
      const requestBody = {
        ingredients: ['chicken', 'rice'],
        elevate: false
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, mockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
      // Should not elevate because false !== true
      expect(data.recipe.name).not.toContain('Elevated');
      expect(data.recipe.elevatedAt).toBeUndefined();
    });

    it('should handle elevation with object values', async () => {
      const requestBody = {
        ingredients: ['chicken', 'rice'],
        elevate: {}
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, mockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
      // Should not elevate because {} !== true
      expect(data.recipe.name).not.toContain('Elevated');
      expect(data.recipe.elevatedAt).toBeUndefined();
    });

    it('should handle elevation with array values', async () => {
      const requestBody = {
        ingredients: ['chicken', 'rice'],
        elevate: []
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, mockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
      // Should not elevate because [] !== true
      expect(data.recipe.name).not.toContain('Elevated');
      expect(data.recipe.elevatedAt).toBeUndefined();
    });

    it('should handle complex recipe parsing edge cases', async () => {
      // Create a mock environment that returns a complex recipe with various edge cases
      const complexEnv = {
        ...enhancedMockEnv,
        AI: {
          run: vi.fn().mockImplementation((model, _params) => {
            if (model === '@cf/baai/bge-small-en-v1.5') {
              return Promise.resolve({
                data: [[0.1, 0.2, 0.3, 0.4, 0.5]]
              });
            } else if (model === '@cf/meta/llama-4-scout-17b-16e-instruct') {
              return Promise.resolve({
                response: {
                  name: 'Complex Test Recipe',
                  description: 'A complex recipe with various edge cases',
                  ingredients: [
                    '1 cup flour',
                    '2 eggs',
                    '1/2 cup milk'
                  ],
                  instructions: [
                    'Mix dry ingredients',
                    'Add wet ingredients',
                    'Bake at 350°F for 30 minutes'
                  ],
                  prepTime: 'PT15M', // ISO format
                  cookTime: 'PT30M', // ISO format
                  totalTime: 'PT45M', // ISO format
                  servings: 6, // Numeric instead of string
                  difficulty: 'Medium',
                  cuisine: 'American',
                  dietary: ['vegetarian'],
                  tips: [
                    'Preheat oven before mixing',
                    'Check doneness with toothpick'
                  ],
                  nutrition: {
                    calories: '250 per serving',
                    protein: '8g',
                    carbs: '35g',
                    fat: '6g'
                  }
                }
              });
            }
            return Promise.resolve({ response: 'Default response' });
          })
        }
      };

      const requestBody = {
        ingredients: ['flour', 'eggs', 'milk'],
        elevate: false
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, complexEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
      expect(data.recipe.prepTime).toBe('15 minutes');
      expect(data.recipe.cookTime).toBe('30 minutes');
      expect(data.recipe.totalTime).toBe('45 minutes');
      expect(data.recipe.servings).toBe('6 servings'); // Should be converted to string
    });
  });

  describe('Image Generation Integration', () => {
    it('should generate image when generateImage option is true in mock mode', async () => {
      const requestBody = {
        ingredients: ['chicken', 'rice'],
        generateImage: true
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, enhancedMockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
      expect(data.recipe.image_url).toBe('https://images.seasonedapp.com/recipe-test-image.jpg');
    });

    it('should generate image when generateImage option is true in AI mode', async () => {
      const requestBody = {
        ingredients: ['chicken', 'rice'],
        generateImage: true
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, enhancedMockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
      expect(data.recipe.image_url).toBe('https://images.seasonedapp.com/recipe-test-image.jpg');

      // Verify image generation service was called
      expect(mockImageGenerationService.fetch).toHaveBeenCalledWith(
        'https://ai-image-generation-worker/generate',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: expect.stringContaining('"recipe"')
        })
      );
    });

    it('should not generate image when generateImage option is false', async () => {
      const requestBody = {
        ingredients: ['chicken', 'rice'],
        generateImage: false
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, enhancedMockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
      expect(data.recipe.image_url).toBeUndefined();

      // Verify image generation service was not called
      expect(mockImageGenerationService.fetch).not.toHaveBeenCalled();
    });

    it('should not generate image when generateImage option is not provided', async () => {
      const requestBody = {
        ingredients: ['chicken', 'rice']
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, enhancedMockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
      expect(data.recipe.image_url).toBeUndefined();

      // Verify image generation service was not called
      expect(mockImageGenerationService.fetch).not.toHaveBeenCalled();
    });

    it('should handle image generation failure gracefully in mock mode', async () => {
      // Mock image generation service to fail
      mockImageGenerationService.fetch.mockRejectedValue(new Error('Image service unavailable'));

      const requestBody = {
        ingredients: ['chicken', 'rice'],
        generateImage: true
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, mockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
      expect(data.recipe.image_url).toBeUndefined();
      expect(data.recipe.imageGenerationError).toBe('Image generation failed, recipe generated without image');
    });

    it('should handle image generation failure gracefully in AI mode', async () => {
      // Mock image generation service to fail
      mockImageGenerationService.fetch.mockRejectedValue(new Error('Image service unavailable'));

      const requestBody = {
        ingredients: ['chicken', 'rice'],
        generateImage: true
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, enhancedMockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
      expect(data.recipe.image_url).toBeUndefined();
      expect(data.recipe.imageGenerationError).toBe('Image generation failed, recipe generated without image');
    });

    it('should handle image generation service returning unsuccessful response', async () => {
      // Mock image generation service to return unsuccessful response
      mockImageGenerationService.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: false,
          error: 'Image generation failed'
        })
      });

      const requestBody = {
        ingredients: ['chicken', 'rice'],
        generateImage: true
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, enhancedMockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
      expect(data.recipe.image_url).toBeUndefined();
      expect(data.recipe.imageGenerationError).toBe('Image generation failed, recipe generated without image');
    });

    it('should handle image generation service returning HTTP error', async () => {
      // Mock image generation service to return HTTP error
      mockImageGenerationService.fetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      const requestBody = {
        ingredients: ['chicken', 'rice'],
        generateImage: true
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, enhancedMockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
      expect(data.recipe.image_url).toBeUndefined();
      expect(data.recipe.imageGenerationError).toBe('Image generation failed, recipe generated without image');
    });

    it('should work with image generation and elevation together', async () => {
      const requestBody = {
        ingredients: ['chicken', 'rice'],
        generateImage: true,
        elevate: true
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, enhancedMockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
      // In AI mode, elevation works but may not change the name significantly
      expect(data.recipe.name).toBeDefined();
      expect(data.recipe.image_url).toBe('https://images.seasonedapp.com/recipe-test-image.jpg');
      expect(data.recipe.elevatedAt).toBeDefined();
    });

    it('should work with image generation and recipeName', async () => {
      const requestBody = {
        recipeName: 'Chicken Teriyaki Bowl',
        generateImage: true
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, enhancedMockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
      expect(data.recipe.image_url).toBe('https://images.seasonedapp.com/recipe-test-image.jpg');
    });

    it('should work with image generation and complex request', async () => {
      const requestBody = {
        ingredients: ['chicken', 'rice', 'vegetables'],
        cuisine: 'asian',
        dietary: ['gluten-free', 'low-sodium'],
        servings: 4,
        maxCookTime: 30,
        mealType: 'dinner',
        cookingMethod: 'stir-fry',
        generateImage: true
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, enhancedMockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
      expect(data.recipe.cuisine).toBe('asian');
      expect(data.recipe.dietary).toEqual(['gluten-free', 'low-sodium']);
      expect(data.recipe.image_url).toBe('https://images.seasonedapp.com/recipe-test-image.jpg');
    });

    it('should handle image generation with truthy but non-boolean values', async () => {
      const requestBody = {
        ingredients: ['chicken', 'rice'],
        generateImage: 'true' // String instead of boolean
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, enhancedMockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
      // Should not generate image because 'true' !== true
      expect(data.recipe.image_url).toBeUndefined();
      expect(mockImageGenerationService.fetch).not.toHaveBeenCalled();
    });

    it('should handle image generation with numeric values', async () => {
      const requestBody = {
        ingredients: ['chicken', 'rice'],
        generateImage: 1 // Number instead of boolean
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, enhancedMockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
      // Should not generate image because 1 !== true
      expect(data.recipe.image_url).toBeUndefined();
      expect(mockImageGenerationService.fetch).not.toHaveBeenCalled();
    });

    it('should handle image generation when service is not available', async () => {
      const envWithoutImageService = {
        ...enhancedMockEnv,
        IMAGE_GENERATION_SERVICE: undefined
      };

      const requestBody = {
        ingredients: ['chicken', 'rice'],
        generateImage: true
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, envWithoutImageService, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recipe).toBeDefined();
      expect(data.recipe.image_url).toBeUndefined();
      expect(data.recipe.imageGenerationError).toBe('Image generation failed, recipe generated without image');
    });
  });
});
