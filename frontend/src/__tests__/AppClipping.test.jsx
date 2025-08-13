import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';

// Mock fetch globally
global.fetch = jest.fn();

// Mock window functions
global.alert = jest.fn();
global.confirm = jest.fn();

describe('App Component - Clipping Functionality', () => {
  beforeEach(() => {
    fetch.mockClear();
    alert.mockClear();
    confirm.mockClear();
  });

  test('shows clip form when clip FAB is clicked', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) });

    render(<App />);
    
    await waitFor(() => {
      const clipButton = screen.getByTitle(/Clip recipe from website/);
      fireEvent.click(clipButton);
    });

    expect(screen.getByText('Clip Recipe from Website')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Recipe URL')).toBeInTheDocument();
  });

  test('closes clip form', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) });

    render(<App />);
    
    await waitFor(() => {
      const clipButton = screen.getByTitle(/Clip recipe from website/);
      fireEvent.click(clipButton);
    });

    const closeButton = screen.getByText('×');
    fireEvent.click(closeButton);

    expect(screen.queryByText('Clip Recipe from Website')).not.toBeInTheDocument();
  });

  test('disables clip button when clipper is unavailable', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: false, status: 503 }); // clipper unavailable

    render(<App />);
    
    await waitFor(() => {
      const clipButton = screen.getByTitle(/Clipper service unavailable/);
      expect(clipButton).toBeDisabled();
    });
  });

  test('retries clipper health check', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: false, status: 503 }) // first health check fails
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) }); // retry succeeds

    render(<App />);
    
    await waitFor(() => {
      const clipButton = screen.getByTitle(/Clipper service unavailable/);
      fireEvent.click(clipButton);
    });

    await waitFor(() => {
      const retryButton = screen.getByTitle('Retry connection');
      fireEvent.click(retryButton);
    });

    await waitFor(() => {
      expect(screen.getByText('Clipper service is available')).toBeInTheDocument();
    });
  });

  test('clips recipe successfully', async () => {
    const mockClippedRecipe = {
      name: 'Clipped Recipe',
      description: 'A delicious recipe',
      ingredients: ['ingredient 1', 'ingredient 2'],
      instructions: ['step 1', 'step 2'],
      source_url: 'https://example.com/recipe'
    };

    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => mockClippedRecipe });

    const user = userEvent.setup();
    render(<App />);
    
    await waitFor(() => {
      const clipButton = screen.getByTitle(/Clip recipe from website/);
      fireEvent.click(clipButton);
    });

    await user.type(screen.getByPlaceholderText('Recipe URL'), 'https://example.com/recipe');
    await user.click(screen.getByRole('button', { name: /Clip Recipe/i }));

    await waitFor(() => {
      expect(screen.getByText('Clipped Recipe Preview')).toBeInTheDocument();
      expect(screen.getByText('Clipped Recipe')).toBeInTheDocument();
      expect(screen.getByText('A delicious recipe')).toBeInTheDocument();
    });
  });

  test('handles clip error - no recipe found', async () => {
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
      const clipButton = screen.getByTitle(/Clip recipe from website/);
      fireEvent.click(clipButton);
    });

    await user.type(screen.getByPlaceholderText('Recipe URL'), 'https://example.com/no-recipe');
    await user.click(screen.getByRole('button', { name: /Clip Recipe/i }));

    await waitFor(() => {
      expect(screen.getByText(/No recipe found on this page/)).toBeInTheDocument();
    });
  });

  test('handles clip error - extraction failed', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) })
      .mockResolvedValueOnce({ 
        ok: false, 
        status: 500,
        text: async () => 'Extraction failed'
      });

    const user = userEvent.setup();
    render(<App />);
    
    await waitFor(() => {
      const clipButton = screen.getByTitle(/Clip recipe from website/);
      fireEvent.click(clipButton);
    });

    await user.type(screen.getByPlaceholderText('Recipe URL'), 'https://example.com/complex-page');
    await user.click(screen.getByRole('button', { name: /Clip Recipe/i }));

    await waitFor(() => {
      expect(screen.getByText(/Recipe extraction failed/)).toBeInTheDocument();
    });
  });

  test('handles network error during clipping', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) })
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const user = userEvent.setup();
    render(<App />);
    
    await waitFor(() => {
      const clipButton = screen.getByTitle(/Clip recipe from website/);
      fireEvent.click(clipButton);
    });

    await user.type(screen.getByPlaceholderText('Recipe URL'), 'https://example.com/recipe');
    await user.click(screen.getByRole('button', { name: /Clip Recipe/i }));

    await waitFor(() => {
      expect(screen.getByText(/Clipper service is currently unavailable/)).toBeInTheDocument();
    });
  });

  test('shows loading state while clipping', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) })
      .mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve({
        ok: true,
        json: async () => ({ name: 'Test Recipe' })
      }), 100)));

    const user = userEvent.setup();
    render(<App />);
    
    await waitFor(() => {
      const clipButton = screen.getByTitle(/Clip recipe from website/);
      fireEvent.click(clipButton);
    });

    await user.type(screen.getByPlaceholderText('Recipe URL'), 'https://example.com/recipe');
    const clipRecipeButton = screen.getByText(/Clip Recipe/);
    await user.click(clipRecipeButton);

    expect(screen.getByText('🔄 Clipping...')).toBeInTheDocument();
  });

  test('edits clipped recipe preview', async () => {
    const mockClippedRecipe = {
      name: 'Original Name',
      description: 'Original description',
      ingredients: ['ingredient 1'],
      instructions: ['step 1'],
      source_url: 'https://example.com/recipe'
    };

    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => mockClippedRecipe });

    const user = userEvent.setup();
    render(<App />);
    
    await waitFor(() => {
      const clipButton = screen.getByTitle(/Clip recipe from website/);
      fireEvent.click(clipButton);
    });

    await user.type(screen.getByPlaceholderText('Recipe URL'), 'https://example.com/recipe');
    await user.click(screen.getByRole('button', { name: /Clip Recipe/i }));

    await waitFor(() => {
      expect(screen.getByText('✏️ Edit Recipe')).toBeInTheDocument();
    });

    await user.click(screen.getByText('✏️ Edit Recipe'));

    const nameInput = screen.getByDisplayValue('Original Name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Updated Name');

    await user.click(screen.getByText('✓ Update Preview'));

    expect(screen.getByText('Updated Name')).toBeInTheDocument();
  });

  test('adds ingredient in edit mode', async () => {
    const mockClippedRecipe = {
      name: 'Test Recipe',
      ingredients: ['ingredient 1'],
      instructions: ['step 1'],
      source_url: 'https://example.com/recipe'
    };

    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => mockClippedRecipe });

    const user = userEvent.setup();
    render(<App />);
    
    await waitFor(() => {
      const clipButton = screen.getByTitle(/Clip recipe from website/);
      fireEvent.click(clipButton);
    });

    await user.type(screen.getByPlaceholderText('Recipe URL'), 'https://example.com/recipe');
    await user.click(screen.getByRole('button', { name: /Clip Recipe/i }));

    // Wait for recipe to load
    await waitFor(() => {
      expect(screen.getByText('Test Recipe')).toBeInTheDocument();
      expect(screen.getByText('ingredient 1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('✏️ Edit Recipe'));

    // Wait for edit mode
    await waitFor(() => {
      expect(screen.getByText('+ Add Ingredient')).toBeInTheDocument();
    });

    await user.click(screen.getByText('+ Add Ingredient'));
    
    // Find all ingredient inputs and get the last one (newly added)
    const ingredientInputs = screen.getAllByRole('textbox').filter(input => 
      input.classList.contains('ingredient-input')
    );
    const newIngredientInput = ingredientInputs[ingredientInputs.length - 1];
    await user.type(newIngredientInput, 'new ingredient');

    await user.click(screen.getByText('✓ Update Preview'));

    expect(screen.getByText('new ingredient')).toBeInTheDocument();
  });

  test('removes ingredient in edit mode', async () => {
    const mockClippedRecipe = {
      name: 'Test Recipe',
      ingredients: ['ingredient 1', 'ingredient 2'],
      instructions: ['step 1'],
      source_url: 'https://example.com/recipe'
    };

    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => mockClippedRecipe });

    const user = userEvent.setup();
    render(<App />);
    
    await waitFor(() => {
      const clipButton = screen.getByTitle(/Clip recipe from website/);
      fireEvent.click(clipButton);
    });

    await user.type(screen.getByPlaceholderText('Recipe URL'), 'https://example.com/recipe');
    await user.click(screen.getByRole('button', { name: /Clip Recipe/i }));

    // Wait for the recipe to be displayed
    await waitFor(() => {
      expect(screen.getByText('Test Recipe')).toBeInTheDocument();
      expect(screen.getByText('ingredient 1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('✏️ Edit Recipe'));

    await waitFor(() => {
      const removeButtons = screen.getAllByTitle('Remove ingredient');
      expect(removeButtons.length).toBe(2);
    });

    const removeButtons = screen.getAllByTitle('Remove ingredient');
    await user.click(removeButtons[0]);

    await user.click(screen.getByText('✓ Update Preview'));

    expect(screen.queryByText('ingredient 1')).not.toBeInTheDocument();
    expect(screen.getByText('ingredient 2')).toBeInTheDocument();
  });

  test('cancels edit preview', async () => {
    const mockClippedRecipe = {
      name: 'Original Name',
      ingredients: ['ingredient 1'],
      instructions: ['step 1'],
      source_url: 'https://example.com/recipe'
    };

    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => mockClippedRecipe });

    const user = userEvent.setup();
    render(<App />);
    
    await waitFor(() => {
      const clipButton = screen.getByTitle(/Clip recipe from website/);
      fireEvent.click(clipButton);
    });

    await user.type(screen.getByPlaceholderText('Recipe URL'), 'https://example.com/recipe');
    await user.click(screen.getByRole('button', { name: /Clip Recipe/i }));

    // Wait for the recipe name to be displayed in preview
    await waitFor(() => {
      expect(screen.getByText('Original Name')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('✏️ Edit Recipe'));

    await waitFor(() => {
      const nameInput = screen.getByDisplayValue('Original Name');
      expect(nameInput).toBeInTheDocument();
    });

    const nameInput = screen.getByDisplayValue('Original Name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Changed Name');

    await user.click(screen.getByText('Cancel Edit'));

    expect(screen.getByText('Original Name')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Changed Name')).not.toBeInTheDocument();
  });

  test('saves clipped recipe to database', async () => {
    const mockClippedRecipe = {
      name: 'Recipe to Save',
      ingredients: ['ingredient 1'],
      instructions: ['step 1'],
      source_url: 'https://example.com/recipe'
    };

    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => mockClippedRecipe })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 1 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => [{ ...mockClippedRecipe, id: 1 }] });

    const user = userEvent.setup();
    render(<App />);
    
    await waitFor(() => {
      const clipButton = screen.getByTitle(/Clip recipe from website/);
      fireEvent.click(clipButton);
    });

    await user.type(screen.getByPlaceholderText('Recipe URL'), 'https://example.com/recipe');
    await user.click(screen.getByRole('button', { name: /Clip Recipe/i }));

    await waitFor(() => {
      fireEvent.click(screen.getByText('Save Recipe'));
    });

    await waitFor(() => {
      expect(alert).toHaveBeenCalledWith('Recipe saved successfully!');
      expect(screen.queryByText('Clipped Recipe Preview')).not.toBeInTheDocument();
    });
  });

  test('detects duplicate recipes', async () => {
    const existingRecipe = {
      id: 1,
      name: 'Duplicate Recipe',
      source_url: 'https://example.com/recipe'
    };

    const mockClippedRecipe = {
      name: 'Duplicate Recipe',
      ingredients: ['ingredient 1'],
      instructions: ['step 1'],
      source_url: 'https://example.com/recipe'
    };

    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [existingRecipe] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => mockClippedRecipe });

    confirm.mockReturnValue(false);

    const user = userEvent.setup();
    render(<App />);
    
    await waitFor(() => {
      const clipButton = screen.getByTitle(/Clip recipe from website/);
      fireEvent.click(clipButton);
    });

    await user.type(screen.getByPlaceholderText('Recipe URL'), 'https://example.com/recipe');
    await user.click(screen.getByRole('button', { name: /Clip Recipe/i }));

    await waitFor(() => {
      fireEvent.click(screen.getByText('Save Recipe'));
    });

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Potential duplicate detected'));
  });

  test('saves duplicate recipe when confirmed', async () => {
    const existingRecipe = {
      id: 1,
      name: 'Duplicate Recipe',
      source_url: 'https://example.com/recipe'
    };

    const mockClippedRecipe = {
      name: 'Duplicate Recipe',
      ingredients: ['ingredient 1'],
      instructions: ['step 1'],
      source_url: 'https://example.com/recipe'
    };

    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [existingRecipe] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => mockClippedRecipe })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 2 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => [existingRecipe, { ...mockClippedRecipe, id: 2 }] });

    confirm.mockReturnValue(true);

    const user = userEvent.setup();
    render(<App />);
    
    await waitFor(() => {
      const clipButton = screen.getByTitle(/Clip recipe from website/);
      fireEvent.click(clipButton);
    });

    await user.type(screen.getByPlaceholderText('Recipe URL'), 'https://example.com/recipe');
    await user.click(screen.getByRole('button', { name: /Clip Recipe/i }));

    await waitFor(() => {
      fireEvent.click(screen.getByText('Save Recipe'));
    });

    await waitFor(() => {
      expect(alert).toHaveBeenCalledWith('Recipe saved successfully!');
    });
  });

  test('handles save error from backend', async () => {
    const mockClippedRecipe = {
      name: 'Recipe',
      ingredients: ['ingredient 1'],
      instructions: ['step 1'],
      source_url: 'https://example.com/recipe'
    };

    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => mockClippedRecipe })
      .mockResolvedValueOnce({ 
        ok: false, 
        status: 400,
        text: async () => 'Recipe already exists'
      });

    const user = userEvent.setup();
    render(<App />);
    
    await waitFor(() => {
      const clipButton = screen.getByTitle(/Clip recipe from website/);
      fireEvent.click(clipButton);
    });

    await user.type(screen.getByPlaceholderText('Recipe URL'), 'https://example.com/recipe');
    await user.click(screen.getByRole('button', { name: /Clip Recipe/i }));

    await waitFor(() => {
      fireEvent.click(screen.getByText('Save Recipe'));
    });

    await waitFor(() => {
      expect(alert).toHaveBeenCalledWith('This recipe already exists in your collection. Please check if you have already saved it.');
    });
  });

  test('try again button repopulates URL field', async () => {
    const mockClippedRecipe = {
      name: 'Test Recipe',
      ingredients: ['ingredient 1'],
      instructions: ['step 1'],
      source_url: 'https://example.com/original-recipe'
    };

    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => mockClippedRecipe });

    const user = userEvent.setup();
    render(<App />);
    
    await waitFor(() => {
      const clipButton = screen.getByTitle(/Clip recipe from website/);
      fireEvent.click(clipButton);
    });

    await user.type(screen.getByPlaceholderText('Recipe URL'), 'https://example.com/original-recipe');
    await user.click(screen.getByRole('button', { name: /Clip Recipe/i }));

    await waitFor(() => {
      fireEvent.click(screen.getByText('🔄 Try Again'));
    });

    const urlInput = screen.getByPlaceholderText('Recipe URL');
    expect(urlInput).toHaveValue('https://example.com/original-recipe');
  });

  test('prevents multiple rapid saves', async () => {
    const mockClippedRecipe = {
      name: 'Recipe',
      ingredients: ['ingredient 1'],
      instructions: ['step 1'],
      source_url: 'https://example.com/recipe'
    };

    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => mockClippedRecipe });
    // Removed the save response mock since we're testing the debounce

    const user = userEvent.setup();
    render(<App />);
    
    await waitFor(() => {
      const clipButton = screen.getByTitle(/Clip recipe from website/);
      fireEvent.click(clipButton);
    });

    await user.type(screen.getByPlaceholderText('Recipe URL'), 'https://example.com/recipe');
    await user.click(screen.getByRole('button', { name: /Clip Recipe/i }));

    await waitFor(() => {
      const saveButton = screen.getByText('Save Recipe');
      fireEvent.click(saveButton);
      fireEvent.click(saveButton); // Click again rapidly
    });

    await waitFor(() => {
      expect(alert).toHaveBeenCalledWith('Please wait a moment before trying to save again.');
    });
  });

  test('shows save progress overlay', async () => {
    const mockClippedRecipe = {
      name: 'Recipe',
      ingredients: ['ingredient 1'],
      instructions: ['step 1'],
      source_url: 'https://example.com/recipe'
    };

    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => mockClippedRecipe })
      .mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve({
        ok: true,
        json: async () => ({ id: 1 })
      }), 100)));

    const user = userEvent.setup();
    render(<App />);
    
    await waitFor(() => {
      const clipButton = screen.getByTitle(/Clip recipe from website/);
      fireEvent.click(clipButton);
    });

    await user.type(screen.getByPlaceholderText('Recipe URL'), 'https://example.com/recipe');
    await user.click(screen.getByRole('button', { name: /Clip Recipe/i }));

    await waitFor(() => {
      fireEvent.click(screen.getByText('Save Recipe'));
    });

    expect(screen.getByText('Saving recipe...')).toBeInTheDocument();
    expect(screen.getByText("Please don't close this window")).toBeInTheDocument();
  });

  test('disables buttons while saving', async () => {
    const mockClippedRecipe = {
      name: 'Recipe',
      ingredients: ['ingredient 1'],
      instructions: ['step 1'],
      source_url: 'https://example.com/recipe'
    };

    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => mockClippedRecipe })
      .mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve({
        ok: true,
        json: async () => ({ id: 1 })
      }), 100)));

    const user = userEvent.setup();
    render(<App />);
    
    await waitFor(() => {
      const clipButton = screen.getByTitle(/Clip recipe from website/);
      fireEvent.click(clipButton);
    });

    await user.type(screen.getByPlaceholderText('Recipe URL'), 'https://example.com/recipe');
    await user.click(screen.getByRole('button', { name: /Clip Recipe/i }));

    await waitFor(() => {
      fireEvent.click(screen.getByText('Save Recipe'));
    });

    // All buttons should be disabled while saving
    expect(screen.getByText('✏️ Edit Recipe')).toBeDisabled();
    expect(screen.getByText('🔄 Saving...')).toBeDisabled();
    expect(screen.getByText('🔄 Try Again')).toBeDisabled();
    expect(screen.getByText('Cancel')).toBeDisabled();
    expect(screen.getByText('×')).toBeDisabled();
  });
});