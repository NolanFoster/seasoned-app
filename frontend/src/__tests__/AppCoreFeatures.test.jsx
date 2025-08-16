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

describe('App Core Features', () => {
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

  describe('Recipe Form Features', () => {
    it('should open and close the recipe form', async () => {
      render(<App />);

      // Click FAB button
      const fabButton = screen.getByRole('button', { name: /\+/i });
      fireEvent.click(fabButton);

      // Form should be visible
      await waitFor(() => {
        expect(screen.getByText('Add New Recipe')).toBeInTheDocument();
      });

      // Close form using close button
      const closeButton = screen.getByRole('button', { name: /×/i });
      fireEvent.click(closeButton);

      // Form should be hidden
      await waitFor(() => {
        expect(screen.queryByText('Add New Recipe')).not.toBeInTheDocument();
      });
    });

    it('should add a new ingredient', async () => {
      const user = userEvent.setup();
      render(<App />);

      // Open form
      const fabButton = screen.getByRole('button', { name: /\+/i });
      fireEvent.click(fabButton);

      await waitFor(() => {
        expect(screen.getByText('Add New Recipe')).toBeInTheDocument();
      });

      // Add ingredient using the button
      const addIngredientButton = screen.getByText('+ Add Ingredient');
      fireEvent.click(addIngredientButton);

      // Should have two ingredient inputs now
      const ingredientInputs = screen.getAllByPlaceholderText(/ingredient/i);
      expect(ingredientInputs).toHaveLength(2);
    });

    it('should add a new instruction', async () => {
      render(<App />);

      // Open form
      const fabButton = screen.getByRole('button', { name: /\+/i });
      fireEvent.click(fabButton);

      await waitFor(() => {
        expect(screen.getByText('Add New Recipe')).toBeInTheDocument();
      });

      // Add instruction using the button
      const addInstructionButton = screen.getByText('+ Add Instruction');
      fireEvent.click(addInstructionButton);

      // Should have two instruction textareas now
      const instructionTextareas = screen.getAllByPlaceholderText(/step/i);
      expect(instructionTextareas).toHaveLength(2);
    });

    it('should handle empty recipe submission', async () => {
      render(<App />);

      // Open form
      const fabButton = screen.getByRole('button', { name: /\+/i });
      fireEvent.click(fabButton);

      await waitFor(() => {
        expect(screen.getByText('Add New Recipe')).toBeInTheDocument();
      });

      // Try to submit without filling anything
      const submitButton = screen.getByText('+ Add Recipe');
      fireEvent.click(submitButton);

      // Form should still be visible (not submitted)
      expect(screen.getByText('Add New Recipe')).toBeInTheDocument();
    });
  });

  describe('Recipe List Features', () => {
    it('should display recipe with formatted duration', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          recipes: [{
            id: '1',
            name: 'Quick Pasta',
            prepTime: 'PT10M',
            cookTime: 'PT20M',
            totalTime: 'PT30M',
            source_url: 'http://example.com/pasta'
          }]
        })
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Quick Pasta')).toBeInTheDocument();
        expect(screen.getByText(/10 m.*prep/i)).toBeInTheDocument();
        expect(screen.getByText(/20 m.*cook/i)).toBeInTheDocument();
      });
    });

    it('should display recipe without timing info', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          recipes: [{
            id: '1',
            name: 'Simple Recipe',
            description: 'A simple recipe',
            source_url: 'http://example.com/simple'
          }]
        })
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Simple Recipe')).toBeInTheDocument();
        expect(screen.getByText('No timing information')).toBeInTheDocument();
      });
    });
  });

  describe('Search Features', () => {
    it('should trigger search on Enter key', async () => {
      const user = userEvent.setup();
      
      // Mock search response
      mockFetch.mockImplementation((url) => {
        if (url.includes('search')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              recipes: [{
                name: 'Chocolate Cake',
                source_url: 'http://example.com/cake'
              }]
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
      await user.type(searchInput, 'chocolate');
      
      // Press Enter
      fireEvent.keyDown(searchInput, { key: 'Enter' });

      // Search should be triggered
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('search'),
          expect.any(Object)
        );
      });
    });

    it('should handle Escape key in search', async () => {
      const user = userEvent.setup();
      render(<App />);

      const searchInput = screen.getByPlaceholderText('Search recipes or paste a URL to clip...');
      await user.type(searchInput, 'test');

      // Press Escape
      fireEvent.keyDown(searchInput, { key: 'Escape' });

      // Input should be cleared
      expect(searchInput).toHaveValue('');
    });
  });

  describe('Clipper Features', () => {
    it('should trigger clip on Enter with URL', async () => {
      const user = userEvent.setup();
      
      // Mock clipper response
      mockFetch.mockImplementation((url) => {
        if (url.includes('clipper')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              recipe: {
                name: 'Clipped Recipe',
                source_url: 'http://example.com/recipe'
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
      await user.type(searchInput, 'https://example.com/recipe');
      
      // Press Enter
      fireEvent.keyDown(searchInput, { key: 'Enter' });

      // Clip should be triggered
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('clipper'),
          expect.objectContaining({
            method: 'POST'
          })
        );
      });
    });
  });

  describe('Recipe Details View', () => {
    it('should display recipe yield information', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          recipes: [{
            id: '1',
            name: 'Cookies',
            recipeYield: '24 cookies',
            ingredients: ['Flour', 'Sugar'],
            instructions: ['Mix', 'Bake'],
            source_url: 'http://example.com/cookies'
          }]
        })
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Cookies')).toBeInTheDocument();
      });

      // Click on recipe
      fireEvent.click(screen.getByText('Cookies'));

      // Should show yield in details
      await waitFor(() => {
        expect(screen.getByText(/24 cookies/)).toBeInTheDocument();
      });
    });

    it('should display ingredient and instruction counts', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          recipes: [{
            id: '1',
            name: 'Test Recipe',
            ingredients: ['A', 'B', 'C'],
            instructions: ['Step 1', 'Step 2'],
            source_url: 'http://example.com/test'
          }]
        })
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Test Recipe')).toBeInTheDocument();
        expect(screen.getByText('3 ingredients')).toBeInTheDocument();
        expect(screen.getByText('2 steps')).toBeInTheDocument();
      });
    });
  });
});