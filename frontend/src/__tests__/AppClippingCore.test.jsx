import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';

// Mock fetch globally
global.fetch = jest.fn();

// Mock window functions
global.alert = jest.fn();
global.confirm = jest.fn();

describe('App Component - Core Clipping Functionality', () => {
  beforeEach(() => {
    fetch.mockClear();
    alert.mockClear();
    confirm.mockClear();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.restoreAllMocks();
  });

  test('complete clipping workflow - clip and save recipe', async () => {
    const mockRecipe = {
      name: 'Test Recipe',
      description: 'A test recipe',
      ingredients: ['ingredient 1', 'ingredient 2'],
      instructions: ['step 1', 'step 2'],
      source_url: 'https://example.com/recipe',
      image_url: 'https://example.com/image.jpg'
    };

    // Mock all fetch calls in sequence
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] }) // fetchRecipes
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) }) // checkClipperHealth
      .mockResolvedValueOnce({ ok: true, json: async () => mockRecipe }) // clipRecipe
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 1 }) }) // saveRecipe
      .mockResolvedValueOnce({ ok: true, json: async () => [{ ...mockRecipe, id: 1 }] }); // fetchRecipes after save

    const user = userEvent.setup();
    render(<App />);
    
    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByTitle(/Clip recipe from website/)).toBeInTheDocument();
    });

    // Open clip form
    fireEvent.click(screen.getByTitle(/Clip recipe from website/));
    expect(screen.getByText('Clip Recipe from Website')).toBeInTheDocument();

    // Enter URL and clip
    await user.type(screen.getByPlaceholderText('Recipe URL'), 'https://example.com/recipe');
    await user.click(screen.getByRole('button', { name: /Clip Recipe/i }));

    // Wait for recipe preview to appear
    await waitFor(() => {
      expect(screen.getByText('Clipped Recipe Preview')).toBeInTheDocument();
      expect(screen.getByText('Test Recipe')).toBeInTheDocument();
      expect(screen.getByText('A test recipe')).toBeInTheDocument();
      expect(screen.getByText('ingredient 1')).toBeInTheDocument();
      expect(screen.getByText('step 1')).toBeInTheDocument();
    });

    // Save the recipe
    fireEvent.click(screen.getByText('Save Recipe'));

    // Verify success
    await waitFor(() => {
      expect(alert).toHaveBeenCalledWith('Recipe saved successfully!');
    });
  });

  test('handles clipping errors gracefully', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) })
      .mockResolvedValueOnce({ 
        ok: false, 
        status: 404,
        text: async () => 'No recipe found'
      });

    const user = userEvent.setup();
    render(<App />);
    
    await waitFor(() => {
      fireEvent.click(screen.getByTitle(/Clip recipe from website/));
    });

    await user.type(screen.getByPlaceholderText('Recipe URL'), 'https://example.com/no-recipe');
    await user.click(screen.getByRole('button', { name: /Clip Recipe/i }));

    await waitFor(() => {
      expect(screen.getByText(/No recipe found on this page/)).toBeInTheDocument();
    });
  });

  test('edit mode works correctly', async () => {
    const mockRecipe = {
      name: 'Original Recipe',
      ingredients: ['ingredient 1'],
      instructions: ['step 1'],
      source_url: 'https://example.com/recipe'
    };

    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => mockRecipe });

    const user = userEvent.setup();
    render(<App />);
    
    // Clip a recipe
    await waitFor(() => {
      fireEvent.click(screen.getByTitle(/Clip recipe from website/));
    });

    await user.type(screen.getByPlaceholderText('Recipe URL'), 'https://example.com/recipe');
    await user.click(screen.getByRole('button', { name: /Clip Recipe/i }));

    // Wait for recipe to load
    await waitFor(() => {
      expect(screen.getByText('Original Recipe')).toBeInTheDocument();
    });

    // Enter edit mode
    fireEvent.click(screen.getByText('✏️ Edit Recipe'));

    // Wait for edit form
    await waitFor(() => {
      expect(screen.getByDisplayValue('Original Recipe')).toBeInTheDocument();
    });

    // Edit the name
    const nameInput = screen.getByDisplayValue('Original Recipe');
    await user.clear(nameInput);
    await user.type(nameInput, 'Edited Recipe');

    // Save edits
    fireEvent.click(screen.getByText('✓ Update Preview'));

    // Verify changes
    await waitFor(() => {
      expect(screen.getByText('Edited Recipe')).toBeInTheDocument();
      expect(screen.queryByDisplayValue('Original Recipe')).not.toBeInTheDocument();
    });
  });
});