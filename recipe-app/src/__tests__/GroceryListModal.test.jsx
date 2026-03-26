import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import GroceryListModal, { aggregateIngredients, flattenIngredients } from '../GroceryListModal';

// ── Mock MealPlanContext ──────────────────────────────────────────────────────
let mockMealPlan = {};
let mockUpNext = [];

jest.mock('../MealPlanContext.jsx', () => ({
  useMealPlan: () => ({ mealPlan: mockMealPlan, upNext: mockUpNext }),
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────
const PLAN_WITH_RECIPES = {
  '2024-01-15': {
    breakfast: [{ id: 'r1', name: 'Oatmeal', ingredients: ['2 cups oats', '1 cup milk', '1 tbsp honey'] }],
    lunch: [],
    dinner: [{ id: 'r2', name: 'Pasta', ingredients: ['1 lb pasta', '2 cups milk'] }],
    snack: [],
  },
};

const UP_NEXT_RECIPES = [
  { id: 'r3', name: 'Eggs', ingredients: ['4 eggs', '1 tbsp honey'] },
];

const MOCK_CATEGORIES = [
  {
    category: 'Pantry Staples',
    items: [
      { name: 'All-purpose flour', quantity: '3 cups', isStaple: true },
      { name: 'Salt', quantity: '1 tsp', isStaple: true },
    ],
  },
  {
    category: 'Dairy',
    items: [
      { name: 'Whole milk', quantity: '2 cups', isStaple: false },
    ],
  },
];

function mockFetchSuccess(cats = MOCK_CATEGORIES) {
  global.fetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ success: true, categories: cats }),
  });
}

function mockFetchError() {
  global.fetch.mockResolvedValueOnce({ ok: false, status: 500 });
}

function renderModal(isOpen = true, onClose = jest.fn()) {
  return render(<GroceryListModal isOpen={isOpen} onClose={onClose} />);
}

// ── aggregateIngredients unit tests ───────────────────────────────────────────

