/**
 * Tests for AI integration and response handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getRecipeRecommendations } from '../src/index.js';

describe('AI Integration', () => {
  let mockEnvWithAI;
  let mockEnvWithFailingAI;

  beforeEach(() => {
    mockEnvWithAI = {
      AI: {
        run: vi.fn()
      },
      ANALYTICS: {
        writeDataPoint: vi.fn().mockResolvedValue(undefined)
      }
    };

    mockEnvWithFailingAI = {
      AI: {
        run: vi.fn().mockRejectedValue(new Error('AI service unavailable'))
      },
      ANALYTICS: {
        writeDataPoint: vi.fn().mockResolvedValue(undefined)
      }
    };
  });

  describe('Successful AI responses', () => {
    it('should handle valid AI response with response field', async () => {
      const mockAIResponse = {
        response: JSON.stringify({
          recommendations: {
            "Summer Favorites": ["tomatoes", "corn", "berries", "peaches"],
            "BBQ Specialties": ["burgers", "hot dogs", "grilled chicken", "corn on cob"],
            "Refreshing Treats": ["ice cream", "lemonade", "fruit salad", "smoothies"]
          }
        })
      };

      mockEnvWithAI.AI.run.mockResolvedValue(mockAIResponse);

      const result = await getRecipeRecommendations('California', '2024-07-15', mockEnvWithAI, 'test-req-123');

      expect(result).toBeDefined();
      expect(result.recommendations).toBeDefined();
      expect(result.location).toBe('California');
      expect(result.date).toBe('2024-07-15');
      expect(result.season).toBe('Summer');
      expect(result.aiModel).toBe('@cf/meta/llama-3.1-8b-instruct');
      expect(result.processingMetrics).toBeDefined();
      expect(mockEnvWithAI.AI.run).toHaveBeenCalledWith(
        '@cf/meta/llama-3.1-8b-instruct',
        expect.objectContaining({
          prompt: expect.stringContaining('Location: California'),
          max_tokens: 512
        })
      );
    });

    it('should handle valid AI response with result field', async () => {
      const mockAIResponse = {
        result: JSON.stringify({
          recommendations: {
            "Winter Favorites": ["citrus", "kale", "brussels sprouts", "pomegranate"],
            "Warming Dishes": ["soup", "stew", "chili", "hot chocolate"],
            "Holiday Treats": ["cookies", "gingerbread", "eggnog", "turkey"]
          }
        })
      };

      mockEnvWithAI.AI.run.mockResolvedValue(mockAIResponse);

      const result = await getRecipeRecommendations('New York', '2024-01-15', mockEnvWithAI, 'test-req-456');

      expect(result).toBeDefined();
      expect(result.recommendations).toBeDefined();
      expect(result.season).toBe('Winter');
      expect(result.aiModel).toBe('@cf/meta/llama-3.1-8b-instruct');
    });

    it('should handle valid AI response with text field', async () => {
      const mockAIResponse = {
        text: JSON.stringify({
          recommendations: {
            "Spring Favorites": ["asparagus", "peas", "strawberries", "herbs"],
            "Light Dishes": ["salads", "grilled fish", "vegetables", "citrus"],
            "Fresh & Seasonal": ["spring onions", "mint", "basil", "artichokes"]
          }
        })
      };

      mockEnvWithAI.AI.run.mockResolvedValue(mockAIResponse);

      const result = await getRecipeRecommendations('Seattle', '2024-04-15', mockEnvWithAI, 'test-req-789');

      expect(result).toBeDefined();
      expect(result.recommendations).toBeDefined();
      expect(result.season).toBe('Spring');
    });

    it('should handle AI response as direct string', async () => {
      const mockAIResponse = JSON.stringify({
        recommendations: {
          "Fall Favorites": ["pumpkin", "apples", "squash", "mushrooms"],
          "Comfort Foods": ["soup", "stew", "casserole", "roast"],
          "Harvest Specials": ["apple pie", "pumpkin bread", "cider", "nuts"]
        }
      });

      mockEnvWithAI.AI.run.mockResolvedValue(mockAIResponse);

      const result = await getRecipeRecommendations('Portland', '2024-10-15', mockEnvWithAI, 'test-req-101');

      expect(result).toBeDefined();
      expect(result.recommendations).toBeDefined();
      expect(result.season).toBe('Fall');
    });

    it('should extract JSON from response with extra text', async () => {
      const mockAIResponse = {
        response: 'Here are your recommendations: {"recommendations": {"Summer Favorites": ["tomatoes", "corn", "berries", "peaches"]}} Hope this helps!'
      };

      mockEnvWithAI.AI.run.mockResolvedValue(mockAIResponse);

      const result = await getRecipeRecommendations('Miami', '2024-08-15', mockEnvWithAI, 'test-req-202');

      expect(result).toBeDefined();
      expect(result.recommendations).toBeDefined();
      expect(result.recommendations['Summer Favorites']).toContain('tomatoes');
    });

    it('should handle location-based prompts correctly', async () => {
      const mockAIResponse = {
        response: JSON.stringify({
          recommendations: {
            "Summer Favorites": ["local produce", "fresh seafood", "seasonal fruits", "herbs"],
            "PNW Specialties": ["salmon", "dungeness crab", "blackberries", "chanterelles"],
            "Regional Dishes": ["cedar plank salmon", "marionberry pie", "craft beer", "coffee"]
          }
        })
      };

      mockEnvWithAI.AI.run.mockResolvedValue(mockAIResponse);

      const result = await getRecipeRecommendations('Seattle, WA', '2024-07-15', mockEnvWithAI, 'test-req-303');

      expect(mockEnvWithAI.AI.run).toHaveBeenCalledWith(
        '@cf/meta/llama-3.1-8b-instruct',
        expect.objectContaining({
          prompt: expect.stringContaining('Location: Seattle, WA'),
          max_tokens: 512
        })
      );
    });

    it('should handle no location prompts correctly', async () => {
      const mockAIResponse = {
        response: JSON.stringify({
          recommendations: {
            "Summer Favorites": ["seasonal produce", "light meals", "fresh ingredients", "cooling foods"],
            "Easy Weeknight Dinners": ["pasta", "stir-fry", "grilled chicken", "salads"],
            "Practical Recipes": ["one-pot meals", "quick prep", "simple ingredients", "budget-friendly"]
          }
        })
      };

      mockEnvWithAI.AI.run.mockResolvedValue(mockAIResponse);

      const result = await getRecipeRecommendations('', '2024-07-15', mockEnvWithAI, 'test-req-404');

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
      const result = await getRecipeRecommendations('Denver', '2024-06-15', mockEnvWithFailingAI, 'test-req-500');

      expect(result).toBeDefined();
      expect(result.recommendations).toBeDefined();
      expect(result.isMockData).toBe(true);
      expect(result.location).toBe('Denver');
      expect(result.date).toBe('2024-06-15');
      expect(result.note).toContain('mock recommendations');
    });

    it('should handle invalid AI response structure', async () => {
      mockEnvWithAI.AI.run.mockResolvedValue(null);

      const result = await getRecipeRecommendations('Boston', '2024-09-15', mockEnvWithAI, 'test-req-501');

      expect(result).toBeDefined();
      expect(result.isMockData).toBe(true);
    });

    it('should handle AI response without expected fields', async () => {
      mockEnvWithAI.AI.run.mockResolvedValue({ unexpected: 'field' });

      const result = await getRecipeRecommendations('Chicago', '2024-11-15', mockEnvWithAI, 'test-req-502');

      expect(result).toBeDefined();
      expect(result.isMockData).toBe(true);
    });

    it('should handle AI response with invalid JSON', async () => {
      const mockAIResponse = {
        response: 'invalid json { not valid }'
      };

      mockEnvWithAI.AI.run.mockResolvedValue(mockAIResponse);

      const result = await getRecipeRecommendations('Phoenix', '2024-05-15', mockEnvWithAI, 'test-req-503');

      expect(result).toBeDefined();
      expect(result.isMockData).toBe(true);
    });

    it('should handle AI timeout errors', async () => {
      mockEnvWithFailingAI.AI.run.mockRejectedValue(new Error('Request timeout exceeded'));

      const result = await getRecipeRecommendations('Austin', '2024-03-15', mockEnvWithFailingAI, 'test-req-504');

      expect(result).toBeDefined();
      expect(result.isMockData).toBe(true);
    });

    it('should handle AI model errors', async () => {
      mockEnvWithFailingAI.AI.run.mockRejectedValue(new Error('AI model is currently unavailable'));

      const result = await getRecipeRecommendations('Nashville', '2024-12-15', mockEnvWithFailingAI, 'test-req-505');

      expect(result).toBeDefined();
      expect(result.isMockData).toBe(true);
    });
  });

  describe('AI prompt generation', () => {
    it('should generate appropriate prompts for different seasons', async () => {
      const mockAIResponse = {
        response: JSON.stringify({ recommendations: {} })
      };
      mockEnvWithAI.AI.run.mockResolvedValue(mockAIResponse);

      // Test different seasons
      await getRecipeRecommendations('Test', '2024-01-15', mockEnvWithAI, 'winter-test');
      expect(mockEnvWithAI.AI.run).toHaveBeenLastCalledWith(
        '@cf/meta/llama-3.1-8b-instruct',
        expect.objectContaining({
          prompt: expect.stringContaining('Winter')
        })
      );

      await getRecipeRecommendations('Test', '2024-04-15', mockEnvWithAI, 'spring-test');
      expect(mockEnvWithAI.AI.run).toHaveBeenLastCalledWith(
        '@cf/meta/llama-3.1-8b-instruct',
        expect.objectContaining({
          prompt: expect.stringContaining('Spring')
        })
      );

      await getRecipeRecommendations('Test', '2024-07-15', mockEnvWithAI, 'summer-test');
      expect(mockEnvWithAI.AI.run).toHaveBeenLastCalledWith(
        '@cf/meta/llama-3.1-8b-instruct',
        expect.objectContaining({
          prompt: expect.stringContaining('Summer')
        })
      );

      await getRecipeRecommendations('Test', '2024-10-15', mockEnvWithAI, 'fall-test');
      expect(mockEnvWithAI.AI.run).toHaveBeenLastCalledWith(
        '@cf/meta/llama-3.1-8b-instruct',
        expect.objectContaining({
          prompt: expect.stringContaining('Fall')
        })
      );
    });

    it('should include holiday context in prompts', async () => {
      const mockAIResponse = {
        response: JSON.stringify({ recommendations: {} })
      };
      mockEnvWithAI.AI.run.mockResolvedValue(mockAIResponse);

      // Test Christmas date
      await getRecipeRecommendations('Test', '2024-12-25', mockEnvWithAI, 'christmas-test');
      expect(mockEnvWithAI.AI.run).toHaveBeenLastCalledWith(
        '@cf/meta/llama-3.1-8b-instruct',
        expect.objectContaining({
          prompt: expect.stringContaining('Christmas')
        })
      );
    });
  });
});
