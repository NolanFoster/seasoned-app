import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import GroceryListModal, { aggregateIngredients } from '../GroceryListModal';

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

// ── Modal rendering ───────────────────────────────────────────────────────────

describe('GroceryListModal — rendering', () => {
  beforeEach(() => {
    mockMealPlan = PLAN_WITH_RECIPES;
    mockUpNext = UP_NEXT_RECIPES;
  });

  test('renders nothing when isOpen is false', () => {
    const { container } = renderModal(false);
    expect(container.firstChild).toBeNull();
  });

  test('renders the modal when isOpen is true', () => {
    renderModal();
    expect(screen.getByRole('dialog', { name: /grocery list/i })).toBeInTheDocument();
  });

  test('renders the "Grocery List" heading', () => {
    renderModal();
    expect(screen.getByText('Grocery List')).toBeInTheDocument();
  });

  test('renders a close button', () => {
    renderModal();
    expect(screen.getByRole('button', { name: /close grocery list/i })).toBeInTheDocument();
  });

  test('renders ingredient checkboxes from the meal plan', () => {
    renderModal();
    // From PLAN_WITH_RECIPES + UP_NEXT_RECIPES (after dedup)
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBeGreaterThan(0);
  });

  test('renders a ×2 count badge for duplicated ingredients', () => {
    // "1 tbsp honey" and "1 cup milk" appear in both fixtures
    renderModal();
    // "1 tbsp honey": r1 breakfast + r3 upNext = 2 times
    const countBadges = screen.getAllByText(/×\d+/);
    expect(countBadges.length).toBeGreaterThan(0);
  });
});

// ── Empty state ───────────────────────────────────────────────────────────────

describe('GroceryListModal — empty state', () => {
  beforeEach(() => {
    mockMealPlan = {};
    mockUpNext = [];
  });

  test('shows empty-state message when meal plan has no recipes', () => {
    renderModal();
    expect(screen.getByText(/no recipes planned yet/i)).toBeInTheDocument();
  });

  test('does not render checkboxes when empty', () => {
    renderModal();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});

// ── Checklist interactions ────────────────────────────────────────────────────

describe('GroceryListModal — checklist', () => {
  beforeEach(() => {
    mockMealPlan = {
      '2024-01-15': {
        breakfast: [{ id: 'r1', name: 'Oats', ingredients: ['oats', 'milk'] }],
        lunch: [], dinner: [], snack: [],
      },
    };
    mockUpNext = [];
  });

  test('checkboxes are unchecked by default', () => {
    renderModal();
    screen.getAllByRole('checkbox').forEach((cb) => {
      expect(cb).not.toBeChecked();
    });
  });

  test('clicking a checkbox checks it', () => {
    renderModal();
    const [firstCheckbox] = screen.getAllByRole('checkbox');
    fireEvent.click(firstCheckbox);
    expect(firstCheckbox).toBeChecked();
  });

  test('clicking a checked checkbox unchecks it', () => {
    renderModal();
    const [firstCheckbox] = screen.getAllByRole('checkbox');
    fireEvent.click(firstCheckbox);
    fireEvent.click(firstCheckbox);
    expect(firstCheckbox).not.toBeChecked();
  });

  test('checking one item does not affect others', () => {
    renderModal();
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();
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

  test('checked state resets when modal is reopened', () => {
    mockMealPlan = {
      '2024-01-15': {
        breakfast: [{ id: 'r1', name: 'Oats', ingredients: ['oats'] }],
        lunch: [], dinner: [], snack: [],
      },
    };
    const { rerender } = render(<GroceryListModal isOpen={true} onClose={jest.fn()} />);
    // Check the item
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('checkbox')).toBeChecked();
    // Close and reopen
    rerender(<GroceryListModal isOpen={false} onClose={jest.fn()} />);
    rerender(<GroceryListModal isOpen={true} onClose={jest.fn()} />);
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });
});
