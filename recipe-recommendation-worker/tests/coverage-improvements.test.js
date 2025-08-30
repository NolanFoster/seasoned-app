/**
 * Additional tests to improve branch coverage to meet 80% threshold
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock shared utilities before importing the main module
vi.mock('../../shared/utility-functions.js', () => ({
  log: vi.fn(),
  generateRequestId: vi.fn(() => 'test-request-id')
}));

vi.mock('../../shared/metrics-collector.js', () => ({
  MetricsCollector: vi.fn().mockImplementation(() => ({
    timing: vi.fn(),
    increment: vi.fn(),
    gauge: vi.fn(),
    getMetrics: vi.fn(() => ({}))
  }))
}));

import { searchRecipeByCategory, getMockRecommendations } from '../src/index.js';

describe('Service Binding Error Response Coverage', () => {
  it('should handle non-ok response status from service binding', async () => {
    const mockEnv = {
      SEARCH_WORKER: {
        fetch: vi.fn().mockResolvedValueOnce(new Response(
          JSON.stringify({ error: 'Service temporarily unavailable' }), 
          { 
            status: 503,
            statusText: 'Service Unavailable'
          }
        ))
      },
      RECIPE_SAVE_WORKER_URL: null
    };

    const recipes = await searchRecipeByCategory(
      'Test Category',
      ['dish1', 'dish2'],
      3,
      mockEnv,
      'test-req-503'
    );

    // Should fall back to dish suggestions
    expect(recipes).toBeDefined();
    expect(recipes.length).toBe(3);
    expect(recipes[0].fallback).toBe(true);
    expect(recipes[0].type).toBe('dish_suggestion');
    expect(recipes[0].source).toBe('ai_generated');
    
    // Verify the service binding was called
    expect(mockEnv.SEARCH_WORKER.fetch).toHaveBeenCalledTimes(1);
  });

  it('should handle 404 response from service binding', async () => {
    const mockEnv = {
      SEARCH_WORKER: {
        fetch: vi.fn().mockResolvedValueOnce(new Response(
          'Not Found', 
          { 
            status: 404,
            statusText: 'Not Found'
          }
        ))
      },
      RECIPE_SAVE_WORKER_URL: null
    };

    const recipes = await searchRecipeByCategory(
      'Obscure Category',
      ['rare dish 1', 'rare dish 2'],
      2,
      mockEnv,
      'test-req-404'
    );

    // Should fall back to dish suggestions
    expect(recipes).toBeDefined();
    expect(recipes.length).toBe(2);
    expect(recipes[0].fallback).toBe(true);
    expect(recipes[0].type).toBe('dish_suggestion');
  });

  it('should handle 500 internal server error from service binding', async () => {
    const mockEnv = {
      SEARCH_WORKER: {
        fetch: vi.fn().mockResolvedValueOnce(new Response(
          JSON.stringify({ 
            error: 'Internal server error',
            details: 'Database connection failed'
          }), 
          { 
            status: 500,
            statusText: 'Internal Server Error'
          }
        ))
      },
      RECIPE_SAVE_WORKER_URL: 'https://recipe-save.workers.dev'
    };

    // Mock global fetch for recipe save worker fallback
    global.fetch = vi.fn().mockResolvedValueOnce(new Response(
      JSON.stringify({ recipes: [] }),
      { status: 200 }
    ));

    const recipes = await searchRecipeByCategory(
      'Error Category',
      ['dish1', 'dish2', 'dish3'],
      3,
      mockEnv,
      'test-req-500'
    );

    // Should attempt fallback and then return dish suggestions
    expect(recipes).toBeDefined();
    expect(recipes.length).toBe(3);
    expect(recipes[0].fallback).toBe(true);
  });
});

describe('Recipe Search Complete Failure Coverage', () => {
  it('should handle complete recipe search failure with exception', async () => {
    const mockEnv = {
      SEARCH_WORKER: {
        fetch: vi.fn().mockImplementation(() => {
          throw new Error('Catastrophic failure');
        })
      },
      RECIPE_SAVE_WORKER_URL: null
    };

    // Mock the internal searchRecipeByCategory to throw an error
    const originalConsoleError = console.error;
    console.error = vi.fn(); // Suppress error logs in test

    try {
      const recipes = await searchRecipeByCategory(
        'Failure Category',
        ['dish1', 'dish2'],
        2,
        mockEnv,
        'test-req-fail'
      );

      // Should return basic fallback - service binding throws, so it falls back to enhanced dishes
      expect(recipes).toBeDefined();
      expect(recipes.length).toBe(2);
      expect(recipes[0].id).toMatch(/^dish_failure_category_/);
      expect(recipes[0].name).toBe('dish1');
      expect(recipes[0].type).toBe('dish_suggestion');
      expect(recipes[0].source).toBe('ai_generated');
      expect(recipes[0].fallback).toBe(true);
    } finally {
      console.error = originalConsoleError;
    }
  });

  it('should handle JSON parse error in service binding response', async () => {
    const mockEnv = {
      SEARCH_WORKER: {
        fetch: vi.fn().mockResolvedValueOnce(new Response(
          'Invalid JSON {broken', 
          { 
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        ))
      },
      RECIPE_SAVE_WORKER_URL: null
    };

    const recipes = await searchRecipeByCategory(
      'Parse Error Category',
      ['dish1'],
      1,
      mockEnv,
      'test-req-parse-error'
    );

    // Should fall back to dish suggestions
    expect(recipes).toBeDefined();
    expect(recipes.length).toBe(1);
    expect(recipes[0].fallback).toBe(true);
  });
});

describe('Invalid Date Handling in getMockRecommendations', () => {
  it('should handle invalid date string gracefully', async () => {
    const recommendations = getMockRecommendations(
      'New York, NY',
      'invalid-date-format',
      3,
      'test-invalid-date'
    );

    expect(recommendations).toBeDefined();
    expect(Object.keys(recommendations).length).toBeGreaterThan(0);
    
    // Should use current date/season as fallback
    const seasonalCategories = Object.keys(recommendations);
    
    // Verify it returns appropriate seasonal recommendations
    expect(seasonalCategories.length).toBeGreaterThan(0);
    Object.values(recommendations).forEach(items => {
      expect(Array.isArray(items)).toBe(true);
      expect(items.length).toBeLessThanOrEqual(3);
      // Each item should be a recipe object
      items.forEach(item => {
        expect(item).toHaveProperty('id');
        expect(item).toHaveProperty('name');
        expect(item).toHaveProperty('fallback', true);
      });
    });
  });

  it('should handle null date gracefully', async () => {
    const recommendations = getMockRecommendations(
      'San Francisco, CA',
      null,
      5,
      'test-null-date'
    );

    expect(recommendations).toBeDefined();
    expect(Object.keys(recommendations).length).toBeGreaterThan(0);
  });

  it('should handle date object that throws on construction', async () => {
    // Create a date string that might cause issues
    const problematicDate = '2024-13-45'; // Invalid month and day
    
    const recommendations = getMockRecommendations(
      'Los Angeles, CA',
      problematicDate,
      2,
      'test-problematic-date'
    );

    expect(recommendations).toBeDefined();
    expect(Object.keys(recommendations).length).toBeGreaterThan(0);
    
    // Should still return valid recommendations
    Object.values(recommendations).forEach(items => {
      expect(Array.isArray(items)).toBe(true);
      expect(items.length).toBeGreaterThan(0);
      expect(items.length).toBeLessThanOrEqual(2);
      // Each item should be a recipe object
      items.forEach(item => {
        expect(item).toHaveProperty('id');
        expect(item).toHaveProperty('name');
        expect(item).toHaveProperty('fallback', true);
      });
    });
  });

  it('should handle empty string date', async () => {
    const recommendations = getMockRecommendations(
      'Chicago, IL',
      '',
      4,
      'test-empty-date'
    );

    expect(recommendations).toBeDefined();
    expect(Object.keys(recommendations).length).toBeGreaterThan(0);
  });

  it('should handle undefined date', async () => {
    const recommendations = getMockRecommendations(
      'Miami, FL',
      undefined,
      3,
      'test-undefined-date'
    );

    expect(recommendations).toBeDefined();
    expect(Object.keys(recommendations).length).toBeGreaterThan(0);
  });
});

// Helper function to get season (from the main module)
function getSeason(date) {
  const month = date.getMonth();
  if (month >= 2 && month <= 4) return 'Spring';
  if (month >= 5 && month <= 7) return 'Summer';
  if (month >= 8 && month <= 10) return 'Fall';
  return 'Winter';
}