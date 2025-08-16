import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Define the worker URLs
const API_URL = 'https://recipe-scraper.nolanfoster.workers.dev';
const CLIPPER_API_URL = 'https://recipe-clipper-worker.nolanfoster.workers.dev';
const SEARCH_DB_URL = 'https://recipe-search-db.nolanfoster.workers.dev';

// Mock window functions
global.alert = jest.fn();
global.confirm = jest.fn();

// Mock IntersectionObserver
global.IntersectionObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

describe('Search Functionality and Glass Panel Integration', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    alert.mockClear();
    confirm.mockClear();
    
    // Mock successful recipes fetch
    mockFetch.mockImplementation((url) => {
      if (url.includes('/recipes')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            recipes: [
              {
                id: '1',
                data: {
                  id: '1',
                  name: 'Test Recipe 1',
                  description: 'A test recipe',
                  ingredients: ['ingredient 1', 'ingredient 2'],
                  instructions: ['step 1', 'step 2'],
                  prep_time: 'PT15M',
                  cook_time: 'PT30M',
                  recipe_yield: '4 servings'
                }
              }
            ]
          })
        });
      }
      if (url.includes('/health')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'healthy' })
        });
      }
      return Promise.resolve({ ok: false });
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Search Bar Behavior', () => {
    it('should render search bar within the glass panel', async () => {
      render(<App />);
      
      await waitFor(() => {
        const searchInput = screen.getByPlaceholderText('Search recipes or paste a URL to clip...');
        expect(searchInput).toBeInTheDocument();
        
        // Check that search bar is within header container
        const headerContainer = document.querySelector('.header-container');
        const searchBar = document.querySelector('.title-search');
        expect(headerContainer).toContainElement(searchBar);
      });
    });

    it('should show search icon when typing non-URL text', async () => {
      const user = userEvent.setup();
      render(<App />);
      
      const searchInput = await screen.findByPlaceholderText('Search recipes or paste a URL to clip...');
      await user.type(searchInput, 'chicken recipe');
      
      // Should show search icon (not clip icon)
      const searchButton = screen.getByRole('button', { name: /search/i });
      expect(searchButton).toBeInTheDocument();
      expect(searchButton.querySelector('svg')).toBeInTheDocument();
    });

    it('should show clip icon when typing a valid URL', async () => {
      const user = userEvent.setup();
      render(<App />);
      
      const searchInput = await screen.findByPlaceholderText('Search recipes or paste a URL to clip...');
      await user.type(searchInput, 'https://example.com/recipe');
      
      // Should show clip icon
      const clipButton = screen.getByRole('button', { name: /clip recipe/i });
      expect(clipButton).toBeInTheDocument();
      expect(clipButton.querySelector('img[alt="Clip"]')).toBeInTheDocument();
    });
  });

  describe('Search Results Integration', () => {
    it('should display search results within the same glass panel', async () => {
      const user = userEvent.setup();
      
      // Mock search API response
      mockFetch.mockImplementation((url) => {
        if (url.includes('/api/search')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              results: [
                {
                  id: 'search-1',
                  properties: {
                    title: 'Chicken Parmesan',
                    description: 'Classic Italian dish',
                    prepTime: 'PT20M',
                    cookTime: 'PT40M',
                    servings: '4 servings',
                    ingredients: ['chicken', 'cheese', 'tomato sauce'],
                    instructions: ['Bread chicken', 'Fry', 'Add sauce and cheese', 'Bake']
                  }
                },
                {
                  id: 'search-2',
                  properties: {
                    title: 'Grilled Chicken Salad',
                    description: 'Healthy salad option',
                    prepTime: 'PT15M',
                    cookTime: 'PT20M',
                    servings: '2 servings',
                    ingredients: ['chicken', 'lettuce', 'tomatoes'],
                    instructions: ['Grill chicken', 'Prepare salad', 'Combine']
                  }
                }
              ]
            })
          });
        }
        if (url.includes('/recipes')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, recipes: [] })
          });
        }
        if (url.includes('/health')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'healthy' })
          });
        }
        return Promise.resolve({ ok: false });
      });
      
      render(<App />);
      
      const searchInput = await screen.findByPlaceholderText('Search recipes or paste a URL to clip...');
      await user.type(searchInput, 'chicken');
      
      // Wait for search results to appear
      await waitFor(() => {
        const searchResults = screen.getByText('Chicken Parmesan');
        expect(searchResults).toBeInTheDocument();
      });
      
      // Check that results are within the header container
      const headerContainer = document.querySelector('.header-container');
      const searchResultsDropdown = document.querySelector('.search-results-dropdown');
      expect(headerContainer).toContainElement(searchResultsDropdown);
      
      // Verify both results are shown
      expect(screen.getByText('Chicken Parmesan')).toBeInTheDocument();
      expect(screen.getByText('Grilled Chicken Salad')).toBeInTheDocument();
    });

    it('should show loading state while searching', async () => {
      const user = userEvent.setup();
      
      // Mock delayed search response
      mockFetch.mockImplementation((url) => {
        if (url.includes('/api/search')) {
          return new Promise(resolve => {
            setTimeout(() => {
              resolve({
                ok: true,
                json: () => Promise.resolve({ results: [] })
              });
            }, 100);
          });
        }
        if (url.includes('/recipes')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, recipes: [] })
          });
        }
        if (url.includes('/health')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'healthy' })
          });
        }
        return Promise.resolve({ ok: false });
      });
      
      render(<App />);
      
      const searchInput = await screen.findByPlaceholderText('Search recipes or paste a URL to clip...');
      await user.type(searchInput, 'test');
      
      // Should show loading spinner
      await waitFor(() => {
        expect(screen.getByText('Searching recipes...')).toBeInTheDocument();
      });
    });

    it('should show no results message when search returns empty', async () => {
      const user = userEvent.setup();
      
      // Mock empty search response
      mockFetch.mockImplementation((url) => {
        if (url.includes('/api/search')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ results: [] })
          });
        }
        if (url.includes('/recipes')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, recipes: [] })
          });
        }
        if (url.includes('/health')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'healthy' })
          });
        }
        return Promise.resolve({ ok: false });
      });
      
      render(<App />);
      
      const searchInput = await screen.findByPlaceholderText('Search recipes or paste a URL to clip...');
      await user.type(searchInput, 'xyz123');
      
      // Should show no results message
      await waitFor(() => {
        expect(screen.getByText('No recipes found for "xyz123"')).toBeInTheDocument();
      });
    });

    it('should close search results when clicking outside', async () => {
      const user = userEvent.setup();
      
      // Mock search response
      mockFetch.mockImplementation((url) => {
        if (url.includes('/api/search')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              results: [{
                id: 'search-1',
                properties: {
                  title: 'Test Recipe',
                  ingredients: [],
                  instructions: []
                }
              }]
            })
          });
        }
        if (url.includes('/recipes')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, recipes: [] })
          });
        }
        if (url.includes('/health')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'healthy' })
          });
        }
        return Promise.resolve({ ok: false });
      });
      
      render(<App />);
      
      const searchInput = await screen.findByPlaceholderText('Search recipes or paste a URL to clip...');
      await user.type(searchInput, 'test');
      
      // Wait for results
      await waitFor(() => {
        expect(screen.getByText('Test Recipe')).toBeInTheDocument();
      });
      
      // Click outside (on the body)
      await user.click(document.body);
      
      // Results should be hidden
      await waitFor(() => {
        expect(screen.queryByText('Test Recipe')).not.toBeInTheDocument();
      });
    });
  });

  describe('Glass Panel Expansion', () => {
    it('should expand glass panel smoothly when showing search results', async () => {
      const user = userEvent.setup();
      
      // Mock search response
      mockFetch.mockImplementation((url) => {
        if (url.includes('/api/search')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              results: [{
                id: 'search-1',
                properties: {
                  title: 'Test Recipe',
                  ingredients: [],
                  instructions: []
                }
              }]
            })
          });
        }
        if (url.includes('/recipes')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, recipes: [] })
          });
        }
        if (url.includes('/health')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'healthy' })
          });
        }
        return Promise.resolve({ ok: false });
      });
      
      render(<App />);
      
      const headerContainer = document.querySelector('.header-container');
      
      const searchInput = await screen.findByPlaceholderText('Search recipes or paste a URL to clip...');
      await user.type(searchInput, 'test');
      
      // Wait for results and check panel expansion
      await waitFor(() => {
        const searchDropdown = document.querySelector('.search-results-dropdown');
        expect(searchDropdown).toBeInTheDocument();
        
        // The header container should maintain its glass effect classes
        expect(headerContainer).toHaveClass('header-container');
      });
    });

    it('should maintain consistent glass effect styling', async () => {
      render(<App />);
      
      await waitFor(() => {
        const headerContainer = document.querySelector('.header-container');
        expect(headerContainer).toBeInTheDocument();
      });
    });
  });

  describe('Search Debouncing', () => {
    it('should debounce search requests', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ delay: null });
      
      // Mock search response
      mockFetch.mockImplementation((url) => {
        if (url.includes('/api/search')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ results: [] })
          });
        }
        if (url.includes('/recipes')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, recipes: [] })
          });
        }
        if (url.includes('/health')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'healthy' })
          });
        }
        return Promise.resolve({ ok: false });
      });
      
      render(<App />);
      
      const searchInput = await screen.findByPlaceholderText('Search recipes or paste a URL to clip...');
      
      // Type quickly
      await user.type(searchInput, 'chic');
      
      // Should not have made any search calls yet
      const searchCallsBefore = mockFetch.mock.calls.filter(call => 
        call[0].includes('/api/search')
      );
      expect(searchCallsBefore.length).toBe(0);
      
      // Fast forward past debounce delay
      jest.advanceTimersByTime(400);
      
      // Now should have made the search call
      await waitFor(() => {
        const searchCallsAfter = mockFetch.mock.calls.filter(call => 
          call[0].includes('/api/search')
        );
        expect(searchCallsAfter.length).toBe(1);
        expect(searchCallsAfter[0][0]).toContain('q=chic');
      });
      
      jest.useRealTimers();
    });
  });

  describe('Recipe Selection from Search Results', () => {
    it('should handle recipe selection from search results', async () => {
      const user = userEvent.setup();
      
      // Mock search response
      mockFetch.mockImplementation((url) => {
        if (url.includes('/api/search')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              results: [{
                id: 'search-1',
                properties: {
                  title: 'Chicken Recipe',
                  description: 'Delicious chicken',
                  ingredients: ['chicken', 'spices'],
                  instructions: ['Cook chicken']
                }
              }]
            })
          });
        }
        if (url.includes('/recipes')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, recipes: [] })
          });
        }
        if (url.includes('/health')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'healthy' })
          });
        }
        return Promise.resolve({ ok: false });
      });
      
      render(<App />);
      
      const searchInput = await screen.findByPlaceholderText('Search recipes or paste a URL to clip...');
      await user.type(searchInput, 'chicken');
      
      // Wait for and click on search result
      const searchResult = await screen.findByText('Chicken Recipe');
      await user.click(searchResult);
      
      // Should clear search and close dropdown
      await waitFor(() => {
        expect(searchInput.value).toBe('');
        expect(screen.queryByText('Chicken Recipe')).not.toBeInTheDocument();
      });
    });
  });

  describe('Search Result Metadata Display', () => {
    it('should display recipe metadata in search results', async () => {
      const user = userEvent.setup();
      
      // Mock search response with full metadata
      mockFetch.mockImplementation((url) => {
        if (url.includes('/api/search')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              results: [{
                id: 'search-1',
                properties: {
                  title: 'Complete Recipe',
                  prepTime: 'PT15M',
                  cookTime: 'PT30M',
                  servings: '4 servings',
                  ingredients: [],
                  instructions: []
                }
              }]
            })
          });
        }
        if (url.includes('/recipes')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, recipes: [] })
          });
        }
        if (url.includes('/health')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'healthy' })
          });
        }
        return Promise.resolve({ ok: false });
      });
      
      render(<App />);
      
      const searchInput = await screen.findByPlaceholderText('Search recipes or paste a URL to clip...');
      await user.type(searchInput, 'recipe');
      
      // Check metadata display
      await waitFor(() => {
        expect(screen.getByText('Prep:')).toBeInTheDocument();
        expect(screen.getByText('15 m')).toBeInTheDocument();
        expect(screen.getByText('Cook:')).toBeInTheDocument();
        expect(screen.getByText('30 m')).toBeInTheDocument();
        expect(screen.getByText('Yield:')).toBeInTheDocument();
        expect(screen.getByText('4 servings')).toBeInTheDocument();
      });
    });

    it('should show no timing information message when metadata is missing', async () => {
      const user = userEvent.setup();
      
      // Mock search response without metadata
      mockFetch.mockImplementation((url) => {
        if (url.includes('/api/search')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              results: [{
                id: 'search-1',
                properties: {
                  title: 'Simple Recipe',
                  ingredients: [],
                  instructions: []
                }
              }]
            })
          });
        }
        if (url.includes('/recipes')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, recipes: [] })
          });
        }
        if (url.includes('/health')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'healthy' })
          });
        }
        return Promise.resolve({ ok: false });
      });
      
      render(<App />);
      
      const searchInput = await screen.findByPlaceholderText('Search recipes or paste a URL to clip...');
      await user.type(searchInput, 'recipe');
      
      // Should show no timing information message
      await waitFor(() => {
        expect(screen.getByText('No timing information')).toBeInTheDocument();
      });
    });
  });
});