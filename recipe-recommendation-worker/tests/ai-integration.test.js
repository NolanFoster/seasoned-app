/**
 * AI Integration Tests for Recipe Recommendation Worker
 * Tests the integration with Cloudflare AI and response handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getRecipeRecommendations } from '../src/index.js';

// Mock environment with AI binding
const mockEnvWithAI = {
  AI: {
    run: vi.fn()
  },
  SEARCH_DB_URL: 'https://test-search-db.workers.dev',
  RECIPE_SAVE_WORKER_URL: 'https://test-save-worker.workers.dev'
};

// Mock environment without AI binding
const mockEnvWithoutAI = {
  AI: null,
  SEARCH_DB_URL: 'https://test-search-db.workers.dev',
  RECIPE_SAVE_WORKER_URL: 'https://test-save-worker.workers.dev'
};

// Mock fetch for testing
global.fetch = vi.fn();

describe('AI Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Successful AI responses', () => {
    it('should handle valid AI response with response field', async () => {
      const mockAIResponse = {
        response: JSON.stringify({
          recommendations: {
            'Summer Favorites': ['grilled salmon', 'fresh salad', 'fruit smoothie'],
            'Quick Meals': ['pasta primavera', 'stir-fry', 'sheet pan chicken'],
            'Refreshing Drinks': ['lemonade', 'iced tea', 'watermelon juice']
          }
        })
      };

      mockEnvWithAI.AI.run.mockResolvedValue(mockAIResponse);
      
      // Mock fetch for recipe search to fail (fallback to enhanced dish names)
      global.fetch.mockResolvedValue({
        ok: false
      });

      const result = await getRecipeRecommendations('San Francisco', '2024-07-15', 3, mockEnvWithAI, 'test-req-123');

      expect(result).toBeDefined();
      expect(result.recommendations).toBeDefined();
      expect(result.location).toBe('San Francisco');
      expect(result.date).toBe('2024-07-15');
      expect(result.season).toBe('Summer');
      expect(result.aiModel).toBe('@cf/meta/llama-3.1-8b-instruct');
      expect(result.processingMetrics).toBeDefined();
      expect(mockEnvWithAI.AI.run).toHaveBeenCalledWith(
        '@cf/meta/llama-3.1-8b-instruct',
        expect.objectContaining({
          prompt: expect.stringContaining('Summer'),
          max_tokens: 512
        })
      );
    });

    it('should handle valid AI response with result field', async () => {
      const mockAIResponse = {
        result: JSON.stringify({
          recommendations: {
            'Winter Comfort': ['beef stew', 'hot chocolate', 'roasted vegetables'],
            'Cozy Baking': ['bread', 'cookies', 'pie'],
            'Warming Soups': ['chicken soup', 'lentil soup', 'minestrone']
          }
        })
      };

      mockEnvWithAI.AI.run.mockResolvedValue(mockAIResponse);
      
      // Mock fetch for recipe search to fail (fallback to enhanced dish names)
      global.fetch.mockResolvedValue({
        ok: false
      });

      const result = await getRecipeRecommendations('New York', '2024-01-15', 3, mockEnvWithAI, 'test-req-456');

      expect(result).toBeDefined();
      expect(result.recommendations).toBeDefined();
      expect(result.season).toBe('Winter');
      expect(result.aiModel).toBe('@cf/meta/llama-3.1-8b-instruct');
    });

    it('should handle valid AI response with text field', async () => {
      const mockAIResponse = {
        text: JSON.stringify({
          recommendations: {
            'Spring Delights': ['asparagus risotto', 'strawberry salad', 'pea soup']
          }
        })
      };

      mockEnvWithAI.AI.run.mockResolvedValue(mockAIResponse);
      
      // Mock fetch for recipe search to fail (fallback to enhanced dish names)
      global.fetch.mockResolvedValue({
        ok: false
      });

      const result = await getRecipeRecommendations('Portland', '2024-04-15', 3, mockEnvWithAI, 'test-req-789');

      expect(result).toBeDefined();
      expect(result.recommendations).toBeDefined();
      expect(result.season).toBe('Spring');
    });

    it('should handle AI response as direct string', async () => {
      const mockAIResponse = JSON.stringify({
        recommendations: {
          'Summer BBQ': ['grilled chicken', 'corn on the cob', 'watermelon']
        }
      });

      mockEnvWithAI.AI.run.mockResolvedValue(mockAIResponse);
      
      // Mock fetch for recipe search to fail (fallback to enhanced dish names)
      global.fetch.mockResolvedValue({
        ok: false
      });

      const result = await getRecipeRecommendations('Miami', '2024-07-15', 3, mockEnvWithAI, 'test-req-string');

      expect(result).toBeDefined();
      expect(result.recommendations).toBeDefined();
      expect(result.season).toBe('Summer');
    });

    it('should extract JSON from response with extra text', async () => {
      const mockAIResponse = {
        response: `Here are some summer recipe recommendations:
        {
          "recommendations": {
            "Summer Favorites": ["grilled tomatoes", "fresh corn", "berry salad"]
          }
        }
        Enjoy these seasonal dishes!`
      };

      mockEnvWithAI.AI.run.mockResolvedValue(mockAIResponse);
      
      // Mock fetch for recipe search to fail (fallback to enhanced dish names)
      global.fetch.mockResolvedValue({
        ok: false
      });

      const result = await getRecipeRecommendations('Los Angeles', '2024-07-15', 3, mockEnvWithAI, 'test-req-extra-text');

      expect(result).toBeDefined();
      expect(result.recommendations).toBeDefined();
      expect(result.recommendations['Summer Favorites']).toBeDefined();
      
      // Check that we have recipe objects with names
      const summerRecipes = result.recommendations['Summer Favorites'];
      expect(summerRecipes.length).toBeGreaterThan(0);
      const hasTomatoes = summerRecipes.some(recipe => 
        recipe.name.toLowerCase().includes('tomatoes')
      );
      expect(hasTomatoes).toBe(true);
    });

    it('should handle location-based prompts correctly', async () => {
      const mockAIResponse = {
        response: JSON.stringify({
          recommendations: {
            'PNW Coastal': ['salmon', 'crab', 'oysters'],
            'Local Specialties': ['berries', 'mushrooms', 'apples'],
            'Seasonal Favorites': ['asparagus', 'peas', 'rhubarb']
          }
        })
      };

      mockEnvWithAI.AI.run.mockResolvedValue(mockAIResponse);
      
      // Mock fetch for recipe search to fail (fallback to enhanced dish names)
      global.fetch.mockResolvedValue({
        ok: false
      });

      const result = await getRecipeRecommendations('Seattle, WA', '2024-07-15', 3, mockEnvWithAI, 'test-req-location');

      expect(result).toBeDefined();
      expect(result.recommendations).toBeDefined();
      expect(result.location).toBe('Seattle, WA');

      expect(mockEnvWithAI.AI.run).toHaveBeenCalledWith(
        '@cf/meta/llama-3.1-8b-instruct',
        expect.objectContaining({
          prompt: expect.stringContaining('Seattle, WA'),
          max_tokens: 512
        })
      );
    });

    it('should handle no location prompts correctly', async () => {
      const mockAIResponse = {
        response: JSON.stringify({
          recommendations: {
            'Quick Meals': ['pasta', 'stir-fry', 'sandwiches'],
            'Budget Friendly': ['rice bowls', 'bean soup', 'eggs'],
            'Easy Prep': ['overnight oats', 'salad jars', 'smoothies']
          }
        })
      };

      mockEnvWithAI.AI.run.mockResolvedValue(mockAIResponse);
      
      // Mock fetch for recipe search to fail (fallback to enhanced dish names)
      global.fetch.mockResolvedValue({
        ok: false
      });

      const result = await getRecipeRecommendations('', '2024-07-15', 3, mockEnvWithAI, 'test-req-no-location');

      expect(result).toBeDefined();
      expect(result.recommendations).toBeDefined();
      expect(result.location).toBe('');

      expect(mockEnvWithAI.AI.run).toHaveBeenCalledWith(
        '@cf/meta/llama-3.1-8b-instruct',
        expect.objectContaining({
          prompt: expect.stringContaining('Location: Not specified'),
          max_tokens: 512
        })
      );
    });
  });

  describe('AI error handling', () => {
    it('should fallback to mock data when AI service fails', async () => {
      mockEnvWithAI.AI.run.mockRejectedValue(new Error('AI service unavailable'));

      const result = await getRecipeRecommendations('Test City', '2024-06-15', 3, mockEnvWithAI, 'test-req-ai-fail');

      expect(result).toBeDefined();
      expect(result.isMockData).toBe(true);
      expect(result.recommendations).toBeDefined();
      expect(Object.keys(result.recommendations)).toHaveLength(3);
    });

    it('should handle invalid AI response structure', async () => {
      const invalidResponse = { unexpected: 'structure' };
      mockEnvWithAI.AI.run.mockResolvedValue(invalidResponse);

      const result = await getRecipeRecommendations('Test City', '2024-06-15', 3, mockEnvWithAI, 'test-req-invalid-structure');

      expect(result).toBeDefined();
      expect(result.isMockData).toBe(true);
    });

    it('should handle AI response without expected fields', async () => {
      const emptyResponse = {};
      mockEnvWithAI.AI.run.mockResolvedValue(emptyResponse);

      const result = await getRecipeRecommendations('Test City', '2024-06-15', 3, mockEnvWithAI, 'test-req-empty-response');

      expect(result).toBeDefined();
      expect(result.isMockData).toBe(true);
    });

    it('should handle AI response with invalid JSON', async () => {
      const invalidJSONResponse = {
        response: 'This is not valid JSON {'
      };
      mockEnvWithAI.AI.run.mockResolvedValue(invalidJSONResponse);

      const result = await getRecipeRecommendations('Test City', '2024-06-15', 3, mockEnvWithAI, 'test-req-invalid-json');

      expect(result).toBeDefined();
      expect(result.isMockData).toBe(true);
    });

    it('should handle AI timeout errors', async () => {
      mockEnvWithAI.AI.run.mockRejectedValue(new Error('Request timeout'));

      const result = await getRecipeRecommendations('Test City', '2024-06-15', 3, mockEnvWithAI, 'test-req-timeout');

      expect(result).toBeDefined();
      expect(result.isMockData).toBe(true);
    });

    it('should handle AI model errors', async () => {
      mockEnvWithAI.AI.run.mockRejectedValue(new Error('Model not available'));

      const result = await getRecipeRecommendations('Test City', '2024-06-15', 3, mockEnvWithAI, 'test-req-model-error');

      expect(result).toBeDefined();
      expect(result.isMockData).toBe(true);
    });
  });

  describe('AI prompt generation', () => {
    it('should generate appropriate prompts for different seasons', async () => {
      const mockAIResponse = {
        response: JSON.stringify({
          recommendations: {
            'Test Category': ['test dish 1', 'test dish 2', 'test dish 3']
          }
        })
      };

      mockEnvWithAI.AI.run.mockResolvedValue(mockAIResponse);
      
      // Mock fetch for recipe search to fail (fallback to enhanced dish names)
      global.fetch.mockResolvedValue({
        ok: false
      });

      // Test different seasons
      await getRecipeRecommendations('Test', '2024-01-15', 3, mockEnvWithAI, 'winter-test');
      expect(mockEnvWithAI.AI.run).toHaveBeenLastCalledWith(
        '@cf/meta/llama-3.1-8b-instruct',
        expect.objectContaining({
          prompt: expect.stringContaining('Winter'),
          max_tokens: 512
        })
      );

      await getRecipeRecommendations('Test', '2024-04-15', 3, mockEnvWithAI, 'spring-test');
      expect(mockEnvWithAI.AI.run).toHaveBeenLastCalledWith(
        '@cf/meta/llama-3.1-8b-instruct',
        expect.objectContaining({
          prompt: expect.stringContaining('Spring'),
          max_tokens: 512
        })
      );

      await getRecipeRecommendations('Test', '2024-07-15', 3, mockEnvWithAI, 'summer-test');
      expect(mockEnvWithAI.AI.run).toHaveBeenLastCalledWith(
        '@cf/meta/llama-3.1-8b-instruct',
        expect.objectContaining({
          prompt: expect.stringContaining('Summer'),
          max_tokens: 512
        })
      );

      await getRecipeRecommendations('Test', '2024-10-15', 3, mockEnvWithAI, 'fall-test');
      expect(mockEnvWithAI.AI.run).toHaveBeenLastCalledWith(
        '@cf/meta/llama-3.1-8b-instruct',
        expect.objectContaining({
          prompt: expect.stringContaining('Fall'),
          max_tokens: 512
        })
      );
    });

    it('should include holiday context in prompts', async () => {
      const mockAIResponse = {
        response: JSON.stringify({
          recommendations: {
            'Test Category': ['test dish 1', 'test dish 2', 'test dish 3']
          }
        })
      };

      mockEnvWithAI.AI.run.mockResolvedValue(mockAIResponse);
      
      // Mock fetch for recipe search to fail (fallback to enhanced dish names)
      global.fetch.mockResolvedValue({
        ok: false
      });

      // Test Christmas date
      await getRecipeRecommendations('Test', '2024-12-25', 3, mockEnvWithAI, 'christmas-test');
      expect(mockEnvWithAI.AI.run).toHaveBeenLastCalledWith(
        '@cf/meta/llama-3.1-8b-instruct',
        expect.objectContaining({
          prompt: expect.stringContaining('Christmas'),
          max_tokens: 512
        })
      );

      // Test Thanksgiving date
      await getRecipeRecommendations('Test', '2024-11-28', 3, mockEnvWithAI, 'thanksgiving-test');
      expect(mockEnvWithAI.AI.run).toHaveBeenLastCalledWith(
        '@cf/meta/llama-3.1-8b-instruct',
        expect.objectContaining({
          prompt: expect.stringContaining('Thanksgiving'),
          max_tokens: 512
        })
      );
    });

    it('should include location context in prompts', async () => {
      const mockAIResponse = {
        response: JSON.stringify({
          recommendations: {
            'Test Category': ['test dish 1', 'test dish 2', 'test dish 3']
          }
        })
      };

      mockEnvWithAI.AI.run.mockResolvedValue(mockAIResponse);
      
      // Mock fetch for recipe search to fail (fallback to enhanced dish names)
      global.fetch.mockResolvedValue({
        ok: false
      });

      await getRecipeRecommendations('Seattle, WA', '2024-06-15', 3, mockEnvWithAI, 'location-test');
      expect(mockEnvWithAI.AI.run).toHaveBeenLastCalledWith(
        '@cf/meta/llama-3.1-8b-instruct',
        expect.objectContaining({
          prompt: expect.stringContaining('Seattle, WA'),
          max_tokens: 512
        })
      );
    });
  });

  describe('AI response edge cases for coverage', () => {
    it('should handle AI response when response is a plain string', async () => {
      const mockAIResponse = 'This is a plain string response';
      mockEnvWithAI.AI.run.mockResolvedValue(mockAIResponse);

      const result = await getRecipeRecommendations('Test City', '2024-06-15', 3, mockEnvWithAI, 'test-req-plain-string');

      expect(result).toBeDefined();
      expect(result.isMockData).toBe(true);
    });

    it('should handle AI response with clean JSON (no extraction needed)', async () => {
      const mockAIResponse = {
        response: '{"recommendations": {"Test": ["dish1", "dish2"]}}'
      };
      mockEnvWithAI.AI.run.mockResolvedValue(mockAIResponse);
      
      // Mock fetch for recipe search to fail (fallback to enhanced dish names)
      global.fetch.mockResolvedValue({
        ok: false
      });

      const result = await getRecipeRecommendations('Test City', '2024-06-15', 3, mockEnvWithAI, 'test-req-clean-json');

      expect(result).toBeDefined();
      expect(result.recommendations).toBeDefined();
    });

    it('should handle unexpected AI response structure with no recognizable fields', async () => {
      const mockAIResponse = {
        unknownField: 'some value',
        anotherField: 123
      };
      mockEnvWithAI.AI.run.mockResolvedValue(mockAIResponse);

      const result = await getRecipeRecommendations('Test City', '2024-06-15', 3, mockEnvWithAI, 'test-req-unknown-structure');

      expect(result).toBeDefined();
      expect(result.isMockData).toBe(true);
    });
  });

  describe('Fallback behavior', () => {
    it('should use mock data when AI is not available', async () => {
      const result = await getRecipeRecommendations('Test City', '2024-06-15', 3, mockEnvWithoutAI, 'test-req-no-ai');

      expect(result).toBeDefined();
      expect(result.isMockData).toBe(true);
      expect(result.recommendations).toBeDefined();
      expect(Object.keys(result.recommendations)).toHaveLength(3);
    });

    it('should respect the limit parameter in mock fallback', async () => {
      const result = await getRecipeRecommendations('Test City', '2024-06-15', 2, mockEnvWithoutAI, 'test-req-limit-test');

      expect(result).toBeDefined();
      expect(result.isMockData).toBe(true);
      
      // Check that each category respects the limit
      Object.values(result.recommendations).forEach(recipes => {
        expect(recipes.length).toBeLessThanOrEqual(2);
      });
    });
  });
});
