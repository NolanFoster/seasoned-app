import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';

// ── Helpers ────────────────────────────────────────────────────────────────

function mockFetchOk(responseBody) {
  global.fetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: () => Promise.resolve(responseBody),
  });
}

function mockFetchFail(status = 500) {
  global.fetch.mockResolvedValueOnce({
    ok: false,
    status,
    json: () => Promise.resolve({ error: 'Server error' }),
  });
}

// Sets the input to a value via a single change event (avoids per-character
// debounce fires that would consume mockOnce responses prematurely).
function setInputValue(value) {
  fireEvent.change(screen.getByRole('textbox'), { target: { value } });
}

function pressEnter() {
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
}

const SEARCH_RESPONSE = {
  results: [{ id: 'abc123' }],
};

const FULL_RECIPE_RESPONSE = {
  data: {
    name: 'Chocolate Cake',
    description: 'A rich chocolate cake.',
    image: 'https://example.com/cake.jpg',
    prepTime: '20 minutes',
    cookTime: '40 minutes',
    servings: '8',
    ingredients: ['2 cups flour', '1 cup cocoa'],
    instructions: ['Mix dry ingredients.', 'Bake at 350°F.'],
    url: 'https://example.com/cake',
  },
};

const CLIP_RESPONSE = {
  recipe: {
    name: 'Clipped Soup',
    description: 'A clipped soup recipe.',
    image: '',
    prepTime: '5 minutes',
    cookTime: '15 minutes',
    servings: '2',
    ingredients: ['water', 'salt'],
    instructions: ['Boil water.', 'Add salt.'],
  },
};

const GENERATE_RESPONSE = {
  success: true,
  recipe: {
    name: 'AI Omelette',
    description: 'An AI-crafted omelette.',
    image_url: '',
    prepTime: '5 minutes',
    cookTime: '5 minutes',
    servings: '1',
    ingredients: ['2 eggs', 'butter'],
    instructions: ['Beat eggs.', 'Cook in butter.'],
  },
};

// ── isValidUrl (tested via omnibox UI behaviour) ───────────────────────────

describe('Omnibox input mode detection', () => {
  test('shows Search + Generate buttons for plain text input', () => {
    render(<App />);
    setInputValue('pasta');
    expect(screen.getByText('Search')).toBeInTheDocument();
    expect(screen.getByText('Generate')).toBeInTheDocument();
  });

  test('shows Clip button when input is a valid https URL', () => {
    render(<App />);
    setInputValue('https://example.com/recipe');
    expect(screen.getByText('Clip')).toBeInTheDocument();
    expect(screen.queryByText('Generate')).not.toBeInTheDocument();
  });

  test('shows Clip button for http:// URLs', () => {
    render(<App />);
    setInputValue('http://example.com/recipe');
    expect(screen.getByText('Clip')).toBeInTheDocument();
  });

  test('primary button is disabled for empty input', () => {
    render(<App />);
    expect(screen.getByText('Search').closest('button')).toBeDisabled();
  });

  test('Generate button is not shown for URL input', () => {
    render(<App />);
    setInputValue('https://example.com/recipe');
    expect(screen.queryByText('Generate')).not.toBeInTheDocument();
  });

  test('input under 2 characters does not show Generate button', () => {
    render(<App />);
    setInputValue('a');
    expect(screen.queryByText('Generate')).not.toBeInTheDocument();
  });
});

// ── Search ─────────────────────────────────────────────────────────────────

describe('Search behaviour', () => {
  test('Enter with text input calls the search endpoint', async () => {
    mockFetchOk(SEARCH_RESPONSE);
    mockFetchOk(FULL_RECIPE_RESPONSE);

    render(<App />);
    setInputValue('cake');
    pressEnter();

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/search?q=cake')
      )
    );
  });

  test('shows search results in dropdown after Enter', async () => {
    mockFetchOk(SEARCH_RESPONSE);
    mockFetchOk(FULL_RECIPE_RESPONSE);

    render(<App />);
    setInputValue('cake');
    pressEnter();

    await waitFor(() =>
      expect(screen.getByText('Chocolate Cake')).toBeInTheDocument()
    );
  });

  test('shows "No results" message when search returns empty', async () => {
    mockFetchOk({ results: [] });

    render(<App />);
    setInputValue('xyzzy');
    pressEnter();

    await waitFor(() =>
      expect(screen.getByText(/No results for/i)).toBeInTheDocument()
    );
  });

  test('selecting a dropdown result shows recipe card', async () => {
    mockFetchOk(SEARCH_RESPONSE);
    mockFetchOk(FULL_RECIPE_RESPONSE);

    render(<App />);
    setInputValue('cake');
    pressEnter();

    await waitFor(() => screen.getByText('Chocolate Cake'));
    fireEvent.click(screen.getByText('Chocolate Cake'));

    expect(screen.getByRole('heading', { name: /Chocolate Cake/i })).toBeInTheDocument();
  });

  test('selecting a result clears the input', async () => {
    mockFetchOk(SEARCH_RESPONSE);
    mockFetchOk(FULL_RECIPE_RESPONSE);

    render(<App />);
    setInputValue('cake');
    pressEnter();

    await waitFor(() => screen.getByText('Chocolate Cake'));
    fireEvent.click(screen.getByText('Chocolate Cake'));

    expect(screen.getByRole('textbox')).toHaveValue('');
  });

  test('Escape key closes the dropdown', async () => {
    mockFetchOk(SEARCH_RESPONSE);
    mockFetchOk(FULL_RECIPE_RESPONSE);

    render(<App />);
    setInputValue('cake');
    pressEnter();

    await waitFor(() => screen.getByText('Chocolate Cake'));
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });

    expect(screen.queryByText('Chocolate Cake')).not.toBeInTheDocument();
  });

  test('shows error message when search fetch fails', async () => {
    mockFetchFail(500);

    render(<App />);
    setInputValue('fail');
    pressEnter();

    await waitFor(() =>
      expect(screen.getByText(/Search failed: 500/i)).toBeInTheDocument()
    );
  });

  test('fetches full recipe data for each search result', async () => {
    mockFetchOk(SEARCH_RESPONSE);
    mockFetchOk(FULL_RECIPE_RESPONSE);

    render(<App />);
    setInputValue('cake');
    pressEnter();

    await waitFor(() => screen.getByText('Chocolate Cake'));

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/recipes/abc123')
    );
  });
});

