import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import GroceryListModal, { aggregateIngredients, flattenIngredients } from '../GroceryListModal';

// ── Mock MealPlanContext ──────────────────────────────────────────────────────
// The overhauled modal reads groceryList and CRUD methods from context;
// mealPlan / upNext are still used by the exported utility functions.
let mockMealPlan = {};
let mockUpNext = [];
let mockGroceryList = [];
let mockToggleItemCompletion = jest.fn();
let mockDeleteItem = jest.fn();
let mockAddCustomItem = jest.fn();

jest.mock('../MealPlanContext.jsx', () => ({
  useMealPlan: () => ({
    mealPlan: mockMealPlan,
    upNext: mockUpNext,
    groceryList: mockGroceryList,
    toggleItemCompletion: mockToggleItemCompletion,
    deleteItem: mockDeleteItem,
    addCustomItem: mockAddCustomItem,
  }),
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

const MOCK_GROCERY_LIST = [
  { id: 'item-1', name: 'All-purpose flour', quantity: '3 cups', category: 'Pantry Staples', completed: false, isCustom: false, source: 'ai-generated', createdAt: 1 },
  { id: 'item-2', name: 'Salt', quantity: '1 tsp', category: 'Pantry Staples', completed: false, isCustom: false, source: 'ai-generated', createdAt: 2 },
  { id: 'item-3', name: 'Whole milk', quantity: '2 cups', category: 'Dairy', completed: false, isCustom: false, source: 'ai-generated', createdAt: 3 },
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
    mockGroceryList = MOCK_GROCERY_LIST;
    mockToggleItemCompletion = jest.fn();
    mockDeleteItem = jest.fn();
    mockAddCustomItem = jest.fn();
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

  test('renders an add-item input', () => {
    renderModal();
    expect(screen.getByRole('textbox', { name: /custom item name/i })).toBeInTheDocument();
  });

  test('renders category headers from groceryList', () => {
    renderModal();
    expect(screen.getByRole('button', { name: /pantry staples/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /dairy/i })).toBeInTheDocument();
  });

  test('renders item names from groceryList', () => {
    renderModal();
    expect(screen.getByText('All-purpose flour')).toBeInTheDocument();
    expect(screen.getByText('Whole milk')).toBeInTheDocument();
  });

  test('renders item quantity text', () => {
    renderModal();
    expect(screen.getByText('3 cups')).toBeInTheDocument();
  });

  test('renders a delete button for each item', () => {
    renderModal();
    const deleteBtns = screen.getAllByRole('button', { name: /^delete /i });
    expect(deleteBtns).toHaveLength(MOCK_GROCERY_LIST.length);
  });
});

// ── Empty state ───────────────────────────────────────────────────────────────

describe('GroceryListModal — empty state', () => {
  beforeEach(() => {
    mockGroceryList = [];
  });

  test('shows empty-state message when groceryList is empty', () => {
    renderModal();
    expect(screen.getByText(/no items yet/i)).toBeInTheDocument();
  });

  test('still renders the add-item input when list is empty', () => {
    renderModal();
    expect(screen.getByRole('textbox', { name: /custom item name/i })).toBeInTheDocument();
  });

  test('does not render item checkboxes when list is empty', () => {
    renderModal();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});

// ── Add custom item ───────────────────────────────────────────────────────────

describe('GroceryListModal — add custom item', () => {
  beforeEach(() => {
    mockGroceryList = [];
    mockAddCustomItem = jest.fn();
  });

  test('calls addCustomItem with trimmed name on form submit', () => {
    renderModal();
    const input = screen.getByRole('textbox', { name: /custom item name/i });
    fireEvent.change(input, { target: { value: '  Olive oil  ' } });
    fireEvent.click(screen.getByRole('button', { name: /add item to grocery list/i }));
    expect(mockAddCustomItem).toHaveBeenCalledTimes(1);
    expect(mockAddCustomItem).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Olive oil' })
    );
  });

  test('clears the input after successful add', () => {
    renderModal();
    const input = screen.getByRole('textbox', { name: /custom item name/i });
    fireEvent.change(input, { target: { value: 'Olive oil' } });
    fireEvent.click(screen.getByRole('button', { name: /add item to grocery list/i }));
    expect(input.value).toBe('');
  });

  test('shows error when submitting an empty input', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /add item to grocery list/i }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(mockAddCustomItem).not.toHaveBeenCalled();
  });

  test('pressing Enter in the input submits the form', () => {
    renderModal();
    const input = screen.getByRole('textbox', { name: /custom item name/i });
    fireEvent.change(input, { target: { value: 'Butter' } });
    fireEvent.submit(input.closest('form'));
    expect(mockAddCustomItem).toHaveBeenCalledTimes(1);
  });
});

// ── Checklist ─────────────────────────────────────────────────────────────────

describe('GroceryListModal — checklist', () => {
  beforeEach(() => {
    mockGroceryList = MOCK_GROCERY_LIST;
    mockToggleItemCompletion = jest.fn();
  });

  test('item checkboxes reflect completed state from context', () => {
    renderModal();
    const checkboxes = screen.getAllByRole('checkbox');
    checkboxes.forEach((cb) => expect(cb).not.toBeChecked());
  });

  test('clicking a checkbox calls toggleItemCompletion with the item id', () => {
    renderModal();
    const checkbox = screen.getByRole('checkbox', { name: 'All-purpose flour' });
    fireEvent.click(checkbox);
    expect(mockToggleItemCompletion).toHaveBeenCalledWith('item-1');
  });

  test('clicking a second checkbox calls toggleItemCompletion with its id', () => {
    renderModal();
    const checkbox = screen.getByRole('checkbox', { name: 'Salt' });
    fireEvent.click(checkbox);
    expect(mockToggleItemCompletion).toHaveBeenCalledWith('item-2');
  });

  test('a completed item renders with checked checkbox', () => {
    mockGroceryList = [
      { ...MOCK_GROCERY_LIST[0], completed: true },
    ];
    renderModal();
    const checkbox = screen.getByRole('checkbox', { name: 'All-purpose flour' });
    expect(checkbox).toBeChecked();
  });
});

// ── Delete item ───────────────────────────────────────────────────────────────

describe('GroceryListModal — delete item', () => {
  beforeEach(() => {
    mockGroceryList = MOCK_GROCERY_LIST;
    mockDeleteItem = jest.fn();
  });

  test('clicking delete calls deleteItem with the item id', () => {
    renderModal();
    const deleteBtn = screen.getByRole('button', { name: 'Delete All-purpose flour' });
    fireEvent.click(deleteBtn);
    expect(mockDeleteItem).toHaveBeenCalledWith('item-1');
  });

  test('each item has its own delete button with correct aria-label', () => {
    renderModal();
    expect(screen.getByRole('button', { name: 'Delete All-purpose flour' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Salt' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Whole milk' })).toBeInTheDocument();
  });
});

// ── Category controls ─────────────────────────────────────────────────────────

describe('GroceryListModal — category controls', () => {
  beforeEach(() => {
    mockGroceryList = MOCK_GROCERY_LIST;
  });

  test('category toggle button collapses items', () => {
    renderModal();
    const toggleBtn = screen.getByRole('button', { name: /pantry staples/i });
    expect(screen.getByText('All-purpose flour')).toBeInTheDocument();
    fireEvent.click(toggleBtn);
    expect(screen.queryByText('All-purpose flour')).not.toBeInTheDocument();
  });

  test('category toggle button expands items again', () => {
    renderModal();
    const toggleBtn = screen.getByRole('button', { name: /pantry staples/i });
    fireEvent.click(toggleBtn);
    expect(screen.queryByText('All-purpose flour')).not.toBeInTheDocument();
    fireEvent.click(toggleBtn);
    expect(screen.getByText('All-purpose flour')).toBeInTheDocument();
  });

  test('category count badge shows correct item count', () => {
    renderModal();
    // Pantry Staples has 2 items
    const toggleBtn = screen.getByRole('button', { name: /pantry staples/i });
    expect(toggleBtn).toHaveTextContent('2');
  });
});

// ── Custom item badge ─────────────────────────────────────────────────────────

describe('GroceryListModal — custom item badge', () => {
  test('custom items show a "Custom" badge', () => {
    mockGroceryList = [
      { id: 'c1', name: 'Extra milk', quantity: '', category: 'Other', completed: false, isCustom: true, source: 'user-added', createdAt: 1 },
    ];
    renderModal();
    expect(screen.getByText('Custom')).toBeInTheDocument();
  });

  test('AI-generated items do not show a "Custom" badge', () => {
    mockGroceryList = MOCK_GROCERY_LIST;
    renderModal();
    expect(screen.queryByText('Custom')).not.toBeInTheDocument();
  });
});

// ── Close behaviour ───────────────────────────────────────────────────────────

describe('GroceryListModal — close behaviour', () => {
  beforeEach(() => {
    mockGroceryList = [];
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
});
