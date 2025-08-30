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
      ['dish1', 'dish2', 'dish3'],  // Need 3 dishes to get 3 results
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

  it('should handle catastrophic failure in searchRecipeByCategory', async () => {
    // This test forces the catch block at lines 1159-1178
    const mockEnv = {};
    
    // Mock console.error to avoid noise in test output
    const originalError = console.error;
    console.error = vi.fn();
    
    try {
      // Test with an environment that will cause the function to fall back to basic dish names
      const recipes = await searchRecipeByCategory(
        'Error Category',
        ['error-dish1', 'error-dish2'],
        2,
        mockEnv,
        'test-catastrophic'
      );
      
      // Should return fallback with dish-based IDs
      expect(recipes).toBeDefined();
      expect(recipes.length).toBe(2);
      expect(recipes[0].id).toMatch(/^dish_error_category_\d+$/);
      expect(recipes[0].name).toBe('error-dish1');
      expect(recipes[0].type).toBe('dish_suggestion');
      expect(recipes[0].source).toBe('ai_generated');
      expect(recipes[0].fallback).toBe(true);
    } finally {
      console.error = originalError;
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
  it('should handle NaN date gracefully', () => {
    // Test with a date that results in NaN when parsed
    const recommendations = getMockRecommendations(
      'Test Location',
      'not-a-date',
      3,
      'test-nan-date'
    );
    
    // Should still return valid recommendations using current date
    expect(recommendations).toBeDefined();
    expect(Object.keys(recommendations).length).toBeGreaterThan(0);
    
    // Check structure
    Object.entries(recommendations.recommendations).forEach(([category, items]) => {
      expect(Array.isArray(items)).toBe(true);
      expect(items.length).toBeGreaterThan(0);
      expect(items.length).toBeLessThanOrEqual(3);
    });
  });

  it('should handle invalid date string gracefully', () => {
    // Pass a string that will create an invalid date when parsed
    const recommendations = getMockRecommendations(
      'New York, NY',
      'invalid-date-format',
      3,
      'test-invalid-date'
    );

    // Verify that it returns valid recommendations despite invalid date
    expect(recommendations).toBeDefined();
    expect(typeof recommendations).toBe('object');
    
    // Should have at least some recommendation categories
    const categories = Object.keys(recommendations.recommendations);
    expect(categories.length).toBeGreaterThan(0);
    
    // Each category should have recipe items
    categories.forEach(category => {
      const items = recommendations.recommendations[category];
      expect(Array.isArray(items)).toBe(true);
      expect(items.length).toBeGreaterThan(0);
      expect(items.length).toBeLessThanOrEqual(3);
      
      // Verify the structure of recipe items
      items.forEach(item => {
        expect(item).toHaveProperty('id');
        expect(item).toHaveProperty('name');
        expect(item).toHaveProperty('type', 'dish_suggestion');
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

  it('should handle date object that throws on construction', () => {
    // Create a date string that might cause issues
    const problematicDate = '2024-13-45'; // Invalid month and day
    
    const recommendations = getMockRecommendations(
      'Los Angeles, CA',
      problematicDate,
      2,
      'test-problematic-date'
    );

    expect(recommendations).toBeDefined();
    expect(typeof recommendations).toBe('object');
    expect(Object.keys(recommendations).length).toBeGreaterThan(0);
    
    // Should still return valid recommendations
    Object.entries(recommendations.recommendations).forEach(([category, items]) => {
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

describe('Service Binding Recipe Search Failure', () => {
  it('should handle recipe search with no recipes returned', async () => {
    // Create a mock where service binding returns empty results
    const mockEnv = {
      SEARCH_WORKER: {
        fetch: vi.fn().mockResolvedValueOnce(new Response(
          JSON.stringify({ recipes: [] }),
          { 
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        ))
      },
      RECIPE_SAVE_WORKER_URL: 'https://test.workers.dev'
    };
    
    // Mock global fetch for recipe save worker
    global.fetch = vi.fn().mockResolvedValueOnce(new Response(
      JSON.stringify({ recipes: [] }),
      { status: 200 }
    ));
    
    const { searchRecipeByCategory } = await import('../src/index.js');
    
    const recipes = await searchRecipeByCategory(
      'Empty Category',
      ['dish1', 'dish2'],
      2,
      mockEnv,
      'test-empty-results'
    );
    
    // Should fall back to enhanced dish names
    expect(recipes).toBeDefined();
    expect(recipes).toHaveLength(2);
    expect(recipes[0]).toHaveProperty('type', 'dish_suggestion');
    expect(recipes[0]).toHaveProperty('source', 'ai_generated');
    expect(recipes[0]).toHaveProperty('fallback', true);
  });

  it('should handle recipe search failure and fallback to dish names', async () => {
    // Create a mock environment where searchRecipeByCategory fails
    const mockEnv = {
      SEARCH_WORKER: {
        fetch: vi.fn().mockResolvedValueOnce(new Response(
          'Server Error',
          { status: 500 }
        ))
      },
      RECIPE_SAVE_WORKER_URL: null
    };
    
    const { enhanceRecommendationsWithRecipes } = await import('../src/index.js');
    const recommendations = {
      'Failed Category': ['dish1', 'dish2', 'dish3']
    };
    
    const enhanced = await enhanceRecommendationsWithRecipes(
      recommendations,
      2,
      mockEnv,
      'test-fallback-path'
    );
    
    // Should fall back to dish names when recipe search fails
    expect(enhanced).toBeDefined();
    expect(enhanced['Failed Category']).toHaveLength(2);
    expect(enhanced['Failed Category'][0]).toHaveProperty('name', 'dish1');
    expect(enhanced['Failed Category'][0]).toHaveProperty('type', 'dish_suggestion');
    expect(enhanced['Failed Category'][0]).toHaveProperty('fallback', true);
  });
});

describe('Additional Branch Coverage', () => {
  it('should handle different seasons in getMockRecommendations', () => {
    const springRecs = getMockRecommendations('Test City', '2024-03-15', 3, 'test-spring');
    const summerRecs = getMockRecommendations('Test City', '2024-07-15', 3, 'test-summer');
    const fallRecs = getMockRecommendations('Test City', '2024-10-15', 3, 'test-fall');
    const winterRecs = getMockRecommendations('Test City', '2024-01-15', 3, 'test-winter');
    
    expect(springRecs.season).toBe('Spring');
    expect(summerRecs.season).toBe('Summer');
    expect(fallRecs.season).toBe('Fall');
    expect(winterRecs.season).toBe('Winter');
  });

  it('should handle different date formats in getMockRecommendations', () => {
    const date1 = getMockRecommendations('Test City', '2024-06-15', 3, 'test-date1');
    const date2 = getMockRecommendations('Test City', '06/15/2024', 3, 'test-date2');
    const date3 = getMockRecommendations('Test City', 'June 15, 2024', 3, 'test-date3');
    
    expect(date1).toBeDefined();
    expect(date2).toBeDefined();
    expect(date3).toBeDefined();
  });

  it('should handle edge case season boundaries', () => {
    // Test edge cases around season boundaries
    const lateWinter = getMockRecommendations('Test City', '2024-02-28', 3, 'test-late-winter');
    const earlySpring = getMockRecommendations('Test City', '2024-03-01', 3, 'test-early-spring');
    const lateSpring = getMockRecommendations('Test City', '2024-05-31', 3, 'test-late-spring');
    const earlySummer = getMockRecommendations('Test City', '2024-06-01', 3, 'test-early-summer');
    
    expect(lateWinter.season).toBe('Winter');
    expect(earlySpring.season).toBe('Spring');
    expect(lateSpring.season).toBe('Spring');
    expect(earlySummer.season).toBe('Summer');
  });
});

describe('Edge Case Coverage', () => {
  it('should handle location edge cases in getMockRecommendations', () => {
    const emptyLocation = getMockRecommendations('', '2024-06-15', 3, 'test-empty-loc');
    const nullLocation = getMockRecommendations(null, '2024-06-15', 3, 'test-null-loc');
    const undefinedLocation = getMockRecommendations(undefined, '2024-06-15', 3, 'test-undef-loc');
    
    expect(emptyLocation.location).toBe('Not specified');
    expect(nullLocation.location).toBe('Not specified');
    expect(undefinedLocation.location).toBe('Not specified');
  });

  it('should handle edge case recipe limits in getMockRecommendations', () => {
    // Test with 0 recipes per category
    const zeroLimitRecs = getMockRecommendations(
      'Test City',
      '2024-07-15',
      0,
      'test-zero-limit'
    );
    
    expect(zeroLimitRecs).toBeDefined();
    const categories = Object.keys(zeroLimitRecs.recommendations);
    expect(categories.length).toBeGreaterThan(0);
    categories.forEach(cat => {
      expect(zeroLimitRecs.recommendations[cat]).toHaveLength(3); // Should default to 3 when 0 is passed
    });
    
    // Test with very high limit
    const highLimitRecs = getMockRecommendations(
      'Test City',
      '2024-07-15',
      100,
      'test-high-limit'
    );
    
    expect(highLimitRecs).toBeDefined();
    const highCategories = Object.keys(highLimitRecs.recommendations);
    expect(highCategories.length).toBeGreaterThan(0);
    highCategories.forEach(cat => {
      expect(highLimitRecs.recommendations[cat].length).toBeLessThanOrEqual(10); // Should cap at 10
    });
  });

  it('should handle extreme edge cases in getMockRecommendations', () => {
    // Test with extreme values
    const extremeLow = getMockRecommendations('Test City', '2024-06-15', -999, 'test-extreme-low');
    const extremeHigh = getMockRecommendations('Test City', '2024-06-15', 999999, 'test-extreme-high');
    const nullLimit = getMockRecommendations('Test City', '2024-06-15', null, 'test-null-limit');
    const undefinedLimit = getMockRecommendations('Test City', '2024-06-15', undefined, 'test-undef-limit');
    
    expect(extremeLow).toBeDefined();
    expect(extremeHigh).toBeDefined();
    expect(nullLimit).toBeDefined();
    expect(undefinedLimit).toBeDefined();
    
    // All should have valid recommendations
    expect(Object.keys(extremeLow.recommendations).length).toBeGreaterThan(0);
    expect(Object.keys(extremeHigh.recommendations).length).toBeGreaterThan(0);
    expect(Object.keys(nullLimit.recommendations).length).toBeGreaterThan(0);
    expect(Object.keys(undefinedLimit.recommendations).length).toBeGreaterThan(0);
  });
});



describe('Recipe Enhancement Error Handling', () => {
  it('should handle errors during recipe enhancement gracefully', async () => {
    // Import enhanceRecommendationsWithRecipes for testing
    const { enhanceRecommendationsWithRecipes } = await import('../src/index.js');
    
    // Create mock environment that will cause searchRecipeByCategory to throw
    const mockEnv = {
      SEARCH_WORKER: {
        fetch: vi.fn().mockImplementation(() => {
          throw new Error('Service connection failed');
        })
      },
      RECIPE_SAVE_WORKER_URL: null
    };
    
    const recommendations = {
      'Summer Favorites': ['tomato salad', 'corn on the cob'],
      'BBQ Essentials': ['grilled chicken', 'veggie burgers']
    };
    
    // Mock searchRecipeByCategory to throw an error
    const originalError = console.error;
    console.error = vi.fn();
    
    try {
      const enhanced = await enhanceRecommendationsWithRecipes(
        recommendations,
        3,
        mockEnv,
        'test-enhance-error'
      );
      
      // Should return fallback structure
      expect(enhanced).toBeDefined();
      expect(Object.keys(enhanced).length).toBe(2);
      expect(enhanced['Summer Favorites']).toHaveLength(2);
      expect(enhanced['Summer Favorites'][0]).toHaveProperty('name', 'tomato salad');
      expect(enhanced['Summer Favorites'][0]).toHaveProperty('type', 'dish_suggestion');
      expect(enhanced['Summer Favorites'][0]).toHaveProperty('fallback', true);
    } finally {
      console.error = originalError;
    }
  });

  it('should handle Promise.all rejection in enhanceRecommendationsWithRecipes', async () => {
    // Import enhanceRecommendationsWithRecipes for testing
    const { enhanceRecommendationsWithRecipes } = await import('../src/index.js');
    
    // Mock Promise.all to throw an error
    const originalPromiseAll = Promise.all;
    const originalError = console.error;
    console.error = vi.fn();
    
    Promise.all = vi.fn().mockImplementation((promises) => {
      if (promises && promises.length > 0) {
        throw new Error('Promise.all failed');
      }
      return originalPromiseAll(promises);
    });
    
    const recommendations = {
      'Test Category': ['dish1', 'dish2']
    };
    
    const mockEnv = {
      SEARCH_WORKER: null,
      RECIPE_SAVE_WORKER_URL: null
    };
    
    try {
      const enhanced = await enhanceRecommendationsWithRecipes(
        recommendations,
        2,
        mockEnv,
        'test-promise-fail'
      );
      
      // Should return fallback structure when Promise.all fails
      expect(enhanced).toBeDefined();
      expect(enhanced['Test Category']).toHaveLength(2);
      expect(enhanced['Test Category'][0]).toHaveProperty('name', 'dish1');
      expect(enhanced['Test Category'][0]).toHaveProperty('type', 'dish_suggestion');
      expect(enhanced['Test Category'][0]).toHaveProperty('fallback', true);
    } finally {
      Promise.all = originalPromiseAll;
      console.error = originalError;
    }
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