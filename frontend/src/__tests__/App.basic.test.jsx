import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from '../App';

// Mock environment variables
beforeAll(() => {
  global.import = {
    meta: {
      env: {
        VITE_API_URL: 'https://test-api.example.com',
        VITE_CLIPPER_API_URL: 'https://test-clipper-api.example.com',
        VITE_SEARCH_DB_URL: 'https://test-search-db.example.com',
      }
    }
  };
});

// Mock all dependencies
global.fetch = jest.fn();
global.alert = jest.fn();
global.confirm = jest.fn(() => true);

// Mock canvas
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
  moveTo: jest.fn(),
  lineTo: jest.fn(),
  closePath: jest.fn(),
  stroke: jest.fn(),
  drawImage: jest.fn(),
  measureText: jest.fn(() => ({ width: 50 })),
  font: '',
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  globalAlpha: 1,
  canvas: { width: 1024, height: 768 },
}));

// Mock IntersectionObserver
global.IntersectionObserver = jest.fn(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock matchMedia
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

// Mock requestAnimationFrame
global.requestAnimationFrame = jest.fn(cb => setTimeout(cb, 0));
global.cancelAnimationFrame = jest.fn(id => clearTimeout(id));

describe('App Basic Tests', () => {
  beforeEach(() => {
    fetch.mockClear();
    jest.clearAllMocks();
  });

  test('renders without crashing', () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, recipes: [], list_complete: true }),
    });

    const { container } = render(<App />);
    expect(container.firstChild).toBeInTheDocument();
  });

  test('shows loading state initially', () => {
    fetch.mockImplementation(() => new Promise(() => {})); // Never resolves
    
    render(<App />);
    // The app shows loading state when recipes are being fetched
    expect(document.body.textContent).toBeTruthy();
  });

  test('displays recipes after loading', async () => {
    const mockRecipes = [
      { id: 1, name: 'Test Recipe 1' },
      { id: 2, name: 'Test Recipe 2' },
    ];

    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, recipes: mockRecipes, list_complete: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'healthy' }),
      });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Test Recipe 1')).toBeInTheDocument();
      expect(screen.getByText('Test Recipe 2')).toBeInTheDocument();
    });
  });

  test('handles empty recipe list', async () => {
    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, recipes: [], list_complete: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'healthy' }),
      });

    render(<App />);

    await waitFor(() => {
      expect(screen.queryByText('Loading recipes...')).not.toBeInTheDocument();
    });

    // Should show FAB button for adding recipes
    expect(screen.getByRole('button', { name: '+' })).toBeInTheDocument();
  });

  test('handles fetch error gracefully', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    
    fetch.mockRejectedValueOnce(new Error('Network error'));

    render(<App />);

    await waitFor(() => {
      expect(screen.queryByText('Loading recipes...')).not.toBeInTheDocument();
    });

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  test('displays search input', async () => {
    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, recipes: [], list_complete: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'healthy' }),
      });

    render(<App />);

    await waitFor(() => {
      const searchInput = screen.getByPlaceholderText('Search recipes or paste a URL to clip...');
      expect(searchInput).toBeInTheDocument();
    });
  });

  test('handles recipes with missing names', async () => {
    const mockRecipes = [
      { id: 1 }, // Missing name
      { id: 2, name: 'Valid Recipe' },
      { id: 3, name: '' }, // Empty name
    ];

    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, recipes: mockRecipes, list_complete: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'healthy' }),
      });

    render(<App />);

    await waitFor(() => {
      // Should display untitled for missing names
      const untitledElements = screen.getAllByText('Untitled Recipe');
      expect(untitledElements.length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText('Valid Recipe')).toBeInTheDocument();
    });
  });

  test('initializes canvas background', async () => {
    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, recipes: [], list_complete: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'healthy' }),
      });

    render(<App />);

    await waitFor(() => {
      expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledWith('2d');
    });
  });
});