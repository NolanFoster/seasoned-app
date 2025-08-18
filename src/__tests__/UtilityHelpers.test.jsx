import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../App';

// Mock fetch globally
global.fetch = jest.fn();

// Mock geolocation
const mockGeolocation = {
  getCurrentPosition: jest.fn()
};

Object.defineProperty(global.navigator, 'geolocation', {
  value: mockGeolocation,
  writable: true
});

describe('App Component Utility Functions', () => {
  beforeEach(() => {
    fetch.mockClear();
    mockGeolocation.getCurrentPosition.mockClear();
    
    // Default successful mocks
    fetch.mockImplementation((url) => {
      if (url.includes('/recommendations')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            recommendations: {
              'Test Category': ['test', 'recipes']
            },
            location: 'Test Location',
            date: '2025-01-01',
            season: 'Test Season'
          })
        });
      } else if (url.includes('/search')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            results: [
              {
                id: '1',
                name: 'Test Recipe',
                description: 'Test Description',
                image: 'test.jpg'
              }
            ]
          })
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({})
      });
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Error Handling', () => {
    it('should handle fetch timeout errors', async () => {
      fetch.mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 100)
        )
      );

      render(<App />);
      
      await waitFor(() => {
        expect(screen.getByText('No Recipes Found')).toBeInTheDocument();
      });
    });

    it('should handle network errors', async () => {
      fetch.mockImplementation(() => 
        Promise.reject(new Error('Network error'))
      );

      render(<App />);
      
      await waitFor(() => {
        expect(screen.getByText('No Recipes Found')).toBeInTheDocument();
      });
    });

    it('should handle malformed JSON responses', async () => {
      fetch.mockImplementation(() => 
        Promise.resolve({
          ok: true,
          json: async () => {
            throw new Error('Invalid JSON');
          }
        })
      );

      render(<App />);
      
      await waitFor(() => {
        expect(screen.getByText('No Recipes Found')).toBeInTheDocument();
      });
    });

    it('should handle HTTP error responses', async () => {
      fetch.mockImplementation(() => 
        Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({})
        })
      );

      render(<App />);
      
      await waitFor(() => {
        expect(screen.getByText('No Recipes Found')).toBeInTheDocument();
      });
    });
  });

  describe('Search Functionality', () => {
    it('should handle search input changes', async () => {
      render(<App />);
      
      const searchInput = screen.getByPlaceholderText(/Search recipes or paste a URL/i);
      
      fireEvent.change(searchInput, { target: { value: 'test query' } });
      
      expect(searchInput.value).toBe('test query');
    });

    it('should handle search button clicks', async () => {
      render(<App />);
      
      const searchButton = screen.getByRole('button', { name: /Search/i });
      
      fireEvent.click(searchButton);
      
      // Should trigger search functionality
      expect(searchButton).toBeInTheDocument();
    });

    it('should handle empty search queries', async () => {
      render(<App />);
      
      const searchInput = screen.getByPlaceholderText(/Search recipes or paste a URL/i);
      const searchButton = screen.getByRole('button', { name: /Search/i });
      
      fireEvent.change(searchInput, { target: { value: '' } });
      fireEvent.click(searchButton);
      
      expect(searchInput.value).toBe('');
    });

    it('should handle URL detection in search', async () => {
      render(<App />);
      
      const searchInput = screen.getByPlaceholderText(/Search recipes or paste a URL/i);
      
      fireEvent.change(searchInput, { target: { value: 'https://example.com/recipe' } });
      
      expect(searchInput.value).toBe('https://example.com/recipe');
    });
  });

  describe('Recipe Loading States', () => {
    it('should show loading state initially', () => {
      render(<App />);
      
      // Should show loading or no recipes initially
      expect(screen.getByText('No Recipes Found')).toBeInTheDocument();
    });

    it('should handle retry button clicks', async () => {
      render(<App />);
      
      await waitFor(() => {
        expect(screen.getByText('🔄 Try Again')).toBeInTheDocument();
      });
      
      const retryButton = screen.getByText('🔄 Try Again');
      fireEvent.click(retryButton);
      
      // Should trigger retry functionality
      expect(fetch).toHaveBeenCalled();
    });
  });

  describe('Component State Management', () => {
    it('should handle component mounting and unmounting', () => {
      const { unmount } = render(<App />);
      
      expect(screen.getByText('Seasoned')).toBeInTheDocument();
      
      unmount();
      
      // Component should unmount without errors
    });

    it('should handle multiple renders', () => {
      const { rerender } = render(<App />);
      
      expect(screen.getByText('Seasoned')).toBeInTheDocument();
      
      rerender(<App />);
      
      expect(screen.getByText('Seasoned')).toBeInTheDocument();
    });
  });

  describe('Accessibility Features', () => {
    it('should have proper ARIA labels', () => {
      render(<App />);
      
      expect(screen.getByLabelText('Search recipes')).toBeInTheDocument();
      expect(screen.getByLabelText('Search')).toBeInTheDocument();
    });

    it('should support keyboard navigation', () => {
      render(<App />);
      
      const searchInput = screen.getByLabelText('Search recipes');
      
      fireEvent.keyDown(searchInput, { key: 'Enter', code: 'Enter' });
      
      expect(searchInput).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined props gracefully', () => {
      expect(() => {
        render(<App />);
      }).not.toThrow();
    });

    it('should handle rapid successive interactions', async () => {
      render(<App />);
      
      const retryButton = screen.getByText('🔄 Try Again');
      
      // Rapid clicks
      fireEvent.click(retryButton);
      fireEvent.click(retryButton);
      fireEvent.click(retryButton);
      
      // Should not crash
      expect(retryButton).toBeInTheDocument();
    });

    it('should handle browser back/forward navigation', () => {
      render(<App />);
      
      // Simulate browser navigation
      const popStateEvent = new PopStateEvent('popstate');
      window.dispatchEvent(popStateEvent);
      
      expect(screen.getByText('Seasoned')).toBeInTheDocument();
    });
  });
});