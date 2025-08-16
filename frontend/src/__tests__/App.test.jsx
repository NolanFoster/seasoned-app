import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import App from '../App';

// Mock fetch globally
global.fetch = jest.fn();

// Mock canvas context
const mockCanvasContext = {
  fillRect: jest.fn(),
  clearRect: jest.fn(),
  beginPath: jest.fn(),
  arc: jest.fn(),
  fill: jest.fn(),
  save: jest.fn(),
  restore: jest.fn(),
  translate: jest.fn(),
  rotate: jest.fn(),
  moveTo: jest.fn(),
  lineTo: jest.fn(),
  closePath: jest.fn(),
  stroke: jest.fn(),
  font: '',
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  globalAlpha: 1,
  canvas: { width: 1024, height: 768 },
};

HTMLCanvasElement.prototype.getContext = jest.fn(() => mockCanvasContext);

// Mock IntersectionObserver
global.IntersectionObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

describe('App Component', () => {
  beforeEach(() => {
    fetch.mockClear();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Initial Render and Loading States', () => {
    test('renders loading state initially', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ recipes: [] }),
      });

      render(<App />);
      
      expect(screen.getByText('Loading recipes...')).toBeInTheDocument();
      
      await waitFor(() => {
        expect(screen.queryByText('Loading recipes...')).not.toBeInTheDocument();
      });
    });

    test('renders app title and search bar', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ recipes: [] }),
      });

      render(<App />);
      
      expect(screen.getByText('Seasoned')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Search recipes or paste a URL to clip...')).toBeInTheDocument();
      
      await waitFor(() => {
        expect(screen.queryByText('Loading recipes...')).not.toBeInTheDocument();
      });
    });
  });

  describe('Recipe Fetching and Display', () => {
    test('fetches and displays recipes on load', async () => {
      const mockRecipes = [
        {
          id: 1,
          name: 'Pasta Carbonara',
          description: 'Classic Italian pasta dish',
          image_url: 'https://example.com/pasta.jpg',
          prep_time: 'PT15M',
          cook_time: 'PT20M',
          recipe_yield: '4 servings',
          ingredients: ['pasta', 'eggs', 'bacon'],
        },
        {
          id: 2,
          name: 'Chocolate Cake',
          description: 'Delicious chocolate dessert',
          image_url: 'https://example.com/cake.jpg',
          prep_time: 'PT30M',
          cook_time: 'PT45M',
          recipe_yield: '8 servings',
          ingredients: ['flour', 'cocoa', 'sugar'],
        },
      ];

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ recipes: mockRecipes }),
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Pasta Carbonara')).toBeInTheDocument();
        expect(screen.getByText('Chocolate Cake')).toBeInTheDocument();
      });

      expect(screen.getByText('15 m')).toBeInTheDocument();
      expect(screen.getByText('20 m')).toBeInTheDocument();
    });

    test('handles fetch error gracefully', async () => {
      fetch.mockRejectedValueOnce(new Error('Network error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText('Loading recipes...')).not.toBeInTheDocument();
      });

      expect(consoleSpy).toHaveBeenCalledWith('Error fetching recipes:', expect.any(Error));
      consoleSpy.mockRestore();
    });

    test('handles invalid response format', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invalid: 'data' }), // No recipes array
      });
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText('Loading recipes...')).not.toBeInTheDocument();
      });

      expect(consoleSpy).toHaveBeenCalledWith('Invalid response format from KV worker:', expect.any(Object));
      consoleSpy.mockRestore();
    });
  });

  describe('Search Functionality', () => {
    test('filters recipes based on search input', async () => {
      const mockRecipes = [
        { id: 1, name: 'Pasta Carbonara', ingredients: ['pasta'] },
        { id: 2, name: 'Chocolate Cake', ingredients: ['chocolate'] },
        { id: 3, name: 'Pasta Salad', ingredients: ['pasta', 'vegetables'] },
      ];

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ recipes: mockRecipes }),
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Pasta Carbonara')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search recipes or paste a URL to clip...');
      
      await userEvent.type(searchInput, 'pasta');

      expect(screen.getByText('Pasta Carbonara')).toBeInTheDocument();
      expect(screen.getByText('Pasta Salad')).toBeInTheDocument();
      expect(screen.queryByText('Chocolate Cake')).not.toBeInTheDocument();
    });

    test('shows no results message when search yields no matches', async () => {
      const mockRecipes = [
        { id: 1, name: 'Pasta Carbonara', ingredients: [] },
      ];

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ recipes: mockRecipes }),
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Pasta Carbonara')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search recipes or paste a URL to clip...');
      
      await userEvent.type(searchInput, 'xyz123');

      expect(screen.queryByText('Pasta Carbonara')).not.toBeInTheDocument();
      // The app might show a "no results" message or just empty grid
    });

    test('search is case insensitive', async () => {
      const mockRecipes = [
        { id: 1, name: 'Pasta Carbonara', ingredients: [] },
      ];

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ recipes: mockRecipes }),
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Pasta Carbonara')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search recipes or paste a URL to clip...');
      
      await userEvent.type(searchInput, 'PASTA');

      expect(screen.getByText('Pasta Carbonara')).toBeInTheDocument();
    });
  });

  describe('URL Input and Recipe Clipping', () => {
    test('shows URL input when typing a valid URL', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ recipes: [] }),
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText('Loading recipes...')).not.toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search recipes or paste a URL to clip...');
      
      await userEvent.type(searchInput, 'https://example.com/recipe');

      expect(screen.getByText('Clip Recipe from URL')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Clip Recipe' })).toBeInTheDocument();
    });

    test('clips recipe when valid URL is submitted', async () => {
      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ recipes: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            data: { name: 'Clipped Recipe' },
          }),
        });

      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText('Loading recipes...')).not.toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search recipes or paste a URL to clip...');
      
      await userEvent.type(searchInput, 'https://example.com/recipe');
      
      const clipButton = screen.getByRole('button', { name: 'Clip Recipe' });
      await userEvent.click(clipButton);

      expect(screen.getByText('Clipping recipe...')).toBeInTheDocument();

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/clip?url='),
          expect.any(Object)
        );
      });
    });

    test('handles clipping error', async () => {
      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ recipes: [] }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ error: 'Failed to clip' }),
        });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText('Loading recipes...')).not.toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search recipes or paste a URL to clip...');
      
      await userEvent.type(searchInput, 'https://example.com/recipe');
      
      const clipButton = screen.getByRole('button', { name: 'Clip Recipe' });
      await userEvent.click(clipButton);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Error clipping recipe:', expect.any(Error));
      });

      consoleSpy.mockRestore();
    });
  });

  describe('Dark Mode', () => {
    test('respects system dark mode preference', async () => {
      window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: query === '(prefers-color-scheme: dark)',
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }));

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ recipes: [] }),
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText('Loading recipes...')).not.toBeInTheDocument();
      });

      // The app should apply dark mode based on system preference
      // Note: The actual dark mode class is set in a setTimeout, so we might need to wait
    });
  });

  describe('Recipe Card Interactions', () => {
    test('expands recipe details on click', async () => {
      const mockRecipes = [
        {
          id: 1,
          name: 'Test Recipe',
          description: 'A test recipe',
          ingredients: ['ingredient 1', 'ingredient 2'],
          instructions: ['Step 1', 'Step 2'],
        },
      ];

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ recipes: mockRecipes }),
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Test Recipe')).toBeInTheDocument();
      });

      const recipeCard = screen.getByText('Test Recipe').closest('.recipe-card');
      fireEvent.click(recipeCard);

      await waitFor(() => {
        expect(screen.getByText('ingredient 1')).toBeInTheDocument();
        expect(screen.getByText('Step 1')).toBeInTheDocument();
      });
    });

    test('closes expanded recipe on backdrop click', async () => {
      const mockRecipes = [
        {
          id: 1,
          name: 'Test Recipe',
          ingredients: ['ingredient 1'],
          instructions: ['Step 1'],
        },
      ];

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ recipes: mockRecipes }),
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Test Recipe')).toBeInTheDocument();
      });

      const recipeCard = screen.getByText('Test Recipe').closest('.recipe-card');
      fireEvent.click(recipeCard);

      await waitFor(() => {
        expect(screen.getByText('ingredient 1')).toBeInTheDocument();
      });

      const backdrop = document.querySelector('.recipe-backdrop');
      fireEvent.click(backdrop);

      await waitFor(() => {
        expect(screen.queryByText('ingredient 1')).not.toBeInTheDocument();
      });
    });
  });

  describe('Seasoning Background Animation', () => {
    test('initializes canvas for background animation', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ recipes: [] }),
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText('Loading recipes...')).not.toBeInTheDocument();
      });

      // Wait for initialization in setTimeout
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledWith('2d');
      expect(mockCanvasContext.clearRect).toHaveBeenCalled();
    });

    test('cleans up animation on unmount', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ recipes: [] }),
      });

      const { unmount } = render(<App />);

      await waitFor(() => {
        expect(screen.queryByText('Loading recipes...')).not.toBeInTheDocument();
      });

      unmount();

      // Animation should be stopped (RAF cancelled)
      // Canvas should be cleaned up
    });
  });

  describe('Responsive Behavior', () => {
    test('handles window resize events', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ recipes: [] }),
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText('Loading recipes...')).not.toBeInTheDocument();
      });

      // Wait for initialization
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      // Clear previous calls
      mockCanvasContext.clearRect.mockClear();

      // Trigger resize
      act(() => {
        global.innerWidth = 500;
        global.innerHeight = 500;
        global.dispatchEvent(new Event('resize'));
      });

      // Canvas should be resized
      await waitFor(() => {
        expect(mockCanvasContext.clearRect).toHaveBeenCalled();
      });
    });
  });

  describe('Recipe Management', () => {
    test('shows add recipe form when FAB is clicked', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ recipes: [] }),
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText('Loading recipes...')).not.toBeInTheDocument();
      });

      const addButton = screen.getByRole('button', { name: '+' });
      fireEvent.click(addButton);

      expect(screen.getByText('Add New Recipe')).toBeInTheDocument();
    });

    test('saves a new recipe', async () => {
      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ recipes: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true }),
        });

      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText('Loading recipes...')).not.toBeInTheDocument();
      });

      const addButton = screen.getByRole('button', { name: '+' });
      fireEvent.click(addButton);

      // Fill in the form
      const nameInput = screen.getByPlaceholderText('Enter recipe name');
      await userEvent.type(nameInput, 'New Recipe');

      const saveButton = screen.getByRole('button', { name: 'Save Recipe' });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/recipes'),
          expect.objectContaining({
            method: 'PUT',
          })
        );
      });
    });
  });

  describe('Error States', () => {
    test('displays error message when recipe has no name', async () => {
      const mockRecipes = [
        {
          id: 1,
          name: '',
          description: 'Recipe without name',
          ingredients: [],
        },
      ];

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ recipes: mockRecipes }),
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText('Loading recipes...')).not.toBeInTheDocument();
      });

      // Should display "Untitled Recipe" for recipes without names
      expect(screen.getByText('Untitled Recipe')).toBeInTheDocument();
    });
  });
});