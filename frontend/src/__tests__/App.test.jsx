import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';

// Mock fetch globally
global.fetch = jest.fn();

// Mock window functions
global.alert = jest.fn();
global.confirm = jest.fn();

// Mock requestAnimationFrame
global.requestAnimationFrame = jest.fn(cb => setTimeout(cb, 0));

// Mock URL.createObjectURL
global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');

describe('formatDuration function', () => {
  // We need to extract the formatDuration function to test it
  // Since it's not exported, we'll test it through the component
  
  beforeEach(() => {
    fetch.mockClear();
    fetch.mockResolvedValue({
      ok: true,
      json: async () => []
    });
  });

  test('formats PT30M correctly', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{
        id: 1,
        name: 'Test Recipe',
        prep_time: 'PT30M',
        cook_time: null,
        recipe_yield: null
      }]
    });

    render(<App />);
    
    await waitFor(() => {
      expect(screen.getByText('30 m')).toBeInTheDocument();
    });
  });

  test('formats PT1H correctly', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{
        id: 1,
        name: 'Test Recipe',
        prep_time: 'PT1H',
        cook_time: null,
        recipe_yield: null
      }]
    });

    render(<App />);
    
    await waitFor(() => {
      expect(screen.getByText('1 h')).toBeInTheDocument();
    });
  });

  test('formats PT1H30M correctly', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{
        id: 1,
        name: 'Test Recipe',
        prep_time: 'PT1H30M',
        cook_time: null,
        recipe_yield: null
      }]
    });

    render(<App />);
    
    await waitFor(() => {
      expect(screen.getByText('1 h 30 m')).toBeInTheDocument();
    });
  });

  test('returns original string if not ISO 8601 format', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{
        id: 1,
        name: 'Test Recipe',
        prep_time: '30 minutes',
        cook_time: null,
        recipe_yield: null
      }]
    });

    render(<App />);
    
    await waitFor(() => {
      expect(screen.getByText('30 minutes')).toBeInTheDocument();
    });
  });

  test('handles null or undefined duration', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{
        id: 1,
        name: 'Test Recipe',
        prep_time: null,
        cook_time: undefined,
        recipe_yield: null
      }]
    });

    render(<App />);
    
    await waitFor(() => {
      expect(screen.getByText('-')).toBeInTheDocument();
    });
  });

  test('handles invalid ISO 8601 format', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{
        id: 1,
        name: 'Test Recipe',
        prep_time: 'PT',
        cook_time: null,
        recipe_yield: null
      }]
    });

    render(<App />);
    
    await waitFor(() => {
      expect(screen.getByText('PT')).toBeInTheDocument();
    });
  });

  test('handles multiple hours', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{
        id: 1,
        name: 'Test Recipe',
        prep_time: 'PT2H45M',
        cook_time: null,
        recipe_yield: null
      }]
    });

    render(<App />);
    
    await waitFor(() => {
      expect(screen.getByText('2 h 45 m')).toBeInTheDocument();
    });
  });

  test('handles only minutes without hours', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{
        id: 1,
        name: 'Test Recipe',
        prep_time: 'PT45M',
        cook_time: null,
        recipe_yield: null
      }]
    });

    render(<App />);
    
    await waitFor(() => {
      expect(screen.getByText('45 m')).toBeInTheDocument();
    });
  });

  test('handles duration with seconds (ignores seconds)', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{
        id: 1,
        name: 'Test Recipe',
        prep_time: 'PT30M30S',
        cook_time: null,
        recipe_yield: null
      }]
    });

    render(<App />);
    
    await waitFor(() => {
      expect(screen.getByText('30 m')).toBeInTheDocument();
    });
  });

  test('handles empty string duration', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{
        id: 1,
        name: 'Test Recipe',
        prep_time: '',
        cook_time: null,
        recipe_yield: null
      }]
    });

    render(<App />);
    
    await waitFor(() => {
      const timeValue = screen.getByText('-');
      expect(timeValue).toBeInTheDocument();
    });
  });
});

