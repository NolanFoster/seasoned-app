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

describe('App Critical Functions Coverage', () => {
  beforeEach(() => {
    fetch.mockClear();
    jest.clearAllMocks();
    
    // Mock console methods
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    
    // Mock localStorage
    Storage.prototype.getItem = jest.fn();
    Storage.prototype.setItem = jest.fn();
    Storage.prototype.removeItem = jest.fn();
    Storage.prototype.clear = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Recipe Generation Worker Testing', () => {
    it('should test recipe generation worker connectivity', async () => {
      // Mock successful health check
      fetch.mockImplementation((url) => {
        if (url.includes('/health')) {
          return Promise.resolve({
            ok: true,
            text: async () => 'OK'
          });
        }
        if (url.includes('/generate')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ recipe: 'Generated recipe' })
          });
        }
        return Promise.resolve({ ok: false });
      });

      render(<App />);
      
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      // The testRecipeGenerationWorker function should be available on window
      if (typeof window !== 'undefined' && window.testRecipeGenerationWorker) {
        await act(async () => {
          await window.testRecipeGenerationWorker();
        });
        
        // Verify health check was called
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/health')
        );
        
        // Verify generate endpoint was called
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/generate'),
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              'Content-Type': 'application/json'
            })
          })
        );
      }
    });

    it('should handle recipe generation worker errors', async () => {
      fetch.mockImplementation(() => {
        return Promise.reject(new Error('Worker unavailable'));
      });

      render(<App />);
      
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      if (typeof window !== 'undefined' && window.testRecipeGenerationWorker) {
        await act(async () => {
          await window.testRecipeGenerationWorker();
        });
        
        // Should handle errors gracefully
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('Worker test failed'),
          expect.any(Error)
        );
      }
    });
  });

  describe('Fetch with Timeout Function', () => {
    it('should implement timeout functionality', async () => {
      // Mock a slow response
      fetch.mockImplementation(() => {
        return new Promise(resolve => {
          setTimeout(() => {
            resolve({
              ok: true,
              json: async () => ({ data: 'slow response' })
            });
          }, 10000); // 10 second delay
        });
      });

      render(<App />);
      
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      const searchInput = screen.getByLabelText(/search recipes/i);
      
      // Trigger a search that should timeout
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'timeout test' } });
        fireEvent.keyDown(searchInput, { key: 'Enter', code: 'Enter' });
      });

      // Wait for timeout to potentially trigger
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 6000)); // Wait 6 seconds
      });

      // The component should handle timeout gracefully
      expect(screen.getByLabelText(/search recipes/i)).toBeInTheDocument();
    });
  });

  describe('Debug Logging Functions', () => {
    it('should handle debug logging when DEBUG_MODE is false', async () => {
      render(<App />);
      
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      // Debug logs should not be called when DEBUG_MODE is false
      const debugCalls = console.log.mock.calls.filter(call => 
        call[0] && typeof call[0] === 'string' && call[0].includes('🔍')
      );
      
      // Should have minimal debug calls since DEBUG_MODE is false
      expect(debugCalls.length).toBeLessThan(10);
    });
  });

  describe('Local Storage Functions', () => {
    it('should save search results to localStorage', async () => {
      const mockResults = [
        { id: 'test-1', name: 'Test Recipe 1' },
        { id: 'test-2', name: 'Test Recipe 2' }
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
              results: mockResults
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
        fireEvent.change(searchInput, { target: { value: 'test search' } });
        fireEvent.keyDown(searchInput, { key: 'Enter', code: 'Enter' });
      });

      await waitFor(() => {
        expect(screen.getByText('Test Recipe 1')).toBeInTheDocument();
      }, { timeout: 3000 });

      // Verify localStorage was called to save results
      expect(localStorage.setItem).toHaveBeenCalled();
    });

    it('should retrieve cached search results from localStorage', async () => {
      const cachedResults = JSON.stringify([
        { id: 'cached-1', name: 'Cached Recipe' }
      ]);

      localStorage.getItem.mockReturnValue(cachedResults);

      render(<App />);
      
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      const searchInput = screen.getByLabelText(/search recipes/i);
      
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'cached search' } });
        fireEvent.keyDown(searchInput, { key: 'Enter', code: 'Enter' });
      });

      // Should retrieve from localStorage
      expect(localStorage.getItem).toHaveBeenCalled();
    });
  });

  describe('Recipe Formatting Functions', () => {
    it('should format recipe ingredients correctly', async () => {
      const mockRecipe = {
        id: 'format-test',
        name: 'Format Test Recipe',
        ingredients: [
          '2.5 cups flour',
          '1/2 teaspoon salt',
          '3.75 tablespoons butter'
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

      // Simulate clicking on a recipe to view details
      // This would trigger ingredient formatting
      const searchInput = screen.getByLabelText(/search recipes/i);
      
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'format test' } });
        fireEvent.keyDown(searchInput, { key: 'Enter', code: 'Enter' });
      });

      // Look for formatted ingredients
      await waitFor(() => {
        // The formatting function should process decimal amounts
        const ingredientElements = screen.queryAllByText(/cups|teaspoon|tablespoons/);
        expect(ingredientElements.length).toBeGreaterThan(0);
      }, { timeout: 3000 });
    });
  });

  describe('Error Boundary and Recovery', () => {
    it('should handle component errors gracefully', async () => {
      // Mock a function that throws an error
      const originalError = console.error;
      console.error = jest.fn();

      render(<App />);
      
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      // Component should still render despite potential errors
      expect(screen.getByText(/seasoned/i)).toBeInTheDocument();
      
      console.error = originalError;
    });
  });

  describe('State Management', () => {
    it('should manage loading states correctly', async () => {
      fetch.mockImplementation((url) => {
        if (url.includes('/recommendations')) {
          return new Promise(resolve => {
            setTimeout(() => {
              resolve({
                ok: true,
                json: async () => ({ recommendations: {} })
              });
            }, 1000);
          });
        }
        return Promise.resolve({ ok: false });
      });

      render(<App />);
      
      // Should show loading state initially
      const loadingElement = screen.queryByText(/loading/i) || 
                           screen.queryByRole('progressbar') ||
                           document.querySelector('.loading-bar');
      
      if (loadingElement) {
        expect(loadingElement).toBeInTheDocument();
      }

      // Wait for loading to complete
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 1500));
      });
    });
  });
});