import { describe, it, expect, vi, beforeEach } from 'vitest';
import { elevateRecipe } from '../../src/handlers/generate-handler.js';

describe('elevateRecipe', () => {
  let mockEnv;
  let mockRecipe;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Mock recipe for testing
    mockRecipe = {
      name: 'Simple Pasta',
      description: 'A basic pasta dish',
      ingredients: [
        '2 cups pasta',
        '1 cup tomato sauce',
        '1 tbsp olive oil'
      ],
      instructions: [
        'Boil water and cook pasta',
        'Heat sauce in a pan',
        'Combine pasta and sauce'
      ],
      prepTime: '10 minutes',
      cookTime: '15 minutes',
      totalTime: '25 minutes',
      servings: '4 servings',
      difficulty: 'Easy',
      cuisine: 'Italian',
      dietary: ['vegetarian'],
      tips: ['Use fresh ingredients']
    };

    // Mock environment
    mockEnv = {
      AI: {
        run: vi.fn()
      }
    };
  });

  describe('Mock Mode (no AI)', () => {
    it('should return elevated recipe in mock mode when AI is not available', async () => {
      const envWithoutAI = {};

      const result = await elevateRecipe(mockRecipe, envWithoutAI);

      expect(result).toEqual({
        ...mockRecipe,
        name: 'Elevated Simple Pasta',
        description: 'A basic pasta dish (Enhanced with professional culinary techniques)',
        ingredients: [
          '2 cups pasta (preferably fresh, high-quality)',
          '1 cup tomato sauce (preferably fresh, high-quality)',
          '1 tbsp olive oil (preferably fresh, high-quality)'
        ],
        instructions: [
          'Boil water and cook pasta (Pro tip: This step is crucial for building flavor layers)',
          'Heat sauce in a pan',
          'Combine pasta and sauce'
        ],
        tips: [
          'Use fresh ingredients',
          'Use high-quality, fresh ingredients for best results',
          'Taste and adjust seasoning throughout the cooking process',
          'Let the dish rest for a few minutes before serving to allow flavors to meld'
        ],
        elevatedAt: expect.any(String),
        elevationMethod: 'mock-ai',
        mockMode: true
      });
    });

    it('should handle recipes without tips in mock mode', async () => {
      const recipeWithoutTips = { ...mockRecipe };
      delete recipeWithoutTips.tips;
      const envWithoutAI = {};

      const result = await elevateRecipe(recipeWithoutTips, envWithoutAI);

      expect(result.tips).toEqual([
        'Use high-quality, fresh ingredients for best results',
        'Taste and adjust seasoning throughout the cooking process',
        'Let the dish rest for a few minutes before serving to allow flavors to meld'
      ]);
    });
  });

  describe('AI Mode', () => {
    it('should successfully elevate recipe with AI', async () => {
      const mockAIResponse = {
        response: {
          name: 'Elevated Simple Pasta',
          description: 'A refined pasta dish with professional techniques',
          ingredients: [
            '2 cups (400g) high-quality durum wheat pasta (e.g., De Cecco or Barilla)',
            '1 cup (240ml) San Marzano tomato sauce, preferably imported',
            '1 tbsp (15ml) extra virgin olive oil, preferably cold-pressed'
          ],
          instructions: [
            'Bring a large pot of heavily salted water to a rolling boil. Add pasta and cook until al dente (about 8-10 minutes). Reserve 1 cup of pasta water before draining.',
            'In a large skillet, gently heat the tomato sauce over medium-low heat. The starchy pasta water helps emulsify the sauce and allows it to cling to the pasta perfectly.',
            'Combine drained pasta with sauce, adding reserved pasta water gradually until desired consistency is achieved. Toss gently to coat evenly.'
          ],
          prepTime: '10 minutes',
          cookTime: '15 minutes',
          totalTime: '25 minutes',
          servings: '4 servings',
          difficulty: 'Easy',
          cuisine: 'Italian',
          dietary: ['vegetarian'],
          tips: [
            'Use fresh ingredients',
            'Always salt your pasta water generously - it should taste like seawater',
            'Reserve pasta water before draining - the starch helps create a silky sauce',
            'Toss pasta with sauce in the pan, not on the plate, for better distribution'
          ]
        }
      };

      mockEnv.AI.run.mockResolvedValue(mockAIResponse);

      const result = await elevateRecipe(mockRecipe, mockEnv);

      expect(mockEnv.AI.run).toHaveBeenCalledWith('@cf/meta/llama-4-scout-17b-16e-instruct', {
        messages: [
          {
            role: 'system',
            content: expect.stringContaining('expert culinary teacher')
          },
          {
            role: 'user',
            content: expect.stringContaining('Simple Pasta')
          }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'recipe_generation',
            schema: expect.objectContaining({
              type: 'object',
              properties: expect.objectContaining({
                name: expect.objectContaining({ type: 'string' }),
                ingredients: expect.objectContaining({ type: 'array' }),
                instructions: expect.objectContaining({ type: 'array' })
              })
            })
          }
        },
        max_tokens: 2048,
        temperature: 0.7
      });

      expect(result).toEqual({
        ...mockAIResponse.response,
        elevatedAt: expect.any(String),
        originalRecipe: mockRecipe,
        elevationMethod: 'llama-ai-culinary-expert'
      });
    });

    it('should handle nested recipe structure in AI response', async () => {
      const mockAIResponse = {
        response: {
          recipe: {
            name: 'Nested Recipe',
            description: 'A nested recipe response',
            ingredients: ['ingredient 1'],
            instructions: ['instruction 1'],
            prepTime: '10 minutes',
            cookTime: '15 minutes',
            totalTime: '25 minutes',
            servings: '4 servings',
            difficulty: 'Easy'
          }
        }
      };

      mockEnv.AI.run.mockResolvedValue(mockAIResponse);

      const result = await elevateRecipe(mockRecipe, mockEnv);

      expect(result.name).toBe('Nested Recipe');
      expect(result.elevatedAt).toBeDefined();
      expect(result.originalRecipe).toBe(mockRecipe);
    });

    it('should throw error when AI returns invalid response', async () => {
      mockEnv.AI.run.mockResolvedValue({ response: null });

      await expect(elevateRecipe(mockRecipe, mockEnv)).rejects.toThrow(
        'Invalid response from LLaMA model for recipe elevation'
      );
    });

    it('should throw error when AI call fails', async () => {
      const error = new Error('AI service unavailable');
      mockEnv.AI.run.mockRejectedValue(error);

      await expect(elevateRecipe(mockRecipe, mockEnv)).rejects.toThrow(
        'AI service unavailable'
      );
    });

    it('should handle missing required fields with fallbacks', async () => {
      const mockAIResponse = {
        response: {
          // Missing name, servings, cuisine, dietary
          description: 'A recipe without some fields',
          ingredients: ['ingredient 1'],
          instructions: ['instruction 1'],
          prepTime: '10 minutes',
          cookTime: '15 minutes',
          totalTime: '25 minutes',
          difficulty: 'Easy'
        }
      };

      mockEnv.AI.run.mockResolvedValue(mockAIResponse);

      const result = await elevateRecipe(mockRecipe, mockEnv);

      expect(result.name).toBe('Elevated Simple Pasta');
      expect(result.servings).toBe('4 servings');
      expect(result.cuisine).toBe('Italian');
      expect(result.dietary).toEqual(['vegetarian']);
    });

    it('should convert numeric servings to string', async () => {
      const mockAIResponse = {
        response: {
          name: 'Test Recipe',
          description: 'A test recipe',
          ingredients: ['ingredient 1'],
          instructions: ['instruction 1'],
          prepTime: '10 minutes',
          cookTime: '15 minutes',
          totalTime: '25 minutes',
          servings: 6, // Numeric servings
          difficulty: 'Easy'
        }
      };

      mockEnv.AI.run.mockResolvedValue(mockAIResponse);

      const result = await elevateRecipe(mockRecipe, mockEnv);

      expect(result.servings).toBe('6 servings');
    });

    it('should handle dietaryConsiderations field name variation', async () => {
      const mockAIResponse = {
        response: {
          name: 'Test Recipe',
          description: 'A test recipe',
          ingredients: ['ingredient 1'],
          instructions: ['instruction 1'],
          prepTime: '10 minutes',
          cookTime: '15 minutes',
          totalTime: '25 minutes',
          servings: '4 servings',
          difficulty: 'Easy',
          dietaryConsiderations: ['vegan', 'gluten-free']
        }
      };

      mockEnv.AI.run.mockResolvedValue(mockAIResponse);

      const result = await elevateRecipe(mockRecipe, mockEnv);

      expect(result.dietary).toEqual(['vegan', 'gluten-free']);
      expect(result.dietaryConsiderations).toBeUndefined();
    });

    it('should handle single dietaryConsiderations value', async () => {
      const mockAIResponse = {
        response: {
          name: 'Test Recipe',
          description: 'A test recipe',
          ingredients: ['ingredient 1'],
          instructions: ['instruction 1'],
          prepTime: '10 minutes',
          cookTime: '15 minutes',
          totalTime: '25 minutes',
          servings: '4 servings',
          difficulty: 'Easy',
          dietaryConsiderations: 'vegan'
        }
      };

      mockEnv.AI.run.mockResolvedValue(mockAIResponse);

      const result = await elevateRecipe(mockRecipe, mockEnv);

      expect(result.dietary).toEqual(['vegan']);
      expect(result.dietaryConsiderations).toBeUndefined();
    });
  });

  describe('System Prompt Validation', () => {
    it('should include culinary expert guidance in system prompt', async () => {
      mockEnv.AI.run.mockResolvedValue({
        response: { ...mockRecipe }
      });

      await elevateRecipe(mockRecipe, mockEnv);

      const systemPrompt = mockEnv.AI.run.mock.calls[0][1].messages[0].content;

      expect(systemPrompt).toContain('expert culinary teacher');
      expect(systemPrompt).toContain('professional chef');
      expect(systemPrompt).toContain('ingredient specificity');
      expect(systemPrompt).toContain('Technique Enhancement');
      expect(systemPrompt).toContain('Pinot Grigio or Sauvignon Blanc');
      expect(systemPrompt).toContain('Maillard reaction');
    });

    it('should include recipe details in user prompt', async () => {
      mockEnv.AI.run.mockResolvedValue({
        response: { ...mockRecipe }
      });

      await elevateRecipe(mockRecipe, mockEnv);

      const userPrompt = mockEnv.AI.run.mock.calls[0][1].messages[1].content;

      expect(userPrompt).toContain('Simple Pasta');
      expect(userPrompt).toContain('A basic pasta dish');
      expect(userPrompt).toContain('2 cups pasta');
      expect(userPrompt).toContain('Boil water and cook pasta');
      expect(userPrompt).toContain('Italian');
      expect(userPrompt).toContain('vegetarian');
    });
  });

  describe('Schema Validation', () => {
    it('should use the same schema as original recipe generation', async () => {
      mockEnv.AI.run.mockResolvedValue({
        response: { ...mockRecipe }
      });

      await elevateRecipe(mockRecipe, mockEnv);

      const schema = mockEnv.AI.run.mock.calls[0][1].response_format.json_schema.schema;

      expect(schema.type).toBe('object');
      expect(schema.properties).toHaveProperty('name');
      expect(schema.properties).toHaveProperty('description');
      expect(schema.properties).toHaveProperty('ingredients');
      expect(schema.properties).toHaveProperty('instructions');
      expect(schema.properties).toHaveProperty('prepTime');
      expect(schema.properties).toHaveProperty('cookTime');
      expect(schema.properties).toHaveProperty('totalTime');
      expect(schema.properties).toHaveProperty('servings');
      expect(schema.properties).toHaveProperty('difficulty');
      expect(schema.properties).toHaveProperty('cuisine');
      expect(schema.properties).toHaveProperty('dietary');
      expect(schema.properties).toHaveProperty('tips');
      expect(schema.required).toEqual(['name', 'description', 'ingredients', 'instructions', 'prepTime', 'cookTime', 'totalTime', 'servings', 'difficulty']);
    });
  });
});
