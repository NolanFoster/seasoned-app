import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the Opik SDK
vi.mock('opik', () => ({
  Opik: vi.fn().mockImplementation(() => ({
    trace: vi.fn().mockReturnValue({
      span: vi.fn().mockReturnValue({
        end: vi.fn()
      }),
      end: vi.fn()
    }),
    flush: vi.fn().mockResolvedValue(undefined)
  }))
}));

import { OpikClient, createOpikClient, opikClient } from '../../src/opik-client.js';

// Mock Cloudflare Workers AI environment
const mockEnv = {
  AI: {
    run: vi.fn()
  }
};

describe('Opik Client - Unit Tests', () => {
  let client;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new OpikClient('test-api-key');
  });

  describe('Constructor and Configuration', () => {
    it('should create client with API key', () => {
      expect(client.apiKey).toBe('test-api-key');
      expect(client.workspaceName).toBe('recipe-generation-worker');
      expect(client.client).toBeDefined();
    });

    it('should create client without API key', () => {
      const noKeyClient = new OpikClient();
      expect(noKeyClient.apiKey).toBeNull();
      expect(noKeyClient.client).toBeNull();
    });

    it('should set API key from environment', () => {
      const noKeyClient = new OpikClient();
      noKeyClient.setApiKey('new-api-key');
      expect(noKeyClient.apiKey).toBe('new-api-key');
      expect(noKeyClient.client).toBeDefined();
    });

    it('should throw error when initializing without API key', () => {
      const noKeyClient = new OpikClient();
      expect(() => noKeyClient.initializeClient()).toThrow('API key is required to initialize Opik client');
    });
  });

  describe('Recipe Generation', () => {
    it('should throw error when client is not initialized', async () => {
      const noKeyClient = new OpikClient();
      await expect(noKeyClient.generateRecipe({ ingredients: ['chicken'] }, mockEnv))
        .rejects.toThrow('Opik client not initialized. Please set API key first.');
    });

    it('should throw error when AI binding is not available', async () => {
      const envWithoutAI = {};
      await expect(client.generateRecipe({ ingredients: ['chicken'] }, envWithoutAI))
        .rejects.toThrow('Cloudflare Workers AI binding not available');
    });

    it('should generate recipe successfully with tracing', async () => {
      const mockResponse = `Recipe Name: Chicken Stir Fry
Description: A delicious and healthy stir fry
Ingredients:
- 1 lb chicken breast
- 2 cups mixed vegetables
- 2 tbsp soy sauce

Instructions:
1. Cut chicken into pieces
2. Stir fry chicken
3. Add vegetables and sauce

Prep Time: 15 minutes
Cook Time: 10 minutes
Total Time: 25 minutes
Servings: 4
Difficulty: Easy
Cuisine: Asian
Dietary: High Protein`;

      mockEnv.AI.run.mockResolvedValue(mockResponse);

      const result = await client.generateRecipe({
        ingredients: ['chicken', 'vegetables'],
        cuisine: 'asian'
      }, mockEnv);

      expect(result.name).toBe('Chicken Stir Fry');
      expect(result.description).toBe('A delicious and healthy stir fry');
      expect(result.ingredients).toContain('1 lb chicken breast');
      expect(result.instructions).toContain('Cut chicken into pieces');
      expect(result.prepTime).toBe('15 minutes');
      expect(result.cookTime).toBe('10 minutes');
      expect(result.totalTime).toBe('25 minutes');
      expect(result.servings).toBe('4');
      expect(result.difficulty).toBe('Easy');
      expect(result.cuisine).toBe('Asian');
      expect(result.dietary).toContain('High Protein');
      expect(result.optikGenerated).toBe(true);
      expect(result.source).toBe('optik-ai');

      // Verify that tracing was used
      expect(client.client.trace).toHaveBeenCalledWith({
        name: 'Recipe Generation',
        input: {
          prompt: expect.stringContaining('Ingredients available: chicken, vegetables'),
          requestData: {
            ingredients: ['chicken', 'vegetables'],
            cuisine: 'asian'
          }
        }
      });

      // Verify that AI was called with correct parameters
      expect(mockEnv.AI.run).toHaveBeenCalledWith('@cf/meta/llama-3.1-8b-instruct', {
        prompt: expect.stringContaining('Ingredients available: chicken, vegetables'),
        max_tokens: 1500,
        temperature: 0.7
      });
    });

    it('should handle AI generation errors gracefully', async () => {
      mockEnv.AI.run.mockRejectedValue(new Error('AI service unavailable'));

      await expect(client.generateRecipe({ ingredients: ['chicken'] }, mockEnv))
        .rejects.toThrow('Failed to generate recipe with Opik: AI service unavailable');
    });
  });

  describe('Prompt Building', () => {
    it('should build prompt with ingredients', () => {
      const prompt = client.buildRecipePrompt({
        ingredients: ['chicken', 'rice'],
        cuisine: 'italian'
      });

      expect(prompt).toContain('Ingredients available: chicken, rice');
      expect(prompt).toContain('Cuisine style: italian');
    });

    it('should build prompt with all parameters', () => {
      const prompt = client.buildRecipePrompt({
        ingredients: ['beef', 'potatoes'],
        cuisine: 'french',
        dietary: ['vegetarian'],
        mealType: 'dinner',
        cookingMethod: 'baking',
        servings: 6,
        maxCookTime: 60
      });

      expect(prompt).toContain('Ingredients available: beef, potatoes');
      expect(prompt).toContain('Cuisine style: french');
      expect(prompt).toContain('Dietary restrictions: vegetarian');
      expect(prompt).toContain('Meal type: dinner');
      expect(prompt).toContain('Preferred cooking method: baking');
      expect(prompt).toContain('Number of servings: 6');
      expect(prompt).toContain('Maximum cooking time: 60 minutes');
    });

    it('should build basic prompt when no parameters provided', () => {
      const prompt = client.buildRecipePrompt({});
      expect(prompt).toContain('Please create a delicious and creative recipe');
    });

    it('should include structured format instructions', () => {
      const prompt = client.buildRecipePrompt({});
      expect(prompt).toContain('Recipe Name: [Name of the recipe]');
      expect(prompt).toContain('Ingredients: [List ingredients with measurements, one per line starting with -]');
      expect(prompt).toContain('Instructions: [Step-by-step instructions, numbered]');
      expect(prompt).toContain('Prep Time: [Preparation time]');
      expect(prompt).toContain('Cook Time: [Cooking time]');
      expect(prompt).toContain('Total Time: [Total time]');
      expect(prompt).toContain('Servings: [Number of servings]');
      expect(prompt).toContain('Difficulty: [Easy/Medium/Hard]');
      expect(prompt).toContain('Cuisine: [Cuisine type]');
      expect(prompt).toContain('Dietary: [Dietary tags like vegetarian, vegan, gluten-free, etc.]');
    });
  });

  describe('Recipe Parsing', () => {
    it('should parse well-formatted recipe text', () => {
      const recipeText = `Recipe Name: Test Recipe
Description: A test recipe
Ingredients:
- 1 cup flour
- 2 eggs
- 1 cup milk

Instructions:
1. Mix ingredients
2. Bake at 350F
3. Serve hot

Prep Time: 10 minutes
Cook Time: 30 minutes
Total Time: 40 minutes
Servings: 8
Difficulty: Easy
Cuisine: American
Dietary: Vegetarian, Gluten-Free`;

      const result = client.parseGeneratedRecipe(recipeText, { ingredients: ['flour', 'eggs'] });

      expect(result.name).toBe('Test Recipe');
      expect(result.description).toBe('A test recipe');
      expect(result.ingredients).toEqual(['1 cup flour', '2 eggs', '1 cup milk']);
      expect(result.instructions).toEqual(['Mix ingredients', 'Bake at 350F', 'Serve hot']);
      expect(result.prepTime).toBe('10 minutes');
      expect(result.cookTime).toBe('30 minutes');
      expect(result.totalTime).toBe('40 minutes');
      expect(result.servings).toBe('8');
      expect(result.difficulty).toBe('Easy');
      expect(result.cuisine).toBe('American');
      expect(result.dietary).toEqual(['Vegetarian', 'Gluten-Free']);
    });

    it('should handle malformed recipe text gracefully', () => {
      const malformedText = 'This is not a properly formatted recipe';
      const result = client.parseGeneratedRecipe(malformedText, { ingredients: ['chicken'] });

      expect(result.name).toBe('Generated Recipe');
      expect(result.ingredients).toEqual(['chicken']);
      expect(result.instructions).toEqual(['Instructions to be determined']);
      expect(result.optikGenerated).toBe(true);
      expect(result.source).toBe('optik-ai');
    });

    it('should include raw response when parsing fails', () => {
      const malformedText = 'Malformed recipe';
      const result = client.parseGeneratedRecipe(malformedText, {});

      expect(result.rawResponse).toBe(malformedText);
    });
  });

  describe('Embedding Generation', () => {
    it('should generate embedding successfully using Cloudflare Workers AI', async () => {
      const mockEmbeddingResponse = {
        data: [[0.1, 0.2, 0.3, 0.4, 0.5]]
      };

      mockEnv.AI.run.mockResolvedValue(mockEmbeddingResponse);

      const result = await client.generateEmbedding('test text', mockEnv);
      expect(result).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
    });

    it('should handle missing AI binding for embeddings', async () => {
      const envWithoutAI = {};
      await expect(client.generateEmbedding('test text', envWithoutAI))
        .rejects.toThrow('Cloudflare Workers AI binding not available');
    });

    it('should handle invalid embedding response format', async () => {
      const invalidResponse = { data: null };
      mockEnv.AI.run.mockResolvedValue(invalidResponse);

      await expect(client.generateEmbedding('test text', mockEnv))
        .rejects.toThrow('Invalid embedding response format');
    });
  });

  describe('Factory Functions', () => {
    it('should create client with createOpikClient', () => {
      const customClient = createOpikClient('custom-key', 'custom-workspace');
      expect(customClient.apiKey).toBe('custom-key');
      expect(customClient.workspaceName).toBe('custom-workspace');
    });

    it('should provide default client instance', () => {
      expect(opikClient).toBeInstanceOf(OpikClient);
    });
  });

  describe('Tracing Integration', () => {
    it('should create trace and span for recipe generation', async () => {
      const mockResponse = `Recipe Name: Test Recipe
Description: Test description
Ingredients:
- 1 ingredient

Instructions:
1. Test step

Prep Time: 5 minutes
Cook Time: 10 minutes
Total Time: 15 minutes
Servings: 2
Difficulty: Easy
Cuisine: Test
Dietary: Test`;

      mockEnv.AI.run.mockResolvedValue(mockResponse);

      await client.generateRecipe({ ingredients: ['test'] }, mockEnv);

      // Verify trace was created
      expect(client.client.trace).toHaveBeenCalledWith({
        name: 'Recipe Generation',
        input: {
          prompt: expect.any(String),
          requestData: { ingredients: ['test'] }
        }
      });

      // Verify span was created
      const mockTrace = client.client.trace();
      expect(mockTrace.span).toHaveBeenCalledWith({
        name: 'LLM Recipe Generation',
        type: 'llm',
        input: {
          prompt: expect.any(String),
          model: '@cf/meta/llama-3.1-8b-instruct'
        }
      });

      // Verify flush was called
      expect(client.client.flush).toHaveBeenCalled();
    });
  });
});