import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import App from '../App';

describe('App Integration Tests', () => {
  let user;

  beforeEach(() => {
    user = userEvent.setup();
    // Mock fetch globally
    global.fetch = jest.fn();
    
    // Mock console methods to avoid noise in tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
    console.log.mockRestore();
    console.error.mockRestore();
    console.warn.mockRestore();
  });

  describe('Recipe Search Flow', () => {
    it('should search for recipes and display results', async () => {
      // Mock initial recipe load
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          recipes: [
            {
              id: 'recipe-1',
              title: 'Chicken Curry',
              description: 'Delicious chicken curry',
              tags: ['curry', 'chicken', 'indian'],
              ingredients: [],
              instructions: []
            },
            {
              id: 'recipe-2',
              title: 'Beef Stew',
              description: 'Hearty beef stew',
              tags: ['stew', 'beef', 'comfort food'],
              ingredients: [],
              instructions: []
            }
          ]
        })
      });

      render(<App />);

      // Wait for initial recipes to load
      await waitFor(() => {
        expect(screen.getByText('Chicken Curry')).toBeInTheDocument();
        expect(screen.getByText('Beef Stew')).toBeInTheDocument();
      });

      // Mock search results
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          results: [
            {
              id: 'recipe-1',
              title: 'Chicken Curry',
              description: 'Delicious chicken curry',
              tags: ['curry', 'chicken', 'indian']
            }
          ]
        })
      });

      // Search for curry
      const searchInput = screen.getByPlaceholderText(/search recipes/i);
      await user.type(searchInput, 'curry');
      
      const searchButton = screen.getByTitle('Search recipes');
      await user.click(searchButton);

      // Should show search results
      await waitFor(() => {
        expect(screen.getByText('Chicken Curry')).toBeInTheDocument();
        expect(screen.queryByText('Beef Stew')).not.toBeInTheDocument();
      });
    });

    it('should handle empty search results', async () => {
      // Mock initial recipe load
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ recipes: [] })
      });

      render(<App />);

      // Mock empty search results
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [] })
      });

      const searchInput = screen.getByPlaceholderText(/search recipes/i);
      await user.type(searchInput, 'nonexistent recipe');
      
      const searchButton = screen.getByTitle('Search recipes');
      await user.click(searchButton);

      // Should show no results message
      await waitFor(() => {
        expect(screen.getByText(/no recipes found/i)).toBeInTheDocument();
      });
    });
  });

  describe('Recipe Viewing Flow', () => {
    it('should view recipe details when clicking on a recipe', async () => {
      const mockRecipe = {
        id: 'recipe-1',
        title: 'Chocolate Cake',
        description: 'Rich chocolate cake',
        ingredients: [
          { text: '2 cups flour', amount: '2', unit: 'cups' },
          { text: '1 cup sugar', amount: '1', unit: 'cup' },
          { text: '3/4 cup cocoa powder', amount: '3/4', unit: 'cup' }
        ],
        instructions: [
          'Preheat oven to 350°F',
          'Mix dry ingredients',
          'Bake for 30 minutes'
        ],
        prepTime: 15,
        cookTime: 30,
        servings: 8,
        tags: ['dessert', 'chocolate', 'cake']
      };

      // Mock initial recipe load
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ recipes: [mockRecipe] })
      });

      render(<App />);

      // Wait for recipe to load and click on it
      await waitFor(() => {
        expect(screen.getByText('Chocolate Cake')).toBeInTheDocument();
      });

      const recipeCard = screen.getByText('Chocolate Cake');
      await user.click(recipeCard);

      // Should show recipe details
      await waitFor(() => {
        expect(screen.getByText('Rich chocolate cake')).toBeInTheDocument();
        expect(screen.getByText('2 cups flour')).toBeInTheDocument();
        expect(screen.getByText('1 cup sugar')).toBeInTheDocument();
        expect(screen.getByText('3/4 cup cocoa powder')).toBeInTheDocument();
        expect(screen.getByText('Preheat oven to 350°F')).toBeInTheDocument();
        expect(screen.getByText('Prep: 15 m')).toBeInTheDocument();
        expect(screen.getByText('Cook: 30 m')).toBeInTheDocument();
        expect(screen.getByText('Servings: 8')).toBeInTheDocument();
      });
    });

    it('should navigate back to recipe list', async () => {
      // Mock initial recipe load
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          recipes: [{
            id: 'recipe-1',
            title: 'Test Recipe',
            description: 'Test description',
            ingredients: [],
            instructions: []
          }]
        })
      });

      render(<App />);

      // Click on recipe
      await waitFor(() => {
        expect(screen.getByText('Test Recipe')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Test Recipe'));

      // Should show back button
      await waitFor(() => {
        const backButton = screen.getByText('← Back to Recipes');
        expect(backButton).toBeInTheDocument();
      });

      // Click back button
      await user.click(screen.getByText('← Back to Recipes'));

      // Should return to recipe list
      await waitFor(() => {
        expect(screen.queryByText('← Back to Recipes')).not.toBeInTheDocument();
        expect(screen.getByText('Test Recipe')).toBeInTheDocument();
      });
    });
  });

  describe('URL Clipping Flow', () => {
    it('should clip a recipe from URL', async () => {
      // Mock initial empty recipe load
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ recipes: [] })
      });

      render(<App />);

      // Mock clipper response
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          recipe: {
            id: 'clipped-recipe-1',
            title: 'Clipped Recipe',
            description: 'Recipe from URL',
            url: 'https://example.com/recipe',
            ingredients: ['1 cup water'],
            instructions: ['Boil water']
          }
        })
      });

      // Mock save response
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true })
      });

      // Enter URL in search
      const searchInput = screen.getByPlaceholderText(/search recipes or paste a URL/i);
      await user.type(searchInput, 'https://example.com/recipe');
      
      const searchButton = screen.getByTitle('Search recipes');
      await user.click(searchButton);

      // Should show success message
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/clip'),
          expect.any(Object)
        );
      });
    });

    it('should handle clipping errors', async () => {
      // Mock initial empty recipe load
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ recipes: [] })
      });

      render(<App />);

      // Mock failed clipper response
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({
          success: false,
          error: 'Invalid URL or unable to extract recipe'
        })
      });

      // Enter invalid URL
      const searchInput = screen.getByPlaceholderText(/search recipes or paste a URL/i);
      await user.type(searchInput, 'https://not-a-recipe.com');
      
      const searchButton = screen.getByTitle('Search recipes');
      await user.click(searchButton);

      // Should handle error gracefully
      await waitFor(() => {
        expect(console.error).toHaveBeenCalled();
      });
    });
  });

  describe('Tag Navigation Flow', () => {
    it('should filter recipes by clicking tags', async () => {
      // Mock initial recipe load
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          recipes: [
            {
              id: 'recipe-1',
              title: 'Italian Pasta',
              tags: ['italian', 'pasta', 'dinner'],
              ingredients: [],
              instructions: []
            },
            {
              id: 'recipe-2',
              title: 'Thai Curry',
              tags: ['thai', 'curry', 'spicy'],
              ingredients: [],
              instructions: []
            }
          ]
        })
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Italian Pasta')).toBeInTheDocument();
        expect(screen.getByText('Thai Curry')).toBeInTheDocument();
      });

      // Mock smart search for 'italian' tag
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          results: [{
            id: 'recipe-1',
            title: 'Italian Pasta',
            tags: ['italian', 'pasta', 'dinner']
          }]
        })
      });

      // Click on italian tag
      const italianTag = screen.getAllByText('italian')[0];
      await user.click(italianTag);

      // Should filter to show only italian recipes
      await waitFor(() => {
        expect(screen.getByText('Italian Pasta')).toBeInTheDocument();
        expect(screen.queryByText('Thai Curry')).not.toBeInTheDocument();
      });
    });
  });

  describe('Recipe Recommendations Flow', () => {
    it('should load and display recipe recommendations', async () => {
      // Mock initial categories load
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          categories: {
            'Quick Meals': ['recipe-1', 'recipe-2'],
            'Comfort Food': ['recipe-3', 'recipe-4']
          }
        })
      });

      // Mock recipe details fetch
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          recipes: [
            {
              id: 'recipe-1',
              title: '15-Minute Stir Fry',
              tags: ['quick', 'asian'],
              ingredients: [],
              instructions: []
            },
            {
              id: 'recipe-2',
              title: 'Quick Salad',
              tags: ['quick', 'healthy'],
              ingredients: [],
              instructions: []
            }
          ]
        })
      });

      render(<App />);

      // Should load categories and recipes
      await waitFor(() => {
        expect(screen.getByText('Quick Meals')).toBeInTheDocument();
        expect(screen.getByText('15-Minute Stir Fry')).toBeInTheDocument();
        expect(screen.getByText('Quick Salad')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      // Mock network error
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      render(<App />);

      // Should show error state
      await waitFor(() => {
        expect(screen.getByText(/no recipes found/i)).toBeInTheDocument();
      });
    });

    it('should handle API errors gracefully', async () => {
      // Mock API error response
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      render(<App />);

      // Should handle error and show fallback UI
      await waitFor(() => {
        expect(screen.getByText(/no recipes found/i)).toBeInTheDocument();
      });
    });
  });
});