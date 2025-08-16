import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import App from '../App';

// Mock all dependencies
global.fetch = jest.fn();
global.alert = jest.fn();
global.confirm = jest.fn(() => true);

// Mock FileReader
global.FileReader = jest.fn(() => ({
  readAsDataURL: jest.fn(function() {
    this.onload({ target: { result: 'data:image/png;base64,fake' } });
  }),
  result: 'data:image/png;base64,fake',
}));

// Mock canvas
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
  font: '',
  fillStyle: '',
  globalAlpha: 1,
};

HTMLCanvasElement.prototype.getContext = jest.fn(() => mockCanvasContext);

// Mock IntersectionObserver
const mockIntersectionObserver = jest.fn();
mockIntersectionObserver.mockReturnValue({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
});
global.IntersectionObserver = mockIntersectionObserver;

// Mock matchMedia
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

// Mock requestAnimationFrame
global.requestAnimationFrame = jest.fn(cb => setTimeout(cb, 0));
global.cancelAnimationFrame = jest.fn(id => clearTimeout(id));

describe('App Comprehensive Tests', () => {
  beforeEach(() => {
    fetch.mockClear();
    jest.clearAllMocks();
  });

  describe('Recipe CRUD Operations', () => {
    test('creates a new recipe from scratch', async () => {
      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ recipes: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: 'healthy' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true }),
        });

      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText('Loading recipes...')).not.toBeInTheDocument();
      });

      // Click FAB to add recipe
      const addButton = screen.getByRole('button', { name: '+' });
      fireEvent.click(addButton);

      // Fill in recipe details
      const nameInput = screen.getByPlaceholderText('Enter recipe name');
      await userEvent.type(nameInput, 'New Test Recipe');

      const descriptionInput = screen.getByPlaceholderText('Recipe description...');
      await userEvent.type(descriptionInput, 'A delicious test recipe');

      // Add ingredients
      const ingredientInput = screen.getByPlaceholderText('Add first ingredient');
      await userEvent.type(ingredientInput, 'Test ingredient 1');

      const addIngredientBtn = screen.getByText('+ Add Ingredient');
      fireEvent.click(addIngredientBtn);

      // Add instructions
      const instructionInput = screen.getByPlaceholderText('Step 1');
      await userEvent.type(instructionInput, 'Test step 1');

      const addInstructionBtn = screen.getByText('+ Add Instruction');
      fireEvent.click(addInstructionBtn);

      // Fill times
      const prepTimeInput = screen.getByPlaceholderText('Prep time in minutes');
      await userEvent.type(prepTimeInput, '30');

      const cookTimeInput = screen.getByPlaceholderText('Cook time in minutes');
      await userEvent.type(cookTimeInput, '45');

      const yieldInput = screen.getByPlaceholderText('e.g., 4 servings, 1 loaf');
      await userEvent.type(yieldInput, '4 servings');

      // Upload image
      const fileInput = screen.getByLabelText(/Choose Image/i);
      const file = new File(['dummy'], 'test.png', { type: 'image/png' });
      await userEvent.upload(fileInput, file);

      // Save recipe
      const saveButton = screen.getByText('+ Add Recipe');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/recipes'),
          expect.objectContaining({
            method: 'PUT',
            body: expect.stringContaining('New Test Recipe'),
          })
        );
      });
    });

    test('updates an existing recipe', async () => {
      const mockRecipe = {
        id: 'test-123',
        name: 'Original Recipe',
        description: 'Original description',
        ingredients: ['ingredient 1', 'ingredient 2'],
        instructions: ['step 1', 'step 2'],
        prep_time: 30,
        cook_time: 45,
        recipe_yield: '4 servings',
        image_url: 'https://example.com/image.jpg',
      };

      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ recipes: [mockRecipe] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: 'healthy' }),
        });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Original Recipe')).toBeInTheDocument();
      });

      // Click recipe to expand
      const recipeCard = screen.getByText('Original Recipe').closest('.recipe-card');
      fireEvent.click(recipeCard);

      await waitFor(() => {
        expect(screen.getByText('ingredient 1')).toBeInTheDocument();
      });

      // Click edit button
      const editButton = screen.getAllByRole('button').find(btn => 
        btn.querySelector('svg') && btn.title === 'Edit recipe'
      );
      fireEvent.click(editButton);

      // Update recipe name
      const nameInput = screen.getByDisplayValue('Original Recipe');
      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, 'Updated Recipe');

      // Remove an ingredient
      const removeButtons = screen.getAllByRole('button').filter(btn => 
        btn.textContent === '×'
      );
      fireEvent.click(removeButtons[0]);

      // Add new ingredient
      const addIngredientBtn = screen.getByText('+ Add Ingredient');
      fireEvent.click(addIngredientBtn);

      const newIngredientInputs = screen.getAllByRole('textbox').filter(input =>
        input.placeholder && input.placeholder.includes('ingredient')
      );
      const lastIngredientInput = newIngredientInputs[newIngredientInputs.length - 1];
      await userEvent.type(lastIngredientInput, 'New ingredient');

      // Save changes
      const saveButton = screen.getByText('Save Changes');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/recipes/test-123'),
          expect.objectContaining({
            method: 'PUT',
            body: expect.stringContaining('Updated Recipe'),
          })
        );
      });
    });

    test('deletes a recipe', async () => {
      const mockRecipe = {
        id: 'delete-123',
        name: 'Recipe to Delete',
      };

      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ recipes: [mockRecipe] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: 'healthy' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true }),
        });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Recipe to Delete')).toBeInTheDocument();
      });

      // Click recipe to expand
      const recipeCard = screen.getByText('Recipe to Delete').closest('.recipe-card');
      fireEvent.click(recipeCard);

      // Click delete button
      const deleteButton = screen.getAllByRole('button').find(btn => 
        btn.querySelector('svg') && btn.title === 'Delete recipe'
      );
      fireEvent.click(deleteButton);

      expect(confirm).toHaveBeenCalledWith('Are you sure you want to delete this recipe?');

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/recipes/delete-123'),
          expect.objectContaining({
            method: 'DELETE',
          })
        );
      });
    });
  });

  describe('Recipe Clipping', () => {
    test('clips a recipe from URL with preview', async () => {
      const clippedRecipe = {
        name: 'Clipped Recipe',
        description: 'From the web',
        ingredients: ['web ingredient 1', 'web ingredient 2'],
        instructions: ['web step 1', 'web step 2'],
        prep_time: 'PT20M',
        cook_time: 'PT30M',
        image_url: 'https://example.com/clipped.jpg',
      };

      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ recipes: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: 'healthy' }),
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

      // Type URL in search
      const searchInput = screen.getByPlaceholderText('Search recipes or paste a URL to clip...');
      await userEvent.type(searchInput, 'https://example.com/recipe');

      // Click clip button
      const clipButton = screen.getByRole('button', { name: /clip recipe/i });
      fireEvent.click(clipButton);

      expect(screen.getByText('Clipping recipe...')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText('Recipe Preview')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Clipped Recipe')).toBeInTheDocument();
      });

      // Edit before saving
      const descInput = screen.getByText('From the web');
      await userEvent.clear(descInput);
      await userEvent.type(descInput, 'Modified description');

      // Save clipped recipe
      const saveButton = screen.getByText('Save Recipe');
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

    test('handles clipping error', async () => {
      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ recipes: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: 'healthy' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: async () => ({ error: 'Invalid URL' }),
        });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText('Loading recipes...')).not.toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search recipes or paste a URL to clip...');
      await userEvent.type(searchInput, 'https://invalid.com/recipe');

      const clipButton = screen.getByRole('button', { name: /clip recipe/i });
      fireEvent.click(clipButton);

      await waitFor(() => {
        expect(alert).toHaveBeenCalledWith(expect.stringContaining('Failed to clip'));
        expect(consoleSpy).toHaveBeenCalled();
      });

      consoleSpy.mockRestore();
    });
  });

  describe('Search and Filter', () => {
    test('filters recipes by search term', async () => {
      const mockRecipes = [
        { id: 1, name: 'Chocolate Cake', ingredients: ['chocolate', 'flour'] },
        { id: 2, name: 'Vanilla Cake', ingredients: ['vanilla', 'flour'] },
        { id: 3, name: 'Chocolate Cookies', ingredients: ['chocolate', 'butter'] },
      ];

      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ recipes: mockRecipes }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: 'healthy' }),
        });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Chocolate Cake')).toBeInTheDocument();
        expect(screen.getByText('Vanilla Cake')).toBeInTheDocument();
        expect(screen.getByText('Chocolate Cookies')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search recipes or paste a URL to clip...');
      await userEvent.type(searchInput, 'chocolate');

      // Should show only chocolate recipes
      expect(screen.getByText('Chocolate Cake')).toBeInTheDocument();
      expect(screen.getByText('Chocolate Cookies')).toBeInTheDocument();
      expect(screen.queryByText('Vanilla Cake')).not.toBeInTheDocument();
    });
  });

  describe('UI Interactions', () => {
    test('handles scroll effects', async () => {
      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ recipes: Array(20).fill(null).map((_, i) => ({
            id: i,
            name: `Recipe ${i}`,
          })) }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: 'healthy' }),
        });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Recipe 0')).toBeInTheDocument();
      });

      // Simulate scroll
      fireEvent.scroll(window, { target: { scrollY: 100 } });

      // IntersectionObserver callbacks should be triggered
      expect(mockIntersectionObserver).toHaveBeenCalled();
    });

    test('handles window resize', async () => {
      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ recipes: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: 'healthy' }),
        });

      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText('Loading recipes...')).not.toBeInTheDocument();
      });

      // Wait for canvas initialization
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      // Simulate resize
      act(() => {
        global.innerWidth = 500;
        global.innerHeight = 500;
        global.dispatchEvent(new Event('resize'));
      });

      // Canvas should be updated
      expect(mockCanvasContext.clearRect).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    test('handles network errors gracefully', async () => {
      fetch.mockRejectedValueOnce(new Error('Network error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText('Loading recipes...')).not.toBeInTheDocument();
        expect(consoleSpy).toHaveBeenCalledWith('Error fetching recipes:', expect.any(Error));
      });

      consoleSpy.mockRestore();
    });

    test('handles invalid recipe data', async () => {
      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ recipes: [
            { id: 1 }, // Missing name
            { id: 2, name: null }, // Null name
            { id: 3, name: '' }, // Empty name
            { id: 4, name: 'Valid Recipe' },
          ] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: 'healthy' }),
        });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Untitled Recipe')).toBeInTheDocument();
        expect(screen.getByText('Valid Recipe')).toBeInTheDocument();
      });
    });
  });

  describe('Dark Mode', () => {
    test('applies dark mode based on system preference', async () => {
      window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: query === '(prefers-color-scheme: dark)',
        media: query,
        onchange: null,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      }));

      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ recipes: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: 'healthy' }),
        });

      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText('Loading recipes...')).not.toBeInTheDocument();
      });

      // Wait for dark mode to be applied
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      // Should initialize seasoning background for dark mode
      expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalled();
    });
  });
});