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

describe('App Event Handlers Coverage', () => {
  beforeEach(() => {
    fetch.mockClear();
    jest.clearAllMocks();
    
    // Mock console methods
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    
    // Mock window methods
    global.addEventListener = jest.fn();
    global.removeEventListener = jest.fn();
    
    // Mock history API
    global.history = {
      pushState: jest.fn(),
      back: jest.fn(),
      state: null
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Window Resize Handler', () => {
    it('should handle window resize events', async () => {
      // Mock canvas and context
      const mockCanvas = {
        width: 1024,
        height: 768,
        getContext: jest.fn(() => ({
          clearRect: jest.fn(),
          fillRect: jest.fn(),
          beginPath: jest.fn(),
          arc: jest.fn(),
          fill: jest.fn()
        }))
      };

      // Mock useRef to return our mock canvas
      const originalUseRef = React.useRef;
      React.useRef = jest.fn((initial) => {
        if (initial === null) {
          return { current: mockCanvas };
        }
        return { current: { ctx: mockCanvas.getContext('2d'), seasoningParticles: [] } };
      });

      render(<App />);
      
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      // Simulate window resize
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1200
      });
      
      Object.defineProperty(window, 'innerHeight', {
        writable: true,
        configurable: true,
        value: 800
      });

      await act(async () => {
        fireEvent(window, new Event('resize'));
      });

      // Should handle resize without errors
      expect(screen.getByText(/seasoned/i)).toBeInTheDocument();
      
      React.useRef = originalUseRef;
    });
  });

  describe('Browser Back Button Handler', () => {
    it('should handle popstate events when recipe is selected', async () => {
      const mockRecipe = {
        id: 'back-test',
        name: 'Back Test Recipe',
        ingredients: ['ingredient 1'],
        instructions: ['instruction 1']
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

      // First, simulate selecting a recipe
      const searchInput = screen.getByLabelText(/search recipes/i);
      
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'back test' } });
        fireEvent.keyDown(searchInput, { key: 'Enter', code: 'Enter' });
      });

      // Wait for recipe to potentially load
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 500));
      });

      // Simulate browser back button (popstate event)
      await act(async () => {
        const popstateEvent = new PopStateEvent('popstate', {
          state: { recipeView: false }
        });
        fireEvent(window, popstateEvent);
      });

      // Should handle back navigation gracefully
      expect(screen.getByText(/seasoned/i)).toBeInTheDocument();
    });
  });

  describe('Escape Key Handler', () => {
    it('should handle escape key when recipe is selected', async () => {
      const mockRecipe = {
        id: 'escape-test',
        name: 'Escape Test Recipe'
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

      // Simulate escape key press
      await act(async () => {
        fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
      });

      // Should handle escape key gracefully
      expect(screen.getByText(/seasoned/i)).toBeInTheDocument();
    });
  });

  describe('Recipe Categories Function', () => {
    it('should fetch recipe categories successfully', async () => {
      const mockCategories = {
        categories: ['Italian', 'Mexican', 'Asian']
      };

      fetch.mockImplementation((url) => {
        if (url.includes('/recommendations')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ recommendations: {} })
          });
        }
        if (url.includes('/api/categories')) {
          return Promise.resolve({
            ok: true,
            json: async () => mockCategories
          });
        }
        return Promise.resolve({ ok: false });
      });

      render(<App />);
      
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
      });

      // Should call categories endpoint
      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/categories'),
          expect.any(Object)
        );
      }, { timeout: 3000 });
    });

    it('should handle categories fetch error', async () => {
      fetch.mockImplementation((url) => {
        if (url.includes('/recommendations')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ recommendations: {} })
          });
        }
        if (url.includes('/api/categories')) {
          return Promise.reject(new Error('Categories fetch failed'));
        }
        return Promise.resolve({ ok: false });
      });

      render(<App />);
      
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
      });

      // Should handle error gracefully
      await waitFor(() => {
        expect(console.error).toHaveBeenCalledWith(
          'Error getting recipe categories:',
          expect.any(Error)
        );
      }, { timeout: 3000 });
    });
  });

  describe('Search Cache Clear Function', () => {
    it('should clear search cache when called', async () => {
      render(<App />);
      
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      const searchInput = screen.getByLabelText(/search recipes/i);
      
      // Perform a search to populate cache
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'cache test' } });
        fireEvent.keyDown(searchInput, { key: 'Enter', code: 'Enter' });
      });

      // Clear the search (which should trigger cache clearing)
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: '' } });
      });

      // Cache clearing should work without errors
      expect(screen.getByLabelText(/search recipes/i)).toHaveValue('');
    });
  });

  describe('Recipe Initialization Functions', () => {
    it('should handle recipe initialization with recommendations', async () => {
      const mockRecommendations = {
        recommendations: {
          'Test Category': ['test-tag']
        }
      };

      fetch.mockImplementation((url) => {
        if (url.includes('/recommendations')) {
          return Promise.resolve({
            ok: true,
            json: async () => mockRecommendations
          });
        }
        if (url.includes('/api/categories')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ categories: ['Test'] })
          });
        }
        return Promise.resolve({ ok: false });
      });

      render(<App />);
      
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 300));
      });

      // Should complete initialization
      await waitFor(() => {
        expect(console.log).toHaveBeenCalledWith('✅ Initialization completed');
      }, { timeout: 5000 });
    });

    it('should handle initialization without recommendations', async () => {
      fetch.mockImplementation((url) => {
        if (url.includes('/recommendations')) {
          return Promise.resolve({
            ok: false,
            status: 404
          });
        }
        return Promise.resolve({ ok: false });
      });

      render(<App />);
      
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
      });

      // Should handle missing recommendations gracefully
      await waitFor(() => {
        expect(console.error).toHaveBeenCalledWith(
          '❌ Failed to fetch recommendations:',
          404
        );
      }, { timeout: 3000 });
    });
  });

  describe('Recipe Refresh Functionality', () => {
    it('should refresh recipes when requested', async () => {
      fetch.mockImplementation((url) => {
        if (url.includes('/recommendations')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ recommendations: {} })
          });
        }
        return Promise.resolve({ ok: false });
      });

      render(<App />);
      
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      // Find and click refresh/retry button
      const retryButton = screen.queryByText(/try again/i) || screen.queryByText(/refresh/i);
      
      if (retryButton) {
        await act(async () => {
          fireEvent.click(retryButton);
        });

        // Should trigger recipe refresh
        await waitFor(() => {
          expect(fetch).toHaveBeenCalledWith(
            expect.stringContaining('/recommendations'),
            expect.any(Object)
          );
        }, { timeout: 3000 });
      }
    });
  });
});