describe('App Component - Basic Rendering', () => {
  beforeEach(() => {
    fetch.mockClear();
    alert.mockClear();
    confirm.mockClear();
  });

  test('renders app title and icon', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => []
    });

    render(<App />);
    
    expect(screen.getByText('Seasoned')).toBeInTheDocument();
    expect(screen.getByAltText('Seasoned')).toBeInTheDocument();
  });

  test('renders FAB buttons', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => []
    });

    render(<App />);
    
    await waitFor(() => {
      expect(screen.getByTitle(/Clip recipe from website/)).toBeInTheDocument();
      const addButton = screen.getByText('+');
      expect(addButton).toBeInTheDocument();
    });
  });

  test('initializes with empty recipe list', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => []
    });

    render(<App />);
    
    await waitFor(() => {
      const recipeGrid = document.querySelector('.recipe-grid');
      expect(recipeGrid).toBeInTheDocument();
      expect(recipeGrid.children.length).toBe(0);
    });
  });

  test('displays recipes when loaded', async () => {
    const mockRecipes = [
      {
        id: 1,
        name: 'Pasta Carbonara',
        description: 'Classic Italian pasta',
        ingredients: ['pasta', 'eggs', 'bacon'],
        instructions: ['Cook pasta', 'Mix with eggs'],
        image_url: 'https://example.com/pasta.jpg'
      },
      {
        id: 2,
        name: 'Caesar Salad',
        description: 'Fresh salad',
        ingredients: ['lettuce', 'croutons'],
        instructions: ['Mix ingredients'],
        image_url: null
      }
    ];

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockRecipes
    });

    render(<App />);
    
    await waitFor(() => {
      expect(screen.getByText('Pasta Carbonara')).toBeInTheDocument();
      expect(screen.getByText('Caesar Salad')).toBeInTheDocument();
    });
  });

  test('handles fetch error gracefully', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation();
    fetch.mockRejectedValueOnce(new Error('Network error'));

    render(<App />);
    
    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        'Error fetching recipes:',
        expect.any(Error)
      );
    });

    consoleError.mockRestore();
  });

  test('checks clipper health on mount', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] }) // recipes
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) }); // clipper health

    render(<App />);
    
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('https://test-clipper-api.example.com/health');
    });
  });

  test('handles clipper unavailable', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation();
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] }) // recipes
      .mockRejectedValueOnce(new Error('Network error')); // clipper health fails

    render(<App />);
    
    await waitFor(() => {
      const clipButton = screen.getByTitle(/Clipper service unavailable/);
      expect(clipButton).toBeDisabled();
    });

    consoleError.mockRestore();
  });
});

