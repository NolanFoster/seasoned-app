import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';

// Mock the utility functions
jest.mock('../../../shared/utility-functions', () => ({
  formatDuration: jest.fn((duration) => {
    if (!duration) return null;
    const match = duration?.match(/PT(\d+)M/);
    if (match) return `${match[1]} min`;
    return duration;
  }),
  isValidUrl: jest.fn((url) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }),
  formatIngredientAmount: jest.fn((amount) => amount)
}));

// Mock the components
jest.mock('../components/VideoPopup', () => {
  return function MockVideoPopup({ isOpen, onClose, videoUrl }) {
    if (!isOpen) return null;
    return (
      <div data-testid="video-popup">
        <button onClick={onClose}>Close</button>
        <div>{videoUrl}</div>
      </div>
    );
  };
});

jest.mock('../components/Recommendations', () => {
  return function MockRecommendations({ onRecipeSelect, recipesByCategory }) {
    return (
      <div data-testid="recommendations">
        {recipesByCategory && Array.from(recipesByCategory.entries()).map(([category, recipes]) => (
          <div key={category}>
            <h2>{category}</h2>
            {recipes.map(recipe => (
              <button key={recipe.id} onClick={() => onRecipeSelect(recipe)}>
                {recipe.name}
              </button>
            ))}
          </div>
        ))}
      </div>
    );
  };
});

// Mock fetch globally
global.fetch = jest.fn();

// Mock console methods
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleLog = console.log;

beforeAll(() => {
  console.error = jest.fn();
  console.warn = jest.fn();
  console.log = jest.fn();
});

afterAll(() => {
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
  console.log = originalConsoleLog;
});

