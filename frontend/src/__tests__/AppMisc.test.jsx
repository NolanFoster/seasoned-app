import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';

// Mock fetch globally
global.fetch = jest.fn();

// Mock window functions
global.alert = jest.fn();
global.confirm = jest.fn();

// Mock console.error
const originalConsoleError = console.error;

describe('App Component - Error Handling and Edge Cases', () => {
  beforeEach(() => {
    fetch.mockClear();
    alert.mockClear();
    console.error = jest.fn();
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  test('handles fetch error when adding recipe', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) })
      .mockRejectedValueOnce(new Error('Network error'));

    const user = userEvent.setup();
    render(<App />);
    
    const addButton = screen.getByText('+');
    await user.click(addButton);

    await user.type(screen.getByPlaceholderText('Name'), 'Test Recipe');
    await user.click(screen.getByText('Add Recipe'));

    await waitFor(() => {
      expect(console.error).toHaveBeenCalledWith('Error adding recipe:', expect.any(Error));
    });
  });

  test('handles fetch error when updating recipe', async () => {
    const mockRecipe = {
      id: 1,
      name: 'Test Recipe',
      ingredients: ['test'],
      instructions: ['test']
    };

    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [mockRecipe] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) })
      .mockRejectedValueOnce(new Error('Network error'));

    const user = userEvent.setup();
    render(<App />);
    
    await waitFor(() => {
      fireEvent.click(screen.getByText('Test Recipe'));
    });

    await waitFor(() => {
      fireEvent.click(screen.getByTitle('Edit Recipe'));
    });

    await user.click(screen.getByText('Update Recipe'));

    await waitFor(() => {
      expect(console.error).toHaveBeenCalledWith('Error updating recipe:', expect.any(Error));
    });
  });

  test('handles fetch error when deleting recipe', async () => {
    const mockRecipe = {
      id: 1,
      name: 'Test Recipe',
      ingredients: [],
      instructions: []
    };

    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [mockRecipe] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) })
      .mockRejectedValueOnce(new Error('Network error'));

    confirm.mockReturnValue(true);

    render(<App />);
    
    await waitFor(() => {
      fireEvent.click(screen.getByText('Test Recipe'));
    });

    await waitFor(() => {
      fireEvent.click(screen.getByTitle('Delete Recipe'));
    });

    await waitFor(() => {
      expect(console.error).toHaveBeenCalledWith('Error deleting recipe:', expect.any(Error));
    });
  });

  test('handles fetch error when uploading image', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 1 }) })
      .mockRejectedValueOnce(new Error('Upload failed'));

    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    const user = userEvent.setup();
    
    render(<App />);
    
    const addButton = screen.getByText('+');
    await user.click(addButton);

    await user.type(screen.getByPlaceholderText('Name'), 'Test Recipe');
    
    const input = screen.getByLabelText(/Choose Image/);
    fireEvent.change(input, { target: { files: [file] } });

    await user.click(screen.getByText('Add Recipe'));

    await waitFor(() => {
      expect(console.error).toHaveBeenCalledWith('Error uploading image:', expect.any(Error));
    });
  });

  test('handles non-ok response when adding recipe', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) })
      .mockResolvedValueOnce({ ok: false, status: 400 });

    const user = userEvent.setup();
    render(<App />);
    
    const addButton = screen.getByText('+');
    await user.click(addButton);

    await user.type(screen.getByPlaceholderText('Name'), 'Test Recipe');
    await user.click(screen.getByText('Add Recipe'));

    // Should not refresh recipes since add failed
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  test('handles non-ok response when updating recipe', async () => {
    const mockRecipe = {
      id: 1,
      name: 'Test Recipe',
      ingredients: ['test'],
      instructions: ['test']
    };

    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [mockRecipe] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) })
      .mockResolvedValueOnce({ ok: false, status: 400 });

    const user = userEvent.setup();
    render(<App />);
    
    await waitFor(() => {
      fireEvent.click(screen.getByText('Test Recipe'));
    });

    await waitFor(() => {
      fireEvent.click(screen.getByTitle('Edit Recipe'));
    });

    await user.click(screen.getByText('Update Recipe'));

    // Form should still be open
    expect(screen.getByText('Edit Recipe')).toBeInTheDocument();
  });

  test('handles non-ok response when deleting recipe', async () => {
    const mockRecipe = {
      id: 1,
      name: 'Test Recipe',
      ingredients: [],
      instructions: []
    };

    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [mockRecipe] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) })
      .mockResolvedValueOnce({ ok: false, status: 400 });

    confirm.mockReturnValue(true);

    render(<App />);
    
    await waitFor(() => {
      fireEvent.click(screen.getByText('Test Recipe'));
    });

    await waitFor(() => {
      fireEvent.click(screen.getByTitle('Delete Recipe'));
    });

    // Recipe should still be visible
    await waitFor(() => {
      expect(screen.getByText('Test Recipe')).toBeInTheDocument();
    });
  });

  test('handles non-ok response when uploading image', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 1 }) })
      .mockResolvedValueOnce({ ok: false, status: 400 })
      .mockResolvedValueOnce({ ok: true, json: async () => [] });

    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    const user = userEvent.setup();
    
    render(<App />);
    
    const addButton = screen.getByText('+');
    await user.click(addButton);

    await user.type(screen.getByPlaceholderText('Name'), 'Test Recipe');
    
    const input = screen.getByLabelText(/Choose Image/);
    fireEvent.change(input, { target: { files: [file] } });

    await user.click(screen.getByText('Add Recipe'));

    // Should still fetch recipes even if image upload failed
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(5);
    });
  });

  test('handles clipper health check with non-ok response', async () => {
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation();
    
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: false, status: 503 });

    render(<App />);
    
    await waitFor(() => {
      expect(consoleWarn).toHaveBeenCalledWith('Clipper worker health check failed:', 503);
    });

    consoleWarn.mockRestore();
  });

  test('handles error parsing duration in formatDuration', async () => {
    // This tests the error path in formatDuration
    const mockRecipe = {
      id: 1,
      name: 'Test Recipe',
      prep_time: { toString: () => { throw new Error('Parse error'); } },
      cook_time: null,
      recipe_yield: null
    };

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [mockRecipe]
    });

    render(<App />);
    
    // Should still render even with error
    await waitFor(() => {
      expect(screen.getByText('Test Recipe')).toBeInTheDocument();
    });
  });

  test('handles recipes with various time field formats', async () => {
    const mockRecipes = [
      {
        id: 1,
        name: 'Recipe 1',
        prepTime: 'PT30M', // camelCase field
        cookTime: 'PT1H',
        yield: '4 servings' // different yield field name
      },
      {
        id: 2,
        name: 'Recipe 2',
        prep_time: 'PT15M',
        cook_time: 'PT45M',
        recipeYield: '2 servings' // different yield field name
      }
    ];

    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => mockRecipes })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) });

    render(<App />);
    
    await waitFor(() => {
      // Should handle all field name variations
      expect(screen.getByText('30 m')).toBeInTheDocument();
      expect(screen.getByText('1 h')).toBeInTheDocument();
      expect(screen.getByText('4 servings')).toBeInTheDocument();
      
      expect(screen.getByText('15 m')).toBeInTheDocument();
      expect(screen.getByText('45 m')).toBeInTheDocument();
      expect(screen.getByText('2 servings')).toBeInTheDocument();
    });
  });

  test('handles image load error in recipe card', async () => {
    const mockRecipe = {
      id: 1,
      name: 'Test Recipe',
      image_url: 'https://invalid-image.com/404.jpg'
    };

    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [mockRecipe] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) });

    render(<App />);
    
    await waitFor(() => {
      const img = screen.getByAltText('Test Recipe');
      fireEvent.error(img);
      
      // Image should be hidden after error
      expect(img.style.display).toBe('none');
    });
  });

  test('handles iframe error in video popup', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{
        id: 1,
        name: 'Test Recipe',
        video_url: 'https://invalid-video.com/video'
      }]
    });

    render(<App />);
    
    await waitFor(() => {
      fireEvent.click(screen.getByText('Test Recipe'));
    });

    await waitFor(() => {
      fireEvent.click(screen.getByText('🎥 Watch Video'));
    });

    const iframe = screen.getByTitle('Recipe Video');
    fireEvent.error(iframe);

    // Should still show iframe even after error
    expect(iframe).toBeInTheDocument();
  });

  test('handles calculateSimilarity with empty strings', async () => {
    const mockRecipes = [
      { id: 1, name: '', source_url: 'https://example.com' }
    ];

    const mockClippedRecipe = {
      name: 'New Recipe',
      ingredients: ['test'],
      instructions: ['test'],
      source_url: 'https://example.com'
    };

    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => mockRecipes })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => mockClippedRecipe });

    const user = userEvent.setup();
    render(<App />);
    
    await waitFor(() => {
      fireEvent.click(screen.getByTitle(/Clip recipe from website/));
    });

    await user.type(screen.getByPlaceholderText('Recipe URL'), 'https://example.com');
    await user.click(screen.getByRole('button', { name: /Clip Recipe/i }));

    await waitFor(() => {
      fireEvent.click(screen.getByText('Save Recipe'));
    });

    // Should not detect as duplicate with empty name
    expect(confirm).not.toHaveBeenCalled();
  });

  test('handles levenshteinDistance calculation', async () => {
    const mockRecipes = [
      { id: 1, name: 'Chicken Parmesan', source_url: 'https://example.com' }
    ];

    const mockClippedRecipe = {
      name: 'Chicken Parmesann', // Slight typo
      ingredients: ['test'],
      instructions: ['test'],
      source_url: 'https://example.com'
    };

    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => mockRecipes })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => mockClippedRecipe });

    confirm.mockReturnValue(false);

    const user = userEvent.setup();
    render(<App />);
    
    await waitFor(() => {
      fireEvent.click(screen.getByTitle(/Clip recipe from website/));
    });

    await user.type(screen.getByPlaceholderText('Recipe URL'), 'https://example.com');
    await user.click(screen.getByRole('button', { name: /Clip Recipe/i }));

    await waitFor(() => {
      fireEvent.click(screen.getByText('Save Recipe'));
    });

    // Should detect as duplicate due to high similarity
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Potential duplicate detected'));
  });

  test('handles very long strings in levenshteinDistance', async () => {
    const longString = 'a'.repeat(1000);
    const mockRecipes = [
      { id: 1, name: longString, source_url: 'https://example.com' }
    ];

    const mockClippedRecipe = {
      name: longString + 'b', // Slightly different
      ingredients: ['test'],
      instructions: ['test'],
      source_url: 'https://example.com'
    };

    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => mockRecipes })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => mockClippedRecipe });

    confirm.mockReturnValue(false);

    const user = userEvent.setup();
    render(<App />);
    
    await waitFor(() => {
      fireEvent.click(screen.getByTitle(/Clip recipe from website/));
    });

    await user.type(screen.getByPlaceholderText('Recipe URL'), 'https://example.com');
    await user.click(screen.getByRole('button', { name: /Clip Recipe/i }));

    await waitFor(() => {
      fireEvent.click(screen.getByText('Save Recipe'));
    });

    // Should detect as duplicate
    expect(confirm).toHaveBeenCalled();
  });

  test('handles saving recipe with catch block error', async () => {
    const mockClippedRecipe = {
      name: 'Test Recipe',
      ingredients: ['test'],
      instructions: ['test'],
      source_url: 'https://example.com'
    };

    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => mockClippedRecipe })
      .mockRejectedValueOnce(new Error('Network error'));

    const user = userEvent.setup();
    render(<App />);
    
    await waitFor(() => {
      fireEvent.click(screen.getByTitle(/Clip recipe from website/));
    });

    await user.type(screen.getByPlaceholderText('Recipe URL'), 'https://example.com');
    await user.click(screen.getByRole('button', { name: /Clip Recipe/i }));

    await waitFor(() => {
      fireEvent.click(screen.getByText('Save Recipe'));
    });

    await waitFor(() => {
      expect(alert).toHaveBeenCalledWith('Failed to save recipe. Please try again.');
    });
  });

  test('handles saving recipe with "already exists" error in catch', async () => {
    const mockClippedRecipe = {
      name: 'Test Recipe',
      ingredients: ['test'],
      instructions: ['test'],
      source_url: 'https://example.com'
    };

    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => mockClippedRecipe })
      .mockRejectedValueOnce(new Error('Recipe already exists in database'));

    const user = userEvent.setup();
    render(<App />);
    
    await waitFor(() => {
      fireEvent.click(screen.getByTitle(/Clip recipe from website/));
    });

    await user.type(screen.getByPlaceholderText('Recipe URL'), 'https://example.com');
    await user.click(screen.getByRole('button', { name: /Clip Recipe/i }));

    await waitFor(() => {
      fireEvent.click(screen.getByText('Save Recipe'));
    });

    await waitFor(() => {
      expect(alert).toHaveBeenCalledWith('This recipe already exists in your collection. Please check if you have already saved it.');
    });
  });

  test('handles updatePreview with empty name', async () => {
    const mockClippedRecipe = {
      name: 'Original Name',
      description: 'Test',
      ingredients: ['test'],
      instructions: ['test'],
      source_url: 'https://example.com'
    };

    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => mockClippedRecipe });

    const user = userEvent.setup();
    render(<App />);
    
    await waitFor(() => {
      fireEvent.click(screen.getByTitle(/Clip recipe from website/));
    });

    await user.type(screen.getByPlaceholderText('Recipe URL'), 'https://example.com');
    await user.click(screen.getByRole('button', { name: /Clip Recipe/i }));

    await waitFor(() => {
      fireEvent.click(screen.getByText('✏️ Edit Recipe'));
    });

    // Clear the name
    const nameInput = screen.getByDisplayValue('Original Name');
    await user.clear(nameInput);

    await user.click(screen.getByText('✓ Update Preview'));

    // Should not update with empty name
    // Input should remain in the DOM; just ensure name wasn't applied to preview
    expect(screen.queryByText('')).not.toBeInTheDocument();
  });

  test('handles edit preview with all fields', async () => {
    const mockClippedRecipe = {
      name: 'Original Recipe',
      description: 'Original description',
      ingredients: ['ingredient 1', 'ingredient 2'],
      instructions: ['step 1', 'step 2'],
      image_url: 'https://example.com/image.jpg',
      source_url: 'https://example.com/recipe'
    };

    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => mockClippedRecipe });

    const user = userEvent.setup();
    render(<App />);
    
    await waitFor(() => {
      fireEvent.click(screen.getByTitle(/Clip recipe from website/));
    });

    await user.type(screen.getByPlaceholderText('Recipe URL'), 'https://example.com/recipe');
    await user.click(screen.getByRole('button', { name: /Clip Recipe/i }));

    await waitFor(() => {
      expect(screen.getByText('Original Recipe')).toBeInTheDocument();
    });

    // Edit the preview
    await user.click(screen.getByText('✏️ Edit Recipe'));

    // Update all fields
    const nameInput = screen.getByDisplayValue('Original Recipe');
    await user.clear(nameInput);
    await user.type(nameInput, 'Updated Recipe');

    const descInput = screen.getByDisplayValue('Original description');
    await user.clear(descInput);
    await user.type(descInput, 'Updated description');

    // Add a new instruction
    await user.click(screen.getByText('+ Add Instruction'));
    const newInstructionTextarea = screen.getAllByPlaceholderText(/Step \d+/).pop();
    await user.type(newInstructionTextarea, 'New step 3');

    await user.click(screen.getByText('✓ Update Preview'));

    // Check all updates were applied
    expect(screen.getByText('Updated Recipe')).toBeInTheDocument();
    expect(screen.getByText('Updated description')).toBeInTheDocument();
    expect(screen.getByText('New step 3')).toBeInTheDocument();
  });
});