describe('App Component - Add Recipe Form', () => {
  beforeEach(() => {
    fetch.mockClear();
    alert.mockClear();
    fetch.mockResolvedValue({
      ok: true,
      json: async () => []
    });
  });

  test('shows add recipe form when FAB is clicked', async () => {
    render(<App />);
    
    const addButton = screen.getByText('+');
    fireEvent.click(addButton);

    expect(screen.getByText('Add New Recipe')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Description')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Ingredients (one per line)')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Instructions (one per line)')).toBeInTheDocument();
  });

  test('closes add recipe form', async () => {
    render(<App />);
    
    const addButton = screen.getByText('+');
    fireEvent.click(addButton);

    const closeButton = screen.getByText('×');
    fireEvent.click(closeButton);

    expect(screen.queryByText('Add New Recipe')).not.toBeInTheDocument();
  });

  test('adds a new recipe successfully', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] }) // initial load
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) }) // clipper health
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 1 }) }) // add recipe
      .mockResolvedValueOnce({ ok: true, json: async () => [{ 
        id: 1, 
        name: 'New Recipe',
        description: 'Test description',
        ingredients: ['ingredient 1', 'ingredient 2'],
        instructions: ['step 1', 'step 2']
      }] }); // refresh recipes

    const user = userEvent.setup();
    render(<App />);
    
    // Open form
    const addButton = screen.getByText('+');
    await user.click(addButton);

    // Fill form
    await user.type(screen.getByPlaceholderText('Name'), 'New Recipe');
    await user.type(screen.getByPlaceholderText('Description'), 'Test description');
    await user.type(screen.getByPlaceholderText('Ingredients (one per line)'), 'ingredient 1\ningredient 2');
    await user.type(screen.getByPlaceholderText('Instructions (one per line)'), 'step 1\nstep 2');

    // Submit
    await user.click(screen.getByText('Add Recipe'));

    await waitFor(() => {
      expect(screen.getByText('New Recipe')).toBeInTheDocument();
    });
  });

  test('validates required name field', async () => {
    render(<App />);
    
    const addButton = screen.getByText('+');
    fireEvent.click(addButton);

    // Try to submit without name
    fireEvent.click(screen.getByText('Add Recipe'));

    // Form should still be open
    expect(screen.getByText('Add New Recipe')).toBeInTheDocument();
  });

  test('handles image upload', async () => {
    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    
    render(<App />);
    
    const addButton = screen.getByText('+');
    fireEvent.click(addButton);

    const input = screen.getByLabelText(/Choose Image/);
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByText('test.jpg')).toBeInTheDocument();
  });

  test('validates image file type', async () => {
    const file = new File(['test'], 'test.txt', { type: 'text/plain' });
    
    render(<App />);
    
    const addButton = screen.getByText('+');
    fireEvent.click(addButton);

    const input = screen.getByLabelText(/Choose Image/);
    fireEvent.change(input, { target: { files: [file] } });

    expect(alert).toHaveBeenCalledWith('Please select a valid image file');
  });
});

describe('App Component - Edit Recipe', () => {
  const mockRecipe = {
    id: 1,
    name: 'Original Recipe',
    description: 'Original description',
    ingredients: ['ingredient 1', 'ingredient 2'],
    instructions: ['step 1', 'step 2'],
    image_url: 'https://example.com/image.jpg'
  };

  beforeEach(() => {
    fetch.mockClear();
    alert.mockClear();
  });

  test('opens edit form with recipe data', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [mockRecipe] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) });

    render(<App />);
    
    // Wait for recipe to load and click it
    await waitFor(() => {
      fireEvent.click(screen.getByText('Original Recipe'));
    });

    // Click edit button in fullscreen view
    await waitFor(() => {
      const editButton = screen.getByTitle('Edit Recipe');
      fireEvent.click(editButton);
    });

    // Check form is populated
    expect(screen.getByDisplayValue('Original Recipe')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Original description')).toBeInTheDocument();
    expect(screen.getByDisplayValue('ingredient 1\ningredient 2')).toBeInTheDocument();
    expect(screen.getByDisplayValue('step 1\nstep 2')).toBeInTheDocument();
  });

  test('updates recipe successfully', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [mockRecipe] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) })
      .mockResolvedValueOnce({ ok: true }) // update request
      .mockResolvedValueOnce({ ok: true, json: async () => [{
        ...mockRecipe,
        name: 'Updated Recipe'
      }] });

    const user = userEvent.setup();
    render(<App />);
    
    // Open recipe and edit
    await waitFor(() => {
      fireEvent.click(screen.getByText('Original Recipe'));
    });

    await waitFor(() => {
      fireEvent.click(screen.getByTitle('Edit Recipe'));
    });

    // Update name
    const nameInput = screen.getByDisplayValue('Original Recipe');
    await user.clear(nameInput);
    await user.type(nameInput, 'Updated Recipe');

    // Submit
    await user.click(screen.getByText('Update Recipe'));

    await waitFor(() => {
      expect(screen.getByText('Updated Recipe')).toBeInTheDocument();
    });
  });

  test('cancels edit form', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [mockRecipe] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) });

    render(<App />);
    
    await waitFor(() => {
      fireEvent.click(screen.getByText('Original Recipe'));
    });

    await waitFor(() => {
      fireEvent.click(screen.getByTitle('Edit Recipe'));
    });

    fireEvent.click(screen.getByText('Cancel'));

    expect(screen.queryByText('Edit Recipe')).not.toBeInTheDocument();
  });
});