describe('aggregateIngredients', () => {
  test('returns empty array for empty plan and upNext', () => {
    expect(aggregateIngredients({}, [])).toEqual([]);
  });

  test('flattens ingredients from a single recipe', () => {
    const plan = {
      '2024-01-15': {
        breakfast: [{ id: 'r1', name: 'Oats', ingredients: ['oats', 'milk'] }],
        lunch: [], dinner: [], snack: [],
      },
    };
    const result = aggregateIngredients(plan, []);
    expect(result).toHaveLength(2);
    expect(result[0].ingredient).toBe('oats');
    expect(result[1].ingredient).toBe('milk');
  });

  test('deduplicates identical ingredient strings with count', () => {
    const plan = {
      '2024-01-15': {
        breakfast: [{ id: 'r1', name: 'A', ingredients: ['1 cup milk'] }],
        lunch: [{ id: 'r2', name: 'B', ingredients: ['1 cup milk', 'eggs'] }],
        dinner: [], snack: [],
      },
    };
    const result = aggregateIngredients(plan, []);
    const milkEntry = result.find((r) => r.ingredient === '1 cup milk');
    expect(milkEntry.count).toBe(2);
    const eggsEntry = result.find((r) => r.ingredient === 'eggs');
    expect(eggsEntry.count).toBe(1);
    expect(result).toHaveLength(2);
  });

  test('includes upNext recipe ingredients', () => {
    const result = aggregateIngredients({}, [{ id: 'u1', name: 'Salad', ingredients: ['lettuce'] }]);
    expect(result[0].ingredient).toBe('lettuce');
  });

  test('skips recipes with no ingredients array', () => {
    const plan = {
      '2024-01-15': {
        breakfast: [{ id: 'r1', name: 'Mystery' }],
        lunch: [], dinner: [], snack: [],
      },
    };
    expect(() => aggregateIngredients(plan, [])).not.toThrow();
    expect(aggregateIngredients(plan, [])).toHaveLength(0);
  });

  test('skips empty and whitespace-only ingredient strings', () => {
    const plan = {
      '2024-01-15': {
        breakfast: [{ id: 'r1', name: 'A', ingredients: ['', '  ', 'oats'] }],
        lunch: [], dinner: [], snack: [],
      },
    };
    const result = aggregateIngredients(plan, []);
    expect(result).toHaveLength(1);
    expect(result[0].ingredient).toBe('oats');
  });

  test('assigns unique string ids to each entry', () => {
    const plan = {
      '2024-01-15': {
        breakfast: [{ id: 'r1', name: 'A', ingredients: ['a', 'b', 'c'] }],
        lunch: [], dinner: [], snack: [],
      },
    };
    const result = aggregateIngredients(plan, []);
    const ids = result.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('handles null/undefined recipes in a slot gracefully', () => {
    const plan = {
      '2024-01-15': {
        breakfast: [null, undefined, { id: 'r1', name: 'Oats', ingredients: ['oats'] }],
        lunch: [], dinner: [], snack: [],
      },
    };
    expect(() => aggregateIngredients(plan, [])).not.toThrow();
    const result = aggregateIngredients(plan, []);
    expect(result[0].ingredient).toBe('oats');
  });
});

// ── flattenIngredients unit tests ─────────────────────────────────────────────

describe('flattenIngredients', () => {
  test('returns empty array for empty inputs', () => {
    expect(flattenIngredients({}, [])).toEqual([]);
  });

  test('returns flat array WITH duplicates (no dedup)', () => {
    const plan = {
      '2024-01-15': {
        breakfast: [{ id: 'r1', name: 'A', ingredients: ['1 cup milk'] }],
        lunch: [{ id: 'r2', name: 'B', ingredients: ['1 cup milk', 'eggs'] }],
        dinner: [], snack: [],
      },
    };
    const result = flattenIngredients(plan, []);
    expect(result).toEqual(['1 cup milk', '1 cup milk', 'eggs']);
  });

  test('includes upNext ingredients', () => {
    const result = flattenIngredients({}, [
      { id: 'u1', name: 'Salad', ingredients: ['lettuce', 'tomato'] },
    ]);
    expect(result).toEqual(['lettuce', 'tomato']);
  });

  test('skips missing ingredients arrays', () => {
    const plan = {
      '2024-01-15': {
        breakfast: [{ id: 'r1', name: 'Mystery' }],
        lunch: [], dinner: [], snack: [],
      },
    };
    expect(() => flattenIngredients(plan, [])).not.toThrow();
    expect(flattenIngredients(plan, [])).toHaveLength(0);
  });

  test('skips empty/whitespace strings', () => {
    const plan = {
      '2024-01-15': {
        breakfast: [{ id: 'r1', name: 'A', ingredients: ['', '  ', 'oats'] }],
        lunch: [], dinner: [], snack: [],
      },
    };
    const result = flattenIngredients(plan, []);
    expect(result).toEqual(['oats']);
  });
});

// ── Modal rendering ───────────────────────────────────────────────────────────

describe('GroceryListModal — rendering', () => {
  beforeEach(() => {
    mockMealPlan = PLAN_WITH_RECIPES;
    mockUpNext = UP_NEXT_RECIPES;
    global.fetch.mockReset();
    mockFetchSuccess();
  });

  test('renders nothing when isOpen is false', () => {
    const { container } = renderModal(false);
    expect(container.firstChild).toBeNull();
  });

  test('renders the modal when isOpen is true', async () => {
    renderModal();
    await screen.findByRole('dialog', { name: /grocery list/i });
  });

  test('renders the "Grocery List" heading', async () => {
    renderModal();
    await screen.findByText('Grocery List');
  });

  test('renders a close button', async () => {
    renderModal();
    await screen.findByRole('button', { name: /close grocery list/i });
  });

  test('shows shimmer skeleton while loading', () => {
    global.fetch.mockImplementation(() => new Promise(() => {}));
    renderModal();
    expect(screen.getByTestId('grocery-shimmer')).toBeInTheDocument();
  });

  test('renders category items after successful fetch', async () => {
    renderModal();
    await screen.findByText('Pantry Staples');
    await screen.findByText('Dairy');
  });

  test('renders item quantity text', async () => {
    renderModal();
    await screen.findByText('3 cups');
  });
});

// ── Empty state ───────────────────────────────────────────────────────────────

describe('GroceryListModal — empty state', () => {
  beforeEach(() => {
    mockMealPlan = {};
    mockUpNext = [];
  });

  test('shows empty-state message when no ingredients', async () => {
    renderModal();
    await screen.findByText(/no recipes planned yet/i);
  });

  test('does not render checkboxes when empty', async () => {
    renderModal();
    await screen.findByText(/no recipes planned yet/i);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  test('does not call fetch when ingredients list is empty', async () => {
    renderModal();
    await screen.findByText(/no recipes planned yet/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ── Error state ───────────────────────────────────────────────────────────────

describe('GroceryListModal — error state', () => {
  beforeEach(() => {
    mockMealPlan = PLAN_WITH_RECIPES;
    mockUpNext = UP_NEXT_RECIPES;
  });

  test('shows error message when fetch fails', async () => {
    mockFetchError();
    renderModal();
    await screen.findByRole('alert');
  });

  test('shows "Try Again" button on error', async () => {
    mockFetchError();
    renderModal();
    await screen.findByRole('button', { name: /try again/i });
  });

  test('clicking Try Again retries the fetch', async () => {
    mockFetchError();
    mockFetchSuccess();
    renderModal();
    const retryBtn = await screen.findByRole('button', { name: /try again/i });
    fireEvent.click(retryBtn);
    await screen.findByText('Pantry Staples');
  });
});

// ── Checklist ─────────────────────────────────────────────────────────────────

describe('GroceryListModal — checklist', () => {
  beforeEach(() => {
    mockMealPlan = PLAN_WITH_RECIPES;
    mockUpNext = UP_NEXT_RECIPES;
    mockFetchSuccess();
  });

  test('item checkboxes are unchecked by default', async () => {
    renderModal();
    await screen.findByText('All-purpose flour');
    const itemCheckboxes = screen.getAllByRole('checkbox').filter(
      (cb) => !cb.getAttribute('aria-label')?.startsWith('Select all items in')
    );
    itemCheckboxes.forEach((cb) => expect(cb).not.toBeChecked());
  });

  test('clicking an item checkbox checks it', async () => {
    renderModal();
    const checkbox = await screen.findByRole('checkbox', { name: 'All-purpose flour' });
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  test('clicking a checked checkbox unchecks it', async () => {
    renderModal();
    const checkbox = await screen.findByRole('checkbox', { name: 'All-purpose flour' });
    fireEvent.click(checkbox);
    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  test('checking one item does not affect others', async () => {
    renderModal();
    const first = await screen.findByRole('checkbox', { name: 'All-purpose flour' });
    const second = await screen.findByRole('checkbox', { name: 'Salt' });
    fireEvent.click(first);
    expect(first).toBeChecked();
    expect(second).not.toBeChecked();
  });
});

// ── Category controls ─────────────────────────────────────────────────────────

describe('GroceryListModal — category controls', () => {
  beforeEach(() => {
    mockMealPlan = PLAN_WITH_RECIPES;
    mockUpNext = UP_NEXT_RECIPES;
    mockFetchSuccess();
  });

  test('category toggle button collapses items', async () => {
    renderModal();
    const toggleBtn = await screen.findByRole('button', { name: /pantry staples/i });
    expect(screen.getByText('All-purpose flour')).toBeInTheDocument();
    fireEvent.click(toggleBtn);
    expect(screen.queryByText('All-purpose flour')).not.toBeInTheDocument();
  });

  test('category toggle button expands items again', async () => {
    renderModal();
    const toggleBtn = await screen.findByRole('button', { name: /pantry staples/i });
    fireEvent.click(toggleBtn);
    expect(screen.queryByText('All-purpose flour')).not.toBeInTheDocument();
    fireEvent.click(toggleBtn);
    expect(screen.getByText('All-purpose flour')).toBeInTheDocument();
  });

  test('category checkbox checks all items in category', async () => {
    renderModal();
    await screen.findByText('Pantry Staples');
    const catCheckbox = screen.getByRole('checkbox', { name: /select all items in pantry staples/i });
    fireEvent.click(catCheckbox);
    expect(screen.getByRole('checkbox', { name: 'All-purpose flour' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Salt' })).toBeChecked();
  });

  test('unchecking category checkbox when all checked unchecks all items', async () => {
    renderModal();
    await screen.findByText('Pantry Staples');
    const catCheckbox = screen.getByRole('checkbox', { name: /select all items in pantry staples/i });
    // Check all first
    fireEvent.click(catCheckbox);
    expect(screen.getByRole('checkbox', { name: 'All-purpose flour' })).toBeChecked();
    // Uncheck all
    fireEvent.click(catCheckbox);
    expect(screen.getByRole('checkbox', { name: 'All-purpose flour' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Salt' })).not.toBeChecked();
  });
});

// ── Close behaviour ───────────────────────────────────────────────────────────

describe('GroceryListModal — close behaviour', () => {
  beforeEach(() => {
    mockMealPlan = {};
    mockUpNext = [];
  });

  test('close button calls onClose', () => {
    const onClose = jest.fn();
    render(<GroceryListModal isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /close grocery list/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('clicking the backdrop calls onClose', () => {
    const onClose = jest.fn();
    render(<GroceryListModal isOpen={true} onClose={onClose} />);
    const overlay = screen.getByRole('dialog', { name: /grocery list/i }).parentElement;
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('Escape key calls onClose', () => {
    const onClose = jest.fn();
    render(<GroceryListModal isOpen={true} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('checked state resets when modal is reopened', async () => {
    mockMealPlan = PLAN_WITH_RECIPES;
    mockUpNext = UP_NEXT_RECIPES;
    mockFetchSuccess();
    mockFetchSuccess();

    const { rerender } = render(<GroceryListModal isOpen={true} onClose={jest.fn()} />);
    // Wait for item to appear and check it
    const checkbox = await screen.findByRole('checkbox', { name: 'All-purpose flour' });
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    // Close modal
    rerender(<GroceryListModal isOpen={false} onClose={jest.fn()} />);
    // Reopen modal
    rerender(<GroceryListModal isOpen={true} onClose={jest.fn()} />);

    // Should be unchecked after reopen
    const resetCheckbox = await screen.findByRole('checkbox', { name: 'All-purpose flour' });
    expect(resetCheckbox).not.toBeChecked();
  });
});
