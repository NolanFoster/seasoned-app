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

describe('App Component - Function Coverage', () => {
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

  describe('Manual Recipe Creation', () => {
    it('should handle manual recipe addition', async () => {
      const user = userEvent.setup();
      render(<App />);

      // Click the FAB button to open the add recipe form
      const fabButton = screen.getByRole('button', { name: /\+/i });
      fireEvent.click(fabButton);

      // Wait for the form to appear
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /new recipe/i })).toBeInTheDocument();
      });

      // Click on New Recipe tab
      fireEvent.click(screen.getByRole('button', { name: /new recipe/i }));

      // Fill in the recipe form
      const nameInput = screen.getByLabelText(/recipe name/i);
      await user.type(nameInput, 'Test Recipe');

      const descriptionInput = screen.getByLabelText(/description/i);
      await user.type(descriptionInput, 'A test recipe description');

      // Add ingredients
      const ingredientInput = screen.getByPlaceholderText(/add ingredient/i);
      await user.type(ingredientInput, 'Test ingredient');
      fireEvent.keyDown(ingredientInput, { key: 'Enter' });

      // Add instructions
      const instructionInput = screen.getByPlaceholderText(/add instruction/i);
      await user.type(instructionInput, 'Test instruction');
      fireEvent.keyDown(instructionInput, { key: 'Enter' });

      // Submit the form
      const saveButton = screen.getByRole('button', { name: /add recipe/i });
      fireEvent.click(saveButton);

      // Verify alert was called
      await waitFor(() => {
        expect(global.alert).toHaveBeenCalledWith(expect.stringContaining('Recipe added successfully'));
      });
    });

    it('should handle recipe editing', async () => {
      // Mock recipes with one to edit
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          recipes: [{
            id: '1',
            name: 'Original Recipe',
            description: 'Original description',
            ingredients: ['Ingredient 1'],
            instructions: ['Step 1'],
            source_url: 'manual://12345'
          }]
        })
      });

      const user = userEvent.setup();
      render(<App />);

      // Wait for recipe to load
      await waitFor(() => {
        expect(screen.getByText('Original Recipe')).toBeInTheDocument();
      });

      // Click on the recipe
      fireEvent.click(screen.getByText('Original Recipe'));

      // Click edit button
      await waitFor(() => {
        const editButton = screen.getByRole('button', { name: /edit/i });
        fireEvent.click(editButton);
      });

      // Modify the recipe name
      const nameInput = screen.getByDisplayValue('Original Recipe');
      await user.clear(nameInput);
      await user.type(nameInput, 'Updated Recipe');

      // Save the changes
      const saveButton = screen.getByRole('button', { name: /save changes/i });
      fireEvent.click(saveButton);

      // Verify alert was called
      await waitFor(() => {
        expect(global.alert).toHaveBeenCalledWith(expect.stringContaining('Recipe updated successfully'));
      });
    });

    it('should handle recipe deletion', async () => {
      // Mock recipes with one to delete
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          recipes: [{
            id: '1',
            name: 'Recipe to Delete',
            description: 'Will be deleted',
            source_url: 'manual://12345'
          }]
        })
      });

      // Mock confirm to return true
      global.confirm.mockReturnValue(true);

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

      // Verify confirm was called
      expect(global.confirm).toHaveBeenCalledWith('Are you sure you want to delete this recipe?');
    });
  });

  describe('Form Reset Function', () => {
    it('should reset form when cancel is clicked', async () => {
      const user = userEvent.setup();
      render(<App />);

      // Click the FAB button to open the add recipe form
      const fabButton = screen.getByRole('button', { name: /\+/i });
      fireEvent.click(fabButton);

      // Wait for the form to appear and click New Recipe
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /new recipe/i })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: /new recipe/i }));

      // Fill in some form data
      const nameInput = screen.getByLabelText(/recipe name/i);
      await user.type(nameInput, 'Test Recipe');

      // Click cancel
      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      fireEvent.click(cancelButton);

      // Verify form is closed
      await waitFor(() => {
        expect(screen.queryByLabelText(/recipe name/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Ingredient and Instruction Management', () => {
    it('should handle ingredient removal', async () => {
      const user = userEvent.setup();
      render(<App />);

      // Open the form
      const fabButton = screen.getByRole('button', { name: /\+/i });
      fireEvent.click(fabButton);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /new recipe/i })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: /new recipe/i }));

      // Add an ingredient
      const ingredientInput = screen.getByPlaceholderText(/add ingredient/i);
      await user.type(ingredientInput, 'Test ingredient');
      fireEvent.keyDown(ingredientInput, { key: 'Enter' });

      // Remove the ingredient
      await waitFor(() => {
        const removeButton = screen.getByRole('button', { name: /×/i });
        fireEvent.click(removeButton);
      });

      // Verify ingredient is removed
      expect(screen.queryByText('Test ingredient')).not.toBeInTheDocument();
    });

    it('should handle instruction removal', async () => {
      const user = userEvent.setup();
      render(<App />);

      // Open the form
      const fabButton = screen.getByRole('button', { name: /\+/i });
      fireEvent.click(fabButton);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /new recipe/i })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: /new recipe/i }));

      // Add an instruction
      const instructionInput = screen.getByPlaceholderText(/add instruction/i);
      await user.type(instructionInput, 'Test instruction');
      fireEvent.keyDown(instructionInput, { key: 'Enter' });

      // Remove the instruction
      await waitFor(() => {
        const removeButtons = screen.getAllByRole('button', { name: /×/i });
        // Find the one for instructions (should be the second one if ingredients are also present)
        const instructionRemoveButton = removeButtons[removeButtons.length - 1];
        fireEvent.click(instructionRemoveButton);
      });

      // Verify instruction is removed
      expect(screen.queryByText('Test instruction')).not.toBeInTheDocument();
    });
  });

  describe('Share Recipe Function', () => {
    it('should handle share recipe functionality', async () => {
      // Mock clipboard API
      Object.assign(navigator, {
        clipboard: {
          writeText: jest.fn().mockResolvedValue()
        }
      });

      // Mock recipe
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          recipes: [{
            id: '1',
            name: 'Recipe to Share',
            description: 'A shareable recipe',
            source_url: 'http://example.com/recipe'
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
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
      expect(global.alert).toHaveBeenCalledWith(expect.stringContaining('Recipe link copied'));
    });
  });

  describe('Edit Mode Functions', () => {
    it('should handle editing mode toggle for recipes', async () => {
      // Mock recipes
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          recipes: [{
            id: '1',
            name: 'Recipe 1',
            source_url: 'http://example.com/1'
          }]
        })
      });

      render(<App />);

      // Wait for recipe to load
      await waitFor(() => {
        expect(screen.getByText('Recipe 1')).toBeInTheDocument();
      });

      // Click on the recipe
      fireEvent.click(screen.getByText('Recipe 1'));

      // Click edit button to enter edit mode
      await waitFor(() => {
        const editButton = screen.getByRole('button', { name: /edit/i });
        fireEvent.click(editButton);
      });

      // Should show save and cancel buttons
      expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });
  });
});