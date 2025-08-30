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

  it.skip('should handle catastrophic failure in searchRecipeByCategory', async () => {
    // This test forces the catch block at lines 1159-1178
    const mockEnv = {};
    
    // Mock array methods to throw errors
    const originalSlice = Array.prototype.slice;
    const originalMap = Array.prototype.map;
    const originalError = console.error;
    console.error = vi.fn();
    
    Array.prototype.slice = function() {
      if (this[0] === 'error-dish1') {
        throw new Error('Array manipulation failed');
      }
      return originalSlice.apply(this, arguments);
    };
    
    try {
      const recipes = await searchRecipeByCategory(
        'Error Category',
        ['error-dish1', 'error-dish2'],
        2,
        mockEnv,
        'test-catastrophic'
      );
      
      // Should return fallback with random IDs
      expect(recipes).toBeDefined();
      expect(recipes.length).toBe(2);
      expect(recipes[0].id).toMatch(/^fallback_\d+_[a-z0-9]+$/);
      expect(recipes[0].name).toBe('error-dish1');
      expect(recipes[0].type).toBe('dish_suggestion');
      expect(recipes[0].source).toBe('fallback');
      expect(recipes[0].fallback).toBe(true);
    } finally {
      Array.prototype.slice = originalSlice;
      Array.prototype.map = originalMap;
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
  it.skip('should handle NaN date gracefully', () => {
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
    Object.entries(recommendations).forEach(([category, items]) => {
      expect(Array.isArray(items)).toBe(true);
      expect(items.length).toBeGreaterThan(0);
      expect(items.length).toBeLessThanOrEqual(3);
    });
  });

  it.skip('should handle invalid date string gracefully', () => {
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
    const categories = Object.keys(recommendations);
    expect(categories.length).toBeGreaterThan(0);
    
    // Each category should have recipe items
    categories.forEach(category => {
      const items = recommendations[category];
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

  it.skip('should handle date object that throws on construction', () => {
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
    Object.entries(recommendations).forEach(([category, items]) => {
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
    // Test Spring
    const springRecs = getMockRecommendations('NYC', '2024-03-15', 2, 'test-spring');
    expect(springRecs).toBeDefined();
    expect(Object.keys(springRecs).length).toBeGreaterThan(0);
    
    // Test Summer
    const summerRecs = getMockRecommendations('NYC', '2024-06-15', 2, 'test-summer');
    expect(summerRecs).toBeDefined();
    expect(Object.keys(summerRecs).length).toBeGreaterThan(0);
    
    // Test Fall
    const fallRecs = getMockRecommendations('NYC', '2024-09-15', 2, 'test-fall');
    expect(fallRecs).toBeDefined();
    expect(Object.keys(fallRecs).length).toBeGreaterThan(0);
    
    // Test Winter
    const winterRecs = getMockRecommendations('NYC', '2024-12-15', 2, 'test-winter');
    expect(winterRecs).toBeDefined();
    expect(Object.keys(winterRecs).length).toBeGreaterThan(0);
  });

  it('should handle different date formats in getMockRecommendations', () => {
    // Test with Date object
    const dateObjRecs = getMockRecommendations('NYC', new Date('2024-07-15'), 2, 'test-date-obj');
    expect(dateObjRecs).toBeDefined();
    expect(Object.keys(dateObjRecs).length).toBeGreaterThan(0);
    
    // Test with numeric month boundaries (edge of seasons)
    const marchEndRecs = getMockRecommendations('NYC', '2024-03-31', 2, 'test-march-end');
    expect(marchEndRecs).toBeDefined();
    
    const mayEndRecs = getMockRecommendations('NYC', '2024-05-31', 2, 'test-may-end');
    expect(mayEndRecs).toBeDefined();
    
    const augustEndRecs = getMockRecommendations('NYC', '2024-08-31', 2, 'test-august-end');
    expect(augustEndRecs).toBeDefined();
    
    const novemberEndRecs = getMockRecommendations('NYC', '2024-11-30', 2, 'test-november-end');
    expect(novemberEndRecs).toBeDefined();
  });
});

describe('Edge Case Coverage', () => {
  it('should handle location edge cases in getMockRecommendations', () => {
    // Test with empty location
    const emptyLocationRecs = getMockRecommendations(
      '',
      '2024-07-15',
      3,
      'test-empty-location'
    );
    
    expect(emptyLocationRecs).toBeDefined();
    expect(Object.keys(emptyLocationRecs).length).toBeGreaterThan(0);
    
    // Test with whitespace-only location
    const whitespaceLocationRecs = getMockRecommendations(
      '   ',
      '2024-07-15',
      3,
      'test-whitespace-location'
    );
    
    expect(whitespaceLocationRecs).toBeDefined();
    expect(Object.keys(whitespaceLocationRecs).length).toBeGreaterThan(0);
  });

  it.skip('should handle edge case recipe limits in getMockRecommendations', () => {
    // Test with 0 recipes per category
    const zeroLimitRecs = getMockRecommendations(
      'Test City',
      '2024-07-15',
      0,
      'test-zero-limit'
    );
    
    expect(zeroLimitRecs).toBeDefined();
    const categories = Object.keys(zeroLimitRecs);
    expect(categories.length).toBeGreaterThan(0);
    categories.forEach(cat => {
      expect(zeroLimitRecs[cat]).toHaveLength(1); // Should default to 1
    });
    
    // Test with very high limit
    const highLimitRecs = getMockRecommendations(
      'Test City',
      '2024-07-15',
      100,
      'test-high-limit'
    );
    
    expect(highLimitRecs).toBeDefined();
    const highCategories = Object.keys(highLimitRecs);
    expect(highCategories.length).toBeGreaterThan(0);
    highCategories.forEach(cat => {
      expect(highLimitRecs[cat].length).toBeLessThanOrEqual(10); // Should cap at 10
    });
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