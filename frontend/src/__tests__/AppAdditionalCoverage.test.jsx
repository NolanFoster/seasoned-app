import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

// Mock clipboard
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: jest.fn().mockResolvedValue()
  },
  writable: true
});

// Mock window.open
global.open = jest.fn();

// Mock requestAnimationFrame
global.requestAnimationFrame = jest.fn(cb => setTimeout(cb, 0));

describe('App Additional Coverage', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    global.alert.mockClear();
    global.confirm.mockClear();
    navigator.clipboard.writeText.mockClear();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ recipes: [] })
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Clipping Features', () => {
    it('should handle successful recipe clipping', async () => {
      const user = userEvent.setup();
      
      // Mock successful clip response
      mockFetch.mockImplementation((url) => {
        if (url.includes('clip')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              recipe: {
                name: 'Clipped Recipe',
                description: 'A clipped recipe',
                ingredients: ['Ingredient 1'],
                instructions: ['Step 1'],
                source_url: 'https://example.com/recipe'
              }
            })
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ recipes: [] })
        });
      });

      render(<App />);

      const searchInput = screen.getByPlaceholderText('Search recipes or paste a URL to clip...');
      
      // Type a URL
      await user.type(searchInput, 'https://example.com/recipe');

      // Click clip button
      await waitFor(() => {
        const clipButton = screen.getByRole('button', { name: /clip/i });
        fireEvent.click(clipButton);
      });

      // Wait for alert
      await waitFor(() => {
        expect(global.alert).toHaveBeenCalledWith(expect.stringContaining('Recipe clipped successfully'));
      });
    });

    it('should handle failed recipe clipping', async () => {
      const user = userEvent.setup();
      
      // Mock failed clip response
      mockFetch.mockImplementation((url) => {
        if (url.includes('clip')) {
          return Promise.resolve({
            ok: false,
            status: 500
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ recipes: [] })
        });
      });

      render(<App />);

      const searchInput = screen.getByPlaceholderText('Search recipes or paste a URL to clip...');
      
      // Type a URL
      await user.type(searchInput, 'https://example.com/recipe');

      // Click clip button
      await waitFor(() => {
        const clipButton = screen.getByRole('button', { name: /clip/i });
        fireEvent.click(clipButton);
      });

      // Wait for error alert
      await waitFor(() => {
        expect(global.alert).toHaveBeenCalledWith(expect.stringContaining('Failed to clip recipe'));
      });
    });

    it('should handle clipper unavailable', async () => {
      const user = userEvent.setup();
      
      // Mock clipper health check failure
      mockFetch.mockImplementation((url) => {
        if (url.includes('health')) {
          return Promise.resolve({
            ok: false,
            status: 503
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ recipes: [] })
        });
      });

      render(<App />);

      // Wait for health check to complete
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('health'),
          expect.any(Object)
        );
      });

      const searchInput = screen.getByPlaceholderText('Search recipes or paste a URL to clip...');
      
      // Type a URL - should show search button instead of clip when clipper is unavailable
      await user.type(searchInput, 'https://example.com/recipe');

      // Should show search button, not clip button
      await waitFor(() => {
        const searchButton = screen.getByRole('button', { name: /search/i });
        expect(searchButton).toBeInTheDocument();
      });
    });
  });

  describe('Recipe Operations', () => {
    it('should handle recipe deletion', async () => {
      // Mock recipes
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          recipes: [{
            id: '1',
            name: 'Recipe to Delete',
            description: 'Will be deleted',
            source_url: 'https://example.com/recipe1'
          }]
        })
      });

      // Mock confirm dialog
      global.confirm.mockReturnValue(true);

      // Mock delete response
      mockFetch.mockImplementation((url) => {
        if (url.includes('delete')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ success: true })
          });
        }
        // Return empty recipes after deletion
        return Promise.resolve({
          ok: true,
          json: async () => ({ recipes: [] })
        });
      });

      render(<App />);

      // Wait for recipe to load
      await waitFor(() => {
        expect(screen.getByText('Recipe to Delete')).toBeInTheDocument();
      });

      // Click on the recipe
      fireEvent.click(screen.getByText('Recipe to Delete'));

      // Click delete button
      await waitFor(() => {
        const deleteButton = screen.getByRole('button', { name: /delete/i });
        fireEvent.click(deleteButton);
      });

      // Verify deletion was attempted
      expect(global.confirm).toHaveBeenCalled();
      
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('delete'),
          expect.objectContaining({
            method: 'DELETE'
          })
        );
      });
    });

    it('should handle recipe deletion cancellation', async () => {
      // Mock recipes
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          recipes: [{
            id: '1',
            name: 'Recipe to Keep',
            description: 'Will not be deleted',
            source_url: 'https://example.com/recipe1'
          }]
        })
      });

      // Mock confirm dialog to cancel
      global.confirm.mockReturnValue(false);

      render(<App />);

      // Wait for recipe to load
      await waitFor(() => {
        expect(screen.getByText('Recipe to Keep')).toBeInTheDocument();
      });

      // Click on the recipe
      fireEvent.click(screen.getByText('Recipe to Keep'));

      // Click delete button
      await waitFor(() => {
        const deleteButton = screen.getByRole('button', { name: /delete/i });
        fireEvent.click(deleteButton);
      });

      // Verify deletion was cancelled
      expect(global.confirm).toHaveBeenCalled();
      
      // Recipe should still be visible
      expect(screen.getByText('Recipe to Keep')).toBeInTheDocument();
    });

    it('should handle recipe sharing', async () => {
      // Mock recipes
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          recipes: [{
            id: '1',
            name: 'Recipe to Share',
            description: 'Share this recipe',
            source_url: 'https://example.com/recipe1'
          }]
        })
      });

      render(<App />);

      // Wait for recipe to load
      await waitFor(() => {
        expect(screen.getByText('Recipe to Share')).toBeInTheDocument();
      });

      // Click on the recipe
      fireEvent.click(screen.getByText('Recipe to Share'));

      // Click share button
      await waitFor(() => {
        const shareButton = screen.getByRole('button', { name: /share/i });
        fireEvent.click(shareButton);
      });

      // Verify clipboard was used
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://example.com/recipe1');
      expect(global.alert).toHaveBeenCalledWith('Recipe link copied to clipboard!');
    });
  });

  describe('Form Input Handlers', () => {
    it('should handle recipe image upload', async () => {
      const user = userEvent.setup();
      render(<App />);

      // Open form
      const fabButton = screen.getByRole('button', { name: /\+/i });
      fireEvent.click(fabButton);

      await waitFor(() => {
        expect(screen.getByText('Add New Recipe')).toBeInTheDocument();
      });

      // Create a mock file
      const file = new File(['image content'], 'recipe.jpg', { type: 'image/jpeg' });
      const fileInput = screen.getByLabelText(/choose image/i);

      // Upload file
      await user.upload(fileInput, file);

      // File should be selected
      expect(fileInput.files[0]).toBe(file);
      expect(fileInput.files).toHaveLength(1);
    });

    it('should handle ingredient input with Enter key', async () => {
      const user = userEvent.setup();
      render(<App />);

      // Open form
      const fabButton = screen.getByRole('button', { name: /\+/i });
      fireEvent.click(fabButton);

      await waitFor(() => {
        expect(screen.getByText('Add New Recipe')).toBeInTheDocument();
      });

      // Type in first ingredient input and press Enter
      const ingredientInput = screen.getByPlaceholderText(/add first ingredient/i);
      await user.type(ingredientInput, 'Flour');
      fireEvent.keyDown(ingredientInput, { key: 'Enter' });

      // Should have added a new ingredient input
      await waitFor(() => {
        const ingredientInputs = screen.getAllByPlaceholderText(/ingredient/i);
        expect(ingredientInputs).toHaveLength(2);
      });
    });

    it('should handle instruction textarea with Enter key', async () => {
      const user = userEvent.setup();
      render(<App />);

      // Open form
      const fabButton = screen.getByRole('button', { name: /\+/i });
      fireEvent.click(fabButton);

      await waitFor(() => {
        expect(screen.getByText('Add New Recipe')).toBeInTheDocument();
      });

      // Type in first instruction textarea and press Enter
      const instructionTextarea = screen.getByPlaceholderText(/step 1/i);
      await user.type(instructionTextarea, 'Mix ingredients');
      fireEvent.keyDown(instructionTextarea, { key: 'Enter' });

      // Should have added a new instruction textarea
      await waitFor(() => {
        const instructionTextareas = screen.getAllByPlaceholderText(/step/i);
        expect(instructionTextareas).toHaveLength(2);
      });
    });
  });

  describe('Recipe Fullscreen Scroll', () => {
    it('should handle scroll opacity changes', async () => {
      // Mock a recipe
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          recipes: [{
            id: '1',
            name: 'Test Recipe',
            description: 'Test description',
            ingredients: ['Ingredient 1', 'Ingredient 2'],
            instructions: ['Step 1', 'Step 2'],
            source_url: 'https://example.com/recipe1'
          }]
        })
      });

      render(<App />);

      // Wait for recipe and click it
      await waitFor(() => {
        expect(screen.getByText('Test Recipe')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Test Recipe'));

      // Wait for fullscreen view
      await waitFor(() => {
        const fullscreenView = screen.getByTestId('recipe-fullscreen');
        expect(fullscreenView).toBeInTheDocument();
      });

      // Simulate scroll
      const fullscreenContainer = screen.getByTestId('recipe-fullscreen');
      
      // Mock scrollTop property and trigger scroll
      Object.defineProperty(fullscreenContainer, 'scrollTop', {
        writable: true,
        value: 100
      });

      fireEvent.scroll(fullscreenContainer);

      // Trigger animation frame callback
      const animationFrameCallback = global.requestAnimationFrame.mock.calls[0][0];
      animationFrameCallback();

      // Component should still be rendered
      expect(fullscreenContainer).toBeInTheDocument();
    });
  });
});