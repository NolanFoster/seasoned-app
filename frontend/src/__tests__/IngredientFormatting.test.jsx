import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from '../App';
import { formatIngredientAmount, decimalToFraction } from '../../../shared/utility-functions.js';

// Mock the API calls and other globals
global.fetch = jest.fn();
global.AbortController = jest.fn(() => ({
  abort: jest.fn(),
  signal: {}
}));

const mockRecipeWithDecimals = {
  id: '1',
  name: 'Test Recipe with Decimals',
  description: 'A recipe to test decimal formatting',
  image: 'https://example.com/image.jpg',
  ingredients: [
    '0.33333334326744 cup flour',
    '1.5 tablespoons sugar',
    '0.25 teaspoon salt',
    '2.666 cups milk',
    '½ cup butter',
    '¾ teaspoon vanilla',
    '1⅓ cups water'
  ],
  instructions: [
    'Mix all ingredients',
    'Bake at 350°F'
  ],
  prep_time: 'PT15M',
  cook_time: 'PT30M',
  recipe_yield: '8 servings'
};

const mockRecipeResponse = {
  data: mockRecipeWithDecimals
};

describe.skip('Ingredient Formatting', () => {
  beforeEach(() => {
    fetch.mockClear();
    localStorage.clear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('formatIngredientAmount function', () => {
    it('converts decimal numbers to fractions', () => {
      expect(formatIngredientAmount('0.33333334326744 cup flour')).toBe('1/3 cup flour');
      expect(formatIngredientAmount('1.5 tablespoons sugar')).toBe('1 1/2 tablespoons sugar');
      expect(formatIngredientAmount('0.25 teaspoon salt')).toBe('1/4 teaspoon salt');
      expect(formatIngredientAmount('2.666 cups milk')).toBe('2 2/3 cups milk');
    });

    it('converts Unicode fractions to ASCII fractions', () => {
      expect(formatIngredientAmount('½ cup butter')).toBe('1/2 cup butter');
      expect(formatIngredientAmount('¾ teaspoon vanilla')).toBe('3/4 teaspoon vanilla');
      expect(formatIngredientAmount('⅓ cup honey')).toBe('1/3 cup honey');
      expect(formatIngredientAmount('⅔ tablespoon oil')).toBe('2/3 tablespoon oil');
    });

    it('handles mixed numbers with Unicode fractions', () => {
      expect(formatIngredientAmount('1⅓ cups water')).toBe('1 1/3 cups water');
      expect(formatIngredientAmount('2½ tablespoons sugar')).toBe('2 1/2 tablespoons sugar');
      expect(formatIngredientAmount('3¾ cups flour')).toBe('3 3/4 cups flour');
    });

    it('preserves already formatted ASCII fractions', () => {
      expect(formatIngredientAmount('1/2 cup cream')).toBe('1/2 cup cream');
      expect(formatIngredientAmount('3/4 teaspoon baking soda')).toBe('3/4 teaspoon baking soda');
      expect(formatIngredientAmount('1 1/3 cups flour')).toBe('1 1/3 cups flour');
    });

    it('handles ingredients without numbers', () => {
      expect(formatIngredientAmount('pinch of salt')).toBe('pinch of salt');
      expect(formatIngredientAmount('fresh herbs to taste')).toBe('fresh herbs to taste');
      expect(formatIngredientAmount('zest of one lemon')).toBe('zest of one lemon');
    });

    it('handles edge cases', () => {
      expect(formatIngredientAmount('')).toBe('');
      expect(formatIngredientAmount(null)).toBe('');
      expect(formatIngredientAmount(undefined)).toBe('');
      expect(formatIngredientAmount(123)).toBe('');
    });
  });

  describe('decimalToFraction function', () => {
    it('converts common fractions correctly', () => {
      expect(decimalToFraction(0.125)).toBe('1/8');
      expect(decimalToFraction(0.25)).toBe('1/4');
      expect(decimalToFraction(0.333)).toBe('1/3');
      expect(decimalToFraction(0.5)).toBe('1/2');
      expect(decimalToFraction(0.75)).toBe('3/4');
    });

    it('handles the specific problematic decimal', () => {
      expect(decimalToFraction(0.33333334326744)).toBe('1/3');
    });

    it('converts mixed numbers correctly', () => {
      expect(decimalToFraction(1.5)).toBe('1 1/2');
      expect(decimalToFraction(2.25)).toBe('2 1/4');
      expect(decimalToFraction(2.333)).toBe('2 1/3');
    });

    it('handles whole numbers', () => {
      expect(decimalToFraction(1)).toBe('1');
      expect(decimalToFraction(2)).toBe('2');
      expect(decimalToFraction(3)).toBe('3');
    });

    it('handles edge cases', () => {
      expect(decimalToFraction(0)).toBe('0');
      expect(decimalToFraction(null)).toBe('');
      expect(decimalToFraction(undefined)).toBe('');
      expect(decimalToFraction(NaN)).toBe('');
    });
  });

  describe('Ingredient display in recipe view', () => {
    it('displays formatted ingredients when viewing a recipe', async () => {
      // Mock the initial API calls
      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ categories: [] })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockRecipeResponse
        });

      render(<App />);

      // Wait for the app to initialize
      await waitFor(() => {
        expect(screen.getByText('Add Recipe')).toBeInTheDocument();
      });

      // Simulate selecting a recipe
      const event = new CustomEvent('recipe-selected', {
        detail: { recipe: mockRecipeWithDecimals }
      });
      window.dispatchEvent(event);

      // Wait for the recipe to be displayed
      await waitFor(() => {
        expect(screen.getByText('Test Recipe with Decimals')).toBeInTheDocument();
      });

      // Check that ingredients are formatted correctly
      await waitFor(() => {
        // Decimal conversions
        expect(screen.getByText('1/3 cup flour')).toBeInTheDocument();
        expect(screen.getByText('1 1/2 tablespoons sugar')).toBeInTheDocument();
        expect(screen.getByText('1/4 teaspoon salt')).toBeInTheDocument();
        expect(screen.getByText('2 2/3 cups milk')).toBeInTheDocument();
        
        // Unicode conversions
        expect(screen.getByText('1/2 cup butter')).toBeInTheDocument();
        expect(screen.getByText('3/4 teaspoon vanilla')).toBeInTheDocument();
        expect(screen.getByText('1 1/3 cups water')).toBeInTheDocument();
      });
    });

    it('formats ingredients in recipe preview when clipping', async () => {
      // Mock the clipper API response
      const mockClippedRecipe = {
        name: 'Clipped Recipe',
        description: 'Test clipped recipe',
        ingredients: [
          '0.5 cup sugar',
          '⅔ cup milk',
          '1½ teaspoons vanilla'
        ],
        instructions: ['Mix and bake'],
        image_url: 'https://example.com/clipped.jpg',
        source_url: 'https://example.com/recipe'
      };

      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ categories: [] })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockClippedRecipe
        });

      render(<App />);

      // Wait for the app to initialize
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter recipe URL to clip...')).toBeInTheDocument();
      });

      // Enter a URL and submit
      const urlInput = screen.getByPlaceholderText('Enter recipe URL to clip...');
      fireEvent.change(urlInput, { target: { value: 'https://example.com/recipe' } });
      
      const clipButton = screen.getByText('Clip Recipe');
      fireEvent.click(clipButton);

      // Wait for the preview to appear
      await waitFor(() => {
        expect(screen.getByText('Recipe Preview')).toBeInTheDocument();
      });

      // Check that ingredients in preview are formatted
      await waitFor(() => {
        expect(screen.getByText('1/2 cup sugar')).toBeInTheDocument();
        expect(screen.getByText('2/3 cup milk')).toBeInTheDocument();
        expect(screen.getByText('1 1/2 teaspoons vanilla')).toBeInTheDocument();
      });
    });
  });

  describe('Edge cases and error handling', () => {
    it('handles recipes with missing ingredients gracefully', async () => {
      const recipeWithoutIngredients = {
        ...mockRecipeWithDecimals,
        ingredients: undefined
      };

      render(<App />);

      const event = new CustomEvent('recipe-selected', {
        detail: { recipe: recipeWithoutIngredients }
      });
      window.dispatchEvent(event);

      await waitFor(() => {
        expect(screen.getByText('Test Recipe with Decimals')).toBeInTheDocument();
      });

      // Should still render without crashing
      expect(screen.getByText('Ingredients')).toBeInTheDocument();
    });

    it('handles malformed ingredient strings', () => {
      const malformedIngredients = [
        '..25 cups flour',
        'NaN teaspoons salt',
        '1.2.3 cups milk',
        'Infinity grams sugar'
      ];

      malformedIngredients.forEach(ingredient => {
        // Should not throw and should return something reasonable
        expect(() => formatIngredientAmount(ingredient)).not.toThrow();
      });
    });

    it('preserves non-standard fraction formats', () => {
      // Test that the function doesn't break existing fraction formats
      expect(formatIngredientAmount('1-1/2 cups flour')).toBe('1-1/2 cups flour');
      expect(formatIngredientAmount('1 and 1/2 cups sugar')).toBe('1 and 1/2 cups sugar');
    });
  });

  describe('Performance considerations', () => {
    it('handles large ingredient lists efficiently', () => {
      const largeIngredientList = Array(100).fill(null).map((_, i) => 
        `${(i * 0.25).toFixed(2)} cups ingredient ${i}`
      );

      const startTime = performance.now();
      largeIngredientList.forEach(ingredient => {
        formatIngredientAmount(ingredient);
      });
      const endTime = performance.now();

      // Should process 100 ingredients in less than 100ms
      expect(endTime - startTime).toBeLessThan(100);
    });
  });
});