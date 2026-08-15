import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App, { buildGenerationRequest, buildAdaptRequest, annotateRecipeForProfile } from '../App';
import { MealPlanProvider } from '../MealPlanContext.jsx';

// Wrap App in the providers it requires (MealPlanProvider lives in main.jsx in production)
function renderApp() {
  return render(<MealPlanProvider><App /></MealPlanProvider>);
}

jest.mock('../flaggly.js', () => ({
  useFlag: (key) => true,
  flaggly: {},
  syncFlagglyUser: jest.fn(),
}))

jest.mock('../useAuth', () => ({
  useAuth: () => ({
    user: { id: 'test-user', email: 'test@example.com' },
    token: 'mock-jwt-token',
    loading: false,
    isAuthenticated: true,
    requestOTP: jest.fn(),
    verifyOTP: jest.fn(),
    signOut: jest.fn(),
  }),
}));

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
  fireEvent.change(screen.getByRole('combobox'), { target: { value } });
}

function pressEnter() {
  fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
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

describe('Allergen profile annotation', () => {
  test('annotates a recipe with a graph summary for hard allergens', () => {
    const recipe = { name: 'Peanut bowl', ingredients: ['1 cup peanuts'] }
    const annotated = annotateRecipeForProfile(recipe, { hard_allergens: ['peanuts'] })

    expect(annotated).toMatchObject({
      appliedConstraints: { hardAllergens: ['peanuts'] },
      allergenSummary: { checked: true, blocked: ['peanuts'], safe: false },
      allergenValidation: 'FAILED',
    })
    expect(recipe.allergenSummary).toBeUndefined()
  })

  test('leaves recipes unchanged when no hard allergens are configured', () => {
    const recipe = { name: 'Rice bowl', ingredients: ['rice'] }
    expect(annotateRecipeForProfile(recipe, { hard_allergens: [] })).toBe(recipe)
  })
})

describe('Adaptation request builder', () => {
  test('keeps the complete base recipe and sends profile plus explicit constraints', () => {
    const baseRecipe = { id: 'recipe-1', name: 'Pasta', ingredients: ['pasta'], instructions: ['Cook pasta'] }
    expect(buildAdaptRequest({
      baseRecipe,
      profile: { hard_allergens: ['milk'] },
      overrides: { dietary: ['dairy_free'], maxCookTime: 30 },
    })).toEqual({
      baseRecipe,
      culinaryProfile: { hard_allergens: ['milk'] },
      constraints: { dietary: ['dairy_free'], maxCookTime: 30 },
    })
  })
})

describe('Generation request builder', () => {
  test('merges profile defaults, explicit overrides, and elevate ingredients', () => {
    expect(buildGenerationRequest({
      dishName: 'Weeknight pasta',
      elevate: true,
      profile: { diet_tags: ['vegetarian'], default_servings: 2 },
      overrides: { dietary: ['vegan'], servings: 4, maxCookTime: 20, ingredients: [] },
      baseIngredients: ['pasta', 'tomatoes'],
    })).toEqual({
      recipeName: 'Weeknight pasta',
      generateImage: true,
      elevate: true,
      culinaryProfile: { diet_tags: ['vegetarian'], default_servings: 2 },
      dietary: ['vegan'],
      servings: 4,
      maxCookTime: 20,
      ingredients: ['pasta', 'tomatoes'],
    })
  })
})

// ── isValidUrl (tested via omnibox UI behaviour) ───────────────────────────

describe('Omnibox first-run guidance', () => {
  test('shows an actionable empty state and fills the omnibox from a suggestion', () => {
    renderApp()

    expect(screen.getByRole('heading', { name: 'Start with a recipe idea' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '20-minute vegetarian dinner' }))

    expect(screen.getByRole('combobox')).toHaveValue('20-minute vegetarian dinner')
    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate' })).toBeInTheDocument()
  })

  test('explains the search, clip, and generate paths beside the field', () => {
    renderApp()
    expect(screen.getByText('Paste a recipe link to clip · type to search · describe a dish to generate')).toBeInTheDocument()
  })
})

describe('Omnibox input mode detection', () => {
  test('shows Generate button for plain text input', () => {
    renderApp();
    setInputValue('pasta');
    expect(screen.getByText('Generate')).toBeInTheDocument();
  });

  test('shows Clip button when input is a valid https URL', () => {
    renderApp();
    setInputValue('https://example.com/recipe');
    expect(screen.getByText('Clip')).toBeInTheDocument();
    expect(screen.queryByText('Generate')).not.toBeInTheDocument();
  });

  test('shows Clip button for http:// URLs', () => {
    renderApp();
    setInputValue('http://example.com/recipe');
    expect(screen.getByText('Clip')).toBeInTheDocument();
  });

  test('no action buttons shown for empty input', () => {
    renderApp();
    expect(screen.queryByText('Search')).not.toBeInTheDocument();
    expect(screen.queryByText('Generate')).not.toBeInTheDocument();
    expect(screen.queryByText('Clip')).not.toBeInTheDocument();
  });

  test('Generate button is not shown for URL input', () => {
    renderApp();
    setInputValue('https://example.com/recipe');
    expect(screen.queryByText('Generate')).not.toBeInTheDocument();
  });

  test('input under 2 characters does not show Generate button', () => {
    renderApp();
    setInputValue('a');
    expect(screen.queryByText('Generate')).not.toBeInTheDocument();
  });
});

// ── Search ─────────────────────────────────────────────────────────────────

describe('Search behaviour', () => {
  test('Enter with text input calls the search endpoint', async () => {
    mockFetchOk(SEARCH_RESPONSE);
    mockFetchOk(FULL_RECIPE_RESPONSE);

    renderApp();
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

    renderApp();
    setInputValue('cake');
    pressEnter();

    await waitFor(() =>
      expect(screen.getByText('Chocolate Cake')).toBeInTheDocument()
    );
  });

  test('shows "No results" message when search returns empty', async () => {
    mockFetchOk({ results: [] });

    renderApp();
    setInputValue('xyzzy');
    pressEnter();

    await waitFor(() =>
      expect(screen.getByText(/No recipes found for/i)).toBeInTheDocument()
    );
  });

  test('selecting a dropdown result shows recipe card', async () => {
    mockFetchOk(SEARCH_RESPONSE);
    mockFetchOk(FULL_RECIPE_RESPONSE);

    renderApp();
    setInputValue('cake');
    pressEnter();

    await waitFor(() => screen.getByText('Chocolate Cake'));
    fireEvent.click(screen.getByText('Chocolate Cake'));

    expect(screen.getByRole('heading', { name: /Chocolate Cake/i })).toBeInTheDocument();
  });

  test('selecting a result clears the input', async () => {
    mockFetchOk(SEARCH_RESPONSE);
    mockFetchOk(FULL_RECIPE_RESPONSE);

    renderApp();
    setInputValue('cake');
    pressEnter();

    await waitFor(() => screen.getByText('Chocolate Cake'));
    fireEvent.click(screen.getByText('Chocolate Cake'));

    expect(screen.getByRole('combobox')).toHaveValue('');
  });

  test('Escape key closes the dropdown', async () => {
    mockFetchOk(SEARCH_RESPONSE);
    mockFetchOk(FULL_RECIPE_RESPONSE);

    renderApp();
    setInputValue('cake');
    pressEnter();

    await waitFor(() => screen.getByText('Chocolate Cake'));
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });

    expect(screen.queryByText('Chocolate Cake')).not.toBeInTheDocument();
  });

  test('shows error message when search fetch fails', async () => {
    mockFetchFail(500);

    renderApp();
    setInputValue('fail');
    pressEnter();

    await waitFor(() =>
      expect(screen.getByText(/Search failed: 500/i)).toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  test('fetches full recipe data for each search result', async () => {
    mockFetchOk(SEARCH_RESPONSE);
    mockFetchOk(FULL_RECIPE_RESPONSE);

    renderApp();
    setInputValue('cake');
    pressEnter();

    await waitFor(() => screen.getByText('Chocolate Cake'));

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/recipes/abc123')
    );
  });

  test('shows available thumbnails and source labels in result rows', async () => {
    mockFetchOk(SEARCH_RESPONSE)
    mockFetchOk(FULL_RECIPE_RESPONSE)

    renderApp()
    setInputValue('cake')
    pressEnter()

    await waitFor(() => screen.getByText('Chocolate Cake'))
    expect(document.querySelector('.dropdown-thumbnail')).toHaveAttribute('src', 'https://example.com/cake.jpg')
    expect(screen.getByText('example.com')).toBeInTheDocument()
  })
});

describe('Core chrome accessibility', () => {
  test('user menu exposes menu semantics and restores focus on Escape', () => {
    renderApp()
    const trigger = screen.getByRole('button', { name: 'Account menu' })
    fireEvent.click(trigger)

    const menu = screen.getByRole('menu', { name: 'Account options' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument()

    fireEvent.keyDown(menu, { key: 'Escape' })
    expect(trigger).toHaveFocus()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('Omnibox accessibility and keyboard navigation', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('exposes an accessible combobox linked to its listbox', async () => {
    mockFetchOk(SEARCH_RESPONSE);
    mockFetchOk(FULL_RECIPE_RESPONSE);

    renderApp();
    const input = screen.getByRole('combobox', {
      name: /search, clip, or generate a recipe/i,
    });

    expect(input).toHaveAttribute('aria-autocomplete', 'list');
    expect(input).toHaveAttribute('aria-expanded', 'false');

    setInputValue('cake');
    pressEnter();

    await waitFor(() => expect(screen.getByRole('option', { name: /Chocolate Cake/i })).toBeInTheDocument());

    const listbox = screen.getByRole('listbox', { name: /recipe suggestions/i });
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-controls', listbox.id);
  });

  test('navigates suggestions with arrow keys and opens the active recipe with Enter', async () => {
    mockFetchOk(SEARCH_RESPONSE);
    mockFetchOk(FULL_RECIPE_RESPONSE);

    renderApp();
    setInputValue('cake');
    pressEnter();

    const option = await screen.findByRole('option', { name: /Chocolate Cake/i });
    const input = screen.getByRole('combobox');

    fireEvent.keyDown(input, { key: 'ArrowDown' });

    expect(input).toHaveFocus();
    expect(option).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', option.id);

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.getByRole('heading', { name: /Chocolate Cake/i })).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  test('ArrowUp wraps to the last recently viewed recipe', () => {
    seedLocalStorage([
      { id: 'r1', name: 'Recipe One', ingredients: [], instructions: [] },
      { id: 'r2', name: 'Recipe Two', ingredients: [], instructions: [] },
    ]);

    renderApp();
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowUp' });

    const lastOption = screen.getByRole('option', { name: /Recipe Two/i });
    expect(lastOption).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', lastOption.id);
  });

  test('Escape closes suggestions and clears the active descendant', async () => {
    seedLocalStorage([{ id: 'r1', name: 'Recipe One', ingredients: [], instructions: [] }]);

    renderApp();
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveAttribute('aria-activedescendant');

    fireEvent.keyDown(input, { key: 'Escape' });

    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).not.toHaveAttribute('aria-activedescendant');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  test('Enter cancels the pending debounced duplicate search', async () => {
    mockFetchOk(SEARCH_RESPONSE);
    mockFetchOk(FULL_RECIPE_RESPONSE);

    renderApp();
    setInputValue('cake');
    pressEnter();

    await screen.findByRole('option', { name: /Chocolate Cake/i });
    await new Promise((resolve) => setTimeout(resolve, 350));

    const searchCalls = global.fetch.mock.calls.filter(([url]) =>
      url.includes('/api/search?q=cake')
    );
    expect(searchCalls).toHaveLength(1);
  });

  test('hides previous results immediately when the text query changes', async () => {
    mockFetchOk(SEARCH_RESPONSE);
    mockFetchOk(FULL_RECIPE_RESPONSE);

    renderApp();
    setInputValue('cake');
    pressEnter();
    await screen.findByRole('option', { name: /Chocolate Cake/i });

    setInputValue('soup');
    const input = screen.getByRole('combobox');
    fireEvent.keyDown(input, { key: 'ArrowDown' });

    expect(screen.queryByRole('option', { name: /Chocolate Cake/i })).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute('aria-activedescendant');

    mockFetchOk({ results: [] });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/search?q=soup')
      )
    );
  });

  test('does not expose stale search options after switching to a URL', async () => {
    mockFetchOk(SEARCH_RESPONSE);
    mockFetchOk(FULL_RECIPE_RESPONSE);

    renderApp();
    setInputValue('cake');
    pressEnter();
    await screen.findByRole('option', { name: /Chocolate Cake/i });

    setInputValue('https://example.com/soup');
    const input = screen.getByRole('combobox');
    fireEvent.keyDown(input, { key: 'ArrowDown' });

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute('aria-activedescendant');

    mockFetchOk(CLIP_RESPONSE);
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(await screen.findByRole('heading', { name: /Clipped Soup/i })).toBeInTheDocument();
  });

  test('ignores a slower response from an outdated query', async () => {
    let resolveFirstSearch;
    let resolveSecondSearch;
    const response = (body) => ({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    });

    global.fetch.mockImplementation((url) => {
      if (url.includes('/api/search?q=first')) {
        return new Promise((resolve) => { resolveFirstSearch = resolve; });
      }
      if (url.includes('/api/search?q=second')) {
        return new Promise((resolve) => { resolveSecondSearch = resolve; });
      }
      if (url.includes('/api/recipes/second-id')) {
        return Promise.resolve(response({
          data: { ...FULL_RECIPE_RESPONSE.data, name: 'Second Recipe' },
        }));
      }
      if (url.includes('/api/recipes/first-id')) {
        return Promise.resolve(response({
          data: { ...FULL_RECIPE_RESPONSE.data, name: 'First Recipe' },
        }));
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    renderApp();
    setInputValue('first');
    pressEnter();
    await waitFor(() => expect(resolveFirstSearch).toBeDefined());

    setInputValue('second');
    pressEnter();
    await waitFor(() => expect(resolveSecondSearch).toBeDefined());

    await act(async () => {
      resolveSecondSearch(response({ results: [{ id: 'second-id' }] }));
    });
    expect(await screen.findByRole('option', { name: /Second Recipe/i })).toBeInTheDocument();

    await act(async () => {
      resolveFirstSearch(response({ results: [{ id: 'first-id' }] }));
    });

    expect(screen.queryByRole('option', { name: /First Recipe/i })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Second Recipe/i })).toBeInTheDocument();
  });
});

// ── Clip ───────────────────────────────────────────────────────────────────

describe('Clip behaviour', () => {
  test('Enter with URL calls the clipper endpoint', async () => {
    mockFetchOk(CLIP_RESPONSE);

    renderApp();
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

    renderApp();
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

    renderApp();
    setInputValue('https://example.com/soup');
    pressEnter();

    await waitFor(() => {
      const [, opts] = global.fetch.mock.calls[0];
      expect(JSON.parse(opts.body)).toMatchObject({ url: 'https://example.com/soup' });
    });
  });

  test('shows clipped recipe card after successful clip', async () => {
    mockFetchOk(CLIP_RESPONSE);

    renderApp();
    setInputValue('https://example.com/soup');
    pressEnter();

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Clipped Soup/i })).toBeInTheDocument()
    );
    expect(screen.getByText('Clipped')).toBeInTheDocument();
  });

  test('clears input after a successful clip', async () => {
    mockFetchOk(CLIP_RESPONSE);

    renderApp();
    setInputValue('https://example.com/soup');
    pressEnter();

    await waitFor(() => screen.getByRole('heading', { name: /Clipped Soup/i }));
    expect(screen.getByRole('combobox')).toHaveValue('');
  });

  test('shows error when clip fetch fails', async () => {
    mockFetchFail(422);

    renderApp();
    setInputValue('https://example.com/bad');
    pressEnter();

    await waitFor(() =>
      expect(screen.getByText(/Clip failed: 422/i)).toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  test('shows Clip button for YouTube URLs', () => {
    renderApp();
    setInputValue('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(screen.getByText('Clip')).toBeInTheDocument();
  });

  test('shows YouTube-specific status text while clipping a YouTube URL', async () => {
    // Hold the fetch open so we can observe the in-flight status label.
    let resolveFetch;
    global.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = () =>
            resolve({
              ok: true,
              status: 200,
              json: () =>
                Promise.resolve({
                  recipe: { ...CLIP_RESPONSE.recipe, sourceType: 'youtube' },
                }),
            });
        })
    );

    renderApp();
    setInputValue('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    pressEnter();

    await waitFor(() =>
      expect(screen.getByText(/Clipping recipe from YouTube…/i)).toBeInTheDocument()
    );
    resolveFetch();
  });

  test('renders YouTube source badge when sourceType=youtube', async () => {
    mockFetchOk({ recipe: { ...CLIP_RESPONSE.recipe, sourceType: 'youtube' } });

    renderApp();
    setInputValue('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    pressEnter();

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Clipped Soup/i })).toBeInTheDocument()
    );
    expect(screen.getByText('YouTube')).toBeInTheDocument();
    expect(screen.queryByText('Clipped')).not.toBeInTheDocument();
  });

  test('renders YouTube badge for youtu.be URLs even without sourceType in response', async () => {
    // Older clipper builds may not return sourceType — frontend should sniff the URL.
    mockFetchOk(CLIP_RESPONSE);

    renderApp();
    setInputValue('https://youtu.be/dQw4w9WgXcQ');
    pressEnter();

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Clipped Soup/i })).toBeInTheDocument()
    );
    expect(screen.getByText('YouTube')).toBeInTheDocument();
  });
});

