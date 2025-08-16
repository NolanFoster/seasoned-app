import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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

describe('Recipe Display', () => {
  beforeEach(() => {
    fetch.mockClear();
    jest.clearAllMocks();
  });

  test('displays recipe with all fields', async () => {
    const mockRecipes = [
      {
        id: 1,
        name: 'Complete Recipe',
        description: 'A recipe with all fields filled',
        image_url: 'https://example.com/image.jpg',
        prep_time: 'PT30M',
        cook_time: 'PT45M',
        recipe_yield: '4 servings',
        ingredients: ['ingredient 1', 'ingredient 2'],
        instructions: ['Step 1', 'Step 2'],
        source_url: 'https://example.com/recipe',
        author: 'Test Chef',
        datePublished: '2024-01-01',
        recipeCategory: 'Main Course',
        recipeCuisine: 'Italian',
        keywords: 'pasta, italian, dinner',
        nutrition: {
          calories: '350',
          protein: '15g',
          fat: '10g'
        },
        aggregateRating: {
          ratingValue: 4.5,
          ratingCount: 100
        }
      },
    ];

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ recipes: mockRecipes }),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Complete Recipe')).toBeInTheDocument();
      expect(screen.getByText('30 m')).toBeInTheDocument(); // Prep time
      expect(screen.getByText('45 m')).toBeInTheDocument(); // Cook time
    });
  });

  test('handles recipe with missing optional fields', async () => {
    const mockRecipes = [
      {
        id: 1,
        name: 'Minimal Recipe',
        // Only required fields
      },
    ];

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ recipes: mockRecipes }),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Minimal Recipe')).toBeInTheDocument();
    });

    // Should not crash with missing fields
    const recipeCard = screen.getByText('Minimal Recipe').closest('.recipe-card');
    expect(recipeCard).toBeInTheDocument();
  });

  test('displays recipe image when available', async () => {
    const mockRecipes = [
      {
        id: 1,
        name: 'Recipe with Image',
        image_url: 'https://example.com/recipe-image.jpg',
      },
    ];

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ recipes: mockRecipes }),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Recipe with Image')).toBeInTheDocument();
    });

    const images = screen.getAllByRole('img');
    const recipeImage = images.find(img => img.src === 'https://example.com/recipe-image.jpg');
    expect(recipeImage).toBeInTheDocument();
  });

  test('shows placeholder for missing image', async () => {
    const mockRecipes = [
      {
        id: 1,
        name: 'Recipe without Image',
        // No image_url
      },
    ];

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ recipes: mockRecipes }),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Recipe without Image')).toBeInTheDocument();
    });

    // Should show recipe icon instead
    const recipeCard = screen.getByText('Recipe without Image').closest('.recipe-card');
    const svgIcon = recipeCard.querySelector('svg');
    expect(svgIcon).toBeInTheDocument();
  });

  test('formats complex time durations', async () => {
    const mockRecipes = [
      {
        id: 1,
        name: 'Long Recipe',
        prep_time: 'PT2H30M',
        cook_time: 'PT1H15M',
      },
    ];

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ recipes: mockRecipes }),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Long Recipe')).toBeInTheDocument();
      expect(screen.getByText('2 h 30 m')).toBeInTheDocument(); // Prep time
      expect(screen.getByText('1 h 15 m')).toBeInTheDocument(); // Cook time
    });
  });

  test('handles numeric time values', async () => {
    const mockRecipes = [
      {
        id: 1,
        name: 'Recipe with Numeric Times',
        prep_time: 30, // Number instead of ISO duration
        cook_time: 45,
      },
    ];

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ recipes: mockRecipes }),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Recipe with Numeric Times')).toBeInTheDocument();
      // formatDuration should handle numbers as strings
      expect(screen.getByText('30')).toBeInTheDocument();
      expect(screen.getByText('45')).toBeInTheDocument();
    });
  });

  test('displays yield information', async () => {
    const mockRecipes = [
      {
        id: 1,
        name: 'Recipe with Yield',
        recipe_yield: '6-8 servings',
      },
    ];

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ recipes: mockRecipes }),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Recipe with Yield')).toBeInTheDocument();
      expect(screen.getByText('6-8 servings')).toBeInTheDocument();
    });
  });

  test('handles array and object ingredient formats', async () => {
    const mockRecipes = [
      {
        id: 1,
        name: 'Recipe with Complex Ingredients',
        ingredients: ['Simple ingredient'],
        recipeIngredient: [
          '2 cups flour',
          { text: '1 cup sugar' },
          { name: '1/2 cup butter' }
        ],
      },
    ];

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ recipes: mockRecipes }),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Recipe with Complex Ingredients')).toBeInTheDocument();
    });

    // Click to expand
    const recipeCard = screen.getByText('Recipe with Complex Ingredients').closest('.recipe-card');
    fireEvent.click(recipeCard);

    await waitFor(() => {
      expect(screen.getByText('Simple ingredient')).toBeInTheDocument();
      expect(screen.getByText('2 cups flour')).toBeInTheDocument();
      expect(screen.getByText('1 cup sugar')).toBeInTheDocument();
      expect(screen.getByText('1/2 cup butter')).toBeInTheDocument();
    });
  });

  test('handles array and object instruction formats', async () => {
    const mockRecipes = [
      {
        id: 1,
        name: 'Recipe with Complex Instructions',
        instructions: ['Simple step'],
        recipeInstructions: [
          'Text instruction',
          { text: 'Instruction with text property' },
          { name: 'Instruction with name property' }
        ],
      },
    ];

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ recipes: mockRecipes }),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Recipe with Complex Instructions')).toBeInTheDocument();
    });

    // Click to expand
    const recipeCard = screen.getByText('Recipe with Complex Instructions').closest('.recipe-card');
    fireEvent.click(recipeCard);

    await waitFor(() => {
      expect(screen.getByText('Simple step')).toBeInTheDocument();
      expect(screen.getByText('Text instruction')).toBeInTheDocument();
      expect(screen.getByText('Instruction with text property')).toBeInTheDocument();
      expect(screen.getByText('Instruction with name property')).toBeInTheDocument();
    });
  });

  test('displays recipe metadata', async () => {
    const mockRecipes = [
      {
        id: 1,
        name: 'Recipe with Metadata',
        author: 'Famous Chef',
        datePublished: '2024-01-15',
        recipeCategory: 'Dessert',
        recipeCuisine: 'French',
        keywords: 'chocolate, cake, dessert',
      },
    ];

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ recipes: mockRecipes }),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Recipe with Metadata')).toBeInTheDocument();
    });

    // Click to expand
    const recipeCard = screen.getByText('Recipe with Metadata').closest('.recipe-card');
    fireEvent.click(recipeCard);

    await waitFor(() => {
      expect(screen.getByText(/Famous Chef/)).toBeInTheDocument();
      expect(screen.getByText(/French/)).toBeInTheDocument();
      expect(screen.getByText(/Dessert/)).toBeInTheDocument();
    });
  });

  test('handles video recipes', async () => {
    const mockRecipes = [
      {
        id: 1,
        name: 'Video Recipe',
        video_url: 'https://www.youtube.com/watch?v=test123',
        video: {
          contentUrl: 'https://www.youtube.com/watch?v=test456'
        },
      },
    ];

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ recipes: mockRecipes }),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Video Recipe')).toBeInTheDocument();
    });

    // Video icon should be present
    const recipeCard = screen.getByText('Video Recipe').closest('.recipe-card');
    const videoIcon = recipeCard.querySelector('.video-indicator');
    expect(videoIcon).toBeInTheDocument();
  });

  test('handles recipe rating display', async () => {
    const mockRecipes = [
      {
        id: 1,
        name: 'Rated Recipe',
        aggregateRating: {
          ratingValue: 4.5,
          ratingCount: 150,
          bestRating: 5
        },
      },
    ];

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ recipes: mockRecipes }),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Rated Recipe')).toBeInTheDocument();
    });

    // Click to expand
    const recipeCard = screen.getByText('Rated Recipe').closest('.recipe-card');
    fireEvent.click(recipeCard);

    await waitFor(() => {
      // Should display rating information
      expect(screen.getByText(/4\.5/)).toBeInTheDocument();
      expect(screen.getByText(/150/)).toBeInTheDocument();
    });
  });

  test('handles nutrition information display', async () => {
    const mockRecipes = [
      {
        id: 1,
        name: 'Nutritious Recipe',
        nutrition: {
          calories: '250',
          protein: '20g',
          carbohydrates: '30g',
          fat: '10g',
          fiber: '5g',
          sugar: '8g',
          sodium: '300mg'
        },
      },
    ];

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ recipes: mockRecipes }),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Nutritious Recipe')).toBeInTheDocument();
    });

    // Click to expand
    const recipeCard = screen.getByText('Nutritious Recipe').closest('.recipe-card');
    fireEvent.click(recipeCard);

    await waitFor(() => {
      expect(screen.getByText(/250/)).toBeInTheDocument();
      expect(screen.getByText(/20g/)).toBeInTheDocument();
      expect(screen.getByText(/30g/)).toBeInTheDocument();
    });
  });
});