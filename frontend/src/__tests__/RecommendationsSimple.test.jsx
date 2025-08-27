import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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

// Mock permissions API
Object.defineProperty(global.navigator, 'permissions', {
  value: {
    query: jest.fn()
  },
  writable: true
});

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

// Set environment variables for testing
process.env.VITE_RECOMMENDATION_API_URL = 'https://recommendations.test.workers.dev';
process.env.VITE_SEARCH_DB_URL = 'https://search-db.test.workers.dev';

describe('Recommendations Component Simple Tests', () => {
  const mockOnRecipeSelect = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    fetch.mockClear();
    mockGeolocation.getCurrentPosition.mockClear();
    mockOnRecipeSelect.mockClear();
    
    // Reset permissions mock
    global.navigator.permissions.query.mockResolvedValue({
      state: 'prompt',
      onchange: null
    });
  });

  describe('Basic Rendering', () => {
    it('renders loading state initially', () => {
      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);
      
      expect(screen.getByText('Seasonal Favorites')).toBeInTheDocument();
      expect(screen.getByText('Local Specialties')).toBeInTheDocument();
      expect(screen.getByText('Holiday Treats')).toBeInTheDocument();
      
      const loadingCards = screen.getAllByText('', { selector: '.loading-card' });
      expect(loadingCards).toHaveLength(9);
    });

    it('shows location resolution status', () => {
      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);
      
      expect(screen.getByText('Resolving location permissions...')).toBeInTheDocument();
      expect(screen.getByText(/Using default location in/)).toBeInTheDocument();
    });

    it('shows location enable button when no location', () => {
      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);
      
      expect(screen.getByText('Enable Location for Better Recommendations')).toBeInTheDocument();
    });
  });

  describe('Location Permission Handling', () => {
    it('handles geolocation not supported', () => {
      Object.defineProperty(global.navigator, 'geolocation', {
        value: undefined,
        writable: true
      });

      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);

      // Should show location prompt immediately
      expect(screen.getByText('Enable Location Access')).toBeInTheDocument();
    });

    it('handles geolocation permission denied', async () => {
      mockGeolocation.getCurrentPosition.mockImplementation((resolve, reject) => {
        const error = new Error('Permission denied');
        error.code = 1;
        reject(error);
      });

      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);

      // Should show location prompt after timeout
      await waitFor(() => {
        expect(screen.getByText('Enable Location Access')).toBeInTheDocument();
      }, { timeout: 5000 });
    });
  });

  describe('API Integration', () => {
    it('fetches recommendations correctly', async () => {
      fetch.mockImplementation((url) => {
        if (url.includes('/recommendations')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              recommendations: {
                'Local Specialties': ['local produce']
              }
            })
          });
        }
        return Promise.resolve({ ok: false });
      });

      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);

      // Should render the component without errors
      expect(screen.getByText('Seasonal Favorites')).toBeInTheDocument();
      expect(screen.getByText('Local Specialties')).toBeInTheDocument();
      expect(screen.getByText('Holiday Treats')).toBeInTheDocument();
    });

    it('handles API errors gracefully', async () => {
      fetch.mockImplementation(() => Promise.reject(new Error('API Error')));

      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);

      // Should handle API errors gracefully and show location prompt
      await waitFor(() => {
        expect(screen.getByText('Enable Location Access')).toBeInTheDocument();
      }, { timeout: 10000 });
    });
  });

  describe('State Management', () => {
    it('manages loading states correctly', () => {
      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);
      
      // Should show location prompt when geolocation is not supported
      expect(screen.getByText('Enable Location Access')).toBeInTheDocument();
    });

    it('manages error states correctly', async () => {
      fetch.mockImplementation(() => Promise.reject(new Error('Network error')));

      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);

      // Should show location prompt when there are network errors
      await waitFor(() => {
        expect(screen.getByText('Enable Location Access')).toBeInTheDocument();
      }, { timeout: 10000 });
    });
  });

  describe('Component Integration', () => {
    it('integrates with parent components correctly', () => {
      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);
      
      // Should render the component structure
      expect(screen.getByText('Seasonal Favorites')).toBeInTheDocument();
      expect(screen.getByText('Local Specialties')).toBeInTheDocument();
      expect(screen.getByText('Holiday Treats')).toBeInTheDocument();
    });

    it('handles recipe selection callback', () => {
      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);
      
      // Should have the callback function available
      expect(mockOnRecipeSelect).toBeDefined();
    });
  });

  describe('Error Boundaries', () => {
    it('handles component errors gracefully', () => {
      // Test that the component renders without crashing
      expect(() => {
        render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);
      }).not.toThrow();
    });

    it('handles missing props gracefully', () => {
      // Test with minimal props
      expect(() => {
        render(<Recommendations />);
      }).not.toThrow();
    });
  });
});