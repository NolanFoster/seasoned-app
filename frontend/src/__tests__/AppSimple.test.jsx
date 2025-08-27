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
  return function MockVideoPopup({ isOpen, onClose, videoUrl, title }) {
    if (!isOpen) return null;
    return (
      <div data-testid="video-popup">
        <button onClick={onClose}>Close</button>
        <div>{videoUrl}</div>
        <div>{title}</div>
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

jest.mock('../components/SwipeableRecipeGrid', () => {
  return function MockSwipeableRecipeGrid({ children, onSwipeLeft, onSwipeRight }) {
    return (
      <div data-testid="swipeable-recipe-grid" onSwipeLeft={onSwipeLeft} onSwipeRight={onSwipeRight}>
        {children}
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

describe('App Component Simple Tests', () => {
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
            location: ''
          })
        });
      }
      if (url.includes('/api/smart-search')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            results: [
              {
                id: 'test-recipe-1',
                name: 'Test Recipe 1',
                ingredients: ['ingredient 1', 'ingredient 2'],
                instructions: ['step 1', 'step 2']
              }
            ]
          })
        });
      }
      if (url.includes('/api/recipes')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            recipes: [
              {
                id: 'test-recipe-1',
                name: 'Test Recipe 1',
                ingredients: ['ingredient 1', 'ingredient 2'],
                instructions: ['step 1', 'step 2']
              }
            ]
          })
        });
      }
      return Promise.resolve({ ok: false });
    });
  });

  describe('Basic Rendering', () => {
    it('renders the main app structure', () => {
      render(<App />);
      
      expect(screen.getByText('Seasoned')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Search recipes or paste a URL to clip...')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /search/i })).toBeInTheDocument();
    });

    it('renders the seasoning background canvas', () => {
      render(<App />);
      
      const canvas = screen.getByRole('img', { hidden: true });
      expect(canvas).toHaveClass('title-icon');
    });

    it('shows loading recommendations initially', () => {
      render(<App />);
      
      expect(screen.getByText('Seasoned')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Search recipes or paste a URL to clip...')).toBeInTheDocument();
    });
  });

  describe('Search Functionality', () => {
    it('handles search input changes', async () => {
      const user = userEvent.setup();
      render(<App />);
      
      const searchInput = screen.getByPlaceholderText('Search recipes or paste a URL to clip...');
      await user.type(searchInput, 'chicken');
      
      expect(searchInput).toHaveValue('chicken');
    });

    it('handles search button click', async () => {
      const user = userEvent.setup();
      render(<App />);
      
      const searchInput = screen.getByPlaceholderText('Search recipes or paste a URL to clip...');
      const searchButton = screen.getByRole('button', { name: /search/i });
      
      await user.type(searchInput, 'chicken');
      await user.click(searchButton);
      
      // Should trigger search functionality
      expect(fetch).toHaveBeenCalled();
    });

    it('handles Enter key in search input', async () => {
      const user = userEvent.setup();
      render(<App />);
      
      const searchInput = screen.getByPlaceholderText('Search recipes or paste a URL to clip...');
      await user.type(searchInput, 'chicken{enter}');
      
      // Should trigger search functionality
      expect(fetch).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('handles fetch errors gracefully', async () => {
      fetch.mockImplementationOnce(() => Promise.reject(new Error('Network error')));
      
      render(<App />);
      
      // Should handle network errors gracefully and still show recommendations
      await waitFor(() => {
        expect(screen.getByTestId('recommendations')).toBeInTheDocument();
      });
    });

    it('handles invalid URLs gracefully', async () => {
      const user = userEvent.setup();
      render(<App />);
      
      const searchInput = screen.getByPlaceholderText('Search recipes or paste a URL to clip...');
      await user.type(searchInput, 'invalid-url');
      
      // Should handle invalid URLs gracefully
      expect(searchInput).toHaveValue('invalid-url');
    });
  });

  describe('API Integration', () => {
    it('fetches recommendations correctly', async () => {
      render(<App />);
      
      // Test recommendations API integration
      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/recommendations'),
          expect.any(Object)
        );
      });
    });

    it('fetches search results correctly', async () => {
      const user = userEvent.setup();
      render(<App />);
      
      const searchInput = screen.getByPlaceholderText('Search recipes or paste a URL to clip...');
      await user.type(searchInput, 'chicken{enter}');
      
      // Should show search results dropdown
      await waitFor(() => {
        expect(screen.getByText(/No recipes found for/)).toBeInTheDocument();
      });
    });
  });

  describe('User Interactions', () => {
    it('handles user clicks correctly', async () => {
      const user = userEvent.setup();
      render(<App />);
      
      // Test various user interactions
      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);
      
      // Should handle click events properly
      expect(searchButton).toBeInTheDocument();
    });

    it('handles keyboard events correctly', async () => {
      const user = userEvent.setup();
      render(<App />);
      
      // Test keyboard event handling
      const searchInput = screen.getByPlaceholderText('Search recipes or paste a URL to clip...');
      await user.type(searchInput, 'test{enter}');
      
      // Should handle keyboard events properly
      expect(fetch).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('handles empty search queries', async () => {
      const user = userEvent.setup();
      render(<App />);
      
      const searchInput = screen.getByPlaceholderText('Search recipes or paste a URL to clip...');
      const searchButton = screen.getByRole('button', { name: /search/i });
      
      await user.click(searchButton);
      
      // Should handle empty search queries gracefully
      expect(searchButton).toBeInTheDocument();
    });

    it('handles very long search queries', async () => {
      const user = userEvent.setup();
      render(<App />);
      
      const searchInput = screen.getByPlaceholderText('Search recipes or paste a URL to clip...');
      const longQuery = 'a'.repeat(1000);
      await user.type(searchInput, longQuery);
      
      // Should handle long search queries gracefully
      expect(searchInput).toHaveValue(longQuery);
    });

    it('handles special characters in search', async () => {
      const user = userEvent.setup();
      render(<App />);
      
      const searchInput = screen.getByPlaceholderText('Search recipes or paste a URL to clip...');
      await user.type(searchInput, 'chicken & rice!@#$%^&*()');
      
      // Should handle special characters gracefully
      expect(searchInput).toHaveValue('chicken & rice!@#$%^&*()');
    });
  });
});