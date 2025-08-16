import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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

// Mock alert and confirm
global.alert = jest.fn();
global.confirm = jest.fn(() => true);

describe('Recipe Management', () => {
  beforeEach(() => {
    fetch.mockClear();
    jest.clearAllMocks();
  });

  test('edits a recipe', async () => {
    const mockRecipes = [
      {
        id: 1,
        name: 'Original Recipe',
        description: 'Original description',
        ingredients: ['ingredient 1'],
        instructions: ['step 1'],
      },
    ];

    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ recipes: mockRecipes }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Original Recipe')).toBeInTheDocument();
    });

    // Click on recipe to expand
    const recipeCard = screen.getByText('Original Recipe').closest('.recipe-card');
    fireEvent.click(recipeCard);

    await waitFor(() => {
      expect(screen.getByText('ingredient 1')).toBeInTheDocument();
    });

    // Click edit button
    const editButton = screen.getByRole('button', { name: /edit/i });
    fireEvent.click(editButton);

    // Modify the recipe name
    const nameInput = screen.getByDisplayValue('Original Recipe');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Updated Recipe');

    // Save changes
    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/recipes/1'),
        expect.objectContaining({
          method: 'PUT',
          body: expect.stringContaining('Updated Recipe'),
        })
      );
    });
  });

  test('deletes a recipe', async () => {
    const mockRecipes = [
      {
        id: 1,
        name: 'Recipe to Delete',
        description: 'This will be deleted',
      },
    ];

    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ recipes: mockRecipes }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Recipe to Delete')).toBeInTheDocument();
    });

    // Click on recipe to expand
    const recipeCard = screen.getByText('Recipe to Delete').closest('.recipe-card');
    fireEvent.click(recipeCard);

    // Click delete button
    const deleteButton = screen.getByRole('button', { name: /delete/i });
    fireEvent.click(deleteButton);

    // Confirm deletion
    expect(global.confirm).toHaveBeenCalledWith(expect.stringContaining('delete'));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/recipes/1'),
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });
  });

  test('cancels delete when user declines confirmation', async () => {
    global.confirm.mockReturnValueOnce(false);

    const mockRecipes = [
      {
        id: 1,
        name: 'Recipe to Keep',
      },
    ];

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ recipes: mockRecipes }),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Recipe to Keep')).toBeInTheDocument();
    });

    // Click on recipe to expand
    const recipeCard = screen.getByText('Recipe to Keep').closest('.recipe-card');
    fireEvent.click(recipeCard);

    // Click delete button
    const deleteButton = screen.getByRole('button', { name: /delete/i });
    fireEvent.click(deleteButton);

    // Should not make delete request
    expect(fetch).toHaveBeenCalledTimes(1); // Only initial load
  });

  test('adds ingredients to recipe', async () => {
    const mockRecipes = [
      {
        id: 1,
        name: 'Recipe',
        ingredients: ['existing ingredient'],
      },
    ];

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ recipes: mockRecipes }),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Recipe')).toBeInTheDocument();
    });

    // Click on recipe to expand
    const recipeCard = screen.getByText('Recipe').closest('.recipe-card');
    fireEvent.click(recipeCard);

    // Click edit button
    const editButton = screen.getByRole('button', { name: /edit/i });
    fireEvent.click(editButton);

    // Add new ingredient
    const addIngredientButton = screen.getByText(/add ingredient/i);
    fireEvent.click(addIngredientButton);

    // Type in new ingredient
    const ingredientInputs = screen.getAllByPlaceholderText(/ingredient/i);
    const newIngredientInput = ingredientInputs[ingredientInputs.length - 1];
    await userEvent.type(newIngredientInput, 'new ingredient');
  });

  test('removes ingredients from recipe', async () => {
    const mockRecipes = [
      {
        id: 1,
        name: 'Recipe',
        ingredients: ['ingredient 1', 'ingredient 2'],
      },
    ];

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ recipes: mockRecipes }),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Recipe')).toBeInTheDocument();
    });

    // Click on recipe to expand
    const recipeCard = screen.getByText('Recipe').closest('.recipe-card');
    fireEvent.click(recipeCard);

    // Click edit button
    const editButton = screen.getByRole('button', { name: /edit/i });
    fireEvent.click(editButton);

    // Remove first ingredient
    const removeButtons = screen.getAllByRole('button', { name: /×|remove/i });
    fireEvent.click(removeButtons[0]);
  });

  test('adds instructions to recipe', async () => {
    const mockRecipes = [
      {
        id: 1,
        name: 'Recipe',
        instructions: ['existing step'],
      },
    ];

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ recipes: mockRecipes }),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Recipe')).toBeInTheDocument();
    });

    // Click on recipe to expand
    const recipeCard = screen.getByText('Recipe').closest('.recipe-card');
    fireEvent.click(recipeCard);

    // Click edit button
    const editButton = screen.getByRole('button', { name: /edit/i });
    fireEvent.click(editButton);

    // Add new instruction
    const addInstructionButton = screen.getByText(/add instruction/i);
    fireEvent.click(addInstructionButton);

    // Type in new instruction
    const instructionInputs = screen.getAllByPlaceholderText(/step/i);
    const newInstructionInput = instructionInputs[instructionInputs.length - 1];
    await userEvent.type(newInstructionInput, 'new step');
  });

  test('uploads recipe image', async () => {
    const mockRecipes = [
      {
        id: 1,
        name: 'Recipe',
      },
    ];

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ recipes: mockRecipes }),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Recipe')).toBeInTheDocument();
    });

    // Click on recipe to expand
    const recipeCard = screen.getByText('Recipe').closest('.recipe-card');
    fireEvent.click(recipeCard);

    // Click edit button
    const editButton = screen.getByRole('button', { name: /edit/i });
    fireEvent.click(editButton);

    // Find file input
    const fileInput = screen.getByLabelText(/choose image/i);
    const file = new File(['dummy content'], 'test.png', { type: 'image/png' });
    
    // Simulate file upload
    await userEvent.upload(fileInput, file);
  });

  test('handles save error gracefully', async () => {
    const mockRecipes = [
      {
        id: 1,
        name: 'Recipe',
      },
    ];

    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ recipes: mockRecipes }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Save failed' }),
      });

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Recipe')).toBeInTheDocument();
    });

    // Click on recipe to expand
    const recipeCard = screen.getByText('Recipe').closest('.recipe-card');
    fireEvent.click(recipeCard);

    // Click edit button
    const editButton = screen.getByRole('button', { name: /edit/i });
    fireEvent.click(editButton);

    // Save changes
    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Error updating recipe:', expect.any(Error));
    });

    consoleSpy.mockRestore();
  });

  test('handles delete error gracefully', async () => {
    const mockRecipes = [
      {
        id: 1,
        name: 'Recipe',
      },
    ];

    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ recipes: mockRecipes }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Delete failed' }),
      });

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Recipe')).toBeInTheDocument();
    });

    // Click on recipe to expand
    const recipeCard = screen.getByText('Recipe').closest('.recipe-card');
    fireEvent.click(recipeCard);

    // Click delete button
    const deleteButton = screen.getByRole('button', { name: /delete/i });
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Error deleting recipe:', expect.any(Error));
    });

    consoleSpy.mockRestore();
  });

  test('cancels editing changes', async () => {
    const mockRecipes = [
      {
        id: 1,
        name: 'Original Recipe',
        description: 'Original description',
      },
    ];

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ recipes: mockRecipes }),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Original Recipe')).toBeInTheDocument();
    });

    // Click on recipe to expand
    const recipeCard = screen.getByText('Original Recipe').closest('.recipe-card');
    fireEvent.click(recipeCard);

    // Click edit button
    const editButton = screen.getByRole('button', { name: /edit/i });
    fireEvent.click(editButton);

    // Modify the recipe name
    const nameInput = screen.getByDisplayValue('Original Recipe');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Changed Recipe');

    // Cancel changes
    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelButton);

    // Should not save changes
    expect(fetch).toHaveBeenCalledTimes(1); // Only initial load
  });

  test('validates required fields before saving', async () => {
    const mockRecipes = [
      {
        id: 1,
        name: 'Recipe',
      },
    ];

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ recipes: mockRecipes }),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Recipe')).toBeInTheDocument();
    });

    // Click on recipe to expand
    const recipeCard = screen.getByText('Recipe').closest('.recipe-card');
    fireEvent.click(recipeCard);

    // Click edit button
    const editButton = screen.getByRole('button', { name: /edit/i });
    fireEvent.click(editButton);

    // Clear the recipe name (required field)
    const nameInput = screen.getByDisplayValue('Recipe');
    await userEvent.clear(nameInput);

    // Try to save
    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    // Should show alert
    expect(global.alert).toHaveBeenCalledWith(expect.stringContaining('name'));
  });
});