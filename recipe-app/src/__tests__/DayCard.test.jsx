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

// Capture the props that MoveMealModal was last opened with
let lastModalProps = null;
jest.mock('../MoveMealModal.jsx', () => (props) => {
  lastModalProps = props;
  if (!props.isOpen) return null;
  return (
    <div data-testid="move-meal-modal">
      <span data-testid="modal-recipe-name">{props.sourceRecipe?.name}</span>
      <button onClick={() => props.onMove('2026-04-01', 'dinner', 0)}>Confirm Move</button>
      <button onClick={props.onClose}>Close Modal</button>
    </div>
  );
});

const mockSetActiveRecipe = jest.fn();
const mockMoveMeal = jest.fn();
jest.mock('../MealPlanContext.jsx', () => ({
  useMealPlan: () => ({
    setActiveRecipe: mockSetActiveRecipe,
    moveMeal: mockMoveMeal,
  }),
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

beforeEach(() => {
  mockSetActiveRecipe.mockClear();
  mockMoveMeal.mockClear();
  lastModalProps = null;
});

// ── Recipe clickability ─────────────────────────────────────────────────────

describe('DayCard — recipe clickability', () => {
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

// ── Move button ─────────────────────────────────────────────────────────────

describe('DayCard — Move button', () => {
  test('each meal item has a Move button', () => {
    renderDayCard();
    expect(screen.getByRole('button', { name: 'Move Spaghetti Carbonara' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move Grilled Salmon' })).toBeInTheDocument();
  });

  test('clicking Move opens the MoveMealModal with correct source info', () => {
    renderDayCard();
    fireEvent.click(screen.getByRole('button', { name: 'Move Spaghetti Carbonara' }));
    expect(screen.getByTestId('move-meal-modal')).toBeInTheDocument();
    expect(screen.getByTestId('modal-recipe-name').textContent).toBe('Spaghetti Carbonara');
    expect(lastModalProps.sourceDate).toBe('2026-03-25');
    expect(lastModalProps.sourceMealType).toBe('lunch');
    expect(lastModalProps.sourceIndex).toBe(0);
  });

  test('modal is not shown before Move is clicked', () => {
    renderDayCard();
    expect(screen.queryByTestId('move-meal-modal')).not.toBeInTheDocument();
  });

  test('closing the modal without confirming does not call moveMeal', () => {
    renderDayCard();
    fireEvent.click(screen.getByRole('button', { name: 'Move Spaghetti Carbonara' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close Modal' }));
    expect(mockMoveMeal).not.toHaveBeenCalled();
    expect(screen.queryByTestId('move-meal-modal')).not.toBeInTheDocument();
  });

  test('confirming the modal calls moveMeal with correct arguments', () => {
    renderDayCard();
    fireEvent.click(screen.getByRole('button', { name: 'Move Spaghetti Carbonara' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Move' }));
    // Confirm Move fires onMove('2026-04-01', 'dinner', 0)
    expect(mockMoveMeal).toHaveBeenCalledWith(
      '2026-03-25', 'lunch',   // source date + type
      '2026-04-01', 'dinner',  // dest date + type
      0, 0                      // source index + dest index
    );
  });

  test('modal closes after confirming the move', () => {
    renderDayCard();
    fireEvent.click(screen.getByRole('button', { name: 'Move Spaghetti Carbonara' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Move' }));
    expect(screen.queryByTestId('move-meal-modal')).not.toBeInTheDocument();
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

  test('never renders a card-level EmptyDropZone even when all meal slots are empty', () => {
    renderDayCard(EMPTY_MEALS);
    expect(screen.queryByTestId('empty-drop-zone')).not.toBeInTheDocument();
  });

  test('always renders meal type section labels even when all slots are empty', () => {
    renderDayCard(EMPTY_MEALS);
    expect(screen.getByText('Breakfast')).toBeInTheDocument();
    expect(screen.getByText('Lunch')).toBeInTheDocument();
    expect(screen.getByText('Dinner')).toBeInTheDocument();
    expect(screen.getByText('Snack')).toBeInTheDocument();
  });

  test('renders meal type section labels when at least one slot has meals', () => {
    renderDayCard();
    expect(screen.getByText('Breakfast')).toBeInTheDocument();
    expect(screen.getByText('Lunch')).toBeInTheDocument();
    expect(screen.getByText('Dinner')).toBeInTheDocument();
    expect(screen.getByText('Snack')).toBeInTheDocument();
  });

  test('renders "No meals" placeholder for each empty slot', () => {
    renderDayCard(EMPTY_MEALS);
    // 4 empty slots → 4 "No meals" placeholders
    expect(screen.getAllByText('No meals')).toHaveLength(4);
  });

  test('renders "No meals" placeholder for empty slots when day has some meals', () => {
    renderDayCard(); // breakfast, dinner, snack are empty; lunch has meals
    // 3 empty slots → 3 "No meals" placeholders
    expect(screen.getAllByText('No meals')).toHaveLength(3);
  });

  test('renders all meal names', () => {
    renderDayCard();
    expect(screen.getByText('Spaghetti Carbonara')).toBeInTheDocument();
    expect(screen.getByText('Grilled Salmon')).toBeInTheDocument();
  });

  test('renders null meals gracefully (defaults to empty slots)', () => {
    renderDayCard(null);
    expect(screen.getByText('Breakfast')).toBeInTheDocument();
    expect(screen.getAllByText('No meals')).toHaveLength(4);
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
