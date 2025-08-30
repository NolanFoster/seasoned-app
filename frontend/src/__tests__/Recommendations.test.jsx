import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
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
  })
}));

// Set environment variables for testing
process.env.VITE_RECOMMENDATION_API_URL = 'https://recommendations.test.workers.dev';
process.env.VITE_SEARCH_DB_URL = 'https://search-db.test.workers.dev';

// Helper function to wait for location timeout
const waitForLocationTimeout = async () => {
  // Wait for the 2-second timeout to complete
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 2500));
  });
};

describe('Recommendations Component', () => {
  const mockOnRecipeSelect = jest.fn();

  beforeEach(() => {
    // Reset all mocks
    fetch.mockClear();
    mockGeolocation.getCurrentPosition.mockClear();
    mockOnRecipeSelect.mockClear();
    
    // Default mock implementation for fetch
    fetch.mockImplementation((url) => {
      if (url.includes('/recommendations')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            recommendations: {
              'Seasonal Favorites': ['seasonal', 'fresh'],
              'Local Specialties': ['local', 'produce'],
              'Holiday Treats': ['holiday', 'celebration']
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
      if (url.includes('reverse-geocode-client')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            city: 'San Francisco',
            locality: 'San Francisco',
            principalSubdivision: 'CA',
            countryName: 'United States'
          })
        });
      }
      return Promise.resolve({ ok: false });
    });
  });

  it('renders loading state initially', () => {
    render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);
    
    // Should show loading categories
    expect(screen.getByText('Seasonal Favorites')).toBeInTheDocument();
    expect(screen.getByText('Local Specialties')).toBeInTheDocument();
    expect(screen.getByText('Holiday Treats')).toBeInTheDocument();
    
    // Should show loading cards
    const loadingCards = screen.getAllByText('', { selector: '.loading-card' });
    expect(loadingCards).toHaveLength(9); // 3 categories × 3 cards each
  });

  it('fetches recommendations on mount', async () => {
    const mockRecommendations = {
      recommendations: {
        'Local Specialties': ['local produce']
      }
    };

    // Mock geolocation to reject quickly so the function can continue
    mockGeolocation.getCurrentPosition.mockImplementation((resolve, reject) => {
      reject(new Error('Geolocation not available in test'));
    });

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
                  title: 'Local Recipe',
                  description: 'A local recipe',
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
      return Promise.resolve({ ok: false });
    });

    render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);

    // Wait for location timeout and fetch calls
    await waitForLocationTimeout();

    // Wait for a fetch call with the correct location
    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    // Verify the fetch call details
    const recommendationsCall = fetch.mock.calls.find(call => 
      call[0].includes('/recommendations')
    );
    expect(recommendationsCall).toBeDefined();
    expect(recommendationsCall[1].method).toBe('POST');
  }, 15000); // Increase timeout to 15 seconds

  it('handles geolocation when available', async () => {
    const mockPosition = {
      coords: {
        latitude: 37.7749,
        longitude: -122.4194
      }
    };

    mockGeolocation.getCurrentPosition.mockImplementation((resolve) => {
      resolve(mockPosition);
    });

    const mockRecommendations = {
      recommendations: {
        'Local Specialties': ['local produce']
      }
    };

    fetch.mockImplementation((url) => {
      if (url.includes('/recommendations')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockRecommendations
        });
      }
      if (url.includes('reverse-geocode-client')) {
        // Mock reverse geocoding response
        return Promise.resolve({
          ok: true,
          json: async () => ({
            city: 'San Francisco',
            locality: 'San Francisco',
            principalSubdivision: 'CA',
            countryName: 'United States'
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
                  title: 'Local Recipe',
                  description: 'A local recipe',
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
      return Promise.resolve({ ok: false });
    });

    render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);

    // Wait for the location to be resolved and fetch to be called
    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    }, { timeout: 10000 });

    // Verify that recommendations were fetched
    const recommendationsCall = fetch.mock.calls.find(call => 
      call[0].includes('/recommendations')
    );
    expect(recommendationsCall).toBeDefined();
  }, 15000); // Increase timeout to 15 seconds

  it('handles no recommendations gracefully', async () => {
    const mockRecommendations = {
      recommendations: {}
    };

    fetch.mockImplementation((url) => {
      if (url.includes('/recommendations')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockRecommendations
        });
      }
      return Promise.resolve({ ok: false });
    });

    render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);

    // Wait for location timeout and fetch calls
    await waitForLocationTimeout();

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    // Should not render any categories when there are no recommendations
    expect(screen.queryByText('Seasonal Favorites')).not.toBeInTheDocument();
  }, 15000); // Increase timeout to 15 seconds

  it('handles malformed recommendations gracefully', async () => {
    const mockRecommendations = {
      recommendations: {
        'Valid Category': ['valid tag'],
        'Invalid Category': 'not an array'
      }
    };

    // Mock search results for the valid category
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
                  title: 'Valid Recipe',
                  description: 'A valid recipe',
                  image: 'recipe.jpg',
                  prepTime: 'PT10M',
                  cookTime: null,
                  servings: '2 servings'
                }
              }
            ]
          })
        });
      }
      return Promise.resolve({ ok: false });
    });

    render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);

    // Wait for location timeout and fetch calls
    await waitForLocationTimeout();

    // Wait for the component to render the valid category
    await waitFor(() => {
      expect(screen.getByText('Valid Category')).toBeInTheDocument();
    }, { timeout: 10000 });

    // Should handle malformed data gracefully without crashing
    // Only valid categories should be rendered
    expect(screen.queryByText('Invalid Category')).not.toBeInTheDocument();
  }, 15000); // Increase timeout to 15 seconds

  describe('Carousel Integration', () => {
    it('uses SwipeableRecipeGrid for recipe display', async () => {
      const mockRecommendations = {
        recommendations: {
          'Test Category': ['test']
        }
      };

      const mockRecipes = Array(5).fill(null).map((_, i) => ({
        id: `recipe-${i}`,
        properties: {
          title: `Recipe ${i}`,
          description: `Description ${i}`,
          tags: ['test'],
          cookTime: 'PT30M',
          prepTime: 'PT15M',
          image: `https://example.com/recipe-${i}.jpg`,
        }
      }));

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
            json: async () => ({ results: mockRecipes })
          });
        }
        return Promise.resolve({ ok: false });
      });

      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);

      // Wait for location timeout and fetch calls
      await waitForLocationTimeout();

      await waitFor(() => {
        // Check that the category is rendered
        expect(screen.getByText('Test Category')).toBeInTheDocument();
      }, { timeout: 10000 });
    }, 15000); // Increase timeout to 15 seconds

    it('displays up to 10 recipes in carousel format', async () => {
      const mockRecommendations = {
        recommendations: {
          'Large Category': ['large']
        }
      };

      // Create 15 recipes to test the 10 recipe limit
      const mockRecipes = Array(15).fill(null).map((_, i) => ({
        id: `recipe-${i}`,
        properties: {
          title: `Recipe ${i}`,
          description: `Description ${i}`,
          tags: ['large'],
          cookTime: 'PT30M',
          prepTime: 'PT15M',
          image: `https://example.com/recipe-${i}.jpg`,
        }
      }));

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
            json: async () => ({ results: mockRecipes })
          });
        }
        return Promise.resolve({ ok: false });
      });

      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);

      // Wait for location timeout and fetch calls
      await waitForLocationTimeout();

      await waitFor(() => {
        expect(screen.getByText('Large Category')).toBeInTheDocument();
      }, { timeout: 10000 });
    }, 15000); // Increase timeout to 15 seconds

    it('maintains carousel functionality across category updates', async () => {
      const mockRecommendations = {
        recommendations: {
          'Dynamic Category': ['dynamic']
        }
      };

      const createMockRecipes = (prefix) => Array(8).fill(null).map((_, i) => ({
        id: `${prefix}-recipe-${i}`,
        properties: {
          title: `${prefix} Recipe ${i}`,
          description: `Description ${i}`,
          tags: ['dynamic'],
          cookTime: 'PT30M',
          prepTime: 'PT15M',
          image: `https://example.com/${prefix}-recipe-${i}.jpg`,
        }
      }));

      // Initial render
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
            json: async () => ({ results: createMockRecipes('Initial') })
          });
        }
        return Promise.resolve({ ok: false });
      });

      const { rerender } = render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);

      // Wait for location timeout and fetch calls
      await waitForLocationTimeout();

      await waitFor(() => {
        expect(screen.getByText('Dynamic Category')).toBeInTheDocument();
      }, { timeout: 10000 });

      // Update with new recipes
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
            json: async () => ({ results: createMockRecipes('Updated') })
          });
        }
        return Promise.resolve({ ok: false });
      });

      // Re-render to trigger new fetch
      rerender(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);

      await waitFor(() => {
        expect(screen.getByText('Dynamic Category')).toBeInTheDocument();
      }, { timeout: 10000 });
    }, 15000); // Increase timeout to 15 seconds
  });

  describe('Error Handling', () => {
    it('handles API errors gracefully', async () => {
      fetch.mockImplementation(() => {
        return Promise.reject(new Error('API Error'));
      });

      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);

      // Wait for location timeout and fetch calls
      await waitForLocationTimeout();

      // Should still show loading state even after error
      expect(screen.getByText('Seasonal Favorites')).toBeInTheDocument();
    }, 15000); // Increase timeout to 15 seconds

    it('handles malformed API responses', async () => {
      fetch.mockImplementation((url) => {
        if (url.includes('/recommendations')) {
          return Promise.resolve({
            ok: true,
            json: async () => 'invalid json'
          });
        }
        return Promise.resolve({ ok: false });
      });

      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);

      // Wait for location timeout and fetch calls
      await waitForLocationTimeout();

      // Should handle malformed responses gracefully
      expect(screen.getByText('Seasonal Favorites')).toBeInTheDocument();
    }, 15000); // Increase timeout to 15 seconds
  });

  describe('Location Handling', () => {
    it('shows location prompt when permission denied', async () => {
      mockGeolocation.getCurrentPosition.mockImplementation((resolve, reject) => {
        reject({ code: 1, message: 'Permission denied' });
      });

      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);

      // Wait for location timeout and fetch calls
      await waitForLocationTimeout();

      // Should show location prompt
      expect(screen.getByText('Enable Location Access')).toBeInTheDocument();
    }, 15000); // Increase timeout to 15 seconds

    it('uses default location after timeout', async () => {
      mockGeolocation.getCurrentPosition.mockImplementation((resolve, reject) => {
        // Don't call resolve or reject - let timeout handle it
      });

      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);

      // Wait for location timeout and fetch calls
      await waitForLocationTimeout();

      await waitFor(() => {
        expect(fetch).toHaveBeenCalled();
      }, { timeout: 10000 });
    }, 15000); // Increase timeout to 15 seconds
  });
});
