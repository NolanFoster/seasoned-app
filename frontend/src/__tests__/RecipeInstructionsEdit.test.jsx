import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from '../App';

// Mock fetch
global.fetch = jest.fn();

describe('Recipe Instructions Editing', () => {
  beforeEach(() => {
    fetch.mockClear();
    fetch.mockImplementation((url) => {
      if (url.includes('/health')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'healthy' })
        });
      }
      if (url.includes('/recipes')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([{
            id: 1,
            name: 'Test Recipe',
            description: 'Test Description',
            recipeIngredient: ['Ingredient 1', 'Ingredient 2'],
            recipeInstructions: [
              { "@type": "HowToStep", text: "Step 1: Do something" },
              { "@type": "HowToStep", text: "Step 2: Do something else" }
            ],
            image: 'https://example.com/image.jpg'
          }])
        });
      }
      return Promise.resolve({ ok: true });
    });
  });

  test('instructions display as text (not objects) when editing a recipe', async () => {
    render(<App />);
    
    // Wait for recipes to load
    await waitFor(() => {
      expect(screen.getByText('Test Recipe')).toBeInTheDocument();
    });

    // Click on the recipe
    fireEvent.click(screen.getByText('Test Recipe'));

    // Wait for recipe details to show
    await waitFor(() => {
      expect(screen.getByTitle('Edit Recipe')).toBeInTheDocument();
    });

    // Click edit button
    fireEvent.click(screen.getByTitle('Edit Recipe'));

    // Wait for edit form to appear
    await waitFor(() => {
      expect(screen.getByText('Instructions')).toBeInTheDocument();
    });

    // Check that instructions are displayed as text, not as [object Object]
    const instructionTextareas = screen.getAllByPlaceholderText(/Step \d+/);
    expect(instructionTextareas).toHaveLength(2);
    expect(instructionTextareas[0]).toHaveValue('Step 1: Do something');
    expect(instructionTextareas[1]).toHaveValue('Step 2: Do something else');
    
    // Verify no [object Object] text appears
    expect(screen.queryByText('[object Object]')).not.toBeInTheDocument();
  });

  test('edited instructions are saved in correct format', async () => {
    render(<App />);
    
    // Wait for recipes to load
    await waitFor(() => {
      expect(screen.getByText('Test Recipe')).toBeInTheDocument();
    });

    // Click on the recipe
    fireEvent.click(screen.getByText('Test Recipe'));

    // Click edit button
    await waitFor(() => {
      expect(screen.getByTitle('Edit Recipe')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTitle('Edit Recipe'));

    // Wait for edit form
    await waitFor(() => {
      expect(screen.getByText('Instructions')).toBeInTheDocument();
    });

    // Find and modify an instruction
    const instructionTextareas = screen.getAllByPlaceholderText(/Step \d+/);
    fireEvent.change(instructionTextareas[0], { target: { value: 'Updated Step 1' } });

    // Mock successful update response
    fetch.mockImplementationOnce(() => Promise.resolve({ ok: true }));

    // Save the recipe
    const saveButton = screen.getByText('✓ Update Recipe');
    fireEvent.click(saveButton);

    // Verify the PUT request was made with correct format
    await waitFor(() => {
      const putCall = fetch.mock.calls.find(call => call[1]?.method === 'PUT');
      expect(putCall).toBeDefined();
      
      const requestBody = JSON.parse(putCall[1].body);
      expect(requestBody.recipeInstructions).toEqual([
        { "@type": "HowToStep", text: "Updated Step 1" },
        { "@type": "HowToStep", text: "Step 2: Do something else" }
      ]);
    });
  });
});