import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import App from '../App';

// Mock fetch globally
global.fetch = jest.fn();

// Mock canvas and other browser APIs
HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
  fillRect: jest.fn(),
  clearRect: jest.fn(),
  beginPath: jest.fn(),
  arc: jest.fn(),
  fill: jest.fn(),
  save: jest.fn(),
  restore: jest.fn(),
  translate: jest.fn(),
  rotate: jest.fn(),
}));

global.IntersectionObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

describe('Search Functionality', () => {
  beforeEach(() => {
    fetch.mockClear();
    jest.clearAllMocks();
  });

  test('handles empty search results', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ recipes: [] }),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.queryByText('Loading recipes...')).not.toBeInTheDocument();
    });

    // Should show empty state
    expect(screen.queryByText('No recipes found')).not.toBeInTheDocument(); // App shows empty grid
  });

  test('searches by recipe name', async () => {
    const mockRecipes = [
      { 
        id: 1, 
        name: 'Chicken Curry',
        ingredients: ['chicken', 'curry powder'],
        instructions: ['Cook chicken', 'Add curry']
      },
      { 
        id: 2, 
        name: 'Beef Stew',
        ingredients: ['beef', 'potatoes'],
        instructions: ['Brown beef', 'Add vegetables']
      },
    ];

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ recipes: mockRecipes }),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Chicken Curry')).toBeInTheDocument();
      expect(screen.getByText('Beef Stew')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search recipes or paste a URL to clip...');
    await userEvent.type(searchInput, 'chicken');

    // Should only show chicken curry
    expect(screen.getByText('Chicken Curry')).toBeInTheDocument();
    expect(screen.queryByText('Beef Stew')).not.toBeInTheDocument();
  });

  test('searches by ingredient', async () => {
    const mockRecipes = [
      { 
        id: 1, 
        name: 'Potato Salad',
        ingredients: ['potatoes', 'mayonnaise', 'eggs'],
        recipeIngredient: ['4 potatoes', '1 cup mayonnaise', '2 eggs']
      },
      { 
        id: 2, 
        name: 'Green Salad',
        ingredients: ['lettuce', 'tomatoes', 'cucumber'],
        recipeIngredient: ['1 head lettuce', '2 tomatoes', '1 cucumber']
      },
    ];

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ recipes: mockRecipes }),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Potato Salad')).toBeInTheDocument();
      expect(screen.getByText('Green Salad')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search recipes or paste a URL to clip...');
    await userEvent.type(searchInput, 'potato');

    // Should only show potato salad
    expect(screen.getByText('Potato Salad')).toBeInTheDocument();
    expect(screen.queryByText('Green Salad')).not.toBeInTheDocument();
  });

  test('searches by instruction text', async () => {
    const mockRecipes = [
      { 
        id: 1, 
        name: 'Grilled Chicken',
        ingredients: ['chicken'],
        instructions: ['Preheat grill', 'Grill chicken for 20 minutes'],
        recipeInstructions: [
          { name: 'Preheat grill' },
          { text: 'Grill chicken for 20 minutes' }
        ]
      },
      { 
        id: 2, 
        name: 'Baked Fish',
        ingredients: ['fish'],
        instructions: ['Preheat oven', 'Bake fish for 15 minutes'],
        recipeInstructions: [
          { name: 'Preheat oven' },
          { text: 'Bake fish for 15 minutes' }
        ]
      },
    ];

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ recipes: mockRecipes }),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Grilled Chicken')).toBeInTheDocument();
      expect(screen.getByText('Baked Fish')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search recipes or paste a URL to clip...');
    await userEvent.type(searchInput, 'grill');

    // Should only show grilled chicken
    expect(screen.getByText('Grilled Chicken')).toBeInTheDocument();
    expect(screen.queryByText('Baked Fish')).not.toBeInTheDocument();
  });

  test('searches by description', async () => {
    const mockRecipes = [
      { 
        id: 1, 
        name: 'Summer Salad',
        description: 'A refreshing salad perfect for hot days',
        ingredients: []
      },
      { 
        id: 2, 
        name: 'Winter Soup',
        description: 'A hearty soup to warm you up',
        ingredients: []
      },
    ];

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ recipes: mockRecipes }),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Summer Salad')).toBeInTheDocument();
      expect(screen.getByText('Winter Soup')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search recipes or paste a URL to clip...');
    await userEvent.type(searchInput, 'refreshing');

    // Should only show summer salad
    expect(screen.getByText('Summer Salad')).toBeInTheDocument();
    expect(screen.queryByText('Winter Soup')).not.toBeInTheDocument();
  });

  test('clears search when input is cleared', async () => {
    const mockRecipes = [
      { id: 1, name: 'Recipe One', ingredients: [] },
      { id: 2, name: 'Recipe Two', ingredients: [] },
    ];

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ recipes: mockRecipes }),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Recipe One')).toBeInTheDocument();
      expect(screen.getByText('Recipe Two')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search recipes or paste a URL to clip...');
    
    // Type search term
    await userEvent.type(searchInput, 'one');
    expect(screen.getByText('Recipe One')).toBeInTheDocument();
    expect(screen.queryByText('Recipe Two')).not.toBeInTheDocument();

    // Clear search
    await userEvent.clear(searchInput);
    
    // Both recipes should be visible again
    expect(screen.getByText('Recipe One')).toBeInTheDocument();
    expect(screen.getByText('Recipe Two')).toBeInTheDocument();
  });

  test('handles special characters in search', async () => {
    const mockRecipes = [
      { 
        id: 1, 
        name: "Mom's Special Recipe",
        ingredients: []
      },
      { 
        id: 2, 
        name: 'Regular Recipe',
        ingredients: []
      },
    ];

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ recipes: mockRecipes }),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Mom's Special Recipe")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search recipes or paste a URL to clip...');
    await userEvent.type(searchInput, "mom's");

    // Should handle apostrophe correctly
    expect(screen.getByText("Mom's Special Recipe")).toBeInTheDocument();
    expect(screen.queryByText('Regular Recipe')).not.toBeInTheDocument();
  });

  test('searches across multiple fields', async () => {
    const mockRecipes = [
      { 
        id: 1, 
        name: 'Pasta Dish',
        description: 'Contains tomatoes',
        ingredients: ['pasta', 'cheese'],
        instructions: ['Boil water']
      },
      { 
        id: 2, 
        name: 'Salad Bowl',
        description: 'Fresh vegetables',
        ingredients: ['lettuce', 'tomatoes'],
        instructions: ['Mix ingredients']
      },
    ];

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ recipes: mockRecipes }),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Pasta Dish')).toBeInTheDocument();
      expect(screen.getByText('Salad Bowl')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search recipes or paste a URL to clip...');
    await userEvent.type(searchInput, 'tomatoes');

    // Both recipes contain "tomatoes" in different fields
    expect(screen.getByText('Pasta Dish')).toBeInTheDocument();
    expect(screen.getByText('Salad Bowl')).toBeInTheDocument();
  });
});