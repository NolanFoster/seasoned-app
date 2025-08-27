import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

describe('Recommendations Component Comprehensive Tests', () => {
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

  describe('Initial Rendering and State', () => {
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
    it('handles geolocation permission granted', async () => {
      const mockPosition = {
        coords: {
          latitude: 37.7749,
          longitude: -122.4194
        }
      };

      mockGeolocation.getCurrentPosition.mockImplementation((resolve) => {
        resolve(mockPosition);
      });

      fetch.mockImplementation((url) => {
        if (url.includes('reverse-geocode-client')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              city: 'San Francisco',
              principalSubdivision: 'CA'
            })
          });
        }
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

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('reverse-geocode-client'),
          expect.any(Object)
        );
      });
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

    it('handles geolocation timeout', async () => {
      mockGeolocation.getCurrentPosition.mockImplementation((resolve, reject) => {
        const error = new Error('Timeout');
        error.code = 3;
        reject(error);
      });

      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);

      // Should show location prompt after timeout
      await waitFor(() => {
        expect(screen.getByText('Enable Location Access')).toBeInTheDocument();
      }, { timeout: 5000 });
    });

    it('handles geolocation not supported', () => {
      Object.defineProperty(global.navigator, 'geolocation', {
        value: undefined,
        writable: true
      });

      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);

      // Should show location prompt immediately
      expect(screen.getByText('Enable Location Access')).toBeInTheDocument();
    });
  });

  describe('Location Prompt and Input', () => {
    it('shows location prompt when needed', async () => {
      mockGeolocation.getCurrentPosition.mockImplementation((resolve, reject) => {
        const error = new Error('Permission denied');
        error.code = 1;
        reject(error);
      });

      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);

      await waitFor(() => {
        expect(screen.getByText('Enable Location Access')).toBeInTheDocument();
      }, { timeout: 5000 });
    });

    it('handles manual location input', async () => {
      const user = userEvent.setup();
      
      mockGeolocation.getCurrentPosition.mockImplementation((resolve, reject) => {
        const error = new Error('Permission denied');
        error.code = 1;
        reject(error);
      });

      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);

      await waitFor(() => {
        expect(screen.getByText('Enable Location Access')).toBeInTheDocument();
      }, { timeout: 5000 });

      const locationInput = screen.getByPlaceholderText(/Enter your city/);
      const setLocationButton = screen.getByText('Set Location');

      await user.type(locationInput, 'New York, NY');
      await user.click(setLocationButton);

      // Should handle manual location input
      expect(locationInput).toHaveValue('New York, NY');
    });

    it('handles GPS location request', async () => {
      const user = userEvent.setup();
      
      mockGeolocation.getCurrentPosition.mockImplementation((resolve, reject) => {
        const error = new Error('Permission denied');
        error.code = 1;
        reject(error);
      });

      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);

      await waitFor(() => {
        expect(screen.getByText('Enable Location Access')).toBeInTheDocument();
      }, { timeout: 5000 });

      const gpsButton = screen.getByText('Use GPS Location');
      await user.click(gpsButton);

      // Should handle GPS location request
      expect(mockGeolocation.getCurrentPosition).toHaveBeenCalled();
    });

    it('handles permission check button', async () => {
      const user = userEvent.setup();
      
      mockGeolocation.getCurrentPosition.mockImplementation((resolve, reject) => {
        const error = new Error('Permission denied');
        error.code = 1;
        reject(error);
      });

      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);

      await waitFor(() => {
        expect(screen.getByText('Enable Location Access')).toBeInTheDocument();
      }, { timeout: 5000 });

      const checkButton = screen.getByText('Check Permission & Get Location');
      await user.click(checkButton);

      // Should handle permission check
      expect(global.navigator.permissions.query).toHaveBeenCalled();
    });

    it('handles general recommendations option', async () => {
      const user = userEvent.setup();
      
      mockGeolocation.getCurrentPosition.mockImplementation((resolve, reject) => {
        const error = new Error('Permission denied');
        error.code = 1;
        reject(error);
      });

      fetch.mockImplementation((url) => {
        if (url.includes('/recommendations')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              recommendations: {
                'General Recipes': ['recipe 1', 'recipe 2']
              }
            })
          });
        }
        return Promise.resolve({ ok: false });
      });

      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);

      await waitFor(() => {
        expect(screen.getByText('Enable Location Access')).toBeInTheDocument();
      }, { timeout: 5000 });

      const generalButton = screen.getByText('Get General Recommendations');
      await user.click(generalButton);

      // Should fetch general recommendations
      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/recommendations'),
          expect.objectContaining({
            body: expect.stringContaining('"location":""')
          })
        );
      });
    });
  });

  describe('API Integration', () => {
    it('fetches recommendations with location', async () => {
      const mockPosition = {
        coords: {
          latitude: 37.7749,
          longitude: -122.4194
        }
      };

      mockGeolocation.getCurrentPosition.mockImplementation((resolve) => {
        resolve(mockPosition);
      });

      fetch.mockImplementation((url) => {
        if (url.includes('reverse-geocode-client')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              city: 'San Francisco',
              principalSubdivision: 'CA'
            })
          });
        }
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

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/recommendations'),
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              'Content-Type': 'application/json'
            })
          })
        );
      });
    });

    it('handles API errors gracefully', async () => {
      fetch.mockImplementation(() => Promise.reject(new Error('API Error')));

      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);

      // Should handle API errors gracefully
      await waitFor(() => {
        expect(screen.getByText('No Recipes Found')).toBeInTheDocument();
      }, { timeout: 5000 });
    });

    it('handles geocoding failures gracefully', async () => {
      const mockPosition = {
        coords: {
          latitude: 37.7749,
          longitude: -122.4194
        }
      };

      mockGeolocation.getCurrentPosition.mockImplementation((resolve) => {
        resolve(mockPosition);
      });

      fetch.mockImplementation((url) => {
        if (url.includes('reverse-geocode-client')) {
          return Promise.reject(new Error('Geocoding failed'));
        }
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

      // Should handle geocoding failures gracefully
      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/recommendations'),
          expect.any(Object)
        );
      });
    });
  });

  describe('State Management', () => {
    it('manages loading states correctly', () => {
      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);
      
      expect(screen.getByText('Resolving location permissions...')).toBeInTheDocument();
    });

    it('manages location state correctly', async () => {
      const user = userEvent.setup();
      
      mockGeolocation.getCurrentPosition.mockImplementation((resolve, reject) => {
        const error = new Error('Permission denied');
        error.code = 1;
        reject(error);
      });

      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);

      await waitFor(() => {
        expect(screen.getByText('Enable Location Access')).toBeInTheDocument();
      }, { timeout: 5000 });

      const locationInput = screen.getByPlaceholderText(/Enter your city/);
      await user.type(locationInput, 'Test City');

      expect(locationInput).toHaveValue('Test City');
    });

    it('manages error states correctly', async () => {
      fetch.mockImplementation(() => Promise.reject(new Error('Network error')));

      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);

      // Should show error state
      await waitFor(() => {
        expect(screen.getByText('No Recipes Found')).toBeInTheDocument();
      }, { timeout: 5000 });
    });
  });

  describe('User Interactions', () => {
    it('handles location prompt close', async () => {
      const user = userEvent.setup();
      
      mockGeolocation.getCurrentPosition.mockImplementation((resolve, reject) => {
        const error = new Error('Permission denied');
        error.code = 1;
        reject(error);
      });

      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);

      await waitFor(() => {
        expect(screen.getByText('Enable Location Access')).toBeInTheDocument();
      }, { timeout: 5000 });

      const skipButton = screen.getByText('Skip for Now');
      await user.click(skipButton);

      // Should close location prompt
      expect(screen.queryByText('Enable Location Access')).not.toBeInTheDocument();
    });

    it('handles location change button', async () => {
      const user = userEvent.setup();
      
      // Mock successful location
      const mockPosition = {
        coords: {
          latitude: 37.7749,
          longitude: -122.4194
        }
      };

      mockGeolocation.getCurrentPosition.mockImplementation((resolve) => {
        resolve(mockPosition);
      });

      fetch.mockImplementation((url) => {
        if (url.includes('reverse-geocode-client')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              city: 'San Francisco',
              principalSubdivision: 'CA'
            })
          });
        }
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

      // Wait for location to be set and location status to appear
      await waitFor(() => {
        expect(screen.getByText(/Location:/)).toBeInTheDocument();
      }, { timeout: 10000 });

      const changeButton = screen.getByText('Change');
      await user.click(changeButton);

      // Should show location prompt
      expect(screen.getByText('Enable Location Access')).toBeInTheDocument();
    });

    it('handles location clear button', async () => {
      const user = userEvent.setup();
      
      // Mock successful location
      const mockPosition = {
        coords: {
          latitude: 37.7749,
          longitude: -122.4194
        }
      };

      mockGeolocation.getCurrentPosition.mockImplementation((resolve) => {
        resolve(mockPosition);
      });

      fetch.mockImplementation((url) => {
        if (url.includes('reverse-geocode-client')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              city: 'San Francisco',
              principalSubdivision: 'CA'
            })
          });
        }
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

      // Wait for location to be set and location status to appear
      await waitFor(() => {
        expect(screen.getByText(/Location:/)).toBeInTheDocument();
      }, { timeout: 10000 });

      const clearButton = screen.getByText('Clear');
      await user.click(clearButton);

      // Should clear location and show enable button
      expect(screen.getByText('Enable Location for Better Recommendations')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles empty location input', async () => {
      const user = userEvent.setup();
      
      mockGeolocation.getCurrentPosition.mockImplementation((resolve, reject) => {
        const error = new Error('Permission denied');
        error.code = 1;
        reject(error);
      });

      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);

      await waitFor(() => {
        expect(screen.getByText('Enable Location Access')).toBeInTheDocument();
      }, { timeout: 5000 });

      const setLocationButton = screen.getByText('Set Location');
      await user.click(setLocationButton);

      // Should handle empty input gracefully
      expect(screen.getByText('Enable Location Access')).toBeInTheDocument();
    });

    it('handles very long location input', async () => {
      const user = userEvent.setup();
      
      mockGeolocation.getCurrentPosition.mockImplementation((resolve, reject) => {
        const error = new Error('Permission denied');
        error.code = 1;
        reject(error);
      });

      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);

      await waitFor(() => {
        expect(screen.getByText('Enable Location Access')).toBeInTheDocument();
      }, { timeout: 5000 });

      const locationInput = screen.getByPlaceholderText(/Enter your city/);
      const longLocation = 'a'.repeat(1000);
      await user.type(locationInput, longLocation);

      expect(locationInput).toHaveValue(longLocation);
    });

    it('handles special characters in location input', async () => {
      const user = userEvent.setup();
      
      mockGeolocation.getCurrentPosition.mockImplementation((resolve, reject) => {
        const error = new Error('Permission denied');
        error.code = 1;
        reject(error);
      });

      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);

      await waitFor(() => {
        expect(screen.getByText('Enable Location Access')).toBeInTheDocument();
      }, { timeout: 5000 });

      const locationInput = screen.getByPlaceholderText(/Enter your city/);
      await user.type(locationInput, 'Test City!@#$%^&*()');

      expect(locationInput).toHaveValue('Test City!@#$%^&*()');
    });
  });

  describe('Debug Tools (Development Only)', () => {
    it('shows debug tools in development mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      
      mockGeolocation.getCurrentPosition.mockImplementation((resolve, reject) => {
        const error = new Error('Permission denied');
        error.code = 1;
        reject(error);
      });

      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);

      await waitFor(() => {
        expect(screen.getByText('Enable Location Access')).toBeInTheDocument();
      }, { timeout: 5000 });

      // Debug tools should be visible in development mode
      expect(screen.getByText(/Debug Tools/)).toBeInTheDocument();
      expect(screen.getByText('Test Location API')).toBeInTheDocument();
      
      process.env.NODE_ENV = originalEnv;
    });

    it('tests location API functionality', async () => {
      const user = userEvent.setup();
      
      mockGeolocation.getCurrentPosition.mockImplementation((resolve, reject) => {
        const error = new Error('Permission denied');
        error.code = 1;
        reject(error);
      });

      fetch.mockImplementation((url) => {
        if (url.includes('/recommendations')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              recommendations: {
                'Test Category': ['test recipe']
              }
            })
          });
        }
        return Promise.resolve({ ok: false });
      });

      render(<Recommendations onRecipeSelect={mockOnRecipeSelect} />);

      await waitFor(() => {
        expect(screen.getByText('Enable Location Access')).toBeInTheDocument();
      }, { timeout: 5000 });

      const testButton = screen.getByText('Test Location API');
      await user.click(testButton);

      // Should test location API
      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/recommendations'),
          expect.any(Object)
        );
      });
    });
  });
});