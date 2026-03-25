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

const BASE_MEALS = [
  { id: 'meal-1', name: 'Spaghetti Carbonara' },
  { id: 'meal-2', name: 'Grilled Salmon' },
];

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
    expect(mockSetActiveRecipe).toHaveBeenCalledWith(BASE_MEALS[0]);
  });

  test('clicking the second recipe calls setActiveRecipe with that recipe', () => {
    renderDayCard();
    fireEvent.click(screen.getByRole('button', { name: /View Grilled Salmon/i }));
    expect(mockSetActiveRecipe).toHaveBeenCalledWith(BASE_MEALS[1]);
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

  test('clicking the remove button calls onRemoveMeal with the meal id', () => {
    const { onRemoveMeal } = renderDayCard();
    fireEvent.click(screen.getByRole('button', { name: /Remove Spaghetti Carbonara/i }));
    expect(onRemoveMeal).toHaveBeenCalledWith('meal-1');
  });

  test('rapid clicks on the same recipe call setActiveRecipe each time', () => {
    renderDayCard();
    const btn = screen.getByRole('button', { name: /View Spaghetti Carbonara/i });
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(mockSetActiveRecipe).toHaveBeenCalledTimes(3);
    expect(mockSetActiveRecipe).toHaveBeenCalledWith(BASE_MEALS[0]);
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

  test('renders EmptyDropZone when there are no meals', () => {
    renderDayCard([]);
    expect(screen.getByTestId('empty-drop-zone')).toBeInTheDocument();
  });

  test('does not render EmptyDropZone when meals are present', () => {
    renderDayCard();
    expect(screen.queryByTestId('empty-drop-zone')).not.toBeInTheDocument();
  });

  test('renders all meal names', () => {
    renderDayCard();
    expect(screen.getByText('Spaghetti Carbonara')).toBeInTheDocument();
    expect(screen.getByText('Grilled Salmon')).toBeInTheDocument();
  });
});
