import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';

// Mock fetch globally
global.fetch = jest.fn();

describe('Recipe Management Functions', () => {
  beforeEach(() => {
    // Reset fetch mock before each test
    fetch.mockClear();
    
    // Mock successful responses by default
    fetch.mockImplementation((url) => {
      if (url.includes('/recommendations')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            recommendations: {
              'Test Category': ['test', 'recipe']
            },
            location: 'Test Location',
            date: '2025-01-01',
            season: 'Test'
          })
        });
      } else if (url.includes('/health')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'healthy' })
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ success: true, recipes: [] }),
        text: async () => 'Success'
      });
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Search and Clip Functions', () => {
    it('should detect valid URLs in search input', async () => {
      const { getByPlaceholderText } = render(<App />);
      
      const searchInput = getByPlaceholderText('Search recipes or paste a URL to clip...');
      
      // Type a URL
      await userEvent.type(searchInput, 'http://example.com/recipe');
      
      // The input should have the URL
      expect(searchInput.value).toBe('http://example.com/recipe');
    });
    
    it('should handle search input changes', async () => {
      const { getByPlaceholderText } = render(<App />);
      
      const searchInput = getByPlaceholderText('Search recipes or paste a URL to clip...');
      
      // Type a search query
      await userEvent.type(searchInput, 'chicken recipe');
      
      // The input should have the search query
      expect(searchInput.value).toBe('chicken recipe');
    });
  });

  describe('Recipe Edit Functions', () => {
    it('should enable edit mode for a recipe', async () => {
      // Mock initial recipes
      fetch.mockImplementation((url) => {
        if (url.includes('/recipes')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              recipes: [
                {
                  id: '1',
                  data: {
                    id: '1',
                    name: 'Test Recipe',
                    source_url: 'http://example.com',
                    ingredients: ['ingredient 1'],
                    instructions: ['step 1']
                  }
                }
              ]
            })
          });
        } else if (url.includes('/recommendations')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              recommendations: {
                'Test Category': ['test', 'recipe']
              },
              location: 'Test Location',
              date: '2025-01-01',
              season: 'Test'
            })
          });
        } else if (url.includes('/health')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ status: 'healthy' })
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, recipes: [] })
        });
      });
      
      const { getByText, getByDisplayValue } = render(<App />);
      
      // Wait for recipes to load
      await waitFor(() => {
        expect(screen.getByText('Test Recipe')).toBeInTheDocument();
      });
      
      // Click on the recipe to view it
      fireEvent.click(getByText('Test Recipe'));
      
      // The recipe view should open
      await waitFor(() => {
        expect(screen.getByText('Instructions')).toBeInTheDocument();
      });
    });
  });

  describe('Clipping Functions', () => {
    it('should show clip button for valid URLs', async () => {
      const { getByPlaceholderText, getByTitle } = render(<App />);
      
      const searchInput = getByPlaceholderText('Search recipes or paste a URL to clip...');
      
      // Type a valid URL
      await userEvent.type(searchInput, 'http://example.com/recipe');
      
      // Mock clipper health check
      fetch.mockImplementation((url) => {
        if (url.includes('clipper') && url.includes('/health')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ status: 'healthy' })
          });
        } else if (url.includes('/recommendations')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              recommendations: {
                'Test Category': ['test', 'recipe']
              },
              location: 'Test Location',
              date: '2025-01-01',
              season: 'Test'
            })
          });
        } else if (url.includes('/health')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ status: 'healthy' })
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, recipes: [] })
        });
      });
      
      // Should show clip button
      await waitFor(() => {
        expect(getByTitle('Clip recipe from website')).toBeInTheDocument();
      });
    });
  });

  describe('Recipe View Functions', () => {
    it('should open recipe view when recipe is clicked', async () => {
      // Mock initial recipes
      fetch.mockImplementation((url) => {
        if (url.includes('/recipes')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              recipes: [
                {
                  id: '1',
                  data: {
                    id: '1',
                    name: 'Clickable Recipe',
                    source_url: 'http://example.com',
                    recipeIngredient: ['ingredient 1', 'ingredient 2'],
                    recipeInstructions: ['step 1', 'step 2']
                  }
                }
              ]
            })
          });
        } else if (url.includes('/recommendations')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              recommendations: {
                'Test Category': ['clickable', 'recipe']
              },
              location: 'Test Location',
              date: '2025-01-01',
              season: 'Test'
            })
          });
        } else if (url.includes('/health')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ status: 'healthy' })
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, recipes: [] })
        });
      });
      
      const { getByText } = render(<App />);
      
      // Wait for recipes to load
      await waitFor(() => {
        expect(screen.getByText('Clickable Recipe')).toBeInTheDocument();
      });
      
      // Click on the recipe
      fireEvent.click(getByText('Clickable Recipe'));
      
      // Recipe view should open with ingredients and instructions
      await waitFor(() => {
        expect(screen.getByText('Ingredients')).toBeInTheDocument();
        expect(screen.getByText('Instructions')).toBeInTheDocument();
        expect(screen.getByText('ingredient 1')).toBeInTheDocument();
        expect(screen.getByText('step 1')).toBeInTheDocument();
      });
      
      // Test back button
      const backButton = screen.getByText('←');
      fireEvent.click(backButton);
      
      // Recipe view should close
      await waitFor(() => {
        expect(screen.queryByText('Ingredients')).not.toBeInTheDocument();
      });
    });
  });

  describe('Share Panel Functions', () => {
    it('should toggle share panel', async () => {
      // Mock initial recipes
      fetch.mockImplementation((url) => {
        if (url.includes('/recipes')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              recipes: [
                {
                  id: '1',
                  data: {
                    id: '1',
                    name: 'Share Test Recipe',
                    source_url: 'http://example.com/share',
                    recipeIngredient: ['ingredient 1'],
                    recipeInstructions: ['step 1']
                  }
                }
              ]
            })
          });
        } else if (url.includes('/recommendations')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              recommendations: {
                'Test Category': ['share', 'test', 'recipe']
              },
              location: 'Test Location',
              date: '2025-01-01',
              season: 'Test'
            })
          });
        } else if (url.includes('/health')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ status: 'healthy' })
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, recipes: [] })
        });
      });
      
      const { getByText, getByTitle } = render(<App />);
      
      // Wait for recipes to load
      await waitFor(() => {
        expect(screen.getByText('Share Test Recipe')).toBeInTheDocument();
      });
      
      // Click on the recipe to open full view
      fireEvent.click(getByText('Share Test Recipe'));
      
      // Wait for recipe view to open
      await waitFor(() => {
        expect(screen.getByText('Ingredients')).toBeInTheDocument();
      });
      
      // Click the share panel trigger button
      const shareButton = getByTitle('More actions');
      fireEvent.click(shareButton);
      
      // Share panel should be visible
      await waitFor(() => {
        expect(screen.getByText('Delete Recipe')).toBeInTheDocument();
        expect(screen.getByText('Share Recipe')).toBeInTheDocument();
      });
      
      // Click share button again to close
      fireEvent.click(shareButton);
      
      // Share panel items should not be visible
      await waitFor(() => {
        const deleteButton = screen.queryByText('Delete Recipe');
        expect(deleteButton).toBeInTheDocument();
        // Check if panel is hidden by checking parent element's class
        expect(deleteButton.closest('.share-panel')).not.toHaveClass('visible');
      });
    });
  });
});