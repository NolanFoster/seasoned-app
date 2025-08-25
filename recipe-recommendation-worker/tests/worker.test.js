/**
 * Tests for Recipe Recommendation Worker
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  getRecipeRecommendations, 
  getSeason, 
  getMockRecommendations,
  enhanceRecommendationsWithRecipes,
  searchRecipeByCategory
} from '../src/index.js';

// Mock environment
const mockEnv = {
  AI: null,
  SEARCH_DB_URL: 'https://test-search-db.workers.dev',
  RECIPE_SAVE_WORKER_URL: 'https://test-save-worker.workers.dev'
};

// Mock fetch for testing
global.fetch = vi.fn();

describe('Recipe Recommendation Worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getSeason function', () => {
    it('should return correct seasons', () => {
      expect(getSeason(new Date('2024-01-15'))).toBe('Winter');
      expect(getSeason(new Date('2024-04-15'))).toBe('Spring');
      expect(getSeason(new Date('2024-07-15'))).toBe('Summer');
      expect(getSeason(new Date('2024-10-15'))).toBe('Fall');
    });
  });

  describe('getMockRecommendations', () => {
    it('should return seasonal data with limit parameter', () => {
      const winterRecs = getMockRecommendations('New York', '2024-01-15', 2);
      expect(winterRecs.season).toBe('Winter');
      expect(winterRecs.location).toBe('New York');
      expect(winterRecs.date).toBe('2024-01-15');
      
      // Check that each category has the correct number of recipes
      Object.values(winterRecs.recommendations).forEach(recipes => {
        expect(recipes.length).toBeLessThanOrEqual(2);
      });
      
      const summerRecs = getMockRecommendations('Los Angeles', '2024-07-15', 5);
      expect(summerRecs.season).toBe('Summer');
      expect(summerRecs.location).toBe('Los Angeles');
      expect(summerRecs.date).toBe('2024-07-15');
      
      // Check that each category has the correct number of recipes
      Object.values(summerRecs.recommendations).forEach(recipes => {
        expect(recipes.length).toBeLessThanOrEqual(5);
      });
    });

    it('should respect the limit parameter', () => {
      const recs = getMockRecommendations('Test City', '2024-06-15', 1);
      Object.values(recs.recommendations).forEach(recipes => {
        expect(recipes.length).toBeLessThanOrEqual(1);
      });
      
      const recs2 = getMockRecommendations('Test City', '2024-06-15', 10);
      Object.values(recs2.recommendations).forEach(recipes => {
        expect(recipes.length).toBeLessThanOrEqual(10);
      });
    });

    it('should return enhanced recipe objects instead of just dish names', () => {
      const recs = getMockRecommendations('Test City', '2024-06-15', 3);
      
      Object.values(recs.recommendations).forEach(recipes => {
        recipes.forEach(recipe => {
          // Check for JSON-LD Recipe properties
          expect(recipe).toHaveProperty('@context');
          expect(recipe).toHaveProperty('@type');
          expect(recipe).toHaveProperty('@id');
          expect(recipe).toHaveProperty('identifier');
          expect(recipe).toHaveProperty('name');
          expect(recipe).toHaveProperty('description');
          expect(recipe).toHaveProperty('recipeIngredient');
          expect(recipe).toHaveProperty('recipeInstructions');
          expect(recipe).toHaveProperty('source');
          expect(recipe).toHaveProperty('fallback');
          expect(recipe.fallback).toBe(true);
        });
      });
    });

    it('should include specific seasonal tags', () => {
      const winterRecs = getMockRecommendations('Boston', '2024-02-10', 3);
      const allWinterRecipes = Object.values(winterRecs.recommendations).flat();
      expect(allWinterRecipes.some(recipe => 
        recipe.name.toLowerCase().includes('citrus') || 
        recipe.name.toLowerCase().includes('orange')
      )).toBe(true);
      expect(allWinterRecipes.some(recipe => 
        recipe.name.toLowerCase().includes('kale')
      )).toBe(true);
      
      const summerRecs = getMockRecommendations('Miami', '2024-07-20', 3);
      const allSummerRecipes = Object.values(summerRecs.recommendations).flat();
      expect(allSummerRecipes.some(recipe => 
        recipe.name.toLowerCase().includes('tomato')
      )).toBe(true);
      // Check for summer ingredients - since recipesPerCategory is 3, we only get first 3 recipes
      // The first 3 summer recipes are: heirloom tomato salad, grilled corn salad, zucchini fritters
      // So we should have tomato and salad
      expect(allSummerRecipes.some(recipe => 
        recipe.name.toLowerCase().includes('tomato') || 
        recipe.name.toLowerCase().includes('salad') ||
        recipe.name.toLowerCase().includes('corn')
      )).toBe(true);
    });

    it('should have proper structure', () => {
      const recs = getMockRecommendations('Test City', '2024-06-15', 3);
      expect(recs).toBeTypeOf('object');
      expect(recs.recommendations).toBeDefined();
      
      const categories = Object.keys(recs.recommendations);
      expect(categories).toHaveLength(3);
      
      categories.forEach(category => {
        expect(recs.recommendations[category]).toBeInstanceOf(Array);
        expect(recs.recommendations[category].length).toBeGreaterThan(0);
        expect(recs.recommendations[category].length).toBeLessThanOrEqual(3);
      });
    });

    it('should handle various date formats', () => {
      const dates = [
        '2024-12-25',  // Christmas
        '2024-01-01',  // New Year
        '2024-07-04',  // July 4th
        '2024-10-31',  // Halloween
      ];
      
      dates.forEach(date => {
        const recs = getMockRecommendations('Test', date, 3);
        expect(recs.date).toBe(date);
        expect(recs.season).toBeDefined();
      });
    });

    it('should handle various location formats', () => {
      const locations = [
        'New York, NY',
        'San Francisco',
        'London, UK',
        'Tokyo, Japan',
        '90210'  // Zip code
      ];
      
      locations.forEach(location => {
        const recs = getMockRecommendations(location, '2024-06-15', 3);
        expect(recs.location).toBe(location);
      });
    });

    it('should have appropriate seasonal recommendations content', () => {
      const seasons = {
        'Winter': { date: '2024-01-15', expectedTags: ['citrus', 'orange', 'duck'] },
        'Spring': { date: '2024-04-15', expectedTags: ['asparagus', 'risotto'] },
        'Summer': { date: '2024-07-15', expectedTags: ['tomato', 'salad'] },
        'Fall': { date: '2024-10-15', expectedTags: ['pumpkin', 'risotto'] }
      };
      
      Object.entries(seasons).forEach(([season, data]) => {
        const recs = getMockRecommendations('Test City', data.date, 3);
        expect(recs.season).toBe(season);
        
        const allRecipes = Object.values(recs.recommendations).flat();
        // Check that at least one of the expected tags is present
        expect(data.expectedTags.some(tag => 
          allRecipes.some(recipe => recipe.name.toLowerCase().includes(tag))
        )).toBe(true);
      });
    });

    it('should handle PNW locations specially', () => {
      const pnwLocations = ['Seattle, WA', 'Portland, OR'];
      const nonPnnwLocations = ['Vancouver, WA'];
      
      // Test actual PNW locations
      pnwLocations.forEach(location => {
        const recs = getMockRecommendations(location, '2024-06-15', 3);
        expect(recs.recommendations).toHaveProperty('Pacific Northwest Coastal Cuisine');
        
        const pnwRecipes = recs.recommendations['Pacific Northwest Coastal Cuisine'];
        expect(pnwRecipes.length).toBeLessThanOrEqual(3);
        expect(pnwRecipes.some(recipe => 
          recipe.name.toLowerCase().includes('salmon')
        )).toBe(true);
      });
      
      // Test non-PNW locations (should not have PNW categories)
      nonPnnwLocations.forEach(location => {
        const recs = getMockRecommendations(location, '2024-06-15', 3);
        expect(recs.recommendations).not.toHaveProperty('Pacific Northwest Coastal Cuisine');
      });
    });

    it('should handle holiday recommendations', () => {
      const holidayDates = [
        { date: '2024-12-25', holiday: 'Christmas' },
        { date: '2024-11-28', holiday: 'Thanksgiving' },
        { date: '2024-10-31', holiday: 'Halloween' }
      ];
      
      holidayDates.forEach(({ date, holiday }) => {
        const recs = getMockRecommendations('Test City', date, 3);
        const categoryNames = Object.keys(recs.recommendations);
        
        expect(categoryNames.some(name => 
          name.toLowerCase().includes(holiday.toLowerCase())
        )).toBe(true);
      });
    });
  });

  describe('enhanceRecommendationsWithRecipes', () => {
    it('should enhance category recommendations with recipes', async () => {
      const mockCategoryRecommendations = {
        'Summer Salads': ['caesar salad', 'greek salad', 'caprese salad'],
        'Grilled Meats': ['steak', 'chicken', 'salmon']
      };
      
      const enhanced = await enhanceRecommendationsWithRecipes(
        mockCategoryRecommendations, 
        2, 
        mockEnv, 
        'test-123'
      );
      
      expect(enhanced).toBeDefined();
      expect(Object.keys(enhanced)).toHaveLength(2);
      
      // Since we're mocking fetch, it should fall back to enhanced dish names
      Object.values(enhanced).forEach(recipes => {
        expect(recipes.length).toBeLessThanOrEqual(2);
        recipes.forEach(recipe => {
          // Check for JSON-LD Recipe properties
          expect(recipe).toHaveProperty('@context');
          expect(recipe).toHaveProperty('@type');
          expect(recipe).toHaveProperty('@id');
          expect(recipe).toHaveProperty('identifier');
          expect(recipe).toHaveProperty('name');
          expect(recipe).toHaveProperty('fallback');
          expect(recipe.fallback).toBe(true);
        });
      });
    });

    it('should handle errors gracefully and fall back to dish names', async () => {
      const mockCategoryRecommendations = {
        'Test Category': ['dish1', 'dish2', 'dish3']
      };
      
      // Mock fetch to throw an error
      global.fetch.mockRejectedValueOnce(new Error('Network error'));
      
      const enhanced = await enhanceRecommendationsWithRecipes(
        mockCategoryRecommendations, 
        2, 
        mockEnv, 
        'test-123'
      );
      
      expect(enhanced).toBeDefined();
      expect(enhanced['Test Category']).toBeDefined();
      expect(enhanced['Test Category'].length).toBeLessThanOrEqual(2);
      
      enhanced['Test Category'].forEach(recipe => {
        expect(recipe.fallback).toBe(true);
        // Check for JSON-LD Recipe properties instead of old type property
        expect(recipe).toHaveProperty('@context');
        expect(recipe).toHaveProperty('@type');
        expect(recipe).toHaveProperty('@id');
        expect(recipe).toHaveProperty('identifier');
      });
    });
  });

  describe('searchRecipeByCategory', () => {
    it('should search for recipes using search database', async () => {
      const mockSearchResponse = {
        nodes: [
          {
            id: 'recipe1',
            properties: {
              name: 'Test Recipe 1',
              description: 'A test recipe',
              ingredients: ['ingredient1', 'ingredient2'],
              instructions: ['step1', 'step2']
            }
          }
        ]
      };
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSearchResponse
      });
      
      const recipes = await searchRecipeByCategory(
        'Test Category', 
        ['dish1', 'dish2'], 
        2, 
        mockEnv, 
        'test-123'
      );
      
      expect(recipes).toBeDefined();
      expect(recipes.length).toBe(1);
      expect(recipes[0].identifier).toBe('recipe1');
      expect(recipes[0].name).toBe('Test Recipe 1');
      expect(recipes[0].source).toBe('search_database');
      expect(recipes[0].fallback).toBe(false);
    });

    it('should fall back to recipe save worker if search database fails', async () => {
      // Mock search database to fail
      global.fetch.mockResolvedValueOnce({
        ok: false
      });
      
      const mockSaveWorkerResponse = {
        recipes: [
          {
            id: 'recipe2',
            name: 'Test Recipe 2',
            description: 'Another test recipe',
            ingredients: ['ingredient3', 'ingredient4'],
            instructions: ['step3', 'step4']
          }
        ]
      };
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSaveWorkerResponse
      });
      
      const recipes = await searchRecipeByCategory(
        'Test Category', 
        ['dish1', 'dish2'], 
        2, 
        mockEnv, 
        'test-123'
      );
      
      expect(recipes).toBeDefined();
      expect(recipes.length).toBe(1);
      expect(recipes[0].identifier).toBe('recipe2');
      expect(recipes[0].name).toBe('Test Recipe 2');
      expect(recipes[0].source).toBe('recipe_save_worker');
    });

    it('should return enhanced dish names as final fallback', async () => {
      // Mock both search methods to fail
      global.fetch.mockResolvedValueOnce({
        ok: false
      });
      
      global.fetch.mockResolvedValueOnce({
        ok: false
      });
      
      const recipes = await searchRecipeByCategory(
        'Test Category', 
        ['dish1', 'dish2', 'dish3'], 
        2, 
        mockEnv, 
        'test-123'
      );
      
      expect(recipes).toBeDefined();
      expect(recipes.length).toBe(2); // Limited to 2
      expect(recipes[0].fallback).toBe(true);
      // Check for JSON-LD Recipe properties instead of old type property
      expect(recipes[0]).toHaveProperty('@context');
      expect(recipes[0]).toHaveProperty('@type');
      expect(recipes[0]).toHaveProperty('@id');
      expect(recipes[0]).toHaveProperty('identifier');
      expect(recipes[0].source).toBe('ai_generated');
    });

    it('should handle network errors gracefully', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));
      
      const recipes = await searchRecipeByCategory(
        'Test Category', 
        ['dish1', 'dish2'], 
        2, 
        mockEnv, 
        'test-123'
      );
      
      expect(recipes).toBeDefined();
      expect(recipes.length).toBe(2);
      expect(recipes[0].fallback).toBe(true);
      expect(recipes[0].source).toBe('fallback');
    });
  });

  describe('getRecipeRecommendations integration', () => {
    it('should handle the new limit parameter', async () => {
      // Mock AI to return a simple response
      const mockAIResponse = {
        response: JSON.stringify({
          recommendations: {
            'Test Category': ['dish1', 'dish2', 'dish3', 'dish4']
          }
        })
      };
      
      // Mock the AI binding
      const mockAIEnv = {
        AI: {
          run: vi.fn().mockResolvedValue(mockAIResponse)
        },
        SEARCH_DB_URL: 'https://test-search-db.workers.dev',
        RECIPE_SAVE_WORKER_URL: 'https://test-save-worker.workers.dev'
      };
      
      // Mock fetch for recipe search
      global.fetch.mockResolvedValue({
        ok: false
      });
      
      const recommendations = await getRecipeRecommendations(
        'Test City', 
        '2024-06-15', 
        2, 
        mockAIEnv, 
        'test-123'
      );
      
      expect(recommendations).toBeDefined();
      expect(recommendations.recommendations).toBeDefined();
      
      // Check that each category respects the limit
      Object.values(recommendations.recommendations).forEach(recipes => {
        expect(recipes.length).toBeLessThanOrEqual(2);
      });
    });

    it('should fall back to mock data when AI is not available', async () => {
      const recommendations = await getRecipeRecommendations(
        'Test City', 
        '2024-06-15', 
        3, 
        mockEnv, 
        'test-123'
      );
      
      expect(recommendations).toBeDefined();
      expect(recommendations.isMockData).toBe(true);
      expect(recommendations.recommendations).toBeDefined();
      
      // Check that each category respects the limit
      Object.values(recommendations.recommendations).forEach(recipes => {
        expect(recipes.length).toBeLessThanOrEqual(3);
      });
    });
  });
});