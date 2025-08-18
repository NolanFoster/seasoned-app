import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SwipeableRecipeGrid from '../components/SwipeableRecipeGrid';

describe('SwipeableRecipeGrid Component', () => {
  const mockRecipes = [
    {
      id: '1',
      name: 'Test Recipe 1',
      description: 'A test recipe description',
      image: 'test1.jpg',
      prep_time: 'PT15M',
      cook_time: 'PT30M',
      recipe_yield: '4 servings'
    },
    {
      id: '2',
      name: 'Test Recipe 2',
      description: 'Another test recipe',
      image: 'test2.jpg',
      prep_time: 'PT20M',
      cook_time: 'PT25M',
      recipe_yield: '6 servings'
    },
    {
      id: '3',
      name: 'Test Recipe 3',
      description: 'Third test recipe',
      image: 'test3.jpg',
      prep_time: 'PT10M',
      cook_time: 'PT40M',
      recipe_yield: '2 servings'
    }
  ];

  const mockOnRecipeClick = jest.fn();

  beforeEach(() => {
    mockOnRecipeClick.mockClear();
  });

  it('should render recipes with category name correctly', () => {
    render(
      <SwipeableRecipeGrid 
        recipes={mockRecipes} 
        onRecipeClick={mockOnRecipeClick}
        categoryName="Test Category"
      />
    );

    expect(screen.getByText('Test Category')).toBeInTheDocument();
    expect(screen.getByText('Test Recipe 1')).toBeInTheDocument();
    expect(screen.getByText('Test Recipe 2')).toBeInTheDocument();
    expect(screen.getByText('Test Recipe 3')).toBeInTheDocument();
  });

  it('should render without category name', () => {
    render(
      <SwipeableRecipeGrid 
        recipes={mockRecipes} 
        onRecipeClick={mockOnRecipeClick}
      />
    );

    expect(screen.getByText('Test Recipe 1')).toBeInTheDocument();
    expect(screen.getByText('Test Recipe 2')).toBeInTheDocument();
  });

  it('should handle empty recipes array', () => {
    render(
      <SwipeableRecipeGrid 
        recipes={[]} 
        onRecipeClick={mockOnRecipeClick}
        categoryName="Empty Category"
      />
    );

    expect(screen.getByText('Empty Category')).toBeInTheDocument();
    expect(screen.queryByText('Test Recipe 1')).not.toBeInTheDocument();
  });

  it('should handle null recipes', () => {
    render(
      <SwipeableRecipeGrid 
        recipes={null} 
        onRecipeClick={mockOnRecipeClick}
        categoryName="Null Recipes"
      />
    );

    expect(screen.getByText('Null Recipes')).toBeInTheDocument();
  });

  it('should handle undefined recipes', () => {
    render(
      <SwipeableRecipeGrid 
        recipes={undefined} 
        onRecipeClick={mockOnRecipeClick}
        categoryName="Undefined Recipes"
      />
    );

    expect(screen.getByText('Undefined Recipes')).toBeInTheDocument();
  });

  it('should call onRecipeClick when recipe is clicked', () => {
    render(
      <SwipeableRecipeGrid 
        recipes={mockRecipes} 
        onRecipeClick={mockOnRecipeClick}
        categoryName="Test Category"
      />
    );

    const firstRecipe = screen.getByText('Test Recipe 1').closest('.recipe-card');
    fireEvent.click(firstRecipe);

    expect(mockOnRecipeClick).toHaveBeenCalledWith(mockRecipes[0]);
  });

  it('should handle recipes without images gracefully', () => {
    const recipesWithoutImages = [
      {
        id: '1',
        name: 'No Image Recipe',
        description: 'Recipe without image',
        prep_time: 'PT15M',
        cook_time: 'PT30M'
      }
    ];

    render(
      <SwipeableRecipeGrid 
        recipes={recipesWithoutImages} 
        onRecipeClick={mockOnRecipeClick}
        categoryName="No Image Category"
      />
    );

    expect(screen.getByText('No Image Recipe')).toBeInTheDocument();
    expect(screen.getByText('No Image Category')).toBeInTheDocument();
  });

  it('should handle recipes without prep time', () => {
    const recipesWithoutPrepTime = [
      {
        id: '1',
        name: 'No Prep Time Recipe',
        description: 'Recipe without prep time',
        image: 'test.jpg',
        cook_time: 'PT30M'
      }
    ];

    render(
      <SwipeableRecipeGrid 
        recipes={recipesWithoutPrepTime} 
        onRecipeClick={mockOnRecipeClick}
        categoryName="No Prep Time"
      />
    );

    expect(screen.getByText('No Prep Time Recipe')).toBeInTheDocument();
  });

  it('should handle recipes without cook time', () => {
    const recipesWithoutCookTime = [
      {
        id: '1',
        name: 'No Cook Time Recipe',
        description: 'Recipe without cook time',
        image: 'test.jpg',
        prep_time: 'PT15M'
      }
    ];

    render(
      <SwipeableRecipeGrid 
        recipes={recipesWithoutCookTime} 
        onRecipeClick={mockOnRecipeClick}
        categoryName="No Cook Time"
      />
    );

    expect(screen.getByText('No Cook Time Recipe')).toBeInTheDocument();
  });

  it('should handle recipes without description', () => {
    const recipesWithoutDescription = [
      {
        id: '1',
        name: 'No Description Recipe',
        image: 'test.jpg',
        prep_time: 'PT15M',
        cook_time: 'PT30M'
      }
    ];

    render(
      <SwipeableRecipeGrid 
        recipes={recipesWithoutDescription} 
        onRecipeClick={mockOnRecipeClick}
        categoryName="No Description"
      />
    );

    expect(screen.getByText('No Description Recipe')).toBeInTheDocument();
  });

  it('should handle multiple recipe clicks', () => {
    render(
      <SwipeableRecipeGrid 
        recipes={mockRecipes} 
        onRecipeClick={mockOnRecipeClick}
        categoryName="Multiple Clicks"
      />
    );

    const firstRecipe = screen.getByText('Test Recipe 1').closest('.recipe-card');
    const secondRecipe = screen.getByText('Test Recipe 2').closest('.recipe-card');

    fireEvent.click(firstRecipe);
    fireEvent.click(secondRecipe);

    expect(mockOnRecipeClick).toHaveBeenCalledTimes(2);
    expect(mockOnRecipeClick).toHaveBeenNthCalledWith(1, mockRecipes[0]);
    expect(mockOnRecipeClick).toHaveBeenNthCalledWith(2, mockRecipes[1]);
  });

  it('should handle recipes with minimal data', () => {
    const minimalRecipes = [
      {
        id: '1',
        name: 'Minimal Recipe'
      }
    ];

    render(
      <SwipeableRecipeGrid 
        recipes={minimalRecipes} 
        onRecipeClick={mockOnRecipeClick}
        categoryName="Minimal Data"
      />
    );

    expect(screen.getByText('Minimal Recipe')).toBeInTheDocument();
  });

  it('should not crash with malformed recipe data', () => {
    const malformedRecipes = [
      null,
      undefined,
      {},
      { id: '1' },
      { name: 'Only Name' },
      { id: '2', name: 'Valid Recipe', description: 'Valid description' }
    ];

    expect(() => {
      render(
        <SwipeableRecipeGrid 
          recipes={malformedRecipes} 
          onRecipeClick={mockOnRecipeClick}
          categoryName="Malformed Data"
        />
      );
    }).not.toThrow();
  });
});