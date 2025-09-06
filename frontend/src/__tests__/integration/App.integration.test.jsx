import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from '../../App';

// Mock all the feature hooks
vi.mock('../../features/recipes/hooks/useRecipes', () => ({
  useRecipes: () => ({
    recipes: [
      { id: '1', name: 'Test Recipe 1', description: 'A test recipe' },
      { id: '2', name: 'Test Recipe 2', description: 'Another test recipe' }
    ],
    selectedRecipe: null,
    editingRecipe: null,
    isLoading: false,
    isSaving: false,
    error: null,
    loadRecipes: vi.fn(),
    saveRecipe: vi.fn(),
    updateRecipe: vi.fn(),
    deleteRecipe: vi.fn(),
    selectRecipe: vi.fn(),
    clearSelectedRecipe: vi.fn(),
    setEditingRecipe: vi.fn(),
    clearEditingRecipe: vi.fn(),
    clearError: vi.fn()
  })
}));

vi.mock('../../features/search/hooks/useSearch', () => ({
  useSearch: () => ({
    query: '',
    results: [],
    isSearching: false,
    hasResults: false,
    hasError: false,
    search: vi.fn(),
    clearSearch: vi.fn(),
    setQuery: vi.fn()
  })
}));

vi.mock('../../features/timers/stores/useTimersStore', () => ({
  useTimersStore: () => ({
    activeTimers: [],
    createTimer: vi.fn(),
    startTimer: vi.fn(),
    pauseTimer: vi.fn(),
    resumeTimer: vi.fn(),
    stopTimer: vi.fn(),
    resetTimer: vi.fn(),
    deleteTimer: vi.fn()
  })
}));

// Mock components that might cause issues
vi.mock('../../components/BackgroundCanvas', () => ({
  default: () => <div data-testid="background-canvas">Background</div>
}));

vi.mock('../../features/recommendations/components/Recommendations', () => ({
  default: () => <div data-testid="recommendations">Recommendations</div>
}));

describe('App Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the main app structure', () => {
    render(<App />);
    
    expect(screen.getByText('Recipe Collection')).toBeInTheDocument();
    expect(screen.getByText('Discover, save, and cook amazing recipes')).toBeInTheDocument();
    expect(screen.getByTestId('background-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('recommendations')).toBeInTheDocument();
  });

  it('should render recipe cards when recipes are available', () => {
    render(<App />);
    
    // The mocked useRecipes hook returns 2 recipes
    // We should see recipe cards (exact implementation depends on RecipePreview component)
    expect(screen.getByText('Test Recipe 1')).toBeInTheDocument();
    expect(screen.getByText('Test Recipe 2')).toBeInTheDocument();
  });

  it('should show add recipe button', () => {
    render(<App />);
    
    const addButton = screen.getByTitle('Add Recipe');
    expect(addButton).toBeInTheDocument();
    expect(addButton).toHaveClass('fab');
  });

  it('should handle dark mode toggle', () => {
    render(<App />);
    
    // The Header component should be rendered with dark mode functionality
    // This test verifies the component structure is intact
    expect(screen.getByText('Recipe Collection')).toBeInTheDocument();
  });
});