describe('App Component - Delete Recipe', () => {
  beforeEach(() => {
    fetch.mockClear();
    confirm.mockClear();
  });

  test('deletes recipe with confirmation', async () => {
    const mockRecipe = {
      id: 1,
      name: 'Recipe to Delete',
      ingredients: [],
      instructions: []
    };

    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [mockRecipe] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) })
      .mockResolvedValueOnce({ ok: true }) // delete request
      .mockResolvedValueOnce({ ok: true, json: async () => [] }); // refresh with no recipes

    confirm.mockReturnValue(true);

    render(<App />);
    
    // Open recipe
    await waitFor(() => {
      fireEvent.click(screen.getByText('Recipe to Delete'));
    });

    // Click delete
    await waitFor(() => {
      fireEvent.click(screen.getByTitle('Delete Recipe'));
    });

    expect(confirm).toHaveBeenCalledWith('Are you sure you want to delete this recipe?');
    
    await waitFor(() => {
      expect(screen.queryByText('Recipe to Delete')).not.toBeInTheDocument();
    });
  });

  test('cancels delete when not confirmed', async () => {
    const mockRecipe = {
      id: 1,
      name: 'Recipe to Keep',
      ingredients: [],
      instructions: []
    };

    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [mockRecipe] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) });

    confirm.mockReturnValue(false);

    render(<App />);
    
    await waitFor(() => {
      fireEvent.click(screen.getByText('Recipe to Keep'));
    });

    await waitFor(() => {
      fireEvent.click(screen.getByTitle('Delete Recipe'));
    });

    expect(confirm).toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(2); // Only initial calls, no delete
  });
});

describe('App Component - Recipe View', () => {
  beforeEach(() => {
    fetch.mockClear();
  });

  test('displays full recipe details', async () => {
    const mockRecipe = {
      id: 1,
      name: 'Detailed Recipe',
      description: 'A detailed description',
      recipeIngredient: ['ingredient 1', 'ingredient 2', 'ingredient 3'],
      recipeInstructions: [
        { '@type': 'HowToStep', text: 'First step' },
        { '@type': 'HowToStep', text: 'Second step' }
      ],
      prep_time: 'PT15M',
      cook_time: 'PT30M',
      recipe_yield: '4 servings',
      image_url: 'https://example.com/recipe.jpg',
      source_url: 'https://example.com/recipe',
      video_url: 'https://youtube.com/watch?v=123'
    };

    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [mockRecipe] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) });

    render(<App />);
    
    await waitFor(() => {
      fireEvent.click(screen.getByText('Detailed Recipe'));
    });

    // Check all details are displayed
    expect(screen.getByText('Detailed Recipe')).toBeInTheDocument();
    expect(screen.getByText('15 m')).toBeInTheDocument();
    expect(screen.getByText('30 m')).toBeInTheDocument();
    expect(screen.getByText('4 servings')).toBeInTheDocument();
    expect(screen.getByText('ingredient 1')).toBeInTheDocument();
    expect(screen.getByText('ingredient 2')).toBeInTheDocument();
    expect(screen.getByText('ingredient 3')).toBeInTheDocument();
    expect(screen.getByText('First step')).toBeInTheDocument();
    expect(screen.getByText('Second step')).toBeInTheDocument();
    expect(screen.getByText('🌐 Source Recipe')).toBeInTheDocument();
    expect(screen.getByText('🎥 Watch Video')).toBeInTheDocument();
  });

  test('handles recipes with old schema format', async () => {
    const mockRecipe = {
      id: 1,
      name: 'Old Format Recipe',
      ingredients: ['old ingredient 1', 'old ingredient 2'],
      instructions: ['old step 1', 'old step 2']
    };

    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [mockRecipe] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) });

    render(<App />);
    
    await waitFor(() => {
      fireEvent.click(screen.getByText('Old Format Recipe'));
    });

    // Should still display properly
    expect(screen.getByText('old ingredient 1')).toBeInTheDocument();
    expect(screen.getByText('old ingredient 2')).toBeInTheDocument();
    expect(screen.getByText('old step 1')).toBeInTheDocument();
    expect(screen.getByText('old step 2')).toBeInTheDocument();
  });

  test('closes recipe view with back button', async () => {
    const mockRecipe = {
      id: 1,
      name: 'Recipe',
      ingredients: [],
      instructions: []
    };

    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => [mockRecipe] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) });

    render(<App />);
    
    await waitFor(() => {
      fireEvent.click(screen.getByText('Recipe'));
    });

    const backButton = screen.getByText('←');
    fireEvent.click(backButton);

    // Should return to recipe grid
    expect(screen.queryByText('←')).not.toBeInTheDocument();
    expect(screen.getByText('+')).toBeInTheDocument(); // FAB should be visible
  });
});

