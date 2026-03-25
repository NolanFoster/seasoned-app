import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DayCard from '../DayCard';

// Avoid DnD DOM complexity in unit tests — render children directly
jest.mock('@hello-pangea/dnd', () => ({
  Droppable: ({ children }) =>
    children(
      { innerRef: () => {}, droppableProps: {}, placeholder: null },
      { isDraggingOver: false }
    ),
  Draggable: ({ children }) =>
    children(
      { innerRef: () => {}, draggableProps: {}, dragHandleProps: {} },
      { isDragging: false }
    ),
}));

jest.mock('../EmptyDropZone.jsx', () => () => <div data-testid="empty-drop-zone" />);
jest.mock('../DragPortal.jsx', () => ({ children }) => children);

const mockSetActiveRecipe = jest.fn();
jest.mock('../MealPlanContext.jsx', () => ({
  useMealPlan: () => ({ setActiveRecipe: mockSetActiveRecipe }),
}));

// New meals shape: organised by meal type
const MEAL_1 = { id: 'meal-1', name: 'Spaghetti Carbonara' };
const MEAL_2 = { id: 'meal-2', name: 'Grilled Salmon' };

const BASE_MEALS = {
  breakfast: [],
  lunch: [MEAL_1, MEAL_2],
  dinner: [],
  snack: [],
};

const EMPTY_MEALS = {
  breakfast: [],
  lunch: [],
  dinner: [],
  snack: [],
};

function renderDayCard(meals = BASE_MEALS) {
  const onRemoveMeal = jest.fn();
  render(
    <DayCard
      day="Monday"
      date="Mar 25"
      dateString="2026-03-25"
      meals={meals}
      onRemoveMeal={onRemoveMeal}
    />
  );
  return { onRemoveMeal };
}

// ── Recipe clickability ─────────────────────────────────────────────────────

describe('DayCard — recipe clickability', () => {
  beforeEach(() => mockSetActiveRecipe.mockClear());

  test('recipe names render as buttons', () => {
    renderDayCard();
    expect(screen.getByRole('button', { name: /View Spaghetti Carbonara/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /View Grilled Salmon/i })).toBeInTheDocument();
  });

  test('clicking a recipe name calls setActiveRecipe with the full recipe object', () => {
    renderDayCard();
    fireEvent.click(screen.getByRole('button', { name: /View Spaghetti Carbonara/i }));
    expect(mockSetActiveRecipe).toHaveBeenCalledTimes(1);
    expect(mockSetActiveRecipe).toHaveBeenCalledWith(MEAL_1);
  });

  test('clicking the second recipe calls setActiveRecipe with that recipe', () => {
    renderDayCard();
    fireEvent.click(screen.getByRole('button', { name: /View Grilled Salmon/i }));
    expect(mockSetActiveRecipe).toHaveBeenCalledWith(MEAL_2);
  });

  test('clicking a recipe name does not call onRemoveMeal', () => {
    const { onRemoveMeal } = renderDayCard();
    fireEvent.click(screen.getByRole('button', { name: /View Spaghetti Carbonara/i }));
    expect(onRemoveMeal).not.toHaveBeenCalled();
  });

  test('clicking the remove button does not call setActiveRecipe', () => {
    renderDayCard();
    fireEvent.click(screen.getByRole('button', { name: /Remove Spaghetti Carbonara/i }));
    expect(mockSetActiveRecipe).not.toHaveBeenCalled();
  });

  test('clicking the remove button calls onRemoveMeal with mealType and meal id', () => {
    const { onRemoveMeal } = renderDayCard();
    fireEvent.click(screen.getByRole('button', { name: /Remove Spaghetti Carbonara/i }));
    expect(onRemoveMeal).toHaveBeenCalledWith('lunch', 'meal-1');
  });

  test('rapid clicks on the same recipe call setActiveRecipe each time', () => {
    renderDayCard();
    const btn = screen.getByRole('button', { name: /View Spaghetti Carbonara/i });
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(mockSetActiveRecipe).toHaveBeenCalledTimes(3);
    expect(mockSetActiveRecipe).toHaveBeenCalledWith(MEAL_1);
  });
});

// ── data-testid ────────────────────────────────────────────────────────────

describe('DayCard — data-testid attributes', () => {
  test('each meal item has data-testid="meal-item-{id}"', () => {
    renderDayCard();
    expect(screen.getByTestId('meal-item-meal-1')).toBeInTheDocument();
    expect(screen.getByTestId('meal-item-meal-2')).toBeInTheDocument();
  });
});

// ── Rendering ──────────────────────────────────────────────────────────────

describe('DayCard — rendering', () => {
  test('renders the day name and date', () => {
    renderDayCard();
    expect(screen.getByText('Monday')).toBeInTheDocument();
    expect(screen.getByText('Mar 25')).toBeInTheDocument();
  });

  test('renders a single card-level EmptyDropZone when all meal slots are empty', () => {
    renderDayCard(EMPTY_MEALS);
    expect(screen.getByTestId('empty-drop-zone')).toBeInTheDocument();
  });

  test('does not render EmptyDropZone when at least one slot has meals', () => {
    renderDayCard(); // lunch has 2 meals
    expect(screen.queryByTestId('empty-drop-zone')).not.toBeInTheDocument();
  });

  test('does not render meal type sections when all slots are empty', () => {
    renderDayCard(EMPTY_MEALS);
    expect(screen.queryByText('Breakfast')).not.toBeInTheDocument();
    expect(screen.queryByText('Lunch')).not.toBeInTheDocument();
  });

  test('renders meal type section labels when at least one slot has meals', () => {
    renderDayCard();
    expect(screen.getByText('Breakfast')).toBeInTheDocument();
    expect(screen.getByText('Lunch')).toBeInTheDocument();
    expect(screen.getByText('Dinner')).toBeInTheDocument();
    expect(screen.getByText('Snack')).toBeInTheDocument();
  });

  test('renders "No meals" placeholder for empty slots when day is not all empty', () => {
    renderDayCard(); // breakfast, dinner, snack are empty; lunch has meals
    // 3 empty slots → 3 "No meals" placeholders
    expect(screen.getAllByText('No meals')).toHaveLength(3);
  });

  test('renders all meal names', () => {
    renderDayCard();
    expect(screen.getByText('Spaghetti Carbonara')).toBeInTheDocument();
    expect(screen.getByText('Grilled Salmon')).toBeInTheDocument();
  });

  test('renders null meals gracefully (defaults to empty state)', () => {
    renderDayCard(null);
    expect(screen.getByTestId('empty-drop-zone')).toBeInTheDocument();
  });
});

// ── droppableId encoding ────────────────────────────────────────────────────

describe('DayCard — encodeDroppableId', () => {
  const { encodeDroppableId } = jest.requireActual('../DayCard');

  test('encodes dateString and mealType with :: separator', () => {
    expect(encodeDroppableId('2026-03-25', 'lunch')).toBe('2026-03-25::lunch');
  });

  test('encodes breakfast slot correctly', () => {
    expect(encodeDroppableId('2026-10-24', 'breakfast')).toBe('2026-10-24::breakfast');
  });
});
