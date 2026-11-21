import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import RecipeCard from '../RecipeCard';
import { resetPairedSidesCache } from '../usePairedSides';

const flagOverrides = {};
jest.mock('../flaggly.js', () => ({
  useFlag: (key) => flagOverrides[key] ?? true,
  flaggly: {},
}));

const heroRecipe = {
  id: 'r-ribeye',
  name: 'Grilled Ribeye Steak',
  ingredients: ['2 ribeye steaks', '1 tsp kosher salt'],
  instructions: ['Season the steaks.', 'Grill to 130°F.'],
};

const generatedSides = [
  {
    id: 'side-ai-blistered-shishito-peppers',
    name: 'Blistered Shishito Peppers',
    type: 'side_veg',
    description: 'Smoky charred peppers with flaky salt and lime.',
    prepMinutes: 5,
    cookMinutes: 8,
    ingredients: ['8 oz shishito peppers', '1 tbsp neutral oil', '1/2 lime'],
    instructions: ['Heat a skillet over high heat.', 'Blister the peppers.'],
    generated: true,
  },
  {
    id: 'side-ai-chimichurri',
    name: 'Chimichurri',
    type: 'sauce',
    description: 'A sharp parsley and vinegar sauce to cut the richness of the steak.',
    prepMinutes: 10,
    cookMinutes: 0,
    ingredients: ['1 cup parsley', '1/4 cup red wine vinegar', '1/2 cup olive oil'],
    instructions: ['Chop the parsley.', 'Stir in the vinegar and oil.'],
    generated: true,
  },
];

let observers = [];
class MockIntersectionObserver {
  constructor(callback) {
    this.callback = callback;
    this.disconnected = false;
    observers.push(this);
  }
  disconnect() {
    this.disconnected = true;
  }
  observe() {}
}

function scrollPairingsIntoView() {
  act(() => {
    observers
      .filter((observer) => !observer.disconnected)
      .forEach((observer) => observer.callback([{ isIntersecting: true }]));
  });
}

function pairingsCalls() {
  return global.fetch.mock.calls.filter(([url]) => String(url).endsWith('/pairings'));
}

function mockPairingsResponse(body, ok = true) {
  global.fetch.mockImplementation(() => Promise.resolve({
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(body),
  }));
}

beforeEach(() => {
  observers = [];
  global.IntersectionObserver = MockIntersectionObserver;
  resetPairedSidesCache();
  Object.keys(flagOverrides).forEach((key) => delete flagOverrides[key]);
});

afterEach(() => {
  delete global.IntersectionObserver;
});