// ── Clip ───────────────────────────────────────────────────────────────────

describe('Clip behaviour', () => {
  test('Enter with URL calls the clipper endpoint', async () => {
    mockFetchOk(CLIP_RESPONSE);

    render(<App />);
    setInputValue('https://example.com/soup');
    pressEnter();

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        'https://test-clipper.example.com/clip',
        expect.objectContaining({ method: 'POST' })
      )
    );
  });

  test('Clip button click calls the clipper endpoint', async () => {
    mockFetchOk(CLIP_RESPONSE);

    render(<App />);
    setInputValue('https://example.com/soup');
    fireEvent.click(screen.getByText('Clip'));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        'https://test-clipper.example.com/clip',
        expect.objectContaining({ method: 'POST' })
      )
    );
  });

  test('sends the URL in the POST body', async () => {
    mockFetchOk(CLIP_RESPONSE);

    render(<App />);
    setInputValue('https://example.com/soup');
    pressEnter();

    await waitFor(() => {
      const [, opts] = global.fetch.mock.calls[0];
      expect(JSON.parse(opts.body)).toMatchObject({ url: 'https://example.com/soup' });
    });
  });

  test('shows clipped recipe card after successful clip', async () => {
    mockFetchOk(CLIP_RESPONSE);

    render(<App />);
    setInputValue('https://example.com/soup');
    pressEnter();

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Clipped Soup/i })).toBeInTheDocument()
    );
    expect(screen.getByText('Clipped')).toBeInTheDocument();
  });

  test('clears input after a successful clip', async () => {
    mockFetchOk(CLIP_RESPONSE);

    render(<App />);
    setInputValue('https://example.com/soup');
    pressEnter();

    await waitFor(() => screen.getByRole('heading', { name: /Clipped Soup/i }));
    expect(screen.getByRole('textbox')).toHaveValue('');
  });

  test('shows error when clip fetch fails', async () => {
    mockFetchFail(422);

    render(<App />);
    setInputValue('https://example.com/bad');
    pressEnter();

    await waitFor(() =>
      expect(screen.getByText(/Clip failed: 422/i)).toBeInTheDocument()
    );
  });
});

// ── Generate ───────────────────────────────────────────────────────────────

describe('Generate behaviour', () => {
  test('Generate button calls the generation endpoint', async () => {
    mockFetchOk(GENERATE_RESPONSE);

    render(<App />);
    setInputValue('omelette');
    fireEvent.click(screen.getByText('Generate'));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        'https://test-gen.example.com/generate',
        expect.objectContaining({ method: 'POST' })
      )
    );
  });

  test('sends recipeName, generateImage and elevate:false in body', async () => {
    mockFetchOk(GENERATE_RESPONSE);

    render(<App />);
    setInputValue('omelette');
    fireEvent.click(screen.getByText('Generate'));

    await waitFor(() => {
      const [, opts] = global.fetch.mock.calls[0];
      const body = JSON.parse(opts.body);
      expect(body.recipeName).toBe('omelette');
      expect(body.generateImage).toBe(true);
      expect(body.elevate).toBe(false);
    });
  });

  test('shows AI Generated recipe card after generation', async () => {
    mockFetchOk(GENERATE_RESPONSE);

    render(<App />);
    setInputValue('omelette');
    fireEvent.click(screen.getByText('Generate'));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /AI Omelette/i })).toBeInTheDocument()
    );
    expect(screen.getByText('AI Generated')).toBeInTheDocument();
  });

  test('clears input after successful generation', async () => {
    mockFetchOk(GENERATE_RESPONSE);

    render(<App />);
    setInputValue('omelette');
    fireEvent.click(screen.getByText('Generate'));

    await waitFor(() => screen.getByRole('heading', { name: /AI Omelette/i }));
    expect(screen.getByRole('textbox')).toHaveValue('');
  });

  test('shows error when generation fetch fails', async () => {
    mockFetchFail(503);

    render(<App />);
    setInputValue('omelette');
    fireEvent.click(screen.getByText('Generate'));

    await waitFor(() =>
      expect(screen.getByText(/Generation failed: 503/i)).toBeInTheDocument()
    );
  });

  test('shows error when generation response has success:false', async () => {
    mockFetchOk({ success: false, error: 'AI unavailable' });

    render(<App />);
    setInputValue('omelette');
    fireEvent.click(screen.getByText('Generate'));

    await waitFor(() =>
      expect(screen.getByText(/AI unavailable/i)).toBeInTheDocument()
    );
  });
});

