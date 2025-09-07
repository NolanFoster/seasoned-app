/**
 * Tests for AI-generated recipes functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  generateAIOnlyRecipes,
  generateAIOnlyRecipesPerCategory,
  getRecipeRecommendations
} from '../src/recommendation-service.js';

// Mock the shared KV storage library
vi.mock('../../shared/kv-storage.js', () => ({
  getRecipeFromKV: vi.fn()
}));

describe('AI-Generated Recipes Functions', () => {
  let mockEnv;
  let mockAI;
  const requestId = 'test-request-123';

  beforeEach(() => {
    mockAI = {
      run: vi.fn()
    };
    
    mockEnv = {
      AI: mockAI,
      RECIPE_STORAGE: {
        get: vi.fn()
      }
    };
  });

  describe('generateAIOnlyRecipes', () => {
    it('should generate AI-only recipes successfully', async () => {
      const mockAIResponse = {
        response: '["Grilled Salmon with Lemon Herb Butter", "Mediterranean Quinoa Bowl", "Chocolate Avocado Mousse"]'
      };

      mockAI.run.mockResolvedValue(mockAIResponse);

      const result = await generateAIOnlyRecipes('San Francisco', '2024-07-15', 3, mockEnv, requestId);

      expect(mockAI.run).toHaveBeenCalledWith(
        '@cf/meta/llama-3.1-8b-instruct',
        expect.objectContaining({
          prompt: expect.stringContaining('Generate 3 creative and unique recipe recommendations'),
          max_tokens: 1000
        })
      );

      expect(result).toHaveLength(3);
      expect(result[0]).toMatchObject({
        name: 'Grilled Salmon with Lemon Herb Butter',
        type: 'ai_generated_recipe',
        source: 'ai_only_generation',
        aiGenerated: true,
        season: 'Summer',
        month: 'July',
        location: 'San Francisco'
      });
    });

    it('should handle AI response with different structure', async () => {
      const mockAIResponse = {
        content: '["Spicy Thai Basil Chicken", "Creamy Mushroom Risotto"]'
      };

      mockAI.run.mockResolvedValue(mockAIResponse);

      const result = await generateAIOnlyRecipes(null, '2024-01-15', 2, mockEnv, requestId);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        name: 'Spicy Thai Basil Chicken',
        type: 'ai_generated_recipe',
        source: 'ai_only_generation',
        aiGenerated: true,
        season: 'Winter',
        month: 'January',
        location: null
      });
    });

    it('should handle AI response as direct string', async () => {
      const mockAIResponse = '["Honey Glazed Carrots", "Garlic Butter Shrimp"]';

      mockAI.run.mockResolvedValue(mockAIResponse);

      const result = await generateAIOnlyRecipes('Seattle', '2024-06-15', 2, mockEnv, requestId);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        name: 'Honey Glazed Carrots',
        type: 'ai_generated_recipe',
        source: 'ai_only_generation',
        aiGenerated: true,
        season: 'Summer',
        month: 'June',
        location: 'Seattle'
      });
    });

    it('should handle invalid AI response gracefully', async () => {
      const mockAIResponse = {
        response: 'This is not valid JSON'
      };

      mockAI.run.mockResolvedValue(mockAIResponse);

      const result = await generateAIOnlyRecipes('Test City', '2024-06-15', 3, mockEnv, requestId);

      expect(result).toEqual([]);
    });

    it('should handle AI service errors gracefully', async () => {
      mockAI.run.mockRejectedValue(new Error('AI service unavailable'));

      const result = await generateAIOnlyRecipes('Test City', '2024-06-15', 3, mockEnv, requestId);

      expect(result).toEqual([]);
    });

    it('should limit results to requested count', async () => {
      const mockAIResponse = {
        response: '["Recipe 1", "Recipe 2", "Recipe 3", "Recipe 4", "Recipe 5"]'
      };

      mockAI.run.mockResolvedValue(mockAIResponse);

      const result = await generateAIOnlyRecipes('Test City', '2024-06-15', 2, mockEnv, requestId);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Recipe 1');
      expect(result[1].name).toBe('Recipe 2');
    });
  });

  describe('getRecipeRecommendations with aiGenerated parameter', () => {
    it('should include AI-generated recipes when aiGenerated > 0', async () => {
      // Mock the main AI response for categories
      const mockCategoryResponse = {
        response: '{"Summer Salads": ["Caprese Salad", "Greek Salad"], "Grilled Meats": ["BBQ Chicken", "Grilled Steak"], "Refreshing Drinks": ["Lemonade", "Iced Tea"]}'
      };

      // Mock the AI-only response (per-category format)
      const mockAIOnlyResponse = {
        response: '{"Summer Salads": ["Tropical Fruit Smoothie", "Coconut Lime Rice"], "Grilled Meats": ["Tropical Fruit Smoothie", "Coconut Lime Rice"], "Refreshing Drinks": ["Tropical Fruit Smoothie", "Coconut Lime Rice"]}'
      };

      mockAI.run
        .mockResolvedValueOnce(mockCategoryResponse)
        .mockResolvedValueOnce(mockAIOnlyResponse);

      const result = await getRecipeRecommendations('Miami', '2024-07-15', 2, 2, mockEnv, requestId);

      expect(mockAI.run).toHaveBeenCalledTimes(2);
      expect(result).toHaveProperty('recommendations');
      
      // Check that AI-generated recipes are integrated into categories
      const allRecipes = Object.values(result.recommendations).flat();
      const aiGeneratedRecipes = allRecipes.filter(recipe => recipe.source === 'ai_generated');
      expect(aiGeneratedRecipes).toHaveLength(6); // 2 per category × 3 categories
      expect(aiGeneratedRecipes[0]).toMatchObject({
        name: 'Tropical Fruit Smoothie',
        source: 'ai_generated'
      });
    });

    it('should not include AI-generated recipes when aiGenerated = 0', async () => {
      const mockCategoryResponse = {
        response: '{"Winter Soups": ["Chicken Noodle", "Tomato Basil"], "Comfort Foods": ["Mac and Cheese", "Shepherd\'s Pie"], "Hot Drinks": ["Hot Chocolate", "Mulled Wine"]}'
      };

      mockAI.run.mockResolvedValue(mockCategoryResponse);

      const result = await getRecipeRecommendations('Boston', '2024-01-15', 2, 0, mockEnv, requestId);

      expect(mockAI.run).toHaveBeenCalledTimes(1);
      expect(result).toHaveProperty('recommendations');
      
      // Check that no AI-generated recipes are present
      const allRecipes = Object.values(result.recommendations).flat();
      const aiGeneratedRecipes = allRecipes.filter(recipe => recipe.source === 'ai_generated');
      expect(aiGeneratedRecipes).toHaveLength(0);
    });

    it('should handle AI-only generation failure gracefully', async () => {
      const mockCategoryResponse = {
        response: '{"Spring Dishes": ["Asparagus Risotto", "Strawberry Salad"], "Light Meals": ["Quinoa Bowl", "Veggie Wrap"], "Fresh Drinks": ["Green Smoothie", "Herbal Tea"]}'
      };

      mockAI.run
        .mockResolvedValueOnce(mockCategoryResponse)
        .mockRejectedValueOnce(new Error('AI-only generation failed'));

      const result = await getRecipeRecommendations('Portland', '2024-04-15', 2, 3, mockEnv, requestId);

      expect(result).toHaveProperty('recommendations');
      
      // Check that no AI-generated recipes are present when generation fails
      const allRecipes = Object.values(result.recommendations).flat();
      const aiGeneratedRecipes = allRecipes.filter(recipe => recipe.source === 'ai_generated');
      expect(aiGeneratedRecipes).toHaveLength(0);
    });
  });

  describe('Parameter validation', () => {
    it('should handle negative aiGenerated count', async () => {
      const mockCategoryResponse = {
        response: '{"Test Category": ["Test Recipe"]}'
      };

      mockAI.run.mockResolvedValue(mockCategoryResponse);

      const result = await getRecipeRecommendations('Test City', '2024-06-15', 1, -1, mockEnv, requestId);

      // Check that no AI-generated recipes are present
      const allRecipes = Object.values(result.recommendations).flat();
      const aiGeneratedRecipes = allRecipes.filter(recipe => recipe.source === 'ai_generated');
      expect(aiGeneratedRecipes).toHaveLength(0);
    });

    it('should handle large aiGenerated count', async () => {
      const mockCategoryResponse = {
        response: '{"Test Category": ["Test Recipe"]}'
      };

      const mockAIOnlyResponse = {
        response: '{"Test Category": ["Recipe 1", "Recipe 2", "Recipe 3", "Recipe 4", "Recipe 5"]}'
      };

      mockAI.run
        .mockResolvedValueOnce(mockCategoryResponse)
        .mockResolvedValueOnce(mockAIOnlyResponse);

      const result = await getRecipeRecommendations('Test City', '2024-06-15', 1, 15, mockEnv, requestId);

      // Should be limited to 10 (as per validation in handler)
      const allRecipes = Object.values(result.recommendations).flat();
      const aiGeneratedRecipes = allRecipes.filter(recipe => recipe.source === 'ai_generated');
      expect(aiGeneratedRecipes.length).toBeLessThanOrEqual(10);
    });
  });
});