describe('App Component - Dark Mode', () => {
  beforeEach(() => {
    fetch.mockClear();
  });

  test('detects dark mode preference', async () => {
    const mockMatchMedia = window.matchMedia;
    window.matchMedia = jest.fn().mockImplementation(query => ({
      matches: query === '(prefers-color-scheme: dark)',
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    }));

    fetch.mockResolvedValueOnce({ ok: true, json: async () => [] });

    render(<App />);

    await waitFor(() => {
      expect(window.matchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)');
    });

    window.matchMedia = mockMatchMedia;
  });

  test('responds to dark mode changes', async () => {
    let darkModeListener;
    const mockMatchMedia = window.matchMedia;
    window.matchMedia = jest.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      addEventListener: jest.fn((event, listener) => {
        if (event === 'change') {
          darkModeListener = listener;
        }
      }),
      removeEventListener: jest.fn()
    }));

    fetch.mockResolvedValueOnce({ ok: true, json: async () => [] });

    render(<App />);

    await waitFor(() => {
      expect(darkModeListener).toBeDefined();
    });

    // Simulate dark mode change
    act(() => {
      darkModeListener({ matches: true });
    });

    window.matchMedia = mockMatchMedia;
  });
});

describe('App Component - Seasoning Background', () => {
  beforeEach(() => {
    fetch.mockClear();
  });

  test('initializes seasoning background canvas', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => [] });

    render(<App />);

    await waitFor(() => {
      const canvas = document.querySelector('.seasoning-background');
      expect(canvas).toBeInTheDocument();
      expect(canvas.tagName).toBe('CANVAS');
    });
  });

  test('creates seasoning particles on initialization', async () => {
    const mockGetContext = jest.fn(() => ({
      clearRect: jest.fn(),
      beginPath: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      arc: jest.fn(),
      fill: jest.fn(),
      fillStyle: '',
      translate: jest.fn(),
      rotate: jest.fn(),
      save: jest.fn(),
      restore: jest.fn(),
      bezierCurveTo: jest.fn(),
      quadraticCurveTo: jest.fn(),
      closePath: jest.fn(),
    }));

    HTMLCanvasElement.prototype.getContext = mockGetContext;

    fetch.mockResolvedValueOnce({ ok: true, json: async () => [] });

    render(<App />);

    await waitFor(() => {
      expect(mockGetContext).toHaveBeenCalledWith('2d');
    }, { timeout: 2000 });
  });

  test('handles window resize for seasoning background', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => [] });

    render(<App />);

    const canvas = document.querySelector('.seasoning-background');
    const initialWidth = canvas.width;
    const initialHeight = canvas.height;

    // Simulate window resize
    global.innerWidth = 800;
    global.innerHeight = 600;
    fireEvent(window, new Event('resize'));

    await waitFor(() => {
      expect(canvas.width).toBe(800);
      expect(canvas.height).toBe(600);
    });
  });
});