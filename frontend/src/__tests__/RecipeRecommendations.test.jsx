import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';

// Mock fetch globally
global.fetch = jest.fn();

// Mock geolocation
const mockGeolocation = {
  getCurrentPosition: jest.fn()
};

Object.defineProperty(global.navigator, 'geolocation', {
  value: mockGeolocation,
  writable: true
});

describe('Recipe Recommendations Feature', () => {
  beforeEach(() => {
    // Reset all mocks
    fetch.mockClear();
    mockGeolocation.getCurrentPosition.mockClear();
    
    // Mock successful recipe fetch
    fetch.mockImplementation((url) => {
      if (url.includes('/recipes')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            recipes: [] // Start with empty recipes to test loading state
          })
        });
      } else if (url.includes('/recommendations')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            recommendations: {
              'Seasonal Favorites': ['berries', 'tomatoes', 'GrilledVegetables', 'SummerSalads'],
              'Local Specialties': ['sourdough', 'seafood', 'FreshProduce', 'ArtisanCheese'],
              'Holiday Treats': ['BBQRibs', 'CornOnTheCob', 'SummerDesserts', 'IceCream']
            },
            location: 'San Francisco, CA',
            date: '2025-08-17',
            season: 'Summer'
          })
        });
      } else if (url.includes('/health')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'healthy' })
        });
      }
      return Promise.resolve({
        ok: false,
        status: 404
      });
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Recommendation Loading States', () => {
    it('should show loading placeholders on initial load', async () => {
      render(<App />);
      
      // Should show loading cards immediately
      await waitFor(() => {
        expect(screen.getByText('Seasonal Favorites')).toBeInTheDocument();
        expect(screen.getByText('Local Specialties')).toBeInTheDocument();
        expect(screen.getByText('Holiday Treats')).toBeInTheDocument();
      });
      
      // Check for loading cards with loading-card class
      const loadingCards = document.querySelectorAll('.loading-card');
      expect(loadingCards.length).toBeGreaterThan(0);
    });

    it('should continue showing loading cards when no recipes match', async () => {
      render(<App />);
      
      // Wait for recommendations to load
      await waitFor(() => {
        expect(screen.getByText('Seasonal Favorites')).toBeInTheDocument();
      }, { timeout: 3000 });
      
      // Loading cards should still be present when no recipes
      const loadingCards = document.querySelectorAll('.loading-card');
      expect(loadingCards.length).toBeGreaterThan(0);
    });
  });

  describe('Recommendation Filtering', () => {
    beforeEach(() => {
      // Override fetch for these tests to include recipes
      fetch.mockImplementation((url) => {
        if (url.includes('/recipes')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              recipes: [
                {
                  id: '1',
                  data: {
                    id: '1',
                    name: 'Summer Berry Salad',
                    description: 'Fresh berries with mint',
                    image: 'berry-salad.jpg',
                    recipeCategory: ['Salad', 'Summer'],
                    recipeCuisine: 'American',
                    keywords: 'fresh, berries, salad',
                    prep_time: 'PT10M',
                    cook_time: null,
                    recipe_yield: '4 servings',
                    recipeIngredient: ['2 cups mixed berries', '1/4 cup fresh mint', 'Honey to taste'],
                    recipeInstructions: ['Mix berries', 'Add mint', 'Drizzle with honey']
                  }
                },
                {
                  id: '2',
                  data: {
                    id: '2',
                    name: 'Grilled Vegetables',
                    description: 'Seasonal grilled vegetables',
                    image: 'grilled-veg.jpg',
                    recipeCategory: 'Side Dish',
                    recipeCuisine: ['Mediterranean', 'Healthy'],
                    keywords: 'grilled, vegetables, summer',
                    prep_time: 'PT15M',
                    cook_time: 'PT20M',
                    recipe_yield: '6 servings',
                    recipeIngredient: ['2 zucchini', '1 eggplant', '2 bell peppers', 'Olive oil'],
                    recipeInstructions: ['Slice vegetables', 'Brush with oil', 'Grill until tender']
                  }
                },
                {
                  id: '3',
                  data: {
                    id: '3',
                    name: 'Tomato Gazpacho',
                    description: 'Cold tomato soup perfect for summer',
                    image: 'gazpacho.jpg',
                    recipeCategory: 'Soup',
                    recipeCuisine: 'Spanish',
                    keywords: 'cold soup, tomatoes, summer',
                    prep_time: 'PT20M',
                    cook_time: null,
                    recipe_yield: '4 servings',
                    recipeIngredient: ['6 ripe tomatoes', '1 cucumber', '1 bell pepper', 'Garlic'],
                    recipeInstructions: ['Chop vegetables', 'Blend until smooth', 'Chill before serving']
                  }
                },
                {
                  id: '4',
                  data: {
                    id: '4',
                    name: 'Apple Pie',
                    description: 'Classic American apple pie',
                    image: 'apple-pie.jpg',
                    recipeCategory: 'Dessert',
                    recipeCuisine: 'American',
                    keywords: 'pie, apples, dessert, fall',
                    prep_time: 'PT30M',
                    cook_time: 'PT45M',
                    recipe_yield: '8 slices',
                    recipeIngredient: ['6 apples', '1 pie crust', '1/2 cup sugar', 'Cinnamon'],
                    recipeInstructions: ['Prepare crust', 'Mix apple filling', 'Bake at 375°F']
                  }
                }
              ]
            })
          });
        } else if (url.includes('/recommendations')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              recommendations: {
                'Seasonal Favorites': ['berries', 'tomatoes', 'GrilledVegetables', 'SummerSalads'],
                'Local Specialties': ['sourdough', 'seafood', 'FreshProduce', 'ArtisanCheese'],
                'Holiday Treats': ['BBQRibs', 'CornOnTheCob', 'SummerDesserts', 'IceCream']
              },
              location: 'San Francisco, CA',
              date: '2025-08-17',
              season: 'Summer'
            })
          });
        } else if (url.includes('/health')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ status: 'healthy' })
          });
        }
        return Promise.resolve({
          ok: false,
          status: 404
        });
      });
    });

    it('should match recipes based on recommendation tags', async () => {
      render(<App />);
      
      // Wait for recommendations to load
      await waitFor(() => {
        expect(screen.getByText('Summer Berry Salad')).toBeInTheDocument();
        expect(screen.getByText('Grilled Vegetables')).toBeInTheDocument();
      }, { timeout: 3000 });
      
      // Check that tomato gazpacho appears (matches 'tomatoes' tag)
      expect(screen.getByText('Tomato Gazpacho')).toBeInTheDocument();
    });

    it('should handle camelCase tags by splitting them', async () => {
      render(<App />);
      
      // Wait for recommendations to load
      await waitFor(() => {
        // GrilledVegetables should match "Grilled Vegetables" recipe
        expect(screen.getByText('Grilled Vegetables')).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('should not show duplicate recipes across categories', async () => {
      render(<App />);
      
      // Wait for recommendations to load
      await waitFor(() => {
        expect(screen.getByText('Summer Berry Salad')).toBeInTheDocument();
      }, { timeout: 3000 });
      
      // Count how many times each recipe appears
      const berryCards = screen.getAllByText('Summer Berry Salad');
      expect(berryCards.length).toBe(1);
    });

    it('should show maximum 3 recipes per category', async () => {
      render(<App />);
      
      // Wait for recommendations to load
      await waitFor(() => {
        expect(screen.getByText('Seasonal Favorites')).toBeInTheDocument();
      }, { timeout: 3000 });
      
      // Get all recipe cards within a category
      const categories = document.querySelectorAll('.recommendation-category');
      categories.forEach(category => {
        const recipeCards = category.querySelectorAll('.recipe-card:not(.loading-card)');
        expect(recipeCards.length).toBeLessThanOrEqual(3);
      });
    });
  });

  describe('Location-based Recommendations', () => {
    it('should request user location for recommendations', async () => {
      mockGeolocation.getCurrentPosition.mockImplementation((success) => {
        success({
          coords: {
            latitude: 37.7749,
            longitude: -122.4194
          }
        });
      });
      
      render(<App />);
      
      // Wait for geolocation to be called
      await waitFor(() => {
        expect(mockGeolocation.getCurrentPosition).toHaveBeenCalled();
      });
    });

    it('should use default location when geolocation fails', async () => {
      mockGeolocation.getCurrentPosition.mockImplementation((success, error) => {
        error({ code: 1, message: 'User denied location' });
      });
      
      render(<App />);
      
      // Should still load recommendations with default location
      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/recommendations'),
          expect.objectContaining({
            body: expect.stringContaining('San Francisco, CA')
          })
        );
      });
    });
  });

  describe('Seasonal Filtering', () => {
    it('should filter out inappropriate seasonal items', async () => {
      // Mock recommendations with inappropriate seasonal items
      fetch.mockImplementation((url) => {
        if (url.includes('/recommendations')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              recommendations: {
                'Holiday Treats': ['Halloween Pumpkin Pie', 'Thanksgiving Turkey', 'Summer BBQ', 'Ice Cream']
              },
              season: 'Summer'
            })
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, recipes: [] })
        });
      });
      
      render(<App />);
      
      // Wait for recommendations to load
      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/recommendations'),
          expect.any(Object)
        );
      });
      
      // Halloween and Thanksgiving items should be filtered out in summer
      const bodyText = document.body.textContent;
      expect(bodyText).not.toContain('Halloween');
      expect(bodyText).not.toContain('Thanksgiving');
    });
  });

  describe('Error Handling', () => {
    it('should handle recommendation API failure gracefully', async () => {
      fetch.mockImplementation((url) => {
        if (url.includes('/recommendations')) {
          return Promise.resolve({
            ok: false,
            status: 500
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, recipes: [] })
        });
      });
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      render(<App />);
      
      // Should log error
      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Failed to fetch recommendations'),
          500
        );
      });
      
      consoleSpy.mockRestore();
    });

    it('should handle malformed recommendation data', async () => {
      fetch.mockImplementation((url) => {
        if (url.includes('/recommendations')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              recommendations: {
                'Bad Category': 'not an array' // Invalid format
              }
            })
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, recipes: [] })
        });
      });
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      render(<App />);
      
      // Should handle error gracefully
      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Invalid tags format'),
          expect.any(String)
        );
      });
      
      consoleSpy.mockRestore();
    });
  });

  describe('Recipe Card Interactions', () => {
    it('should open recipe view when clicking on a recommendation card', async () => {
      render(<App />);
      
      // Wait for recommendations to load
      await waitFor(() => {
        expect(screen.getByText('Summer Berry Salad')).toBeInTheDocument();
      }, { timeout: 3000 });
      
      // Click on a recipe card
      const recipeCard = screen.getByText('Summer Berry Salad').closest('.recipe-card');
      await userEvent.click(recipeCard);
      
      // Should show recipe details
      await waitFor(() => {
        expect(screen.getByText('Ingredients')).toBeInTheDocument();
        expect(screen.getByText('Instructions')).toBeInTheDocument();
      });
    });
  });

  describe('Tag Matching Algorithm', () => {
    it('should match recipes with partial word matches', async () => {
      render(<App />);
      
      // Wait for recommendations - 'berries' tag should match 'Summer Berry Salad'
      await waitFor(() => {
        expect(screen.getByText('Summer Berry Salad')).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('should match recipes with multiple word tags', async () => {
      render(<App />);
      
      // 'SummerSalads' should be split and match recipes with 'summer' or 'salad'
      await waitFor(() => {
        expect(screen.getByText('Summer Berry Salad')).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('should use word boundaries for accurate matching', async () => {
      // This ensures 'pie' doesn't match 'piece' for example
      fetch.mockImplementation((url) => {
        if (url.includes('/recipes')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              recipes: [
                {
                  id: '1',
                  name: 'Piece of Cake',
                  description: 'Not a pie',
                  recipeCategory: 'Dessert',
                  keywords: 'piece, cake'
                }
              ]
            })
          });
        } else if (url.includes('/recommendations')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              recommendations: {
                'Desserts': ['pie']
              }
            })
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });
      
      render(<App />);
      
      // 'pie' should not match 'piece'
      await waitFor(() => {
        const categories = document.querySelectorAll('.recommendation-category');
        expect(categories.length).toBeGreaterThan(0);
      });
      
      // Should not find 'Piece of Cake' when searching for 'pie'
      expect(screen.queryByText('Piece of Cake')).not.toBeInTheDocument();
    });
  });
});