// ── Generate ───────────────────────────────────────────────────────────────

describe('Generate behaviour', () => {
  test('Generate button calls the generation endpoint', async () => {
    mockFetchOk(GENERATE_RESPONSE);

    renderApp();
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

    renderApp();
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

  test('Tune composer sends structured overrides before generation', async () => {
    mockFetchOk({
      ...GENERATE_RESPONSE,
      appliedConstraints: { dietary: ['vegan'], maxCookTime: 20, servings: 2 },
    });

    renderApp();
    setInputValue('weeknight curry');
    fireEvent.click(screen.getByRole('button', { name: /Tune generation constraints/i }));

    expect(screen.getByRole('dialog', { name: /Make weeknight curry work for you/i })).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Vegan'));
    fireEvent.change(screen.getByLabelText('Max time (minutes)'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('Servings'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate recipe' }));

    await waitFor(() => {
      const call = global.fetch.mock.calls.find(([url]) => url === 'https://test-gen.example.com/generate');
      expect(call).toBeDefined();
      const body = JSON.parse(call[1].body);
      expect(body.dietary).toEqual(['vegan']);
      expect(body.maxCookTime).toBe(20);
      expect(body.servings).toBe(2);
    });

    expect(await screen.findByText('Personalized')).toBeInTheDocument();
    expect(screen.getByText('20 min max')).toBeInTheDocument();
  });

  test('shows AI Generated recipe card after generation', async () => {
    mockFetchOk(GENERATE_RESPONSE);

    renderApp();
    setInputValue('omelette');
    fireEvent.click(screen.getByText('Generate'));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /AI Omelette/i })).toBeInTheDocument()
    );
    expect(screen.getByText('AI Generated')).toBeInTheDocument();
  });

  test('clears input after successful generation', async () => {
    mockFetchOk(GENERATE_RESPONSE);

    renderApp();
    setInputValue('omelette');
    fireEvent.click(screen.getByText('Generate'));

    await waitFor(() => screen.getByRole('heading', { name: /AI Omelette/i }));
    expect(screen.getByRole('combobox')).toHaveValue('');
  });

  test('shows error when generation fetch fails', async () => {
    mockFetchFail(503);

    renderApp();
    setInputValue('omelette');
    fireEvent.click(screen.getByText('Generate'));

    await waitFor(() =>
      expect(screen.getByText(/Generation failed: 503/i)).toBeInTheDocument()
    );
  });

  test('offers retry when generation fails', async () => {
    mockFetchFail(503);

    renderApp();
    setInputValue('omelette');
    fireEvent.click(screen.getByText('Generate'));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry generation' })).toBeInTheDocument());

    mockFetchOk(GENERATE_RESPONSE);
    fireEvent.click(screen.getByRole('button', { name: 'Retry generation' }));

    expect(await screen.findByRole('heading', { name: /AI Omelette/i })).toBeInTheDocument();
  });

  test('shows error when generation response has success:false', async () => {
    mockFetchOk({ success: false, error: 'AI unavailable' });

    renderApp();
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

    renderApp();
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

    fireEvent.click(screen.getByTitle('Remix with AI'));
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

    fireEvent.click(screen.getByTitle('Remix with AI'));
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

    fireEvent.click(screen.getByTitle('Remix with AI'));
    fireEvent.click(screen.getByTitle(/Elevate this recipe/i));

    await waitFor(() => screen.getByText('Elevated'));
    expect(screen.getByRole('heading', { name: /Elevated Chocolate Cake/i })).toBeInTheDocument();
  });

  test('shows error when elevation fetch fails', async () => {
    await loadRecipe();
    mockFetchFail(500);

    fireEvent.click(screen.getByTitle('Remix with AI'));
    fireEvent.click(screen.getByTitle(/Elevate this recipe/i));

    await waitFor(() =>
      expect(screen.getByText(/Generation failed: 500/i)).toBeInTheDocument()
    );
  });
});

// ── RecipeAdapt ─────────────────────────────────────────────────────────────

describe('RecipeAdapt behaviour', () => {
  async function loadRecipe() {
    mockFetchOk(SEARCH_RESPONSE)
    mockFetchOk(FULL_RECIPE_RESPONSE)

    renderApp()
    setInputValue('cake')
    pressEnter()
    await waitFor(() => screen.getByText('Chocolate Cake'))
    fireEvent.click(screen.getByText('Chocolate Cake'))
    await waitFor(() => screen.getByRole('heading', { name: /Chocolate Cake/i }))
  }

  test('sends the selected recipe and constraints to the adapt endpoint', async () => {
    await loadRecipe()
    mockFetchOk({
      success: true,
      appliedConstraints: { dietary: ['dairy_free'], maxCookTime: 30 },
      recipe: {
        name: 'Dairy-free Chocolate Cake',
        description: 'A better-fit cake.',
        ingredients: ['2 cups rice flour'],
        instructions: ['Mix and bake.'],
        substitutions: [{ from: 'flour', to: 'rice flour', reason: 'Avoid wheat.' }],
        adaptationNotes: ['The chocolate profile remains intact.'],
        adapted_from: 'abc123',
      },
    })

    fireEvent.click(screen.getByTitle('Remix with AI'))
    fireEvent.click(screen.getByTitle(/Adapt this recipe/i))
    fireEvent.click(screen.getByRole('button', { name: 'Adapt recipe' }))

    await waitFor(() => {
      const call = global.fetch.mock.calls.find(([url]) => url === 'https://test-gen.example.com/adapt')
      expect(call).toBeDefined()
      const body = JSON.parse(call[1].body)
      expect(body.baseRecipe.name).toBe('Chocolate Cake')
      expect(body.constraints).toEqual(expect.objectContaining({ dietary: [], servings: 4 }))
    })
    expect(await screen.findByRole('heading', { name: /Dairy-free Chocolate Cake/i })).toBeInTheDocument()
    expect(screen.getByText('What changed')).toBeInTheDocument()
  })
})

// ── Recipe card lifecycle ──────────────────────────────────────────────────

describe('Recipe card lifecycle', () => {
  test('close button removes the recipe card', async () => {
    mockFetchOk(GENERATE_RESPONSE);

    renderApp();
    setInputValue('omelette');
    fireEvent.click(screen.getByText('Generate'));

    await waitFor(() => screen.getByRole('heading', { name: /AI Omelette/i }));
    fireEvent.click(screen.getByTitle('More options'));
    fireEvent.click(screen.getByTitle('Close'));

    expect(screen.queryByRole('heading', { name: /AI Omelette/i })).not.toBeInTheDocument();
  });

  test('closing a card clears any displayed error', async () => {
    mockFetchFail(503);

    renderApp();
    setInputValue('omelette');
    fireEvent.click(screen.getByText('Generate'));

    await waitFor(() => screen.getByText(/Generation failed: 503/i));

    // Re-type and start a new successful generation — the error should clear
    mockFetchOk(GENERATE_RESPONSE);
    setInputValue('omelette');
    fireEvent.click(screen.getByText('Generate'));

    await waitFor(() => screen.getByRole('heading', { name: /AI Omelette/i }));
    expect(screen.queryByText(/Generation failed/i)).not.toBeInTheDocument();
  });
});

// ── Recently viewed recipes ─────────────────────────────────────────────────

const RECENT_STORAGE_KEY = 'seasoned_recent_recipes';

function seedLocalStorage(recipes) {
  localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(recipes));
}

