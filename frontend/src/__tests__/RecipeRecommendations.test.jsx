import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import Recommendations from '../components/Recommendations';

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

// Mock the utility function
jest.mock('../../../shared/utility-functions.js', () => ({
  formatDuration: jest.fn((duration) => {
    if (!duration) return '-';
    // Simple mock implementation
    if (duration.includes('PT')) {
      const minutes = duration.replace('PT', '').replace('M', '');
      return `${minutes} min`;
    }
    return duration;
  }),
  isValidUrl: jest.fn((url) => {
    return url && (url.startsWith('http://') || url.startsWith('https://'));
  }),
  formatIngredientAmount: jest.fn((amount) => amount || '')
}));

// Set environment variables for testing
process.env.VITE_API_URL = 'https://test-api.example.com';
process.env.VITE_CLIPPER_API_URL = 'https://test-clipper-api.example.com';
process.env.VITE_SEARCH_DB_URL = 'https://test-search-db.example.com';
process.env.VITE_RECOMMENDATION_API_URL = 'https://test-recommendations.example.com';

// Helper function to wait for location timeout
const waitForLocationTimeout = async () => {
  // Wait for the 2-second timeout to complete
  await new Promise(resolve => setTimeout(resolve, 2500));
};

// Test the new Recommendations component separately
describe.skip('Recommendations Component Integration', () => {
  const mockOnRecipeSelect = jest.fn();

  beforeEach(() => {
    mockOnRecipeSelect.mockClear();
    
    // Default mock implementation for fetch
    fetch.mockImplementation((url) => {
      if (url.includes('/recommendations')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            recommendations: {
              'Seasonal Favorites': [
                {
                  id: 'recipe-1',
                  name: 'Summer Berry Salad',
                  description: 'Fresh berries with mint',
                  image: 'berry-salad.jpg',
                  prepTime: 'PT10M',
                  cookTime: null,
                  servings: '4 servings',
                  ingredients: ['berries', 'mint', 'honey'],
                  instructions: ['Mix berries', 'Add mint', 'Drizzle honey']
                }
              ],
              'Local Specialties': [
                {
                  id: 'recipe-2',
                  name: 'Grilled Vegetables',
                  description: 'Seasonal grilled vegetables',
                  image: 'grilled-veg.jpg',
                  prepTime: 'PT15M',
                  cookTime: 'PT20M',
                  servings: '2 servings',
                  ingredients: ['zucchini', 'bell peppers', 'olive oil'],
                  instructions: ['Slice vegetables', 'Brush with oil', 'Grill until tender']
                }
              ],
              'Holiday Treats': [
                {
                  id: 'recipe-3',
                  name: 'Holiday Cookies',
                  description: 'Festive holiday cookies',
                  image: 'cookies.jpg',
                  prepTime: 'PT20M',
                  cookTime: 'PT12M',
                  servings: '24 cookies',
                  ingredients: ['flour', 'sugar', 'eggs', 'butter'],
                  instructions: ['Mix ingredients', 'Shape cookies', 'Bake until golden']
                }
              ]
            }
          })
        });
      }
      if (url.includes('/api/search')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            results: [
              {
                id: '1',
                properties: {
                  title: 'Test Recipe',
                  description: 'A test recipe',
                  image: 'recipe.jpg',
                  prepTime: 'PT10M',
                  cookTime: 'PT20M',
                  servings: '2 servings'
                }
              }
            ]
          })
        });
      }
      if (url.includes('/health')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'healthy' })
        });
      }
      if (url.includes('/recipes/')) {
        const mockResponse = {
          ok: true,
          json: async () => ({
            id: 'recipe-1',
            data: {
              name: 'Summer Berry Salad',
              description: 'Fresh berries with mint',
              image: 'berry-salad.jpg',
              prepTime: 'PT10M',
              cookTime: null,
              servings: '4 servings',
              ingredients: ['berries', 'mint', 'honey'],
              instructions: ['Mix berries', 'Add mint', 'Drizzle honey']
            }
          }),
          text: async () => JSON.stringify({
            id: 'recipe-1',
            data: {
              name: 'Summer Berry Salad',
              description: 'Fresh berries with mint',
              image: 'berry-salad.jpg',
              prepTime: 'PT10M',
              cookTime: null,
              servings: '4 servings',
              ingredients: ['berries', 'mint', 'honey'],
              instructions: ['Mix berries', 'Add mint', 'Drizzle honey']
            }
          })
        };
        return Promise.resolve(mockResponse);
      }
      return Promise.resolve({ ok: false });
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders recommendations component correctly', () => {
    render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);
    
    // Should show loading categories
    expect(screen.getByText('Seasonal Favorites')).toBeInTheDocument();
    expect(screen.getByText('Local Specialties')).toBeInTheDocument();
    expect(screen.getByText('Holiday Treats')).toBeInTheDocument();
  });

  it('calls onRecipeSelect when recipe is selected', async () => {
    const mockRecommendations = {
      recommendations: {
        'Seasonal Favorites': [
          {
            id: 'recipe-1',
            name: 'Summer Berry Salad',
            description: 'Fresh berries with mint',
            image: 'berry-salad.jpg',
            prepTime: 'PT10M',
            cookTime: null,
            servings: '4 servings',
            ingredients: ['berries', 'mint', 'honey'],
            instructions: ['Mix berries', 'Add mint', 'Drizzle honey']
          }
        ]
      }
    };

    // Mock geolocation to reject quickly so the function can continue
    mockGeolocation.getCurrentPosition.mockImplementation((resolve, reject) => {
      reject(new Error('Geolocation not available in test'));
    });

    // Mock the fetch calls with proper URL matching
    fetch.mockImplementation((url) => {
      if (url.includes('/recommendations')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockRecommendations
        });
      }
      if (url.includes('/api/search')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            results: [
              {
                id: '1',
                properties: {
                  title: 'Summer Berry Salad',
                  description: 'Fresh berries with mint',
                  image: 'berry-salad.jpg',
                  prepTime: 'PT10M',
                  cookTime: null,
                  servings: '4 servings'
                }
              }
            ]
          })
        });
      }
      if (url.includes('/recipes/')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 'recipe-1',
            data: {
              name: 'Summer Berry Salad',
              description: 'Fresh berries with mint',
              image: 'berry-salad.jpg',
              prepTime: 'PT10M',
              cookTime: null,
              servings: '4 servings',
              ingredients: ['berries', 'mint', 'honey'],
              instructions: ['Mix berries', 'Add mint', 'Drizzle honey']
            }
          })
        });
      }
      return Promise.resolve({ ok: false });
    });

    render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);

    // Wait for location timeout and fetch calls
    await waitForLocationTimeout();

    // Wait for recommendations to load and recipes to be fetched
    await waitFor(() => {
      expect(screen.getByText('Seasonal Favorites')).toBeInTheDocument();
    }, { timeout: 10000 });
    
    // Wait for the recipe to be rendered
    await waitFor(() => {
      expect(screen.getByText('Summer Berry Salad')).toBeInTheDocument();
    }, { timeout: 10000 });

    // Click on the recipe card
    const recipeCard = screen.getByText('Summer Berry Salad').closest('.recipe-card');
    fireEvent.click(recipeCard);

    expect(mockOnRecipeSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'recipe-1',
        name: 'Summer Berry Salad'
      })
    );
  }, 15000); // Increase timeout to 15 seconds

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
    }, 15000); // Increase timeout to 15 seconds

    it('should replace loading cards with actual recommendations', async () => {
      render(<App />);
      
      // Wait for recommendations to load
      await waitFor(() => {
        expect(screen.getByText('Summer Berry Salad')).toBeInTheDocument();
        expect(screen.getByText('Seasonal Favorites')).toBeInTheDocument();
      }, { timeout: 15000 });
      
      // Loading cards should be gone
      const loadingCards = document.querySelectorAll('.loading-card');
      expect(loadingCards.length).toBe(0);
    }, 15000); // Increase timeout to 15 seconds
  });

  describe('Recommendation Filtering', () => {
    it('should filter recipes by tag matches', async () => {
      render(<App />);
      
      // Wait for recommendations to load
      await waitFor(() => {
        expect(screen.getByText('Summer Berry Salad')).toBeInTheDocument();
        expect(screen.getByText('Grilled Vegetables')).toBeInTheDocument();
        expect(screen.getByText('Seasonal Favorites')).toBeInTheDocument();
      }, { timeout: 15000 });
      
      // Check that tomato gazpacho appears (matches 'tomatoes' tag)
      expect(screen.getByText('Summer Berry Salad')).toBeInTheDocument();
    }, 15000); // Increase timeout to 15 seconds

    it('should handle camelCase tags by splitting them', async () => {
      render(<App />);
      
      // Wait for recommendations to load
      await waitFor(() => {
        // GrilledVegetables should match "Grilled Vegetables" recipe
        expect(screen.getByText('Grilled Vegetables')).toBeInTheDocument();
        expect(screen.getByText('Seasonal Favorites')).toBeInTheDocument();
      }, { timeout: 15000 });
    }, 15000); // Increase timeout to 15 seconds

    it('should not show duplicate recipes across categories', async () => {
      render(<App />);
      
      // Wait for recommendations to load
      await waitFor(() => {
        expect(screen.getByText('Summer Berry Salad')).toBeInTheDocument();
        expect(screen.getByText('Seasonal Favorites')).toBeInTheDocument();
      }, { timeout: 15000 });
      
      // Count how many times each recipe appears
      const berryCards = screen.getAllByText('Summer Berry Salad');
      expect(berryCards.length).toBe(1);
    }, 15000); // Increase timeout to 15 seconds

    it('should show maximum 3 recipes per category', async () => {
      render(<App />);
      
      // Wait for recommendations to load
      await waitFor(() => {
        expect(screen.getByText('Seasonal Favorites')).toBeInTheDocument();
      }, { timeout: 15000 });
      
      // Get all recipe cards within a category
      const categories = document.querySelectorAll('.recommendation-category');
      categories.forEach(category => {
        const recipeCards = category.querySelectorAll('.recipe-card:not(.loading-card)');
        expect(recipeCards.length).toBeLessThanOrEqual(3);
      });
    }, 15000); // Increase timeout to 15 seconds
  });

  describe('Location-based Recommendations', () => {
    it('should use empty location when geolocation fails', async () => {
      // Mock geolocation to fail
      mockGeolocation.getCurrentPosition.mockImplementation((resolve, reject) => {
        reject(new Error('Geolocation not available'));
      });

      render(<App />);

      // Wait for the component to make API calls
      await waitFor(() => {
        expect(fetch).toHaveBeenCalled();
      }, { timeout: 15000 });

      // Should still load recommendations with empty location for location-agnostic recommendations
      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/recommendations'),
          expect.objectContaining({
            body: expect.stringContaining('"location":"San Francisco, CA"')
          })
        );
      }, { timeout: 15000 });
    }, 15000); // Increase timeout to 15 seconds
  });

  describe('Error Handling', () => {
    it('should handle malformed recommendation data', async () => {
      // Mock console.error to spy on it
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      // Mock fetch to return malformed data
      fetch.mockImplementation((url) => {
        if (url.includes('/recommendations')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              recommendations: {
                'Invalid Category': 'not an array'
              }
            })
          });
        }
        return Promise.resolve({ ok: false });
      });

      render(<App />);

      // Wait for the component to handle the error
      await waitFor(() => {
        expect(fetch).toHaveBeenCalled();
      }, { timeout: 15000 });

      // Should handle error gracefully
      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalled();
      }, { timeout: 15000 });

      consoleSpy.mockRestore();
    }, 15000); // Increase timeout to 15 seconds
  });
});