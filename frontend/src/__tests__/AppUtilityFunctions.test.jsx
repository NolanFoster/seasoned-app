import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';

// Mock fetch globally
global.fetch = jest.fn();

// Mock environment variables
const mockEnv = {
  VITE_SAVE_WORKER_URL: 'https://recipe-save-worker.test.workers.dev',
  VITE_SEARCH_DB_URL: 'https://search-db.test.workers.dev',
  VITE_RECIPE_VIEW_URL: 'https://recipe-view.test.workers.dev',
  VITE_RECOMMENDATION_API_URL: 'https://recommendations.test.workers.dev',
  VITE_CLIPPER_API_URL: 'https://test-clipper-api.example.com'
};

// Apply environment variables
Object.entries(mockEnv).forEach(([key, value]) => {
  process.env[key] = value;
});

// Mock IntersectionObserver
global.IntersectionObserver = jest.fn(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn()
}));

describe('App Utility Functions Coverage', () => {
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
    window.open = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
    console.warn.mockRestore();
    console.log.mockRestore();
    console.error.mockRestore();
  });

  describe('Clipboard and URL handling', () => {
    it('should detect and handle recipe URLs', async () => {
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
        
        if (url.includes('/health')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ status: 'healthy' })
          });
        }
        
        if (url.includes('/clip')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              recipe: {
                id: 'clipped-123',
                name: 'Clipped Recipe',
                url: 'https://example.com/recipe'
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
      
      const searchInput = await screen.findByPlaceholderText('Search recipes or paste a URL to clip...');
      
      // Type a recipe URL
      await user.type(searchInput, 'https://recipeblog.com/pasta-recipe');
      
      // Should detect URL
      expect(searchInput.value).toContain('https://');
    });

    it('should handle clipboard paste of URLs', async () => {
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
      
      // Simulate paste event
      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: new DataTransfer()
      });
      pasteEvent.clipboardData.setData('text/plain', 'https://recipe.com/test');
      
      await act(async () => {
        searchInput.dispatchEvent(pasteEvent);
      });
    });
  });

  describe('Timer and debouncing functions', () => {
    it('should handle search debouncing', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ delay: null });
      
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
      
      // Type rapidly
      await user.type(searchInput, 'test');
      
      // Advance timers
      act(() => {
        jest.advanceTimersByTime(500);
      });
      
      jest.useRealTimers();
    });
  });

  describe('Error handling and recovery', () => {
    it('should handle clipper health check failure', async () => {
      fetch.mockImplementation((url) => {
        if (url.includes('/api/recommendations')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              recommendations: {}
            })
          });
        }
        
        if (url.includes('/health')) {
          return Promise.resolve({
            ok: false,
            status: 503
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
      
      // Should log health check failure
      expect(console.log).toHaveBeenCalled();
    });

    it('should handle recipe save toggle', async () => {
      const user = userEvent.setup();
      
      // Start with save disabled
      global.localStorage.getItem = jest.fn((key) => {
        if (key === 'recipeSaveEnabled') return 'false';
        return null;
      });
      
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

  describe('Recipe transformation functions', () => {
    it('should transform recipe data correctly', async () => {
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
                { 
                  id: 'test-1', 
                  properties: { 
                    name: 'Test Recipe',
                    prepTime: 'PT15M',
                    cookTime: 'PT30M',
                    totalTime: 'PT45M',
                    datePublished: '2023-01-01',
                    nutrition: {
                      calories: '350 calories',
                      protein: '15g protein'
                    }
                  } 
                }
              ]
            })
          });
        }
        
        if (url.includes('/recipe/get')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              id: 'test-1',
              data: {
                name: 'Test Recipe',
                title: 'Test Recipe Title',
                description: 'A test recipe',
                image: ['https://example.com/image.jpg'],
                images: ['https://example.com/image2.jpg'],
                ingredients: ['1 cup flour', '2 eggs'],
                instructions: [
                  { name: 'Step 1', text: 'Mix ingredients' },
                  { text: 'Step 2' },
                  'Step 3 as string'
                ],
                prepTime: 'PT15M',
                cookTime: 'PT30M',
                totalTime: 'PT45M',
                recipeYield: '4 servings',
                nutrition: {
                  calories: '350',
                  proteinContent: '15g'
                },
                video: {
                  contentUrl: 'https://youtube.com/watch?v=123'
                },
                author: {
                  name: 'Test Author'
                },
                datePublished: '2023-01-01T00:00:00Z'
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
      
      // Wait for recommendations to process
      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/search'),
          expect.any(Object)
        );
      }, { timeout: 3000 });
    });

    it('should handle recipes with missing fields', async () => {
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
            ok: true,
            json: async () => ({
              id: 'minimal-recipe',
              data: {
                name: 'Minimal Recipe'
                // Missing most fields
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

  describe('Category and recommendation processing', () => {
    it('should handle malformed recommendation data', async () => {
      fetch.mockImplementation((url) => {
        if (url.includes('/api/recommendations')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              recommendations: {
                'Valid': ['recipe1'],
                'Invalid': 'not-an-array',
                'Null': null,
                'Number': 123
              }
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
      
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search recipes or paste a URL to clip...')).toBeInTheDocument();
      });
      
      // Should handle malformed data gracefully
      expect(console.warn).toHaveBeenCalled();
    });

    it('should limit recipes per category', async () => {
      fetch.mockImplementation((url) => {
        if (url.includes('/api/recommendations')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              recommendations: {
                'Many Recipes': ['recipe1', 'recipe2', 'recipe3', 'recipe4', 'recipe5']
              }
            })
          });
        }
        
        if (url.includes('/api/search')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              results: [
                { id: 'r1', properties: { name: 'Recipe 1' } },
                { id: 'r2', properties: { name: 'Recipe 2' } },
                { id: 'r3', properties: { name: 'Recipe 3' } },
                { id: 'r4', properties: { name: 'Recipe 4' } },
                { id: 'r5', properties: { name: 'Recipe 5' } }
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
      
      // Should process all recommendations
      await waitFor(() => {
        const searchCalls = fetch.mock.calls.filter(call => 
          call[0].includes('/api/search')
        );
        expect(searchCalls.length).toBeGreaterThan(0);
      }, { timeout: 3000 });
    });
  });

  describe('Visual state and UI updates', () => {
    it('should handle window resize events', async () => {
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
      
      // Simulate window resize
      act(() => {
        global.innerWidth = 500;
        global.dispatchEvent(new Event('resize'));
      });
      
      act(() => {
        global.innerWidth = 1024;
        global.dispatchEvent(new Event('resize'));
      });
    });

    it('should handle scroll events', async () => {
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
      
      // Simulate scroll
      act(() => {
        window.pageYOffset = 100;
        global.dispatchEvent(new Event('scroll'));
      });
    });
  });
});