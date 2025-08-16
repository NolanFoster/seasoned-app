import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from '../App';

// Import the App component and manually test the exported functions
// to boost coverage

// Mock everything to prevent errors
global.fetch = jest.fn(() => 
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ recipes: [] }),
  })
);

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
  drawImage: jest.fn(),
  canvas: { width: 100, height: 100 },
}));

global.IntersectionObserver = jest.fn(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

global.matchMedia = jest.fn(() => ({
  matches: false,
  media: '',
  onchange: null,
  addListener: jest.fn(),
  removeListener: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  dispatchEvent: jest.fn(),
}));

global.requestAnimationFrame = jest.fn(cb => setTimeout(cb, 0));
global.cancelAnimationFrame = jest.fn();
global.alert = jest.fn();
global.confirm = jest.fn(() => true);

describe('App Simple Coverage Tests', () => {
  test('renders and covers major code paths', async () => {
    // Multiple renders with different states to cover more branches
    const { rerender } = render(<App />);
    
    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('Seasoned')).toBeInTheDocument();
    });

    // Re-render with different window sizes to trigger resize handlers
    global.innerWidth = 500;
    global.dispatchEvent(new Event('resize'));
    
    // Re-render to trigger different effects
    rerender(<App />);
    
    // Trigger scroll events
    global.dispatchEvent(new Event('scroll'));
    
    // Mock different fetch responses for different code paths
    fetch.mockImplementationOnce(() => 
      Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Not found' }),
      })
    );
    
    rerender(<App />);
    
    // Mock recipes with various data formats
    fetch.mockImplementationOnce(() => 
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ 
          recipes: [
            { id: 1, name: 'Recipe 1', prep_time: 'PT30M', cook_time: 'PT45M' },
            { id: 2, name: 'Recipe 2', ingredients: ['a', 'b'], instructions: ['1', '2'] },
            { id: 3, name: 'Recipe 3', video_url: 'https://youtube.com/watch?v=123' },
            { id: 4, name: null }, // Invalid recipe
            { id: 5 }, // Missing name
          ]
        }),
      })
    );
    
    rerender(<App />);
    
    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });
  });

  test('covers dark mode paths', async () => {
    // Test with dark mode preference
    global.matchMedia = jest.fn(() => ({
      matches: true,
      media: '(prefers-color-scheme: dark)',
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }));
    
    render(<App />);
    
    await waitFor(() => {
      expect(screen.getByText('Seasoned')).toBeInTheDocument();
    });
  });

  test('covers error paths', async () => {
    // Test network error
    fetch.mockRejectedValueOnce(new Error('Network error'));
    
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    
    render(<App />);
    
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled();
    });
    
    consoleSpy.mockRestore();
  });

  test('covers clipper health check', async () => {
    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ recipes: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'healthy' }),
      });
    
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    
    render(<App />);
    
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Clipper worker health:', expect.any(Object));
    });
    
    consoleSpy.mockRestore();
  });

  test('covers invalid response handling', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ invalid: 'data' }), // No recipes array
    });
    
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    
    render(<App />);
    
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Invalid response format from KV worker:', expect.any(Object));
    });
    
    consoleSpy.mockRestore();
  });

  test('covers recipe transformation', async () => {
    const complexRecipes = [
      {
        id: 1,
        name: 'Complex Recipe',
        recipeIngredient: ['ing1', { text: 'ing2' }, { name: 'ing3' }],
        recipeInstructions: ['inst1', { text: 'inst2' }, { name: 'inst3' }],
        image: { url: 'http://example.com/image1.jpg' },
        aggregateRating: { ratingValue: 4.5 },
        nutrition: { calories: '200' },
      },
      {
        id: 2,
        name: 'Another Recipe',
        image: 'http://example.com/image2.jpg',
        video: { contentUrl: 'http://youtube.com/video' },
      },
    ];
    
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ recipes: complexRecipes }),
    });
    
    render(<App />);
    
    await waitFor(() => {
      expect(screen.getByText('Complex Recipe')).toBeInTheDocument();
    });
  });
});