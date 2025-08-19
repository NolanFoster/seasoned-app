import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import SwipeableRecipeGrid from '../components/SwipeableRecipeGrid';

// Mock recipe card component
const MockRecipeCard = ({ recipe }) => (
  <div 
    data-testid={`recipe-${recipe.id}`}
    className="recipe-card"
    style={{ width: '300px', height: '400px' }}
  >
    <h3>{recipe.name}</h3>
    <p>{recipe.description}</p>
  </div>
);

describe('Carousel Integration Tests', () => {
  const createMockRecipes = (count) => 
    Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      name: `Recipe ${i + 1}`,
      description: `Description for recipe ${i + 1}`,
    }));

  describe('Recipe Display Scenarios', () => {
    it('displays 10 recipe cards in carousel', () => {
      const recipes = createMockRecipes(10);
      
      render(
        <SwipeableRecipeGrid>
          {recipes.map(recipe => (
            <MockRecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </SwipeableRecipeGrid>
      );

      // All 10 recipes should be rendered
      recipes.forEach(recipe => {
        expect(screen.getByTestId(`recipe-${recipe.id}`)).toBeInTheDocument();
      });
    });

    it('handles fewer than 10 recipes', () => {
      const recipes = createMockRecipes(5);
      
      render(
        <SwipeableRecipeGrid>
          {recipes.map(recipe => (
            <MockRecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </SwipeableRecipeGrid>
      );

      expect(screen.getAllByTestId(/recipe-/)).toHaveLength(5);
    });

    it('handles more than 10 recipes (testing scroll)', () => {
      const recipes = createMockRecipes(15);
      
      const { container } = render(
        <SwipeableRecipeGrid>
          {recipes.map(recipe => (
            <MockRecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </SwipeableRecipeGrid>
      );

      // All recipes should be rendered (even if not visible)
      expect(screen.getAllByTestId(/recipe-/)).toHaveLength(15);
      
      // Carousel container should exist
      expect(container.querySelector('.carousel-container')).toBeInTheDocument();
    });
  });

  describe('Dynamic Recipe Updates', () => {
    it('updates carousel when recipes change', () => {
      const initialRecipes = createMockRecipes(5);
      
      const { rerender } = render(
        <SwipeableRecipeGrid>
          {initialRecipes.map(recipe => (
            <MockRecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </SwipeableRecipeGrid>
      );

      expect(screen.getAllByTestId(/recipe-/)).toHaveLength(5);

      // Update to 10 recipes
      const updatedRecipes = createMockRecipes(10);
      rerender(
        <SwipeableRecipeGrid>
          {updatedRecipes.map(recipe => (
            <MockRecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </SwipeableRecipeGrid>
      );

      expect(screen.getAllByTestId(/recipe-/)).toHaveLength(10);
    });

    it('handles recipe removal', () => {
      const recipes = createMockRecipes(10);
      
      const { rerender } = render(
        <SwipeableRecipeGrid>
          {recipes.map(recipe => (
            <MockRecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </SwipeableRecipeGrid>
      );

      expect(screen.getAllByTestId(/recipe-/)).toHaveLength(10);

      // Remove some recipes
      const remainingRecipes = recipes.slice(0, 7);
      rerender(
        <SwipeableRecipeGrid>
          {remainingRecipes.map(recipe => (
            <MockRecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </SwipeableRecipeGrid>
      );

      expect(screen.getAllByTestId(/recipe-/)).toHaveLength(7);
      expect(screen.queryByTestId('recipe-8')).not.toBeInTheDocument();
    });

    it('handles empty state', () => {
      const { rerender, container } = render(
        <SwipeableRecipeGrid>
          {createMockRecipes(5).map(recipe => (
            <MockRecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </SwipeableRecipeGrid>
      );

      // Clear all recipes
      rerender(<SwipeableRecipeGrid />);

      // Carousel structure should still exist
      expect(container.querySelector('.carousel-container')).toBeInTheDocument();
      expect(container.querySelector('.recipe-grid')).toBeInTheDocument();
      expect(screen.queryByTestId(/recipe-/)).not.toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    it('allows clicking on recipe cards', () => {
      const handleClick = jest.fn();
      const recipes = createMockRecipes(10);
      
      render(
        <SwipeableRecipeGrid>
          {recipes.map(recipe => (
            <div 
              key={recipe.id}
              data-testid={`recipe-${recipe.id}`}
              onClick={() => handleClick(recipe.id)}
              role="button"
              tabIndex={0}
            >
              {recipe.name}
            </div>
          ))}
        </SwipeableRecipeGrid>
      );

      fireEvent.click(screen.getByTestId('recipe-5'));
      expect(handleClick).toHaveBeenCalledWith(5);
    });

    it('maintains focus within carousel', () => {
      const recipes = createMockRecipes(3);
      
      render(
        <SwipeableRecipeGrid>
          {recipes.map(recipe => (
            <button key={recipe.id} data-testid={`btn-${recipe.id}`}>
              {recipe.name}
            </button>
          ))}
        </SwipeableRecipeGrid>
      );

      const firstButton = screen.getByTestId('btn-1');
      firstButton.focus();
      
      expect(document.activeElement).toBe(firstButton);
    });
  });

  describe('Performance Scenarios', () => {
    it('handles rapid updates efficiently', async () => {
      const { rerender } = render(
        <SwipeableRecipeGrid>
          {createMockRecipes(5).map(recipe => (
            <MockRecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </SwipeableRecipeGrid>
      );

      // Perform multiple rapid updates
      for (let i = 6; i <= 10; i++) {
        rerender(
          <SwipeableRecipeGrid>
            {createMockRecipes(i).map(recipe => (
              <MockRecipeCard key={recipe.id} recipe={recipe} />
            ))}
          </SwipeableRecipeGrid>
        );
      }

      // Final state should have 10 recipes
      await waitFor(() => {
        expect(screen.getAllByTestId(/recipe-/)).toHaveLength(10);
      });
    });

    it('handles large recipe lists', () => {
      const recipes = createMockRecipes(50);
      
      const { container } = render(
        <SwipeableRecipeGrid>
          {recipes.map(recipe => (
            <MockRecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </SwipeableRecipeGrid>
      );

      // Should render all recipes
      expect(screen.getAllByTestId(/recipe-/)).toHaveLength(50);
      
      // Carousel should be scrollable
      const grid = container.querySelector('.recipe-grid');
      expect(grid).toHaveClass('carousel-layout');
    });
  });

  describe('Error Boundaries', () => {
    it('handles invalid children gracefully', () => {
      const { container } = render(
        <SwipeableRecipeGrid>
          {null}
          {undefined}
          {false}
          <div data-testid="valid-child">Valid</div>
        </SwipeableRecipeGrid>
      );

      expect(screen.getByTestId('valid-child')).toBeInTheDocument();
      expect(container.querySelector('.carousel-container')).toBeInTheDocument();
    });

    it('handles mixed content types', () => {
      render(
        <SwipeableRecipeGrid>
          <div data-testid="div-child">Div</div>
          <span data-testid="span-child">Span</span>
          <button data-testid="button-child">Button</button>
          Text content
        </SwipeableRecipeGrid>
      );

      expect(screen.getByTestId('div-child')).toBeInTheDocument();
      expect(screen.getByTestId('span-child')).toBeInTheDocument();
      expect(screen.getByTestId('button-child')).toBeInTheDocument();
    });
  });

  describe('Responsive Behavior', () => {
    it('adapts to viewport changes', () => {
      const recipes = createMockRecipes(10);
      
      // Start with desktop viewport
      global.innerWidth = 1200;
      
      const { container } = render(
        <SwipeableRecipeGrid>
          {recipes.map(recipe => (
            <MockRecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </SwipeableRecipeGrid>
      );

      const grid = container.querySelector('.recipe-grid');
      expect(grid).toHaveClass('carousel-layout');

      // Simulate mobile viewport
      global.innerWidth = 375;
      fireEvent(window, new Event('resize'));

      // Carousel should still work
      expect(grid).toHaveClass('carousel-layout');
    });
  });

  describe('Loading States', () => {
    it('handles loading placeholders', () => {
      const LoadingCard = () => (
        <div data-testid="loading-card" className="loading-card" style={{ width: '300px', height: '400px' }}>
          Loading...
        </div>
      );

      render(
        <SwipeableRecipeGrid>
          {Array.from({ length: 10 }, (_, i) => (
            <LoadingCard key={i} />
          ))}
        </SwipeableRecipeGrid>
      );

      expect(screen.getAllByTestId('loading-card')).toHaveLength(10);
    });

    it('transitions from loading to loaded state', () => {
      const { rerender } = render(
        <SwipeableRecipeGrid>
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} data-testid="loading">Loading...</div>
          ))}
        </SwipeableRecipeGrid>
      );

      expect(screen.getAllByTestId('loading')).toHaveLength(10);

      // Replace with actual recipes
      const recipes = createMockRecipes(10);
      rerender(
        <SwipeableRecipeGrid>
          {recipes.map(recipe => (
            <MockRecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </SwipeableRecipeGrid>
      );

      expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
      expect(screen.getAllByTestId(/recipe-/)).toHaveLength(10);
    });
  });
});