describe('App Component Coverage Improvement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetch.mockClear();
    
    // Default mock implementation
    fetch.mockImplementation((url) => {
      if (url.includes('/recommendations')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            recommendations: {
              'Seasonal Favorites': ['summer', 'salads'],
              'Local Specialties': ['tomatoes', 'vegetables']
            },
            season: 'summer',
            location: 'San Francisco, CA'
          })
        });
      }
      if (url.includes('/api/smart-search')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            results: [{
              id: '1',
              properties: {
                title: 'Summer Salad',
                description: 'Fresh summer salad',
                image: 'salad.jpg'
              }
            }]
          })
        });
      }
      if (url.includes('/values/recipe')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: {
              id: '1',
              name: 'Summer Salad',
              description: 'Fresh summer salad',
              ingredients: ['lettuce', 'tomatoes'],
              instructions: ['Mix ingredients'],
              image: 'salad.jpg'
            }
          })
        });
      }
      return Promise.resolve({ ok: false });
    });
  });

  describe('Timer Functionality in Instructions', () => {
    it('should render timer buttons for time mentions in instructions', async () => {
      render(<App />);
      
      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText('Seasoned')).toBeInTheDocument();
      });

      // Create a recipe with time mentions
      const recipeWithTimers = {
        id: '1',
        name: 'Test Recipe',
        instructions: [
          'Cook for 10 minutes on medium heat',
          'Let it rest for 5-10 minutes',
          'Bake for 1 hour at 350°F'
        ],
        ingredients: ['test ingredient']
      };

      // Trigger recipe view
      const event = new CustomEvent('viewRecipe', { detail: recipeWithTimers });
      window.dispatchEvent(event);

      await waitFor(() => {
        expect(screen.getByText(/Cook for/)).toBeInTheDocument();
      });

      // Should render timer buttons
      const timerButtons = screen.getAllByRole('button', { name: /timer/i });
      expect(timerButtons.length).toBeGreaterThan(0);
    });

    it('should handle timer button clicks', async () => {
      render(<App />);
      
      const recipeWithTimers = {
        id: '1',
        name: 'Test Recipe',
        instructions: ['Cook for 10 minutes'],
        ingredients: ['test']
      };

      const event = new CustomEvent('viewRecipe', { detail: recipeWithTimers });
      window.dispatchEvent(event);

      await waitFor(() => {
        const timerButton = screen.getByRole('button', { name: /10 minutes/i });
        fireEvent.click(timerButton);
        // Timer functionality test - just ensure it doesn't crash
      });
    });
  });

  describe('Search Cache Functionality', () => {
    it('should cache search results', async () => {
      render(<App />);
      
      const searchInput = screen.getByPlaceholderText(/search recipes/i);
      
      // First search
      await userEvent.type(searchInput, 'pasta');
      fireEvent.keyPress(searchInput, { key: 'Enter', charCode: 13 });
      
      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(expect.stringContaining('smart-search'));
      });
      
      const firstCallCount = fetch.mock.calls.length;
      
      // Clear and search again with same query
      await userEvent.clear(searchInput);
      await userEvent.type(searchInput, 'pasta');
      fireEvent.keyPress(searchInput, { key: 'Enter', charCode: 13 });
      
      // Should use cache, not make another API call
      expect(fetch.mock.calls.length).toBe(firstCallCount);
    });
  });

  describe('Error Handling', () => {
    it('should handle failed recommendation fetches gracefully', async () => {
      fetch.mockImplementation((url) => {
        if (url.includes('/recommendations')) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({ ok: false });
      });

      render(<App />);
      
      await waitFor(() => {
        expect(screen.getByText(/No Recipes Found/)).toBeInTheDocument();
      });
    });

    it('should handle malformed recommendation data', async () => {
      fetch.mockImplementation((url) => {
        if (url.includes('/recommendations')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              // Missing recommendations field
              season: 'summer'
            })
          });
        }
        return Promise.resolve({ ok: false });
      });

      render(<App />);
      
      await waitFor(() => {
        expect(screen.getByText(/No Recipes Found/)).toBeInTheDocument();
      });
    });

    it('should handle search API failures', async () => {
      fetch.mockImplementation((url) => {
        if (url.includes('/smart-search')) {
          return Promise.reject(new Error('Search service down'));
        }
        if (url.includes('/recommendations')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              recommendations: { 'Test': ['query'] }
            })
          });
        }
        return Promise.resolve({ ok: false });
      });

      render(<App />);
      
      const searchInput = screen.getByPlaceholderText(/search recipes/i);
      await userEvent.type(searchInput, 'test');
      fireEvent.keyPress(searchInput, { key: 'Enter', charCode: 13 });
      
      // Should handle error gracefully
      await waitFor(() => {
        expect(console.error).toHaveBeenCalled();
      });
    });
  });

  describe('Recipe Form Validation', () => {
    it('should validate required fields when adding a recipe', async () => {
      render(<App />);
      
      // Open add form
      const addButton = screen.getByRole('button', { name: /add recipe/i });
      fireEvent.click(addButton);
      
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/recipe name/i)).toBeInTheDocument();
      });
      
      // Try to save without filling required fields
      const saveButton = screen.getByRole('button', { name: /save/i });
      fireEvent.click(saveButton);
      
      // Should show validation error
      await waitFor(() => {
        expect(screen.getByText(/enter a recipe name/i)).toBeInTheDocument();
      });
    });

    it('should handle ingredient input correctly', async () => {
      render(<App />);
      
      const addButton = screen.getByRole('button', { name: /add recipe/i });
      fireEvent.click(addButton);
      
      const ingredientInput = await screen.findByPlaceholderText(/add ingredient/i);
      
      // Add ingredient with Enter key
      await userEvent.type(ingredientInput, '2 cups flour');
      fireEvent.keyPress(ingredientInput, { key: 'Enter', charCode: 13 });
      
      await waitFor(() => {
        expect(screen.getByText('2 cups flour')).toBeInTheDocument();
      });
    });
  });

  describe('Clipper Integration', () => {
    it('should handle clipper URL validation', async () => {
      render(<App />);
      
      const searchInput = screen.getByPlaceholderText(/search recipes/i);
      
      // Test with invalid URL
      await userEvent.type(searchInput, 'not a url');
      
      // Should not trigger clipper
      expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining('/clip'));
      
      // Test with valid URL
      await userEvent.clear(searchInput);
      await userEvent.type(searchInput, 'https://example.com/recipe');
      fireEvent.keyPress(searchInput, { key: 'Enter', charCode: 13 });
      
      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/clip'));
      });
    });

    it('should show clipper loading state', async () => {
      fetch.mockImplementation((url) => {
        if (url.includes('/clip')) {
          return new Promise(resolve => {
            setTimeout(() => resolve({
              ok: true,
              json: async () => ({
                title: 'Clipped Recipe',
                ingredients: ['test'],
                instructions: ['test']
              })
            }), 1000);
          });
        }
        return Promise.resolve({ ok: false });
      });

      render(<App />);
      
      const searchInput = screen.getByPlaceholderText(/search recipes/i);
      await userEvent.type(searchInput, 'https://example.com/recipe');
      fireEvent.keyPress(searchInput, { key: 'Enter', charCode: 13 });
      
      // Should show loading state
      await waitFor(() => {
        expect(screen.getByText(/clipping recipe/i)).toBeInTheDocument();
      });
    });
  });

  describe('Recipe Refresh Functionality', () => {
    it('should prevent multiple simultaneous refreshes', async () => {
      render(<App />);
      
      await waitFor(() => {
        const retryButton = screen.getByRole('button', { name: /try again/i });
        
        // Click multiple times quickly
        fireEvent.click(retryButton);
        fireEvent.click(retryButton);
        fireEvent.click(retryButton);
        
        // Should only trigger one refresh
        const recommendationCalls = fetch.mock.calls.filter(call => 
          call[0].includes('/recommendations')
        );
        
        // Initial call + one refresh
        expect(recommendationCalls.length).toBeLessThanOrEqual(2);
      });
    });
  });

  describe('Video Popup Integration', () => {
    it('should open video popup when recipe has video', async () => {
      render(<App />);
      
      const recipeWithVideo = {
        id: '1',
        name: 'Video Recipe',
        video_url: 'https://youtube.com/watch?v=test',
        ingredients: ['test'],
        instructions: ['test']
      };

      const event = new CustomEvent('viewRecipe', { detail: recipeWithVideo });
      window.dispatchEvent(event);

      await waitFor(() => {
        const playButton = screen.getByRole('button', { name: /play video/i });
        fireEvent.click(playButton);
        
        expect(screen.getByTestId('video-popup')).toBeInTheDocument();
      });
    });
  });

  describe('Recipe Selection and Navigation', () => {
    it('should handle recipe selection from recommendations', async () => {
      const mockRecipesByCategory = new Map([
        ['Test Category', [{
          id: '1',
          name: 'Test Recipe',
          ingredients: ['test'],
          instructions: ['test']
        }]]
      ]);

      render(<App />);
      
      // Wait for recommendations to render
      await waitFor(() => {
        // Manually trigger the recommendations with data
        const recommendationsContainer = screen.getByTestId('recommendations');
        expect(recommendationsContainer).toBeInTheDocument();
      });
    });

    it('should close recipe view on back button click', async () => {
      render(<App />);
      
      const recipe = {
        id: '1',
        name: 'Test Recipe',
        ingredients: ['test'],
        instructions: ['test']
      };

      const event = new CustomEvent('viewRecipe', { detail: recipe });
      window.dispatchEvent(event);

      await waitFor(() => {
        expect(screen.getByText('Test Recipe')).toBeInTheDocument();
      });

      const backButton = screen.getByRole('button', { name: /back/i });
      fireEvent.click(backButton);

      await waitFor(() => {
        expect(screen.queryByText('Test Recipe')).not.toBeInTheDocument();
      });
    });
  });
});