import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import App from '../App';

// Mock fetch globally
global.fetch = jest.fn();

// Mock canvas and other browser APIs
HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
  fillRect: jest.fn(),
  clearRect: jest.fn(),
  beginPath: jest.fn(),
  arc: jest.fn(),
  fill: jest.fn(),
  save: jest.fn(),
  restore: jest.fn(),
  translate: jest.fn(),
  rotate: jest.fn(),
}));

global.IntersectionObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

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

// Mock alert
global.alert = jest.fn();

describe('Recipe Clipper Functionality', () => {
  beforeEach(() => {
    fetch.mockClear();
    jest.clearAllMocks();
  });

  test('shows clipper UI when valid URL is entered', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ recipes: [] }),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.queryByText('Loading recipes...')).not.toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search recipes or paste a URL to clip...');
    
    // Type a valid URL
    await userEvent.type(searchInput, 'https://www.example.com/recipe');

    // Should show clipper UI
    expect(screen.getByText('Clip Recipe from URL')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clip recipe/i })).toBeInTheDocument();
  });

  test('clips recipe successfully', async () => {
    const clippedRecipe = {
      name: 'Clipped Recipe',
      description: 'A delicious recipe from the web',
      ingredients: ['ingredient 1', 'ingredient 2'],
      instructions: ['step 1', 'step 2'],
      prep_time: 'PT30M',
      cook_time: 'PT45M',
      image_url: 'https://example.com/image.jpg',
    };

    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ recipes: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: clippedRecipe,
        }),
      });

    render(<App />);

    await waitFor(() => {
      expect(screen.queryByText('Loading recipes...')).not.toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search recipes or paste a URL to clip...');
    await userEvent.type(searchInput, 'https://www.example.com/recipe');

    const clipButton = screen.getByRole('button', { name: /clip recipe/i });
    fireEvent.click(clipButton);

    // Should show loading state
    expect(screen.getByText('Clipping recipe...')).toBeInTheDocument();

    // Should show preview
    await waitFor(() => {
      expect(screen.getByText('Recipe Preview')).toBeInTheDocument();
      expect(screen.getByText('Clipped Recipe')).toBeInTheDocument();
    });
  });

  test('handles clip error', async () => {
    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ recipes: [] }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Failed to clip recipe' }),
      });

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    render(<App />);

    await waitFor(() => {
      expect(screen.queryByText('Loading recipes...')).not.toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search recipes or paste a URL to clip...');
    await userEvent.type(searchInput, 'https://www.example.com/recipe');

    const clipButton = screen.getByRole('button', { name: /clip recipe/i });
    fireEvent.click(clipButton);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Error clipping recipe:', expect.any(Error));
      expect(global.alert).toHaveBeenCalledWith(expect.stringContaining('Failed to clip'));
    });

    consoleSpy.mockRestore();
  });

  test('edits clipped recipe before saving', async () => {
    const clippedRecipe = {
      name: 'Original Name',
      description: 'Original description',
      ingredients: ['ingredient 1'],
      instructions: ['step 1'],
    };

    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ recipes: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: clippedRecipe,
        }),
      });

    render(<App />);

    await waitFor(() => {
      expect(screen.queryByText('Loading recipes...')).not.toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search recipes or paste a URL to clip...');
    await userEvent.type(searchInput, 'https://www.example.com/recipe');

    const clipButton = screen.getByRole('button', { name: /clip recipe/i });
    fireEvent.click(clipButton);

    await waitFor(() => {
      expect(screen.getByText('Recipe Preview')).toBeInTheDocument();
    });

    // Edit the recipe name
    const nameInput = screen.getByDisplayValue('Original Name');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Modified Name');

    // Add a new ingredient
    const addIngredientButton = screen.getByText(/add ingredient/i);
    fireEvent.click(addIngredientButton);
  });

  test('saves clipped recipe', async () => {
    const clippedRecipe = {
      name: 'Clipped Recipe',
      ingredients: ['ingredient 1'],
      instructions: ['step 1'],
    };

    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ recipes: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: clippedRecipe,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

    render(<App />);

    await waitFor(() => {
      expect(screen.queryByText('Loading recipes...')).not.toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search recipes or paste a URL to clip...');
    await userEvent.type(searchInput, 'https://www.example.com/recipe');

    const clipButton = screen.getByRole('button', { name: /clip recipe/i });
    fireEvent.click(clipButton);

    await waitFor(() => {
      expect(screen.getByText('Recipe Preview')).toBeInTheDocument();
    });

    // Save the recipe
    const saveButton = screen.getByRole('button', { name: /save recipe/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/recipes'),
        expect.objectContaining({
          method: 'PUT',
          body: expect.stringContaining('Clipped Recipe'),
        })
      );
    });
  });

  test('cancels clipped recipe preview', async () => {
    const clippedRecipe = {
      name: 'Clipped Recipe',
    };

    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ recipes: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: clippedRecipe,
        }),
      });

    render(<App />);

    await waitFor(() => {
      expect(screen.queryByText('Loading recipes...')).not.toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search recipes or paste a URL to clip...');
    await userEvent.type(searchInput, 'https://www.example.com/recipe');

    const clipButton = screen.getByRole('button', { name: /clip recipe/i });
    fireEvent.click(clipButton);

    await waitFor(() => {
      expect(screen.getByText('Recipe Preview')).toBeInTheDocument();
    });

    // Cancel the preview
    const cancelButton = screen.getByRole('button', { name: /cancel|close|×/i });
    fireEvent.click(cancelButton);

    // Preview should be closed
    await waitFor(() => {
      expect(screen.queryByText('Recipe Preview')).not.toBeInTheDocument();
    });
  });

  test('handles multiple URLs in different formats', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ recipes: [] }),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.queryByText('Loading recipes...')).not.toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search recipes or paste a URL to clip...');

    // Test different URL formats
    const urls = [
      'https://example.com/recipe',
      'http://example.com/recipe',
      'www.example.com/recipe',
      'example.com/recipe',
    ];

    for (const url of urls) {
      await userEvent.clear(searchInput);
      await userEvent.type(searchInput, url);

      if (url.startsWith('http') || url.startsWith('www')) {
        expect(screen.getByText('Clip Recipe from URL')).toBeInTheDocument();
      }
    }
  });

  test('validates recipe before saving', async () => {
    const clippedRecipe = {
      name: '',  // Empty name
      ingredients: [],
      instructions: [],
    };

    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ recipes: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: clippedRecipe,
        }),
      });

    render(<App />);

    await waitFor(() => {
      expect(screen.queryByText('Loading recipes...')).not.toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search recipes or paste a URL to clip...');
    await userEvent.type(searchInput, 'https://www.example.com/recipe');

    const clipButton = screen.getByRole('button', { name: /clip recipe/i });
    fireEvent.click(clipButton);

    await waitFor(() => {
      expect(screen.getByText('Recipe Preview')).toBeInTheDocument();
    });

    // Try to save without a name
    const saveButton = screen.getByRole('button', { name: /save recipe/i });
    fireEvent.click(saveButton);

    // Should show validation error
    expect(global.alert).toHaveBeenCalledWith(expect.stringContaining('name'));
  });

  test('handles network error during clipping', async () => {
    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ recipes: [] }),
      })
      .mockRejectedValueOnce(new Error('Network error'));

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    render(<App />);

    await waitFor(() => {
      expect(screen.queryByText('Loading recipes...')).not.toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search recipes or paste a URL to clip...');
    await userEvent.type(searchInput, 'https://www.example.com/recipe');

    const clipButton = screen.getByRole('button', { name: /clip recipe/i });
    fireEvent.click(clipButton);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Error clipping recipe:', expect.any(Error));
    });

    consoleSpy.mockRestore();
  });

  test('handles clipper health check', async () => {
    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ recipes: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'healthy' }),
      });

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    render(<App />);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/health'));
    });

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Clipper worker health:', expect.objectContaining({ status: 'healthy' }));
    });

    consoleSpy.mockRestore();
  });
});