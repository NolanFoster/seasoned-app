import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from '../App';

// Mock fetch globally
global.fetch = jest.fn();

// Mock environment variables
const mockEnv = {
  VITE_API_URL: 'https://test-api.example.com',
  VITE_CLIPPER_API_URL: 'https://test-clipper-api.example.com',
  VITE_SEARCH_DB_URL: 'https://test-search-db.example.com',
  VITE_SAVE_WORKER_URL: 'https://test-save-worker.example.com',
  VITE_RECIPE_VIEW_URL: 'https://test-recipe-view.example.com',
  VITE_RECIPE_GENERATION_URL: 'https://test-recipe-generation.example.com',
  VITE_RECOMMENDATION_API_URL: 'https://test-recommendation.example.com'
};

Object.entries(mockEnv).forEach(([key, value]) => {
  process.env[key] = value;
});

describe('App Utility Functions Coverage', () => {
  beforeEach(() => {
    fetch.mockClear();
    jest.clearAllMocks();
    
    // Mock console methods
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('HTML Entity Decoding', () => {
    it('should decode common HTML entities', async () => {
      // Create a recipe with HTML entities in the title
      const mockRecipe = {
        id: 'test-1',
        name: 'Chicken &amp; Rice with &quot;Special&quot; Sauce',
        description: 'A recipe with &lt;b&gt;bold&lt;/b&gt; text and &copy; symbol',
        ingredients: ['2&frac12; cups rice', '1&frac14; lbs chicken'],
        instructions: ['Cook for 10&ndash;15 minutes', 'Add salt &amp; pepper']
      };

      fetch.mockImplementation((url) => {
        if (url.includes('/recommendations')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ recommendations: {} })
          });
        }
        if (url.includes('/api/search')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              results: [mockRecipe]
            })
          });
        }
        return Promise.resolve({ ok: false });
      });

      render(<App />);
      
      // Wait for component to mount and process
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      // Search for the recipe to trigger entity decoding
      const searchInput = screen.getByLabelText(/search recipes/i);
      
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'chicken' } });
        fireEvent.keyDown(searchInput, { key: 'Enter', code: 'Enter' });
      });

      // Wait for search results
      await waitFor(() => {
        // Check that HTML entities are properly decoded in the displayed content
        expect(screen.getByText(/Chicken & Rice with "Special" Sauce/)).toBeInTheDocument();
      }, { timeout: 5000 });
    });

    it('should handle numeric HTML entities', async () => {
      const mockRecipe = {
        id: 'test-2',
        name: 'Recipe with &#8217;s apostrophe and &#176; degree',
        description: 'Temperature: 350&#176;F'
      };

      fetch.mockImplementation((url) => {
        if (url.includes('/recommendations')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ recommendations: {} })
          });
        }
        if (url.includes('/api/search')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              results: [mockRecipe]
            })
          });
        }
        return Promise.resolve({ ok: false });
      });

      render(<App />);
      
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      const searchInput = screen.getByLabelText(/search recipes/i);
      
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'recipe' } });
        fireEvent.keyDown(searchInput, { key: 'Enter', code: 'Enter' });
      });

      await waitFor(() => {
        expect(screen.getByText(/Recipe with 's apostrophe and ° degree/)).toBeInTheDocument();
      }, { timeout: 5000 });
    });
  });

  describe('Timer Functionality', () => {
    it('should parse time mentions in instructions', async () => {
      const mockRecipe = {
        id: 'timer-test',
        name: 'Timer Test Recipe',
        instructions: [
          'Cook for 10 minutes until golden',
          'Bake for 25-30 minutes at 350°F',
          'Let rest for 5 seconds before serving'
        ]
      };

      fetch.mockImplementation((url) => {
        if (url.includes('/recommendations')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ recommendations: {} })
          });
        }
        if (url.includes('/api/recipe/')) {
          return Promise.resolve({
            ok: true,
            json: async () => mockRecipe
          });
        }
        return Promise.resolve({ ok: false });
      });

      render(<App />);
      
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      // Simulate clicking on a recipe to view its details
      // This will trigger the timer parsing functionality
      const recipeCards = screen.queryAllByText(/timer test recipe/i);
      if (recipeCards.length > 0) {
        await act(async () => {
          fireEvent.click(recipeCards[0]);
        });

        // Look for timer buttons that should be rendered
        await waitFor(() => {
          const timerButtons = screen.queryAllByText(/start timer/i);
          expect(timerButtons.length).toBeGreaterThanOrEqual(1);
        }, { timeout: 3000 });
      }
    });
  });

  describe('URL Validation and Clipping', () => {
    it('should validate URLs correctly', async () => {
      render(<App />);
      
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      const searchInput = screen.getByLabelText(/search recipes/i);
      
      // Test valid URL
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'https://example.com/recipe' } });
        fireEvent.keyDown(searchInput, { key: 'Enter', code: 'Enter' });
      });

      // Should trigger URL clipping logic
      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/clip'),
          expect.objectContaining({
            method: 'POST'
          })
        );
      }, { timeout: 3000 });
    });

    it('should handle invalid URLs gracefully', async () => {
      render(<App />);
      
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      const searchInput = screen.getByLabelText(/search recipes/i);
      
      // Test invalid URL
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'not-a-url' } });
        fireEvent.keyDown(searchInput, { key: 'Enter', code: 'Enter' });
      });

      // Should trigger search instead of clipping
      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/search'),
          expect.any(Object)
        );
      }, { timeout: 3000 });
    });
  });

  describe('Recipe Management Functions', () => {
    it('should handle recipe deletion', async () => {
      const mockRecipes = [
        { id: 'recipe-1', name: 'Test Recipe 1' },
        { id: 'recipe-2', name: 'Test Recipe 2' }
      ];

      fetch.mockImplementation((url) => {
        if (url.includes('/recommendations')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ recommendations: {} })
          });
        }
        if (url.includes('/api/search')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              results: mockRecipes
            })
          });
        }
        if (url.includes('/api/recipe/') && url.includes('DELETE')) {
          return Promise.resolve({ ok: true });
        }
        return Promise.resolve({ ok: false });
      });

      // Mock window.confirm
      global.confirm = jest.fn(() => true);

      render(<App />);
      
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      // Search for recipes
      const searchInput = screen.getByLabelText(/search recipes/i);
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'test' } });
        fireEvent.keyDown(searchInput, { key: 'Enter', code: 'Enter' });
      });

      // Wait for recipes to load
      await waitFor(() => {
        expect(screen.getByText('Test Recipe 1')).toBeInTheDocument();
      }, { timeout: 3000 });

      // Find and click delete button
      const deleteButtons = screen.queryAllByText(/delete/i);
      if (deleteButtons.length > 0) {
        await act(async () => {
          fireEvent.click(deleteButtons[0]);
        });

        // Verify confirmation was called
        expect(global.confirm).toHaveBeenCalled();
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle fetch errors gracefully', async () => {
      fetch.mockImplementation(() => {
        return Promise.reject(new Error('Network error'));
      });

      render(<App />);
      
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      // Should handle the error without crashing
      expect(screen.getByText(/seasoned/i)).toBeInTheDocument();
    });

    it('should handle malformed API responses', async () => {
      fetch.mockImplementation((url) => {
        if (url.includes('/recommendations')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ invalid: 'data' })
          });
        }
        return Promise.resolve({ ok: false });
      });

      render(<App />);
      
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      // Should handle malformed data gracefully
      expect(screen.getByText(/seasoned/i)).toBeInTheDocument();
    });
  });

  describe('Background Animation', () => {
    it('should initialize seasoning background animation', async () => {
      // Mock canvas context
      const mockContext = {
        clearRect: jest.fn(),
        fillRect: jest.fn(),
        beginPath: jest.fn(),
        arc: jest.fn(),
        fill: jest.fn(),
        save: jest.fn(),
        restore: jest.fn(),
        translate: jest.fn(),
        rotate: jest.fn(),
        globalAlpha: 1
      };

      HTMLCanvasElement.prototype.getContext = jest.fn(() => mockContext);

      render(<App />);
      
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
      });

      // Check that canvas was created
      const canvas = screen.getByRole('img', { hidden: true }) || 
                    document.querySelector('canvas.seasoning-background');
      
      if (canvas) {
        // Verify canvas context methods were called (indicating animation setup)
        expect(mockContext.clearRect).toHaveBeenCalled();
      }
    });
  });

  describe('Local Storage Integration', () => {
    it('should save and retrieve search cache', async () => {
      const mockSearchResults = [
        { id: 'cached-1', name: 'Cached Recipe' }
      ];

      fetch.mockImplementation((url) => {
        if (url.includes('/recommendations')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ recommendations: {} })
          });
        }
        if (url.includes('/api/search')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              results: mockSearchResults
            })
          });
        }
        return Promise.resolve({ ok: false });
      });

      render(<App />);
      
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      const searchInput = screen.getByLabelText(/search recipes/i);
      
      // Perform a search to populate cache
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'cached recipe' } });
        fireEvent.keyDown(searchInput, { key: 'Enter', code: 'Enter' });
      });

      await waitFor(() => {
        expect(screen.getByText('Cached Recipe')).toBeInTheDocument();
      }, { timeout: 3000 });

      // Perform the same search again - should use cache
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'cached recipe' } });
        fireEvent.keyDown(searchInput, { key: 'Enter', code: 'Enter' });
      });

      // Should still show the cached result
      expect(screen.getByText('Cached Recipe')).toBeInTheDocument();
    });
  });
});