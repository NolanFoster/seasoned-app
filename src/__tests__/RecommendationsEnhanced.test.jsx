import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Recommendations from '../components/Recommendations';

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

describe('Recommendations Enhanced Tests', () => {
  const mockOnRecipeSelect = jest.fn();

  beforeEach(() => {
    fetch.mockClear();
    mockGeolocation.getCurrentPosition.mockClear();
    mockOnRecipeSelect.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Props Handling', () => {
    it('should render with recipesByCategory prop', () => {
      const mockRecipesByCategory = new Map([
        ['Test Category', [
          { id: '1', name: 'Test Recipe 1', description: 'Test description' },
          { id: '2', name: 'Test Recipe 2', description: 'Another test' }
        ]]
      ]);

      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} recipesByCategory={mockRecipesByCategory} />);
      
      expect(screen.getByText('Test Category')).toBeInTheDocument();
    });

    it('should render without recipesByCategory prop', () => {
      fetch.mockImplementation(() => 
        Promise.resolve({
          ok: true,
          json: async () => ({
            recommendations: {
              'Fetched Category': ['test', 'tags']
            },
            location: 'Test Location',
            date: '2025-01-01',
            season: 'Test'
          })
        })
      );

      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);
      
      expect(screen.getByText('Seasonal Favorites')).toBeInTheDocument();
    });

    it('should handle empty recipesByCategory', () => {
      const emptyRecipesByCategory = new Map();

      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} recipesByCategory={emptyRecipesByCategory} />);
      
      // Should fall back to fetching recommendations
      expect(screen.getByText('Seasonal Favorites')).toBeInTheDocument();
    });

    it('should handle null recipesByCategory', () => {
      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} recipesByCategory={null} />);
      
      expect(screen.getByText('Seasonal Favorites')).toBeInTheDocument();
    });
  });

  describe('Geolocation Handling', () => {
    it('should handle successful geolocation', async () => {
      mockGeolocation.getCurrentPosition.mockImplementation((success) => {
        success({
          coords: {
            latitude: 37.7749,
            longitude: -122.4194
          }
        });
      });

      fetch.mockImplementation(() => 
        Promise.resolve({
          ok: true,
          json: async () => ({
            recommendations: {
              'Location Category': ['local', 'recipes']
            },
            location: 'San Francisco, CA',
            date: '2025-01-01'
          })
        })
      );

      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);
      
      await waitFor(() => {
        expect(screen.getByText('Seasonal Favorites')).toBeInTheDocument();
      });
    });

    it('should handle geolocation timeout', async () => {
      mockGeolocation.getCurrentPosition.mockImplementation((success, error) => {
        error({ code: 3, message: 'Timeout' });
      });

      fetch.mockImplementation(() => 
        Promise.resolve({
          ok: true,
          json: async () => ({
            recommendations: {
              'Default Category': ['default', 'recipes']
            },
            location: 'San Francisco, CA',
            date: '2025-01-01'
          })
        })
      );

      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);
      
      await waitFor(() => {
        expect(screen.getByText('Seasonal Favorites')).toBeInTheDocument();
      });
    });

    it('should handle geolocation permission denied', async () => {
      mockGeolocation.getCurrentPosition.mockImplementation((success, error) => {
        error({ code: 1, message: 'User denied location' });
      });

      fetch.mockImplementation(() => 
        Promise.resolve({
          ok: true,
          json: async () => ({
            recommendations: {
              'Permission Denied Category': ['fallback', 'recipes']
            },
            location: 'San Francisco, CA',
            date: '2025-01-01'
          })
        })
      );

      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);
      
      await waitFor(() => {
        expect(screen.getByText('Seasonal Favorites')).toBeInTheDocument();
      });
    });

    it('should handle missing geolocation API', async () => {
      const originalGeolocation = global.navigator.geolocation;
      delete global.navigator.geolocation;

      fetch.mockImplementation(() => 
        Promise.resolve({
          ok: true,
          json: async () => ({
            recommendations: {
              'No Geolocation Category': ['basic', 'recipes']
            },
            location: 'San Francisco, CA',
            date: '2025-01-01'
          })
        })
      );

      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);
      
      await waitFor(() => {
        expect(screen.getByText('Seasonal Favorites')).toBeInTheDocument();
      });

      global.navigator.geolocation = originalGeolocation;
    });
  });

  describe('API Error Handling', () => {
    it('should handle recommendation API errors', async () => {
      fetch.mockImplementation(() => 
        Promise.resolve({
          ok: false,
          status: 500
        })
      );

      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);
      
      await waitFor(() => {
        expect(screen.getByText('Seasonal Favorites')).toBeInTheDocument();
      });
    });

    it('should handle search API errors', async () => {
      fetch.mockImplementation((url) => {
        if (url.includes('/recommendations')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              recommendations: {
                'Test Category': ['test', 'tags']
              }
            })
          });
        } else if (url.includes('/search')) {
          return Promise.resolve({
            ok: false,
            status: 404
          });
        }
        return Promise.resolve({ ok: false });
      });

      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);
      
      await waitFor(() => {
        expect(screen.getByText('Seasonal Favorites')).toBeInTheDocument();
      });
    });

    it('should handle network errors', async () => {
      fetch.mockImplementation(() => 
        Promise.reject(new Error('Network error'))
      );

      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);
      
      await waitFor(() => {
        expect(screen.getByText('Seasonal Favorites')).toBeInTheDocument();
      });
    });

    it('should handle JSON parsing errors', async () => {
      fetch.mockImplementation(() => 
        Promise.resolve({
          ok: true,
          json: async () => {
            throw new Error('Invalid JSON');
          }
        })
      );

      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);
      
      await waitFor(() => {
        expect(screen.getByText('Seasonal Favorites')).toBeInTheDocument();
      });
    });
  });

  describe('Data Processing', () => {
    it('should handle malformed recommendation data', async () => {
      fetch.mockImplementation(() => 
        Promise.resolve({
          ok: true,
          json: async () => ({
            recommendations: null
          })
        })
      );

      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);
      
      await waitFor(() => {
        expect(screen.getByText('Seasonal Favorites')).toBeInTheDocument();
      });
    });

    it('should handle empty recommendation data', async () => {
      fetch.mockImplementation(() => 
        Promise.resolve({
          ok: true,
          json: async () => ({
            recommendations: {}
          })
        })
      );

      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);
      
      await waitFor(() => {
        expect(screen.getByText('Seasonal Favorites')).toBeInTheDocument();
      });
    });

    it('should handle non-array tag values', async () => {
      fetch.mockImplementation(() => 
        Promise.resolve({
          ok: true,
          json: async () => ({
            recommendations: {
              'Invalid Tags': 'not-an-array',
              'Valid Tags': ['valid', 'tags']
            }
          })
        })
      );

      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);
      
      await waitFor(() => {
        expect(screen.getByText('Seasonal Favorites')).toBeInTheDocument();
      });
    });

    it('should handle mixed valid and invalid data', async () => {
      fetch.mockImplementation((url) => {
        if (url.includes('/recommendations')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              recommendations: {
                'Valid Category': ['valid', 'tags'],
                'Invalid Category': null,
                'Empty Category': []
              }
            })
          });
        } else if (url.includes('/search')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              results: [
                { id: '1', name: 'Valid Recipe', description: 'Valid' },
                null,
                { id: '2' }, // Missing name
                { name: 'No ID Recipe' } // Missing ID
              ]
            })
          });
        }
        return Promise.resolve({ ok: false });
      });

      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);
      
      await waitFor(() => {
        expect(screen.getByText('Seasonal Favorites')).toBeInTheDocument();
      });
    });
  });

  describe('Loading States', () => {
    it('should show loading categories initially', () => {
      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);
      
      expect(screen.getByText('Seasonal Favorites')).toBeInTheDocument();
      expect(screen.getByText('Local Specialties')).toBeInTheDocument();
      expect(screen.getByText('Holiday Treats')).toBeInTheDocument();
    });

    it('should handle long loading times', async () => {
      fetch.mockImplementation(() => 
        new Promise(resolve => 
          setTimeout(() => resolve({
            ok: true,
            json: async () => ({
              recommendations: {
                'Slow Category': ['slow', 'loading']
              }
            })
          }), 2000)
        )
      );

      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);
      
      expect(screen.getByText('Seasonal Favorites')).toBeInTheDocument();
    });
  });

  describe('Recipe Selection', () => {
    it('should handle recipe selection with full recipe data', async () => {
      const mockRecipesByCategory = new Map([
        ['Test Category', [
          { 
            id: '1', 
            name: 'Full Recipe', 
            description: 'Complete recipe',
            image: 'test.jpg',
            ingredients: ['ingredient1', 'ingredient2'],
            instructions: ['step1', 'step2'],
            prep_time: 'PT15M',
            cook_time: 'PT30M'
          }
        ]]
      ]);

      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} recipesByCategory={mockRecipesByCategory} />);
      
      const recipeCard = screen.getByText('Full Recipe').closest('.recipe-card');
      fireEvent.click(recipeCard);
      
      expect(mockOnRecipeSelect).toHaveBeenCalledWith(expect.objectContaining({
        id: '1',
        name: 'Full Recipe'
      }));
    });

    it('should handle recipe selection with minimal data', async () => {
      const mockRecipesByCategory = new Map([
        ['Test Category', [
          { id: '1', name: 'Minimal Recipe' }
        ]]
      ]);

      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} recipesByCategory={mockRecipesByCategory} />);
      
      const recipeCard = screen.getByText('Minimal Recipe').closest('.recipe-card');
      fireEvent.click(recipeCard);
      
      expect(mockOnRecipeSelect).toHaveBeenCalledWith(expect.objectContaining({
        id: '1',
        name: 'Minimal Recipe'
      }));
    });
  });
});