describe('Complete the Meal — pairings generated per dish', () => {
  test('waits until the section is in view, then shows pairings generated for the dish', async () => {
    mockPairingsResponse({ success: true, method: 'llama-ai-pairings', sides: generatedSides });
    render(<RecipeCard recipe={heroRecipe} onClose={jest.fn()} />);

    expect(screen.getByText(/Creating a side, starch, and sauce for Grilled Ribeye Steak/i)).toBeInTheDocument();
    expect(pairingsCalls()).toHaveLength(0);

    scrollPairingsIntoView();
    expect(await screen.findByText('Blistered Shishito Peppers')).toBeInTheDocument();
    expect(screen.getByText('Chimichurri')).toBeInTheDocument();
    expect(screen.queryByText('Crispy Roasted Asparagus')).not.toBeInTheDocument();

    expect(pairingsCalls()).toHaveLength(1);
    const body = JSON.parse(pairingsCalls()[0][1].body);
    expect(body.heroRecipe).toMatchObject({ name: 'Grilled Ribeye Steak', ingredients: heroRecipe.ingredients });
  });

  test('opens a generated pairing as a full recipe without generating pairings for it', async () => {
    mockPairingsResponse({ success: true, method: 'llama-ai-pairings', sides: generatedSides });
    render(<RecipeCard recipe={heroRecipe} onClose={jest.fn()} />);
    scrollPairingsIntoView();

    const [viewButton] = await screen.findAllByRole('button', { name: /View Pairing Recipe/i });
    fireEvent.click(viewButton);

    expect(document.getElementById('side-recipe-title')).toHaveTextContent('Blistered Shishito Peppers');
    expect(screen.getByText('Heat a skillet over high heat.')).toBeInTheDocument();
    expect(pairingsCalls()).toHaveLength(1);
  });

  test('falls back to the curated pairings when generation fails', async () => {
    global.fetch.mockImplementation(() => Promise.reject(new Error('offline')));
    render(<RecipeCard recipe={heroRecipe} onClose={jest.fn()} />);
    scrollPairingsIntoView();

    expect(await screen.findByText('Crispy Roasted Asparagus')).toBeInTheDocument();
    expect(screen.queryByText(/Creating a side, starch, and sauce/i)).not.toBeInTheDocument();
  });

  test('falls back to the curated pairings on an error response', async () => {
    mockPairingsResponse({ error: 'boom' }, false);
    render(<RecipeCard recipe={heroRecipe} onClose={jest.fn()} />);
    scrollPairingsIntoView();

    expect(await screen.findByText('Garlic Mashed Potatoes')).toBeInTheDocument();
  });

  test('reuses pairings already generated for the same dish', async () => {
    mockPairingsResponse({ success: true, method: 'llama-ai-pairings', sides: generatedSides });
    const { unmount } = render(<RecipeCard recipe={heroRecipe} onClose={jest.fn()} />);
    scrollPairingsIntoView();
    await screen.findByText('Blistered Shishito Peppers');
    unmount();

    render(<RecipeCard recipe={heroRecipe} onClose={jest.fn()} />);
    expect(screen.getByText('Blistered Shishito Peppers')).toBeInTheDocument();
    expect(pairingsCalls()).toHaveLength(1);
  });

  test('generates fresh pairings when the card switches to another dish', async () => {
    mockPairingsResponse({ success: true, method: 'llama-ai-pairings', sides: generatedSides });
    const { rerender } = render(<RecipeCard recipe={heroRecipe} onClose={jest.fn()} />);
    scrollPairingsIntoView();
    await screen.findByText('Blistered Shishito Peppers');

    const tacoSides = [{ ...generatedSides[0], id: 'side-ai-elote', name: 'Street Corn Elote' }];
    mockPairingsResponse({ success: true, method: 'llama-ai-pairings', sides: tacoSides });
    const tacos = {
      id: 'r-tacos',
      name: 'Steak Tacos',
      ingredients: ['1 lb flank steak', '8 corn tortillas'],
      instructions: ['Sear the steak.', 'Serve in tortillas.'],
    };
    rerender(<RecipeCard recipe={tacos} onClose={jest.fn()} />);

    expect(screen.queryByText('Blistered Shishito Peppers')).not.toBeInTheDocument();
    expect(screen.getByText(/Creating a side, starch, and sauce for Steak Tacos/i)).toBeInTheDocument();
    scrollPairingsIntoView();
    expect(await screen.findByText('Street Corn Elote')).toBeInTheDocument();
    expect(pairingsCalls()).toHaveLength(2);
  });

  test('shows curated pairings without a request when AI pairings are switched off', () => {
    flagOverrides['complete-meal-ai-pairings'] = false;
    render(<RecipeCard recipe={heroRecipe} onClose={jest.fn()} />);

    expect(screen.getByText('Crispy Roasted Asparagus')).toBeInTheDocument();
    expect(observers).toHaveLength(0);
    expect(pairingsCalls()).toHaveLength(0);
  });

  test('passes the dish allergens to the generator', async () => {
    mockPairingsResponse({ success: true, method: 'llama-ai-pairings', sides: generatedSides });
    render(
      <RecipeCard
        recipe={{ ...heroRecipe, appliedConstraints: { hardAllergens: ['peanuts'] } }}
        onClose={jest.fn()}
      />
    );
    scrollPairingsIntoView();
    await screen.findByText('Blistered Shishito Peppers');

    expect(JSON.parse(pairingsCalls()[0][1].body).hardAllergens).toEqual(['peanuts']);
  });
});
