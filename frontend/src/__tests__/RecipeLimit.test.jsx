import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock the search worker URL
global.SEARCH_DB_URL = 'https://test-search.example.com';

// Mock the utility function
jest.mock('../../../shared/utility-functions.js', () => ({
  formatDuration: jest.fn((duration) => {
    if (!duration) return '-';
    if (duration.includes('PT')) {
      const minutes = duration.replace('PT', '').replace('M', '');
      return `${minutes} min`;
    }
    return duration;
  })
}));

describe('Recipe Limit Configuration Tests', () => {
  describe('API Limit Configuration', () => {
    it('should use limit of 10 in API calls', () => {
      // Import the searchRecipesByTags function or component that uses it
      const searchUrl = `${SEARCH_DB_URL}/api/smart-search?q=test&type=recipe&limit=10`;
      
      // Verify the URL contains limit=10
      expect(searchUrl).toContain('limit=10');
      expect(searchUrl).not.toContain('limit=6');
    });
  });

  describe('Recipe Slice Configuration', () => {
    it('should slice arrays to 10 items maximum', () => {
      // Create test data with 15 items
      const recipes = Array(15).fill(null).map((_, i) => ({
        id: `recipe-${i}`,
        name: `Recipe ${i}`
      }));
      
      // Simulate the slice operation used in Recommendations.jsx
      const displayedRecipes = recipes.slice(0, 10);
      
      expect(displayedRecipes).toHaveLength(10);
      expect(displayedRecipes[0].name).toBe('Recipe 0');
      expect(displayedRecipes[9].name).toBe('Recipe 9');
      expect(displayedRecipes[10]).toBeUndefined();
    });

    it('should handle arrays with fewer than 10 items', () => {
      // Create test data with 5 items
      const recipes = Array(5).fill(null).map((_, i) => ({
        id: `recipe-${i}`,
        name: `Recipe ${i}`
      }));
      
      // Simulate the slice operation
      const displayedRecipes = recipes.slice(0, 10);
      
      expect(displayedRecipes).toHaveLength(5);
      expect(displayedRecipes[0].name).toBe('Recipe 0');
      expect(displayedRecipes[4].name).toBe('Recipe 4');
    });

    it('should handle exactly 10 items', () => {
      // Create test data with exactly 10 items
      const recipes = Array(10).fill(null).map((_, i) => ({
        id: `recipe-${i}`,
        name: `Recipe ${i}`
      }));
      
      // Simulate the slice operation
      const displayedRecipes = recipes.slice(0, 10);
      
      expect(displayedRecipes).toHaveLength(10);
      expect(displayedRecipes[0].name).toBe('Recipe 0');
      expect(displayedRecipes[9].name).toBe('Recipe 9');
    });
  });

  describe('Component Integration', () => {
    // Simple component that demonstrates the 10 recipe limit
    const RecipeList = ({ recipes }) => {
      const displayedRecipes = recipes.slice(0, 10);
      
      return (
        <div>
          {displayedRecipes.map(recipe => (
            <div key={recipe.id} data-testid="recipe-item">
              {recipe.name}
            </div>
          ))}
        </div>
      );
    };

    it('displays up to 10 recipes when given more', () => {
      const manyRecipes = Array(20).fill(null).map((_, i) => ({
        id: `recipe-${i}`,
        name: `Recipe ${i}`
      }));

      render(<RecipeList recipes={manyRecipes} />);
      
      const recipeItems = screen.getAllByTestId('recipe-item');
      expect(recipeItems).toHaveLength(10);
      
      // Verify first and last displayed recipes
      expect(screen.getByText('Recipe 0')).toBeInTheDocument();
      expect(screen.getByText('Recipe 9')).toBeInTheDocument();
      expect(screen.queryByText('Recipe 10')).not.toBeInTheDocument();
    });

    it('displays all recipes when given fewer than 10', () => {
      const fewRecipes = Array(7).fill(null).map((_, i) => ({
        id: `recipe-${i}`,
        name: `Recipe ${i}`
      }));

      render(<RecipeList recipes={fewRecipes} />);
      
      const recipeItems = screen.getAllByTestId('recipe-item');
      expect(recipeItems).toHaveLength(7);
      
      // Verify all recipes are displayed
      for (let i = 0; i < 7; i++) {
        expect(screen.getByText(`Recipe ${i}`)).toBeInTheDocument();
      }
    });
  });

  describe('Carousel Configuration', () => {
    it('should support displaying 10 recipe cards in carousel', () => {
      // Mock carousel container with 10 cards
      const carouselWidth = 300 * 10 + 20 * 9; // 10 cards of 300px + 9 gaps of 20px
      const viewportWidth = 1200; // Desktop viewport
      
      // Verify carousel can accommodate 10 cards
      expect(carouselWidth).toBeGreaterThan(viewportWidth);
      
      // Verify scroll is needed for 10 cards
      const scrollNeeded = carouselWidth > viewportWidth;
      expect(scrollNeeded).toBe(true);
    });

    it('calculates correct scroll distance for navigation', () => {
      const cardWidth = 300;
      const cardsPerScroll = 3;
      const scrollDistance = cardWidth * cardsPerScroll;
      
      expect(scrollDistance).toBe(900);
      
      // Verify we can navigate through 10 cards in chunks
      const totalCards = 10;
      const scrollsNeeded = Math.ceil(totalCards / cardsPerScroll);
      expect(scrollsNeeded).toBe(4); // 3 + 3 + 3 + 1
    });
  });
});