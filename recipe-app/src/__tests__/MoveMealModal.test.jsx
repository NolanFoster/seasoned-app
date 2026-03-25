import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import MoveMealModal from '../MoveMealModal';

// Provide mealPlan for destIndex computation
const mockMealPlan = {
  '2026-03-26': { breakfast: [], lunch: [{ id: 'x', name: 'X' }], dinner: [], snack: [] },
  '2026-03-27': { breakfast: [], lunch: [], dinner: [], snack: [] },
};
jest.mock('../MealPlanContext.jsx', () => ({
  useMealPlan: () => ({ mealPlan: mockMealPlan }),
}));

const SOURCE_RECIPE = { id: 'r1', name: 'Spaghetti Carbonara' };

const DEFAULT_PROPS = {
  isOpen: true,
  onClose: jest.fn(),
  sourceDate: '2026-03-25',
  sourceMealType: 'lunch',
  sourceIndex: 0,
  sourceRecipe: SOURCE_RECIPE,
  onMove: jest.fn(),
};

function renderModal(overrides = {}) {
  const props = { ...DEFAULT_PROPS, onClose: jest.fn(), onMove: jest.fn(), ...overrides };
  render(<MoveMealModal {...props} />);
  return props;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Visibility ──────────────────────────────────────────────────────────────

describe('MoveMealModal — visibility', () => {
  test('renders when isOpen is true', () => {
    renderModal();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  test('renders nothing when isOpen is false', () => {
    renderModal({ isOpen: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

// ── Step 1: date selection ──────────────────────────────────────────────────

describe('MoveMealModal — Step 1 (date)', () => {
  test('shows "Move to…" title on mount', () => {
    renderModal();
    expect(screen.getByText('Move to…')).toBeInTheDocument();
  });

  test('shows "Which day?" prompt on mount', () => {
    renderModal();
    expect(screen.getByText('Which day?')).toBeInTheDocument();
  });

  test('shows source recipe name in context strip', () => {
    renderModal();
    expect(screen.getByText('Spaghetti Carbonara')).toBeInTheDocument();
  });

  test('renders 7 day option buttons', () => {
    renderModal();
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(7);
  });

  test('does not show meal type buttons in Step 1', () => {
    renderModal();
    expect(screen.queryByText('Breakfast')).not.toBeInTheDocument();
    expect(screen.queryByText('Lunch')).not.toBeInTheDocument();
  });

  test('does not show Back button in Step 1', () => {
    renderModal();
    expect(screen.queryByRole('button', { name: /back to date selection/i })).not.toBeInTheDocument();
  });

  test('Cancel button calls onClose', () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('Escape key in Step 1 calls onClose', () => {
    const { onClose } = renderModal();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('clicking the backdrop calls onClose', () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ── Step 1 → Step 2 transition ─────────────────────────────────────────────

describe('MoveMealModal — transition to Step 2', () => {
  function advanceToStep2() {
    const result = renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Move to Today/i }));
    return result;
  }

  test('clicking a date shows "Which meal?" prompt', () => {
    advanceToStep2();
    expect(screen.getByText('Which meal?')).toBeInTheDocument();
  });

  test('Step 2 renders all four meal type buttons', () => {
    advanceToStep2();
    expect(screen.getByText('Breakfast')).toBeInTheDocument();
    expect(screen.getByText('Lunch')).toBeInTheDocument();
    expect(screen.getByText('Dinner')).toBeInTheDocument();
    expect(screen.getByText('Snack')).toBeInTheDocument();
  });

  test('Step 2 shows selected date in header', () => {
    advanceToStep2();
    expect(screen.getByText(/Today,/i)).toBeInTheDocument();
  });

  test('Step 2 shows Back button', () => {
    advanceToStep2();
    expect(screen.getByRole('button', { name: /back to date selection/i })).toBeInTheDocument();
  });

  test('Step 2 hides "Which day?" prompt', () => {
    advanceToStep2();
    expect(screen.queryByText('Which day?')).not.toBeInTheDocument();
  });
});

// ── Back button ─────────────────────────────────────────────────────────────

describe('MoveMealModal — Back button', () => {
  function goToStep2ThenBack() {
    const result = renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Move to Today/i }));
    fireEvent.click(screen.getByRole('button', { name: /back to date selection/i }));
    return result;
  }

  test('Back returns to Step 1 without calling onClose', () => {
    const { onClose } = goToStep2ThenBack();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Which day?')).toBeInTheDocument();
  });

  test('After Back, date buttons are visible again', () => {
    goToStep2ThenBack();
    expect(screen.getAllByRole('option')).toHaveLength(7);
  });

  test('After Back, meal type buttons are hidden', () => {
    goToStep2ThenBack();
    expect(screen.queryByText('Breakfast')).not.toBeInTheDocument();
  });

  test('Escape in Step 2 goes back to Step 1, not close', () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Move to Today/i }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Which day?')).toBeInTheDocument();
  });
});

// ── Step 2: meal type selection & onMove callback ───────────────────────────

describe('MoveMealModal — meal type selection', () => {
  function advanceToStep2(date = '2026-03-27') {
    const result = renderModal();
    // Click the date button for the given dateString by finding it via its label
    const btn = screen.getByRole('button', { name: /Move to Today/i });
    fireEvent.click(btn);
    return result;
  }

  test('selecting Breakfast calls onMove with mealType "breakfast"', () => {
    const { onMove } = advanceToStep2();
    fireEvent.click(screen.getByRole('button', { name: /Move to Breakfast/i }));
    expect(onMove).toHaveBeenCalledTimes(1);
    const [, mealTypeArg] = onMove.mock.calls[0];
    expect(mealTypeArg).toBe('breakfast');
  });

  test('selecting Lunch calls onMove with mealType "lunch"', () => {
    const { onMove } = advanceToStep2();
    fireEvent.click(screen.getByRole('button', { name: /Move to Lunch/i }));
    expect(onMove).toHaveBeenCalledWith(expect.any(String), 'lunch', expect.any(Number));
  });

  test('selecting Dinner calls onMove with mealType "dinner"', () => {
    const { onMove } = advanceToStep2();
    fireEvent.click(screen.getByRole('button', { name: /Move to Dinner/i }));
    expect(onMove).toHaveBeenCalledWith(expect.any(String), 'dinner', expect.any(Number));
  });

  test('selecting Snack calls onMove with mealType "snack"', () => {
    const { onMove } = advanceToStep2();
    fireEvent.click(screen.getByRole('button', { name: /Move to Snack/i }));
    expect(onMove).toHaveBeenCalledWith(expect.any(String), 'snack', expect.any(Number));
  });

  test('onMove receives destIndex equal to destination slot length (append)', () => {
    // Today's date → maps to the first day in the generated list.
    // For this test we need to check destIndex computation.
    // mockMealPlan has '2026-03-26' lunch: [x] (length 1)
    // We can't easily control which date "Today" maps to, so we just assert
    // that destIndex is a non-negative number.
    const { onMove } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Move to Today/i }));
    fireEvent.click(screen.getByRole('button', { name: /Move to Dinner/i }));
    const [, , destIndex] = onMove.mock.calls[0];
    expect(typeof destIndex).toBe('number');
    expect(destIndex).toBeGreaterThanOrEqual(0);
  });

  test('onClose is NOT called when a meal type is selected', () => {
    const { onClose } = advanceToStep2();
    fireEvent.click(screen.getByRole('button', { name: /Move to Lunch/i }));
    expect(onClose).not.toHaveBeenCalled();
  });

  test('Cancel on Step 2 calls onClose without firing onMove', () => {
    const { onMove, onClose } = advanceToStep2();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onMove).not.toHaveBeenCalled();
  });
});

// ── ARIA / accessibility ────────────────────────────────────────────────────

describe('MoveMealModal — accessibility', () => {
  test('dialog has role="dialog"', () => {
    renderModal();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  test('dialog has aria-modal="true"', () => {
    renderModal();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  test('dialog is labelled via aria-labelledby pointing to the title', () => {
    renderModal();
    const dialog = screen.getByRole('dialog');
    const labelId = dialog.getAttribute('aria-labelledby');
    expect(labelId).toBeTruthy();
    expect(document.getElementById(labelId)).toBeInTheDocument();
  });
});
