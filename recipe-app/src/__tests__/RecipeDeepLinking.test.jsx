/**
 * RecipeDeepLinking.test.jsx
 *
 * Integration tests for the full recipe deep-linking flow:
 *   User clicks a recipe in the MealPlannerDrawer
 *     → DayCard calls setActiveRecipe(meal)
 *     → App.jsx effect closes the drawer
 *     → RecipeCard renders with the selected recipe
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../App';
import { MealPlanProvider } from '../MealPlanContext.jsx';

// ── Module mocks ────────────────────────────────────────────────────────────

jest.mock('../flaggly.js', () => ({
  useFlag: () => false,
  flaggly: {},
}));

jest.mock('../useAuth', () => ({
  useAuth: () => ({
    user: { id: 'test-user', email: 'test@example.com' },
    loading: false,
    isAuthenticated: true,
    requestOTP: jest.fn(),
    verifyOTP: jest.fn(),
    signOut: jest.fn(),
  }),
}));

// Render DnD children directly — no pointer-event or getBoundingClientRect needed
jest.mock('@hello-pangea/dnd', () => ({
  DragDropContext: ({ children }) => <>{children}</>,
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

// ── Test data ───────────────────────────────────────────────────────────────

const PLAN_RECIPE = {
  id: 'plan-recipe-001',
  name: 'Spaghetti Carbonara',
  description: 'A classic Italian pasta dish.',
  image: '',
  prep_time: 'PT10M',
  cook_time: 'PT20M',
  recipe_yield: '4',
  ingredients: ['400g spaghetti', '3 eggs'],
  instructions: ['Boil pasta.', 'Mix with eggs.'],
  source_url: '',
};

function getToday() {
  return new Date().toISOString().split('T')[0];
}

function seedMealPlan(recipe = PLAN_RECIPE) {
  localStorage.setItem(
    'seasoned_meal_plan',
    JSON.stringify({ [getToday()]: [recipe] })
  );
}

function renderApp() {
  return render(
    <MealPlanProvider>
      <App />
    </MealPlanProvider>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function openDrawer() {
  fireEvent.click(screen.getByRole('button', { name: /open meal planner/i }));
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Recipe deep-linking: full flow', () => {
  beforeEach(() => seedMealPlan());
  afterEach(() => localStorage.removeItem('seasoned_meal_plan'));

  test('clicking a recipe in the drawer renders RecipeCard with correct name', () => {
    renderApp();
    openDrawer();

    fireEvent.click(screen.getByRole('button', { name: /View Spaghetti Carbonara/i }));

    expect(
      screen.getByRole('heading', { name: /Spaghetti Carbonara/i })
    ).toBeInTheDocument();
  });

  test('drawer closes automatically after selecting a recipe', () => {
    renderApp();
    openDrawer();

    const drawer = screen.getByTestId('meal-planner-drawer');
    expect(drawer).toHaveClass('is-open');

    fireEvent.click(screen.getByRole('button', { name: /View Spaghetti Carbonara/i }));

    expect(drawer).not.toHaveClass('is-open');
  });

  test('meal item is accessible by data-testid', () => {
    renderApp();
    openDrawer();

    expect(screen.getByTestId(`meal-item-${PLAN_RECIPE.id}`)).toBeInTheDocument();
  });

  test('drawer opens and shows the meal item before any click', () => {
    renderApp();
    openDrawer();

    expect(screen.getByRole('button', { name: /View Spaghetti Carbonara/i })).toBeInTheDocument();
  });
});

describe('Recipe deep-linking: state isolation', () => {
  afterEach(() => localStorage.removeItem('seasoned_meal_plan'));

  test('drawer starts closed on initial render', () => {
    seedMealPlan();
    renderApp();

    const drawer = screen.getByTestId('meal-planner-drawer');
    expect(drawer).not.toHaveClass('is-open');
  });

  test('closing the RecipeCard (via handleClose) does not reopen the drawer', () => {
    seedMealPlan();
    renderApp();
    openDrawer();

    fireEvent.click(screen.getByRole('button', { name: /View Spaghetti Carbonara/i }));

    // RecipeCard is now showing; open the options menu and click Close
    fireEvent.click(screen.getByTitle('More options'));
    fireEvent.click(screen.getByTitle('Close'));

    // RecipeCard should be gone and drawer should stay closed
    expect(
      screen.queryByRole('heading', { name: /Spaghetti Carbonara/i })
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('meal-planner-drawer')).not.toHaveClass('is-open');
  });

  test('activeRecipe and mealPlan are independent: selecting a recipe does not alter the meal plan', () => {
    seedMealPlan();
    renderApp();
    openDrawer();

    fireEvent.click(screen.getByRole('button', { name: /View Spaghetti Carbonara/i }));

    // Meal plan in localStorage should be unchanged
    const stored = JSON.parse(localStorage.getItem('seasoned_meal_plan'));
    expect(stored[getToday()]).toHaveLength(1);
    expect(stored[getToday()][0].name).toBe('Spaghetti Carbonara');
  });
});

describe('Recipe deep-linking: backwards compatibility', () => {
  afterEach(() => localStorage.removeItem('seasoned_meal_plan'));

  test('manually toggling the drawer open/close is unaffected by recipe selection logic', () => {
    localStorage.setItem('seasoned_meal_plan', JSON.stringify({}));
    renderApp();

    const toggleBtn = screen.getByRole('button', { name: /open meal planner/i });
    const drawer = screen.getByTestId('meal-planner-drawer');

    // Open
    fireEvent.click(toggleBtn);
    expect(drawer).toHaveClass('is-open');

    // Close via toggle — use data-testid to avoid ambiguity with the drawer's own close button
    fireEvent.click(screen.getByTestId('open-meal-planner-btn'));
    expect(drawer).not.toHaveClass('is-open');
  });
});
