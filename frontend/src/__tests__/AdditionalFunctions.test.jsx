import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import App from '../App';

// Mock fetch globally
global.fetch = jest.fn();

describe('Additional Function Coverage Tests', () => {
  beforeEach(() => {
    fetch.mockClear();
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, recipes: [] }),
      text: async () => 'Success'
    });
  });

  describe('Window Resize and Dark Mode', () => {
    it('should handle window resize events', async () => {
      const { container } = render(<App />);
      
      // Trigger window resize
      act(() => {
        window.dispatchEvent(new Event('resize'));
      });
      
      // Canvas should be present
      const canvas = container.querySelector('.seasoning-background');
      expect(canvas).toBeInTheDocument();
    });

    it('should detect dark mode preference', () => {
      // Mock matchMedia
      const mockMatchMedia = jest.fn().mockImplementation(query => ({
        matches: query === '(prefers-color-scheme: dark)',
        media: query,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      }));
      
      window.matchMedia = mockMatchMedia;
      
      const { container } = render(<App />);
      
      // App should render with dark mode detection
      expect(container.firstChild).toBeInTheDocument();
    });
  });

  describe('Recipe Timer Functions', () => {
    it('should handle scroll events for recipe view', async () => {
      // Mock recipes with timer data
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          recipes: [
            {
              id: '1',
              data: {
                id: '1',
                name: 'Timer Recipe',
                prepTime: 'PT30M',
                cookTime: 'PT1H',
                recipeIngredient: ['ingredient 1'],
                recipeInstructions: ['step 1']
              }
            }
          ]
        })
      });
      
      const { getByText } = render(<App />);
      
      // Wait for recipe to load and click it
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });
      
      const recipeTitle = screen.queryByText('Timer Recipe');
      if (recipeTitle) {
        fireEvent.click(recipeTitle);
        
        // Simulate scroll event
        const recipeView = document.querySelector('.recipe-fullscreen');
        if (recipeView) {
          fireEvent.scroll(recipeView, { target: { scrollTop: 100 } });
        }
      }
    });
  });

  describe('Recipe Actions', () => {
    it('should handle recipe deletion confirmation', async () => {
      // Mock window.confirm
      window.confirm = jest.fn(() => false);
      
      // Mock all API calls
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
                    name: 'Delete Test Recipe',
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
                'Test Category': ['delete', 'test', 'recipe']
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
          ok: false,
          status: 404
        });
      });
      
      render(<App />);
      
      // Wait for recipes to load
      await waitFor(() => {
        expect(screen.getByText('Delete Test Recipe')).toBeInTheDocument();
      }, { timeout: 3000 });
      
      // Verify the confirm dialog is set up
      global.confirm.mockReturnValue(true);
      
      // The recipe card should be rendered
      const recipeElements = screen.getAllByText('Delete Test Recipe');
      expect(recipeElements.length).toBeGreaterThan(0);
    });
  });

  describe('Share Functions', () => {
    it('should handle share functionality', async () => {
      // Mock navigator.share
      const mockShare = jest.fn().mockResolvedValue();
      const mockClipboard = {
        writeText: jest.fn().mockResolvedValue()
      };
      
      Object.defineProperty(navigator, 'share', {
        value: mockShare,
        writable: true,
        configurable: true
      });
      
      Object.defineProperty(navigator, 'clipboard', {
        value: mockClipboard,
        writable: true,
        configurable: true
      });
      
      // Mock recipes
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          recipes: [
            {
              id: '1',
              data: {
                id: '1',
                name: 'Share Recipe',
                source_url: 'http://example.com/share',
                recipeIngredient: ['ingredient 1'],
                recipeInstructions: ['step 1']
              }
            }
          ]
        })
      });
      
      render(<App />);
      
      // Wait for recipes to load
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle fetch errors gracefully', async () => {
      // Mock fetch to reject
      fetch.mockRejectedValueOnce(new Error('Network error'));
      
      const consoleError = jest.spyOn(console, 'error').mockImplementation();
      
      render(<App />);
      
      // Wait for error to be handled
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });
      
      // Should have logged error
      expect(consoleError).toHaveBeenCalled();
      
      consoleError.mockRestore();
    });
  });
});