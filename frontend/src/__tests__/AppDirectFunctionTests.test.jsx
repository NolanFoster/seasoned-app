import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import '@testing-library/jest-dom';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock environment variables
process.env.VITE_API_URL = 'https://test-api.example.com';
process.env.VITE_CLIPPER_API_URL = 'https://test-clipper-api.example.com';
process.env.VITE_SEARCH_DB_URL = 'https://test-search-db.example.com';

// Mock alerts and confirms
global.alert = jest.fn();
global.confirm = jest.fn();

describe('App Component - Direct Function Tests', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    global.alert.mockClear();
    global.confirm.mockClear();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ recipes: [] })
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('formatDuration function via recipe display', () => {
    it('should format duration with hours and minutes', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          recipes: [{
            id: '1',
            name: 'Test Recipe',
            prepTime: 'PT1H30M',
            cookTime: 'PT45M',
            source_url: 'http://example.com/recipe1'
          }]
        })
      });

      render(<App />);
      
      // Wait for recipes to load and check formatted time appears
      await waitFor(() => {
        expect(screen.getByText('Test Recipe')).toBeInTheDocument();
        // Check for formatted times
        expect(screen.getByText(/1 h 30 m/)).toBeInTheDocument();
        expect(screen.getByText(/45 m/)).toBeInTheDocument();
      });
    });

    it('should handle duration with only minutes', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          recipes: [{
            id: '1',
            name: 'Quick Recipe',
            prepTime: 'PT15M',
            cookTime: 'PT0M',
            source_url: 'http://example.com/recipe1'
          }]
        })
      });

      render(<App />);
      
      await waitFor(() => {
        expect(screen.getByText('Quick Recipe')).toBeInTheDocument();
        expect(screen.getByText(/15 m/)).toBeInTheDocument();
      });
    });

    it('should handle non-ISO duration format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          recipes: [{
            id: '1',
            name: 'Custom Recipe',
            prepTime: '20 minutes',
            cookTime: '1 hour',
            source_url: 'http://example.com/recipe1'
          }]
        })
      });

      render(<App />);
      
      await waitFor(() => {
        expect(screen.getByText('Custom Recipe')).toBeInTheDocument();
        // Non-ISO formats should be displayed as-is
        expect(screen.getByText(/20 minutes/)).toBeInTheDocument();
        expect(screen.getByText(/1 hour/)).toBeInTheDocument();
      });
    });

    it('should handle empty duration', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          recipes: [{
            id: '1',
            name: 'No Time Recipe',
            prepTime: '',
            cookTime: null,
            source_url: 'http://example.com/recipe1'
          }]
        })
      });

      render(<App />);
      
      await waitFor(() => {
        expect(screen.getByText('No Time Recipe')).toBeInTheDocument();
      });
    });

    it('should handle numeric duration', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          recipes: [{
            id: '1',
            name: 'Numeric Recipe',
            prepTime: 30,
            cookTime: 60,
            source_url: 'http://example.com/recipe1'
          }]
        })
      });

      render(<App />);
      
      await waitFor(() => {
        expect(screen.getByText('Numeric Recipe')).toBeInTheDocument();
      });
    });
  });

  describe('isValidUrl function via search input', () => {
    it('should show clip button for https URLs', async () => {
      const user = userEvent.setup();
      render(<App />);

      const searchInput = screen.getByPlaceholderText('Search recipes or paste a URL to clip...');
      await user.clear(searchInput);
      await user.type(searchInput, 'https://example.com/recipe');

      await waitFor(() => {
        const clipButton = screen.getByRole('button', { name: /clip/i });
        expect(clipButton).toBeInTheDocument();
      });
    });

    it('should show clip button for http URLs', async () => {
      const user = userEvent.setup();
      render(<App />);

      const searchInput = screen.getByPlaceholderText('Search recipes or paste a URL to clip...');
      await user.clear(searchInput);
      await user.type(searchInput, 'http://example.com/recipe');

      await waitFor(() => {
        const clipButton = screen.getByRole('button', { name: /clip/i });
        expect(clipButton).toBeInTheDocument();
      });
    });

    it('should show clip button for domain with subdomain', async () => {
      const user = userEvent.setup();
      render(<App />);

      const searchInput = screen.getByPlaceholderText('Search recipes or paste a URL to clip...');
      await user.clear(searchInput);
      await user.type(searchInput, 'recipes.example.com');

      await waitFor(() => {
        const clipButton = screen.getByRole('button', { name: /clip/i });
        expect(clipButton).toBeInTheDocument();
      });
    });

    it('should show search button for non-URLs', async () => {
      const user = userEvent.setup();
      render(<App />);

      const searchInput = screen.getByPlaceholderText('Search recipes or paste a URL to clip...');
      await user.clear(searchInput);
      await user.type(searchInput, 'chocolate cake recipe');

      await waitFor(() => {
        const searchButton = screen.getByRole('button', { name: /search/i });
        expect(searchButton).toBeInTheDocument();
      });
    });

    it('should show search button for single words', async () => {
      const user = userEvent.setup();
      render(<App />);

      const searchInput = screen.getByPlaceholderText('Search recipes or paste a URL to clip...');
      await user.clear(searchInput);
      await user.type(searchInput, 'pasta');

      await waitFor(() => {
        const searchButton = screen.getByRole('button', { name: /search/i });
        expect(searchButton).toBeInTheDocument();
      });
    });

    it('should handle malformed URLs', async () => {
      const user = userEvent.setup();
      render(<App />);

      const searchInput = screen.getByPlaceholderText('Search recipes or paste a URL to clip...');
      await user.clear(searchInput);
      await user.type(searchInput, 'ht://broken.url');

      await waitFor(() => {
        const searchButton = screen.getByRole('button', { name: /search/i });
        expect(searchButton).toBeInTheDocument();
      });
    });
  });

  describe('Window and element event handlers', () => {
    it('should handle window resize event', async () => {
      render(<App />);

      // Trigger resize event
      global.innerWidth = 1200;
      global.innerHeight = 800;
      global.dispatchEvent(new Event('resize'));

      // Component should still be rendered
      expect(screen.getByText('Seasoned')).toBeInTheDocument();
    });

    it('should handle clipper health check errors', async () => {
      // Mock the clipper health check to fail
      let callCount = 0;
      mockFetch.mockImplementation((url) => {
        callCount++;
        if (url.includes('health')) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ recipes: [] })
        });
      });

      render(<App />);

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText('Seasoned')).toBeInTheDocument();
      });

      // Health check should have been called
      expect(callCount).toBeGreaterThan(0);
    });
  });

  describe('Recipe time formatting in fullscreen view', () => {
    it('should display formatted times in recipe details', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          recipes: [{
            id: '1',
            name: 'Detailed Recipe',
            description: 'A recipe with timing',
            prepTime: 'PT2H',
            cookTime: 'PT1H15M',
            totalTime: 'PT3H15M',
            ingredients: ['Ingredient 1'],
            instructions: ['Step 1'],
            source_url: 'http://example.com/recipe1'
          }]
        })
      });

      render(<App />);
      
      await waitFor(() => {
        expect(screen.getByText('Detailed Recipe')).toBeInTheDocument();
      });

      // Click on the recipe to view details
      const recipeCard = screen.getByText('Detailed Recipe');
      recipeCard.click();

      // Check that times are formatted in the fullscreen view
      await waitFor(() => {
        expect(screen.getByText(/Prep: 2 h/)).toBeInTheDocument();
        expect(screen.getByText(/Cook: 1 h 15 m/)).toBeInTheDocument();
        expect(screen.getByText(/Total: 3 h 15 m/)).toBeInTheDocument();
      });
    });
  });
});