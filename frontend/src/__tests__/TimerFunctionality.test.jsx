import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from '../App';

describe('Timer Functionality', () => {
  beforeEach(() => {
    // Mock fetch to return recipes with timer instructions
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('renderInstructionWithTimers', () => {
    it('should render timer buttons for time mentions in instructions', async () => {
      const recipeWithTimers = {
        id: 'timer-test-1',
        title: 'Test Recipe with Timers',
        description: 'Recipe to test timer functionality',
        ingredients: [],
        instructions: [
          'Preheat oven to 350°F',
          'Bake for 25 minutes until golden brown',
          'Let cool for 5-10 minutes before serving',
          'Refrigerate for 2 hours or overnight'
        ],
        prepTime: 15,
        cookTime: 30,
        servings: 4
      };

      global.fetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ recipes: [recipeWithTimers] }),
        status: 200,
        ok: true
      });

      const { container } = render(<App />);

      // Wait for recipes to load
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      // Click on the recipe to view details
      const recipeCard = await screen.findByText('Test Recipe with Timers');
      fireEvent.click(recipeCard);

      // Check if timer buttons are rendered
      await waitFor(() => {
        const timerButtons = container.querySelectorAll('.timer-button-inline');
        expect(timerButtons).toHaveLength(3); // For "25 minutes", "5-10 minutes", and "2 hours"
      });
    });

    it('should handle various time formats', async () => {
      const recipeWithVariousTimeFormats = {
        id: 'timer-test-2',
        title: 'Various Time Formats',
        description: 'Testing different time formats',
        ingredients: [],
        instructions: [
          'Cook for 30 seconds on high heat',
          'Simmer for 1 hour',
          'Rest for 15 mins',
          'Marinate for 2-3 hrs',
          'Freeze for 20 to 30 minutes',
          'Wait 5 min before serving'
        ]
      };

      global.fetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ recipes: [recipeWithVariousTimeFormats] }),
        status: 200,
        ok: true
      });

      const { container } = render(<App />);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      const recipeCard = await screen.findByText('Various Time Formats');
      fireEvent.click(recipeCard);

      await waitFor(() => {
        const timerButtons = container.querySelectorAll('.timer-button-inline');
        expect(timerButtons).toHaveLength(6); // One for each time mention
      });
    });

    it('should not render timer buttons for instructions without time mentions', async () => {
      const recipeWithoutTimers = {
        id: 'timer-test-3',
        title: 'No Timers Recipe',
        description: 'Recipe without time mentions',
        ingredients: [],
        instructions: [
          'Mix all ingredients together',
          'Season to taste',
          'Serve immediately'
        ]
      };

      global.fetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ recipes: [recipeWithoutTimers] }),
        status: 200,
        ok: true
      });

      const { container } = render(<App />);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      const recipeCard = await screen.findByText('No Timers Recipe');
      fireEvent.click(recipeCard);

      await waitFor(() => {
        const instructions = container.querySelector('.instructions-section');
        expect(instructions).toBeInTheDocument();
        const timerButtons = container.querySelectorAll('.timer-button-inline');
        expect(timerButtons).toHaveLength(0);
      });
    });

    it('should handle timer button clicks', async () => {
      const recipeWithTimer = {
        id: 'timer-test-4',
        title: 'Timer Click Test',
        description: 'Testing timer button functionality',
        ingredients: [],
        instructions: [
          'Boil water for 10 minutes'
        ]
      };

      global.fetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ recipes: [recipeWithTimer] }),
        status: 200,
        ok: true
      });

      const { container } = render(<App />);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      const recipeCard = await screen.findByText('Timer Click Test');
      fireEvent.click(recipeCard);

      await waitFor(() => {
        const timerButton = container.querySelector('.timer-button-inline');
        expect(timerButton).toBeInTheDocument();
        expect(timerButton).toHaveAttribute('title', 'Set timer for 10 minutes');
        
        // Click the timer button
        fireEvent.click(timerButton);
        // Currently the click handler just prevents default
        // But we're testing that it doesn't throw an error
      });
    });

    it('should display timer text correctly', async () => {
      const recipeWithComplexTimer = {
        id: 'timer-test-5',
        title: 'Complex Timer Display',
        description: 'Testing timer text display',
        ingredients: [],
        instructions: [
          'Proof dough for 45-60 minutes until doubled in size'
        ]
      };

      global.fetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ recipes: [recipeWithComplexTimer] }),
        status: 200,
        ok: true
      });

      const { container } = render(<App />);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      const recipeCard = await screen.findByText('Complex Timer Display');
      fireEvent.click(recipeCard);

      await waitFor(() => {
        const timerText = container.querySelector('.timer-text');
        expect(timerText).toHaveTextContent('Set timer for 45-60 minutes');
      });
    });

    it('should handle singular and plural time units', async () => {
      const recipeWithSingularPlural = {
        id: 'timer-test-6',
        title: 'Singular Plural Test',
        description: 'Testing singular and plural time units',
        ingredients: [],
        instructions: [
          'Wait 1 minute',
          'Cook for 1 hour',
          'Chill for 1 second',
          'Rest for 2 minutes',
          'Bake for 2 hours',
          'Flash freeze for 30 seconds'
        ]
      };

      global.fetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ recipes: [recipeWithSingularPlural] }),
        status: 200,
        ok: true
      });

      const { container } = render(<App />);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      const recipeCard = await screen.findByText('Singular Plural Test');
      fireEvent.click(recipeCard);

      await waitFor(() => {
        const timerButtons = container.querySelectorAll('.timer-button-inline');
        expect(timerButtons).toHaveLength(6);
        
        // Check that all timer buttons are rendered correctly
        const timerTexts = Array.from(timerButtons).map(btn => 
          btn.querySelector('.timer-text').textContent
        );
        
        expect(timerTexts).toContain('Set timer for 1 minute');
        expect(timerTexts).toContain('Set timer for 1 hour');
        expect(timerTexts).toContain('Set timer for 1 second');
        expect(timerTexts).toContain('Set timer for 2 minutes');
        expect(timerTexts).toContain('Set timer for 2 hours');
        expect(timerTexts).toContain('Set timer for 30 seconds');
      });
    });
  });
});