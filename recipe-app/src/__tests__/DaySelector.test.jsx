import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DaySelector from '../DaySelector';

const mockAddUpNext = jest.fn();
jest.mock('../MealPlanContext.jsx', () => ({
  useMealPlan: () => ({ addUpNext: mockAddUpNext }),
}));

function renderSelector(props = {}) {
  const onDaySelected = jest.fn();
  const onClose = jest.fn();
  render(
    <DaySelector
      onDaySelected={onDaySelected}
      onClose={onClose}
      {...props}
    />
  );
  return { onDaySelected, onClose };
}

// ── Step 1: date selection ──────────────────────────────────────────────────

describe('DaySelector — Step 1 (date)', () => {
  test('renders the "Which day?" prompt on mount', () => {
    renderSelector();
    expect(screen.getByText('Which day?')).toBeInTheDocument();
  });

  test('renders the "Add to Planner" title on mount', () => {
    renderSelector();
    expect(screen.getByText('Add to Planner')).toBeInTheDocument();
  });

  test('renders 7 day options', () => {
    renderSelector();
    // Each day option has an "Add to <label>" aria-label
    const dayButtons = screen.getAllByRole('option').map((li) => li.querySelector('button'));
    expect(dayButtons).toHaveLength(7);
  });

  test('does not show meal type buttons on Step 1', () => {
    renderSelector();
    expect(screen.queryByText('Breakfast')).not.toBeInTheDocument();
    expect(screen.queryByText('Lunch')).not.toBeInTheDocument();
  });

  test('does not show Back button on Step 1', () => {
    renderSelector();
    expect(screen.queryByRole('button', { name: /back to day selection/i })).not.toBeInTheDocument();
  });

  test('Cancel (×) button calls onClose', () => {
    const { onClose } = renderSelector();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('clicking the backdrop calls onClose', () => {
    const { onClose } = renderSelector();
    const backdrop = screen.getByRole('dialog');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('Escape key on Step 1 calls onClose', () => {
    const { onClose } = renderSelector();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ── Step 1 → Step 2 transition ─────────────────────────────────────────────

describe('DaySelector — transition to Step 2', () => {
  function advanceToStep2() {
    const result = renderSelector();
    // Click the first day button (Today)
    const firstDay = screen.getByRole('button', { name: /Add to Today/i });
    fireEvent.click(firstDay);
    return result;
  }

  test('clicking a date advances to Step 2', () => {
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

  test('Step 2 shows the selected date in the header', () => {
    advanceToStep2();
    // Header should include something like "Today, Mar 25"
    expect(screen.getByText(/Today,/i)).toBeInTheDocument();
  });

  test('Step 2 hides the "Which day?" prompt', () => {
    advanceToStep2();
    expect(screen.queryByText('Which day?')).not.toBeInTheDocument();
  });

  test('Step 2 shows the Back button', () => {
    advanceToStep2();
    expect(screen.getByRole('button', { name: /back to day selection/i })).toBeInTheDocument();
  });
});

// ── Back button ─────────────────────────────────────────────────────────────

describe('DaySelector — Back button', () => {
  function goToStep2ThenBack() {
    const result = renderSelector();
    fireEvent.click(screen.getByRole('button', { name: /Add to Today/i }));
    fireEvent.click(screen.getByRole('button', { name: /back to day selection/i }));
    return result;
  }

  test('Back button returns to Step 1 without calling onClose', () => {
    const { onClose } = goToStep2ThenBack();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Which day?')).toBeInTheDocument();
  });

  test('After going back, date buttons are visible again', () => {
    goToStep2ThenBack();
    expect(screen.getAllByRole('option')).toHaveLength(7);
  });

  test('After going back, meal type buttons are not visible', () => {
    goToStep2ThenBack();
    expect(screen.queryByText('Breakfast')).not.toBeInTheDocument();
  });

  test('Escape on Step 2 goes back to Step 1 (not close)', () => {
    const { onClose } = renderSelector();
    fireEvent.click(screen.getByRole('button', { name: /Add to Today/i }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Which day?')).toBeInTheDocument();
  });

  test('pressing Back multiple times stays on Step 1', () => {
    renderSelector();
    fireEvent.click(screen.getByRole('button', { name: /Add to Today/i }));
    fireEvent.click(screen.getByRole('button', { name: /back to day selection/i }));
    // Back button should no longer exist on Step 1
    expect(screen.queryByRole('button', { name: /back to day selection/i })).not.toBeInTheDocument();
    expect(screen.getByText('Which day?')).toBeInTheDocument();
  });
});

// ── Step 2: meal type selection ─────────────────────────────────────────────

describe('DaySelector — Step 2 (meal type)', () => {
  function advanceToStep2() {
    const result = renderSelector();
    fireEvent.click(screen.getByRole('button', { name: /Add to Today/i }));
    return result;
  }

  test('selecting Breakfast fires onDaySelected with correct dateString and mealType', () => {
    const { onDaySelected } = advanceToStep2();
    fireEvent.click(screen.getByRole('button', { name: /Add to Breakfast/i }));
    expect(onDaySelected).toHaveBeenCalledTimes(1);
    const [dateArg, mealTypeArg] = onDaySelected.mock.calls[0];
    expect(typeof dateArg).toBe('string');
    expect(mealTypeArg).toBe('breakfast');
  });

  test('selecting Lunch fires onDaySelected with mealType "lunch"', () => {
    const { onDaySelected } = advanceToStep2();
    fireEvent.click(screen.getByRole('button', { name: /Add to Lunch/i }));
    expect(onDaySelected).toHaveBeenCalledWith(expect.any(String), 'lunch');
  });

  test('selecting Dinner fires onDaySelected with mealType "dinner"', () => {
    const { onDaySelected } = advanceToStep2();
    fireEvent.click(screen.getByRole('button', { name: /Add to Dinner/i }));
    expect(onDaySelected).toHaveBeenCalledWith(expect.any(String), 'dinner');
  });

  test('selecting Snack fires onDaySelected with mealType "snack"', () => {
    const { onDaySelected } = advanceToStep2();
    fireEvent.click(screen.getByRole('button', { name: /Add to Snack/i }));
    expect(onDaySelected).toHaveBeenCalledWith(expect.any(String), 'snack');
  });

  test('onClose is not called when a meal type is selected', () => {
    const { onClose } = advanceToStep2();
    fireEvent.click(screen.getByRole('button', { name: /Add to Lunch/i }));
    expect(onClose).not.toHaveBeenCalled();
  });

  test('Cancel (×) on Step 2 calls onClose without firing onDaySelected', () => {
    const { onDaySelected, onClose } = advanceToStep2();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onDaySelected).not.toHaveBeenCalled();
  });
});

// ── Re-selection ────────────────────────────────────────────────────────────

describe('DaySelector — re-selection', () => {
  test('user can go back and select a different date', () => {
    const { onDaySelected } = renderSelector();
    // Select today first
    fireEvent.click(screen.getByRole('button', { name: /Add to Today/i }));
    // Go back
    fireEvent.click(screen.getByRole('button', { name: /back to day selection/i }));
    // Select tomorrow
    fireEvent.click(screen.getByRole('button', { name: /Add to Tomorrow/i }));
    // Select a meal type
    fireEvent.click(screen.getByRole('button', { name: /Add to Lunch/i }));
    const [dateArg, mealTypeArg] = onDaySelected.mock.calls[0];
    // Date arg should be tomorrow's ISO string (not today's)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(dateArg).toBe(tomorrow.toISOString().split('T')[0]);
    expect(mealTypeArg).toBe('lunch');
  });
});

// ── Save to Up Next ──────────────────────────────────────────────────────────

const RECIPE = { id: 'r1', name: 'Pasta Carbonara', ingredients: ['pasta', 'eggs'] };

describe('DaySelector — Save to Up Next', () => {
  beforeEach(() => {
    mockAddUpNext.mockClear();
  });

  test('renders the "Save to Up Next" button on Step 1', () => {
    renderSelector({ recipe: RECIPE });
    expect(screen.getByRole('button', { name: /save to up next/i })).toBeInTheDocument();
  });

  test('"Save to Up Next" button is disabled when no recipe is passed', () => {
    renderSelector();
    expect(screen.getByRole('button', { name: /save to up next/i })).toBeDisabled();
  });

  test('clicking "Save to Up Next" calls addUpNext with the recipe', () => {
    renderSelector({ recipe: RECIPE });
    fireEvent.click(screen.getByRole('button', { name: /save to up next/i }));
    expect(mockAddUpNext).toHaveBeenCalledWith(RECIPE);
  });

  test('clicking "Save to Up Next" calls onClose immediately', () => {
    const { onClose } = renderSelector({ recipe: RECIPE });
    fireEvent.click(screen.getByRole('button', { name: /save to up next/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('clicking "Save to Up Next" does not call onDaySelected', () => {
    const { onDaySelected } = renderSelector({ recipe: RECIPE });
    fireEvent.click(screen.getByRole('button', { name: /save to up next/i }));
    expect(onDaySelected).not.toHaveBeenCalled();
  });

  test('"Save to Up Next" button is not shown on Step 2 (meal selection)', () => {
    renderSelector({ recipe: RECIPE });
    fireEvent.click(screen.getByRole('button', { name: /Add to Today/i }));
    expect(screen.queryByRole('button', { name: /save to up next/i })).not.toBeInTheDocument();
  });

  test('day selection flow still works after "Save to Up Next" button is present', () => {
    const { onDaySelected } = renderSelector({ recipe: RECIPE });
    fireEvent.click(screen.getByRole('button', { name: /Add to Today/i }));
    fireEvent.click(screen.getByRole('button', { name: /Add to Lunch/i }));
    expect(onDaySelected).toHaveBeenCalledWith(expect.any(String), 'lunch');
  });
});
