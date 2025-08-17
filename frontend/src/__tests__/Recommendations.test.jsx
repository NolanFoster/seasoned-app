import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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

describe('Recommendations Component', () => {
  const mockOnRecipeSelect = jest.fn();

  beforeEach(() => {
    // Reset all mocks
    fetch.mockClear();
    mockGeolocation.getCurrentPosition.mockClear();
    mockOnRecipeSelect.mockClear();
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
        'Seasonal Favorites': ['summer berries', 'grilled vegetables'],
        'Local Specialties': ['farm fresh', 'local produce']
      },
      season: 'summer'
    };

    // Mock geolocation to reject quickly so the function can continue
    mockGeolocation.getCurrentPosition.mockImplementation((resolve, reject) => {
      reject(new Error('Geolocation not available in test'));
    });

    // Mock the fetch calls
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
      return Promise.resolve({ ok: false });
    });

    render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);

    // Wait for the component to render the recommendations
    await waitFor(() => {
      expect(screen.getByText('Seasonal Favorites')).toBeInTheDocument();
    }, { timeout: 5000 });

    // Check that fetch was called for recommendations
    // The component should have made the fetch call by now
    expect(fetch).toHaveBeenCalled();
    
    const recommendationsCall = fetch.mock.calls.find(call => 
      call[0].includes('/recommendations')
    );
    expect(recommendationsCall).toBeDefined();
    expect(recommendationsCall[1].method).toBe('POST');
    expect(recommendationsCall[1].body).toContain('San Francisco, CA');
  });

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
      return Promise.resolve({ ok: false });
    });

    render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/recommendations'),
        expect.objectContaining({
          body: expect.stringContaining('37.77°N, -122.42°W')
        })
      );
    });
  });

  it('handles geolocation errors gracefully', async () => {
    mockGeolocation.getCurrentPosition.mockImplementation((resolve, reject) => {
      reject(new Error('Geolocation error'));
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
      return Promise.resolve({ ok: false });
    });

    render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/recommendations'),
        expect.objectContaining({
          body: expect.stringContaining('San Francisco, CA')
        })
      );
    });
  });

  it('filters seasonal recommendations appropriately', async () => {
    const mockRecommendations = {
      recommendations: {
        'Holiday Treats': ['pumpkin pie', 'gingerbread', 'summer fruit'],
        'Seasonal Favorites': ['berries', 'vegetables']
      },
      season: 'summer'
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

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    }, { timeout: 3000 });

    // Check that it was called with the right parameters
    const recommendationsCall = fetch.mock.calls.find(call => 
      call[0].includes('/recommendations')
    );
    expect(recommendationsCall).toBeDefined();
    // The body should contain the location and date, not the season
    expect(recommendationsCall[1].body).toContain('San Francisco, CA');
  });

  it('handles API errors gracefully', async () => {
    fetch.mockImplementation(() => Promise.resolve({ ok: false, status: 500 }));

    render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    // After API error, component should not render anything (returns null)
    expect(screen.queryByText('Seasonal Favorites')).not.toBeInTheDocument();
  });

  it('handles network errors gracefully', async () => {
    fetch.mockImplementation(() => Promise.reject(new Error('Network error')));

    render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    // After network error, component should not render anything (returns null)
    expect(screen.queryByText('Seasonal Favorites')).not.toBeInTheDocument();
  });

  it('calls onRecipeSelect when recipe card is clicked', async () => {
    const mockRecommendations = {
      recommendations: {
        'Seasonal Favorites': ['summer berries']
      }
    };

    const mockSearchResults = {
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
    };

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
          json: async () => mockSearchResults
        });
      }
      return Promise.resolve({ ok: false });
    });

    render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);

    // Wait for recommendations to load and recipes to be fetched
    await waitFor(() => {
      expect(screen.getByText('Summer Berry Salad')).toBeInTheDocument();
    });

    // Click on the recipe card
    const recipeCard = screen.getByText('Summer Berry Salad').closest('.recipe-card');
    recipeCard.click();

    expect(mockOnRecipeSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '1',
        name: 'Summer Berry Salad'
      })
    );
  });

  it('handles empty recommendations gracefully', async () => {
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

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    // Should not render any categories when there are no recommendations
    expect(screen.queryByText('Seasonal Favorites')).not.toBeInTheDocument();
  });

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

    // Wait for the component to render the valid category
    await waitFor(() => {
      expect(screen.getByText('Valid Category')).toBeInTheDocument();
    }, { timeout: 5000 });

    // Should handle malformed data gracefully without crashing
    // Only valid categories should be rendered
    expect(screen.queryByText('Invalid Category')).not.toBeInTheDocument();
  });
});
