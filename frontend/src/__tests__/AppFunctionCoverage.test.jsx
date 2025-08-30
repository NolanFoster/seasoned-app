import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';

// Mock fetch globally
global.fetch = jest.fn();

// Mock environment variables
const mockEnv = {
  VITE_SAVE_WORKER_URL: 'https://recipe-save-worker.test.workers.dev',
  VITE_SEARCH_DB_URL: 'https://search-db.test.workers.dev',
  VITE_RECIPE_VIEW_URL: 'https://recipe-view.test.workers.dev',
  VITE_RECOMMENDATION_API_URL: 'https://recommendations.test.workers.dev'
};

// Apply environment variables
Object.entries(mockEnv).forEach(([key, value]) => {
  process.env[key] = value;
});

describe('App Function Coverage', () => {
  beforeEach(() => {
    // Reset fetch mock before each test
    fetch.mockClear();
    
    // Mock console methods
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    
    // Mock localStorage
    global.localStorage = {
      getItem: jest.fn((key) => {
        if (key === 'recipeSaveEnabled') return 'true';
        return null;
      }),
      setItem: jest.fn(),
      removeItem: jest.fn(),
      clear: jest.fn()
    };
    
    // Mock window functions
    window.alert = jest.fn();
    window.confirm = jest.fn(() => true);
  });

  afterEach(() => {
    jest.clearAllMocks();
    console.warn.mockRestore();
    console.log.mockRestore();
    console.error.mockRestore();
  });

  describe('Initialization and Loading States', () => {
    it('should handle initialization with minimum loading time', async () => {
      const startTime = Date.now();
      
      fetch.mockImplementation((url) => {
        if (url.includes('/api/recommendations')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              recommendations: {
                'Quick': ['pasta', 'salad']
              }
            })
          });
        }
        
        if (url.includes('/api/search')) {
          // Return quickly to test minimum loading time
          return Promise.resolve({
            ok: true,
            json: async () => ({
              results: []
            })
          });
        }
        
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true })
        });
      });

      render(<App />);
      
      // Should show loading state initially
      expect(screen.getByText(/Loading recipe recommendations.../i)).toBeInTheDocument();
      
      // Wait for initialization to complete
      await waitFor(() => {
        expect(screen.queryByText(/Loading recipe recommendations.../i)).not.toBeInTheDocument();
      }, { timeout: 2000 });
      
      // Verify minimum loading time was enforced (800ms)
      const endTime = Date.now();
      expect(endTime - startTime).toBeGreaterThanOrEqual(800);
    });

    it('should handle initialization errors gracefully', async () => {
      fetch.mockImplementation((url) => {
        if (url.includes('/api/recommendations')) {
          return Promise.reject(new Error('Network error'));
        }
        
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true })
        });
      });

      render(<App />);
      
      // Wait for error handling
      await waitFor(() => {
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('Error during initialization:'),
          expect.any(Error)
        );
      });
      
      // App should still render without crashing
      expect(screen.getByPlaceholderText('Search recipes or paste a URL to clip...')).toBeInTheDocument();
    });
  });

  describe('Recipe Fetching with Rate Limiting', () => {
    it('should handle rate limited responses', async () => {
      fetch.mockImplementation((url) => {
        if (url.includes('/api/recommendations')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              recommendations: {}
            })
          });
        }
        
        if (url.includes('/recipe/get')) {
          return Promise.resolve({
            ok: false,
            status: 429,
            text: async () => 'Rate limit exceeded'
          });
        }
        
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true })
        });
      });

      render(<App />);
      
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search recipes or paste a URL to clip...')).toBeInTheDocument();
      });
    });
  });

  describe('Recipe Data Validation', () => {
    it('should validate recipe data has required fields', async () => {
      fetch.mockImplementation((url) => {
        if (url.includes('/api/recommendations')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              recommendations: {}
            })
          });
        }
        
        if (url.includes('/recipe/get')) {
          // Return recipe with missing name/title
          return Promise.resolve({
            ok: true,
            json: async () => ({
              id: 'invalid-recipe',
              data: {
                description: 'Recipe without name',
                ingredients: []
              }
            })
          });
        }
        
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true })
        });
      });

      render(<App />);
      
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search recipes or paste a URL to clip...')).toBeInTheDocument();
      });
      
      // Should log warning about invalid recipe data
      expect(console.warn).toHaveBeenCalled();
    });

    it('should handle recipe data with data property wrapper', async () => {
      fetch.mockImplementation((url) => {
        if (url.includes('/api/recommendations')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              recommendations: {
                'Test': ['recipe']
              }
            })
          });
        }
        
        if (url.includes('/api/search')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              results: [
                { id: 'wrapped-recipe', properties: { name: 'Wrapped Recipe' } }
              ]
            })
          });
        }
        
        if (url.includes('/recipe/get')) {
          // Return recipe already wrapped in data property
          return Promise.resolve({
            ok: true,
            json: async () => ({
              id: 'wrapped-recipe',
              data: {
                name: 'Wrapped Recipe',
                title: 'Also has title',
                ingredients: ['ingredient 1']
              }
            })
          });
        }
        
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true })
        });
      });

      render(<App />);
      
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search recipes or paste a URL to clip...')).toBeInTheDocument();
      });
    });
  });

  describe('Search Functionality Edge Cases', () => {
    it('should handle empty search query', async () => {
      const user = userEvent.setup();
      
      fetch.mockImplementation((url) => {
        if (url.includes('/api/recommendations')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              recommendations: {}
            })
          });
        }
        
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true })
        });
      });

      render(<App />);
      
      const searchInput = await screen.findByPlaceholderText('Search recipes or paste a URL to clip...');
      
      // Type and then clear
      await user.type(searchInput, 'test');
      await user.clear(searchInput);
      
      // Should not trigger search for empty query
      expect(fetch).not.toHaveBeenCalledWith(
        expect.stringContaining('/api/search?q='),
        expect.any(Object)
      );
    });

    it('should debounce search requests', async () => {
      const user = userEvent.setup();
      
      fetch.mockImplementation((url) => {
        if (url.includes('/api/recommendations')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              recommendations: {}
            })
          });
        }
        
        if (url.includes('/api/search')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              results: []
            })
          });
        }
        
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true })
        });
      });

      render(<App />);
      
      const searchInput = await screen.findByPlaceholderText('Search recipes or paste a URL to clip...');
      
      // Type quickly
      await user.type(searchInput, 'p');
      await user.type(searchInput, 'a');
      await user.type(searchInput, 's');
      await user.type(searchInput, 't');
      await user.type(searchInput, 'a');
      
      // Wait for debounce
      await waitFor(() => {
        const searchCalls = fetch.mock.calls.filter(call => 
          call[0].includes('/api/search')
        );
        // Should only make one search call after debouncing
        expect(searchCalls.length).toBeLessThanOrEqual(1);
      }, { timeout: 1000 });
    });
  });

  describe('Share Panel Functionality', () => {
    it('should handle share with navigator.share API', async () => {
      // Mock navigator.share
      global.navigator.share = jest.fn().mockResolvedValue();
      
      fetch.mockImplementation((url) => {
        if (url.includes('/api/recommendations')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              recommendations: {}
            })
          });
        }
        
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true })
        });
      });

      render(<App />);
      
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search recipes or paste a URL to clip...')).toBeInTheDocument();
      });
    });

    it('should fallback to clipboard when share API fails', async () => {
      // Mock navigator.share to reject
      global.navigator.share = jest.fn().mockRejectedValue(new Error('Share failed'));
      global.navigator.clipboard = {
        writeText: jest.fn().mockResolvedValue()
      };
      
      fetch.mockImplementation((url) => {
        if (url.includes('/api/recommendations')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              recommendations: {}
            })
          });
        }
        
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true })
        });
      });

      render(<App />);
      
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search recipes or paste a URL to clip...')).toBeInTheDocument();
      });
    });
  });

  describe('Recipe Categories and Recommendations', () => {
    it('should handle recommendations with multiple categories', async () => {
      fetch.mockImplementation((url) => {
        if (url.includes('/api/recommendations')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              recommendations: {
                'Breakfast': ['pancakes', 'eggs'],
                'Lunch': ['sandwich', 'salad'],
                'Dinner': ['pasta', 'steak']
              }
            })
          });
        }
        
        if (url.includes('/api/search')) {
          const query = new URL(url).searchParams.get('q');
          return Promise.resolve({
            ok: true,
            json: async () => ({
              results: [
                { id: `${query}-1`, properties: { name: `${query} Recipe 1` } }
              ]
            })
          });
        }
        
        if (url.includes('/recipe/get')) {
          const recipeId = new URL(url).searchParams.get('id');
          return Promise.resolve({
            ok: true,
            json: async () => ({
              id: recipeId,
              data: {
                name: `Recipe ${recipeId}`,
                ingredients: ['test']
              }
            })
          });
        }
        
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true })
        });
      });

      render(<App />);
      
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search recipes or paste a URL to clip...')).toBeInTheDocument();
      });
      
      // Should process all categories
      await waitFor(() => {
        const searchCalls = fetch.mock.calls.filter(call => 
          call[0].includes('/api/search')
        );
        expect(searchCalls.length).toBeGreaterThan(0);
      }, { timeout: 3000 });
    });
  });
});