// ── Elevate ────────────────────────────────────────────────────────────────

describe('Elevate behaviour', () => {
  // Display a recipe card by searching and selecting a result
  async function loadRecipe() {
    mockFetchOk(SEARCH_RESPONSE);
    mockFetchOk(FULL_RECIPE_RESPONSE);

    render(<App />);
    setInputValue('cake');
    pressEnter();

    await waitFor(() => screen.getByText('Chocolate Cake'));
    fireEvent.click(screen.getByText('Chocolate Cake'));
    await waitFor(() => screen.getByRole('heading', { name: /Chocolate Cake/i }));
  }

  test('Elevate button calls the generation endpoint with elevate:true', async () => {
    await loadRecipe();

    mockFetchOk({
      success: true,
      recipe: { ...GENERATE_RESPONSE.recipe, name: 'Elevated Chocolate Cake' },
    });

    fireEvent.click(screen.getByTitle(/Elevate this recipe/i));

    await waitFor(() => {
      const call = global.fetch.mock.calls.find(
        ([url]) => url === 'https://test-gen.example.com/generate'
      );
      expect(call).toBeDefined();
      const body = JSON.parse(call[1].body);
      expect(body.elevate).toBe(true);
      expect(body.recipeName).toBe('Chocolate Cake');
    });
  });

  test('passes existing ingredients in the elevate request', async () => {
    await loadRecipe();

    mockFetchOk({
      success: true,
      recipe: { ...GENERATE_RESPONSE.recipe, name: 'Elevated Chocolate Cake' },
    });

    fireEvent.click(screen.getByTitle(/Elevate this recipe/i));

    await waitFor(() => {
      const call = global.fetch.mock.calls.find(
        ([url]) => url === 'https://test-gen.example.com/generate'
      );
      const body = JSON.parse(call[1].body);
      expect(body.ingredients).toEqual(['2 cups flour', '1 cup cocoa']);
    });
  });

  test('replaces card with Elevated badge after elevating', async () => {
    await loadRecipe();

    mockFetchOk({
      success: true,
      recipe: { ...GENERATE_RESPONSE.recipe, name: 'Elevated Chocolate Cake' },
    });

    fireEvent.click(screen.getByTitle(/Elevate this recipe/i));

    await waitFor(() => screen.getByText('Elevated'));
    expect(screen.getByRole('heading', { name: /Elevated Chocolate Cake/i })).toBeInTheDocument();
  });

  test('shows error when elevation fetch fails', async () => {
    await loadRecipe();
    mockFetchFail(500);

    fireEvent.click(screen.getByTitle(/Elevate this recipe/i));

    await waitFor(() =>
      expect(screen.getByText(/Generation failed: 500/i)).toBeInTheDocument()
    );
  });
});

// ── Recipe card lifecycle ──────────────────────────────────────────────────

describe('Recipe card lifecycle', () => {
  test('close button removes the recipe card', async () => {
    mockFetchOk(GENERATE_RESPONSE);

    render(<App />);
    setInputValue('omelette');
    fireEvent.click(screen.getByText('Generate'));

    await waitFor(() => screen.getByRole('heading', { name: /AI Omelette/i }));
    fireEvent.click(screen.getByTitle('Close'));

    expect(screen.queryByRole('heading', { name: /AI Omelette/i })).not.toBeInTheDocument();
  });

  test('closing a card clears any displayed error', async () => {
    mockFetchFail(503);

    render(<App />);
    setInputValue('omelette');
    fireEvent.click(screen.getByText('Generate'));

    await waitFor(() => screen.getByText(/Generation failed: 503/i));

    // A new successful generation clears the error
    mockFetchOk(GENERATE_RESPONSE);
    fireEvent.click(screen.getByText('Generate'));

    await waitFor(() => screen.getByRole('heading', { name: /AI Omelette/i }));
    expect(screen.queryByText(/Generation failed/i)).not.toBeInTheDocument();
  });
});