describe('Recently viewed recipes', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('stores a recipe in localStorage after viewing a search result', async () => {
    mockFetchOk(SEARCH_RESPONSE);
    mockFetchOk(FULL_RECIPE_RESPONSE);

    renderApp();
    setInputValue('cake');
    pressEnter();

    await waitFor(() => screen.getByText('Chocolate Cake'));
    fireEvent.click(screen.getByText('Chocolate Cake'));

    await waitFor(() => screen.getByRole('heading', { name: /Chocolate Cake/i }));

    const stored = JSON.parse(localStorage.getItem(RECENT_STORAGE_KEY));
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe('Chocolate Cake');
  });

  test('stores a recipe in localStorage after a successful clip', async () => {
    mockFetchOk(CLIP_RESPONSE);

    renderApp();
    setInputValue('https://example.com/soup');
    pressEnter();

    await waitFor(() => screen.getByRole('heading', { name: /Clipped Soup/i }));

    const stored = JSON.parse(localStorage.getItem(RECENT_STORAGE_KEY));
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe('Clipped Soup');
  });

  test('stores a recipe in localStorage after a successful generate', async () => {
    mockFetchOk(GENERATE_RESPONSE);

    renderApp();
    setInputValue('omelette');
    fireEvent.click(screen.getByText('Generate'));

    await waitFor(() => screen.getByRole('heading', { name: /AI Omelette/i }));

    const stored = JSON.parse(localStorage.getItem(RECENT_STORAGE_KEY));
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe('AI Omelette');
  });

  test('shows Recently Viewed section on input focus when history exists', async () => {
    seedLocalStorage([{ id: 'abc123', name: 'Chocolate Cake', description: '', image: '', prep_time: null, cook_time: null, recipe_yield: null, ingredients: [], instructions: [] }]);

    renderApp();
    fireEvent.focus(screen.getByRole('combobox'));

    expect(screen.getByText('Recently Viewed')).toBeInTheDocument();
    expect(screen.getByText('Chocolate Cake')).toBeInTheDocument();
  });

  test('shows last search results below recently viewed when input is cleared', async () => {
    seedLocalStorage([{ id: 'recent1', name: 'Saved Pasta', description: '', image: '', prep_time: null, cook_time: null, recipe_yield: null, ingredients: [], instructions: [] }]);

    mockFetchOk(SEARCH_RESPONSE);
    mockFetchOk(FULL_RECIPE_RESPONSE);

    renderApp();
    setInputValue('cake');
    pressEnter();
    await waitFor(() => screen.getByText('Chocolate Cake'));

    // Clear the input — dropdown should now show both sections
    setInputValue('');
    fireEvent.focus(screen.getByRole('combobox'));

    expect(screen.getByText('Recently Viewed')).toBeInTheDocument();
    expect(screen.getByText('Saved Pasta')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /Last search: cake/i })).toBeInTheDocument();
    expect(screen.getAllByText('Chocolate Cake').length).toBeGreaterThan(0);
  });

  test('shows only search results when input has 2+ characters, not the combined view', async () => {
    seedLocalStorage([{ id: 'recent1', name: 'Saved Pasta', description: '', image: '', prep_time: null, cook_time: null, recipe_yield: null, ingredients: [], instructions: [] }]);

    mockFetchOk(SEARCH_RESPONSE);
    mockFetchOk(FULL_RECIPE_RESPONSE);

    renderApp();
    setInputValue('cake');
    pressEnter();
    await waitFor(() => screen.getByText('Chocolate Cake'));

    expect(screen.queryByText('Recently Viewed')).not.toBeInTheDocument();
    expect(screen.queryByText('Saved Pasta')).not.toBeInTheDocument();
  });

  test('does not show Recently Viewed section when input has 2+ characters', async () => {
    seedLocalStorage([{ id: 'abc123', name: 'Chocolate Cake', description: '', image: '', prep_time: null, cook_time: null, recipe_yield: null, ingredients: [], instructions: [] }]);

    renderApp();
    setInputValue('ca');

    expect(screen.queryByText('Recently Viewed')).not.toBeInTheDocument();
  });

  test('selecting a recent item opens the recipe card', async () => {
    const recentRecipe = { id: 'abc123', name: 'Chocolate Cake', description: 'A rich cake.', image: '', prep_time: '20 minutes', cook_time: '40 minutes', recipe_yield: '8', ingredients: [], instructions: [], source_url: '' };
    seedLocalStorage([recentRecipe]);

    renderApp();
    fireEvent.focus(screen.getByRole('combobox'));

    await waitFor(() => screen.getByText('Chocolate Cake'));
    fireEvent.click(screen.getByText('Chocolate Cake'));

    expect(screen.getByRole('heading', { name: /Chocolate Cake/i })).toBeInTheDocument();
  });

  test('deduplicates: viewing same recipe twice keeps only one entry', async () => {
    mockFetchOk(SEARCH_RESPONSE);
    mockFetchOk(FULL_RECIPE_RESPONSE);

    renderApp();
    setInputValue('cake');
    pressEnter();

    await waitFor(() => screen.getByText('Chocolate Cake'));
    fireEvent.click(screen.getByText('Chocolate Cake'));
    await waitFor(() => screen.getByRole('heading', { name: /Chocolate Cake/i }));

    // View the same recipe again
    mockFetchOk(SEARCH_RESPONSE);
    mockFetchOk(FULL_RECIPE_RESPONSE);
    fireEvent.click(screen.getByTitle('More options'));
    fireEvent.click(screen.getByTitle('Close'));
    setInputValue('cake');
    pressEnter();
    await waitFor(() => screen.getByText('Chocolate Cake'));
    fireEvent.click(screen.getByText('Chocolate Cake'));
    await waitFor(() => screen.getByRole('heading', { name: /Chocolate Cake/i }));

    const stored = JSON.parse(localStorage.getItem(RECENT_STORAGE_KEY));
    const names = stored.map((r) => r.name);
    expect(names.filter((n) => n === 'Chocolate Cake')).toHaveLength(1);
  });

  test('both recipes remain in recent after selecting two different search results', async () => {
    const SOUP_SEARCH = { results: [{ id: 'soup456' }] };
    const SOUP_RECIPE = {
      data: {
        name: 'Tomato Soup',
        description: 'A classic soup.',
        image: '',
        prepTime: '5 minutes',
        cookTime: '20 minutes',
        servings: '4',
        ingredients: ['tomatoes', 'salt'],
        instructions: ['Blend.', 'Simmer.'],
        url: '',
      },
    };

    // Select first recipe
    mockFetchOk(SEARCH_RESPONSE);
    mockFetchOk(FULL_RECIPE_RESPONSE);
    renderApp();
    setInputValue('cake');
    pressEnter();
    await waitFor(() => screen.getByText('Chocolate Cake'));
    fireEvent.click(screen.getByText('Chocolate Cake'));
    await waitFor(() => screen.getByRole('heading', { name: /Chocolate Cake/i }));

    // Select second recipe
    mockFetchOk(SOUP_SEARCH);
    mockFetchOk(SOUP_RECIPE);
    setInputValue('soup');
    pressEnter();
    await waitFor(() => screen.getByText('Tomato Soup'));
    fireEvent.click(screen.getByText('Tomato Soup'));
    await waitFor(() => screen.getByRole('heading', { name: /Tomato Soup/i }));

    const stored = JSON.parse(localStorage.getItem(RECENT_STORAGE_KEY));
    const names = stored.map((r) => r.name);
    expect(names).toContain('Chocolate Cake');
    expect(names).toContain('Tomato Soup');
    expect(stored).toHaveLength(2);
  });

  test('re-opening a recipe from recently viewed does not change the recent list', async () => {
    const recipe1 = { id: 'r1', name: 'Recipe One', description: '', image: '', prep_time: null, cook_time: null, recipe_yield: null, ingredients: [], instructions: [], source_url: '' };
    const recipe2 = { id: 'r2', name: 'Recipe Two', description: '', image: '', prep_time: null, cook_time: null, recipe_yield: null, ingredients: [], instructions: [], source_url: '' };
    seedLocalStorage([recipe2, recipe1]); // recipe2 is more recent

    renderApp();
    fireEvent.focus(screen.getByRole('combobox'));

    // Re-open the older recipe from recent
    await waitFor(() => screen.getByText('Recipe One'));
    fireEvent.click(screen.getByText('Recipe One'));
    await waitFor(() => screen.getByRole('heading', { name: /Recipe One/i }));

    const stored = JSON.parse(localStorage.getItem(RECENT_STORAGE_KEY));
    // Order and length should be unchanged
    expect(stored).toHaveLength(2);
    expect(stored[0].id).toBe('r2');
    expect(stored[1].id).toBe('r1');
  });

  test('Clear button removes all recent entries and hides the section', async () => {
    seedLocalStorage([{ id: 'abc123', name: 'Chocolate Cake', description: '', image: '', prep_time: null, cook_time: null, recipe_yield: null, ingredients: [], instructions: [] }]);

    renderApp();
    fireEvent.focus(screen.getByRole('combobox'));

    await waitFor(() => screen.getByText('Recently Viewed'));
    fireEvent.click(screen.getByText('Clear'));

    expect(screen.queryByText('Recently Viewed')).not.toBeInTheDocument();
    expect(localStorage.getItem(RECENT_STORAGE_KEY)).toBeNull();
  });
});
