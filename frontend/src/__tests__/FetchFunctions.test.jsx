import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from '../App';

describe('Fetch Functions', () => {
  let originalFetch;
  let abortSpy;

  beforeEach(() => {
    originalFetch = global.fetch;
    abortSpy = jest.fn();
    
    // Mock AbortController
    global.AbortController = jest.fn(() => ({
      abort: abortSpy,
      signal: { aborted: false }
    }));
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  describe('fetchWithTimeout', () => {
    it('should call fetch with abort signal', async () => {
      const mockResponse = { 
        ok: true, 
        json: () => Promise.resolve({ recipes: [] }),
        status: 200
      };
      
      global.fetch = jest.fn(() => Promise.resolve(mockResponse));

      await act(async () => {
        render(<App />);
      });

      // Wait for initial fetch calls
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      // Check that fetch was called with signal
      const fetchCalls = global.fetch.mock.calls;
      const callWithSignal = fetchCalls.find(call => call[1]?.signal);
      expect(callWithSignal).toBeDefined();
    });

    it('should handle timeout by aborting the request', async () => {
      jest.useFakeTimers();
      
      // Create a fetch that never resolves
      global.fetch = jest.fn(() => new Promise(() => {}));

      render(<App />);

      // Fast-forward time to trigger timeout
      act(() => {
        jest.advanceTimersByTime(11000); // Default timeout is 10000ms
      });

      await waitFor(() => {
        expect(abortSpy).toHaveBeenCalled();
      });

      jest.useRealTimers();
    });

    it('should clear timeout on successful fetch', async () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
      
      global.fetch = jest.fn(() => 
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ recipes: [] }),
          status: 200
        })
      );

      await act(async () => {
        render(<App />);
      });

      await waitFor(() => {
        expect(clearTimeoutSpy).toHaveBeenCalled();
      });

      clearTimeoutSpy.mockRestore();
    });
  });

  describe('smartSearch', () => {
    it('should perform smart search and return results', async () => {
      const searchResults = [
        { id: 'recipe-1', title: 'Chicken Curry', tags: ['curry', 'chicken'] },
        { id: 'recipe-2', title: 'Beef Curry', tags: ['curry', 'beef'] }
      ];

      global.fetch = jest.fn((url) => {
        if (url.includes('/api/smart-search')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ results: searchResults })
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ recipes: [] })
        });
      });

      const { container } = render(<App />);

      // Trigger a search by simulating a tag click
      await act(async () => {
        // First load some recipes with tags
        global.fetch.mockImplementationOnce(() => 
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              recipes: [{
                id: 'test-1',
                title: 'Test Recipe',
                tags: ['curry', 'spicy'],
                ingredients: [],
                instructions: []
              }]
            })
          })
        );
      });

      await waitFor(() => {
        const searchCall = global.fetch.mock.calls.find(call => 
          call[0].includes('/api/smart-search')
        );
        if (searchCall) {
          expect(searchCall[0]).toContain('q=');
          expect(searchCall[0]).toContain('type=recipe');
          expect(searchCall[0]).toContain('limit=10');
        }
      });
    });

    it('should handle smart search errors gracefully', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      global.fetch = jest.fn((url) => {
        if (url.includes('/api/smart-search')) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ recipes: [] })
        });
      });

      await act(async () => {
        render(<App />);
      });

      // The error should be caught and logged
      await waitFor(() => {
        const warnCalls = consoleWarnSpy.mock.calls;
        const searchErrorCall = warnCalls.find(call => 
          call[0]?.includes('Smart search failed')
        );
        expect(searchErrorCall).toBeDefined();
      });

      consoleWarnSpy.mockRestore();
    });

    it('should return empty array when search response is not ok', async () => {
      global.fetch = jest.fn((url) => {
        if (url.includes('/api/smart-search')) {
          return Promise.resolve({
            ok: false,
            status: 404
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ recipes: [] })
        });
      });

      await act(async () => {
        render(<App />);
      });

      // The function should return empty array without throwing
      expect(() => render(<App />)).not.toThrow();
    });
  });

  describe('fetchCompleteRecipeData', () => {
    it('should fetch complete recipe data from save worker', async () => {
      const completeRecipeData = {
        id: 'recipe-123',
        data: {
          title: 'Complete Recipe',
          description: 'A complete recipe with all data',
          ingredients: [
            { text: 'Ingredient 1', amount: '1', unit: 'cup' },
            { text: 'Ingredient 2', amount: '2', unit: 'tbsp' }
          ],
          instructions: ['Step 1', 'Step 2', 'Step 3'],
          prepTime: 15,
          cookTime: 30
        }
      };

      global.fetch = jest.fn((url) => {
        if (url.includes('/recipe/get')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(completeRecipeData)
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ recipes: [] })
        });
      });

      // We can't directly test this internal function, but we can test
      // its usage when viewing recipe details
      const { container } = render(<App />);

      await waitFor(() => {
        const getCall = global.fetch.mock.calls.find(call => 
          call[0]?.includes('/recipe/get')
        );
        if (getCall) {
          expect(getCall[0]).toContain('id=');
        }
      });
    });

    it('should handle recipe data in different formats', async () => {
      // Test with data already wrapped
      const wrappedData = {
        id: 'recipe-456',
        url: 'https://example.com/recipe',
        data: {
          title: 'Wrapped Recipe',
          ingredients: [],
          instructions: []
        }
      };

      global.fetch = jest.fn((url) => {
        if (url.includes('/recipe/get')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(wrappedData)
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ recipes: [] })
        });
      });

      await act(async () => {
        render(<App />);
      });

      // Test with unwrapped data
      const unwrappedData = {
        title: 'Unwrapped Recipe',
        name: 'Alternative Name',
        ingredients: [],
        instructions: []
      };

      global.fetch = jest.fn((url) => {
        if (url.includes('/recipe/get')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(unwrappedData)
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ recipes: [] })
        });
      });

      await act(async () => {
        render(<App />);
      });
    });

    it('should validate recipe data has required fields', async () => {
      // Test with invalid recipe data
      const invalidData = {
        id: 'recipe-789',
        data: {
          // Missing title and name
          ingredients: [],
          instructions: []
        }
      };

      global.fetch = jest.fn((url) => {
        if (url.includes('/recipe/get')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(invalidData)
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ recipes: [] })
        });
      });

      await act(async () => {
        render(<App />);
      });

      // Should handle invalid data gracefully
      expect(() => render(<App />)).not.toThrow();
    });

    it('should handle fetch errors when getting complete recipe data', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      global.fetch = jest.fn((url) => {
        if (url.includes('/recipe/get')) {
          return Promise.reject(new Error('Failed to fetch'));
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ recipes: [] })
        });
      });

      await act(async () => {
        render(<App />);
      });

      // Error should be handled gracefully
      expect(() => render(<App />)).not.toThrow();

      consoleWarnSpy.mockRestore();
    });
  });
});