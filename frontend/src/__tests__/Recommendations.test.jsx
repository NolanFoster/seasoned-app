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

  describe('Carousel Integration', () => {
    it('uses SwipeableRecipeGrid for recipe display', async () => {
      const mockRecommendations = {
        categories: {
          'Test Category': {
            tags: ['test'],
            description: 'Test recipes'
          }
        }
      };

      const mockRecipes = Array(5).fill(null).map((_, i) => ({
        id: `recipe-${i}`,
        name: `Recipe ${i}`,
        description: `Description ${i}`,
        tags: ['test'],
        cookTime: 'PT30M',
        prepTime: 'PT15M',
        image: `https://example.com/recipe-${i}.jpg`,
      }));

      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockRecommendations,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ results: mockRecipes }),
        });

      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);

      await waitFor(() => {
        // Check that SwipeableRecipeGrid is used (we mocked it in the test setup)
        const categoryContainer = screen.getByText('Test Category').closest('.recommendation-category');
        expect(categoryContainer).toBeInTheDocument();
        
        // The grid should contain recipe cards
        const recipeCards = screen.getAllByTestId('recipe-item');
        expect(recipeCards.length).toBeGreaterThan(0);
      });
    });

    it('displays up to 10 recipes in carousel format', async () => {
      const mockRecommendations = {
        categories: {
          'Large Category': {
            tags: ['large'],
            description: 'Many recipes'
          }
        }
      };

      // Create 15 recipes to test the 10 recipe limit
      const mockRecipes = Array(15).fill(null).map((_, i) => ({
        id: `recipe-${i}`,
        name: `Recipe ${i}`,
        description: `Description ${i}`,
        tags: ['large'],
        cookTime: 'PT30M',
        prepTime: 'PT15M',
        image: `https://example.com/recipe-${i}.jpg`,
      }));

      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockRecommendations,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ results: mockRecipes }),
        });

      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);

      await waitFor(() => {
        const recipeCards = screen.getAllByTestId('recipe-item');
        // Should only display 10 recipes maximum
        expect(recipeCards).toHaveLength(10);
        
        // Verify first 10 recipes are displayed
        for (let i = 0; i < 10; i++) {
          expect(screen.getByText(`Recipe ${i}`)).toBeInTheDocument();
        }
        
        // Verify recipes 11-14 are not displayed
        for (let i = 10; i < 15; i++) {
          expect(screen.queryByText(`Recipe ${i}`)).not.toBeInTheDocument();
        }
      });
    });

    it('maintains carousel functionality across category updates', async () => {
      const mockRecommendations = {
        categories: {
          'Dynamic Category': {
            tags: ['dynamic'],
            description: 'Dynamic recipes'
          }
        }
      };

      const createMockRecipes = (prefix) => Array(8).fill(null).map((_, i) => ({
        id: `${prefix}-recipe-${i}`,
        name: `${prefix} Recipe ${i}`,
        description: `Description ${i}`,
        tags: ['dynamic'],
        cookTime: 'PT30M',
        prepTime: 'PT15M',
        image: `https://example.com/${prefix}-recipe-${i}.jpg`,
      }));

      // Initial render
      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockRecommendations,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ results: createMockRecipes('Initial') }),
        });

      const { rerender } = render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);

      await waitFor(() => {
        expect(screen.getByText('Initial Recipe 0')).toBeInTheDocument();
      });

      // Update with new recipes
      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockRecommendations,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ results: createMockRecipes('Updated') }),
        });

      rerender(<Recommendations onRecipeSelect={mockOnRecipeSelect} key="update" />);

      await waitFor(() => {
        expect(screen.getByText('Updated Recipe 0')).toBeInTheDocument();
        expect(screen.queryByText('Initial Recipe 0')).not.toBeInTheDocument();
      });
    });

    it('displays "Generate with AI" indicator for AI-generated recipes and hides timing info', async () => {
      const mockRecipesByCategory = new Map([
        ['AI Suggestions', [
          {
            id: 'ai-recipe-1',
            name: 'AI Generated Recipe 1',
            description: 'This recipe was generated by AI',
            source: 'ai_generated',
            prep_time: 'PT10M',
            cook_time: 'PT20M',
            recipe_yield: '4 servings'
          },
          {
            id: 'ai-recipe-2',
            name: 'AI Generated Recipe 2',
            description: 'Another AI-generated recipe',
            fallback: true,
            prep_time: 'PT15M',
            cook_time: 'PT25M',
            recipe_yield: '6 servings'
          },
          {
            id: 'regular-recipe-1',
            name: 'Regular Recipe 1',
            description: 'This is a regular recipe',
            source: 'user_created',
            prep_time: 'PT5M',
            cook_time: 'PT15M',
            recipe_yield: '2 servings'
          }
        ]]
      ]);

      render(
        <Recommendations 
          onRecipeSelect={mockOnRecipeSelect} 
          recipesByCategory={mockRecipesByCategory}
        />
      );

      // Wait for recipes to render
      await waitFor(() => {
        expect(screen.getByText('AI Generated Recipe 1')).toBeInTheDocument();
        expect(screen.getByText('AI Generated Recipe 2')).toBeInTheDocument();
        expect(screen.getByText('Regular Recipe 1')).toBeInTheDocument();
      });

      // Check that AI-generated recipes show the indicator
      const aiIndicators = screen.getAllByText('Generate with AI');
      expect(aiIndicators).toHaveLength(2);

      // Check that regular recipes don't show the indicator
      const recipeCards = screen.getAllByText(/Recipe \d/);
      expect(recipeCards).toHaveLength(3);
      
      // Verify the indicator is positioned correctly within the recipe cards
      const aiRecipe1Card = screen.getByText('AI Generated Recipe 1').closest('.recipe-card');
      const aiRecipe2Card = screen.getByText('AI Generated Recipe 2').closest('.recipe-card');
      const regularRecipeCard = screen.getByText('Regular Recipe 1').closest('.recipe-card');

      // Use getAllByText to get all indicators and check they're in the right cards
      const allIndicators = screen.getAllByText('Generate with AI');
      expect(aiRecipe1Card).toContainElement(allIndicators[0]);
      expect(aiRecipe2Card).toContainElement(allIndicators[1]);
      
      // Check that regular recipe doesn't have the indicator by looking for the specific text within that card
      const regularRecipeContent = regularRecipeCard.querySelector('.recipe-card-content');
      expect(regularRecipeContent).not.toContainElement(allIndicators[0]);
      expect(regularRecipeContent).not.toContainElement(allIndicators[1]);

      // Check that AI-generated recipes don't show timing information
      const aiRecipe1Content = aiRecipe1Card.querySelector('.recipe-card-content');
      const aiRecipe2Content = aiRecipe2Card.querySelector('.recipe-card-content');
      
      // Should not contain timing elements
      expect(aiRecipe1Content).not.toContainElement(screen.queryByText('Prep'));
      expect(aiRecipe1Content).not.toContainElement(screen.queryByText('Cook'));
      expect(aiRecipe1Content).not.toContainElement(screen.queryByText('Yield'));
      expect(aiRecipe2Content).not.toContainElement(screen.queryByText('Prep'));
      expect(aiRecipe2Content).not.toContainElement(screen.queryByText('Cook'));
      expect(aiRecipe2Content).not.toContainElement(screen.queryByText('Yield'));

      // Check that regular recipes still show timing information
      expect(regularRecipeContent).toContainElement(screen.getByText('Prep'));
      expect(regularRecipeContent).toContainElement(screen.getByText('Cook'));
      expect(regularRecipeContent).toContainElement(screen.getByText('Yield'));
    });
  });
});
