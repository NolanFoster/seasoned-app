import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import UpNextCard from '../UpNextCard';

// ── Mock drag-and-drop ────────────────────────────────────────────────────────
// Renders children directly so we can test the card content without a
// full DragDropContext. Mirrors the pattern used in DayCard.test.jsx.
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

jest.mock('../DragPortal.jsx', () => ({ children }) => children);

// ── Mock MealPlanContext ──────────────────────────────────────────────────────
const mockRemoveUpNext = jest.fn();
let mockUpNext = [];

jest.mock('../MealPlanContext.jsx', () => ({
  useMealPlan: () => ({ upNext: mockUpNext, removeUpNext: mockRemoveUpNext }),
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────
const RECIPE_1 = {
  id: 'r1',
  name: 'Spaghetti Carbonara',
  ingredients: ['pasta', 'eggs', 'bacon'],
  prepTime: 10,
  cookTime: 20,
};

const RECIPE_2 = {
  id: 'r2',
  name: 'Grilled Salmon',
  ingredients: ['salmon', 'lemon', 'herbs'],
  prepTime: 5,
  cookTime: 15,
  imageUrl: 'https://example.com/salmon.jpg',
};

const RECIPE_SPARSE = {
  id: 'r3',
  name: 'Simple Toast',
  ingredients: ['bread'],
  // no prepTime, cookTime, or imageUrl
};

function renderUpNextCard() {
  return render(<UpNextCard />);
}

// ── Empty state ───────────────────────────────────────────────────────────────

describe('UpNextCard — empty state', () => {
  beforeEach(() => {
    mockUpNext = [];
  });

  test('renders the "Up Next" heading', () => {
    renderUpNextCard();
    expect(screen.getByText('Up Next')).toBeInTheDocument();
  });

  test('shows the empty-state placeholder when upNext is empty', () => {
    renderUpNextCard();
    expect(screen.getByText(/no recipes staged yet/i)).toBeInTheDocument();
  });

  test('does not render any recipe cards when upNext is empty', () => {
    renderUpNextCard();
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
  });
});

// ── Recipes render ────────────────────────────────────────────────────────────

describe('UpNextCard — recipe cards', () => {
  beforeEach(() => {
    mockUpNext = [RECIPE_1, RECIPE_2];
    mockRemoveUpNext.mockClear();
  });

  test('renders a card for each recipe in upNext', () => {
    renderUpNextCard();
    expect(screen.getByText('Spaghetti Carbonara')).toBeInTheDocument();
    expect(screen.getByText('Grilled Salmon')).toBeInTheDocument();
  });

  test('does not show the empty-state placeholder when recipes are present', () => {
    renderUpNextCard();
    expect(screen.queryByText(/no recipes staged yet/i)).not.toBeInTheDocument();
  });

  test('displays prep and cook time metadata', () => {
    renderUpNextCard();
    expect(screen.getByText('10m prep')).toBeInTheDocument();
    expect(screen.getByText('20m cook')).toBeInTheDocument();
  });

  test('renders image when imageUrl is present', () => {
    renderUpNextCard();
    const img = screen.getByAltText('Grilled Salmon');
    expect(img).toHaveAttribute('src', 'https://example.com/salmon.jpg');
  });

  test('renders a remove button for each recipe', () => {
    renderUpNextCard();
    const removeButtons = screen.getAllByRole('button', { name: /remove/i });
    expect(removeButtons).toHaveLength(2);
  });

  test('each remove button has an accessible aria-label containing the recipe name', () => {
    renderUpNextCard();
    expect(
      screen.getByRole('button', { name: /remove spaghetti carbonara/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /remove grilled salmon/i })
    ).toBeInTheDocument();
  });

  test('renders data-testid attribute for each card', () => {
    const { container } = renderUpNextCard();
    expect(container.querySelector('[data-testid="up-next-card-r1"]')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="up-next-card-r2"]')).toBeInTheDocument();
  });
});

// ── Sparse recipe objects ─────────────────────────────────────────────────────

describe('UpNextCard — sparse recipe objects', () => {
  beforeEach(() => {
    mockUpNext = [RECIPE_SPARSE];
  });

  test('renders without crashing when recipe has no imageUrl, prepTime, or cookTime', () => {
    expect(() => renderUpNextCard()).not.toThrow();
    expect(screen.getByText('Simple Toast')).toBeInTheDocument();
  });

  test('does not render metadata section when times are absent', () => {
    renderUpNextCard();
    expect(screen.queryByText(/prep/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/cook/i)).not.toBeInTheDocument();
  });

  test('does not render an img element when imageUrl is absent', () => {
    renderUpNextCard();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});

// ── Remove functionality ──────────────────────────────────────────────────────

describe('UpNextCard — remove button', () => {
  beforeEach(() => {
    mockUpNext = [RECIPE_1, RECIPE_2];
    mockRemoveUpNext.mockClear();
  });

  test('clicking the remove button calls removeUpNext with the recipe id', () => {
    renderUpNextCard();
    fireEvent.click(screen.getByRole('button', { name: /remove spaghetti carbonara/i }));
    expect(mockRemoveUpNext).toHaveBeenCalledWith('r1');
  });

  test('clicking the second remove button calls removeUpNext with the correct id', () => {
    renderUpNextCard();
    fireEvent.click(screen.getByRole('button', { name: /remove grilled salmon/i }));
    expect(mockRemoveUpNext).toHaveBeenCalledWith('r2');
  });

  test('removeUpNext is called exactly once per click', () => {
    renderUpNextCard();
    fireEvent.click(screen.getByRole('button', { name: /remove spaghetti carbonara/i }));
    expect(mockRemoveUpNext).toHaveBeenCalledTimes(1);
  });
});

// ── Droppable / drag-drop structure ──────────────────────────────────────────

describe('UpNextCard — drag-drop structure', () => {
  beforeEach(() => {
    mockUpNext = [RECIPE_1];
    mockRemoveUpNext.mockClear();
  });

  test('component renders inside a section with the staging area aria-label', () => {
    renderUpNextCard();
    expect(screen.getByRole('region', { name: /up next staging area/i })).toBeInTheDocument();
  });
});
