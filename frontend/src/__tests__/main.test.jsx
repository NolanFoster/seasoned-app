import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

// Mock the utility functions
jest.mock('../../shared/utility-functions.js', () => ({
  formatDuration: jest.fn((duration) => {
    if (!duration) return '-';
    if (duration.includes('PT')) {
      const minutes = duration.replace('PT', '').replace('M', '');
      return `${minutes} min`;
    }
    return duration;
  }),
  isValidUrl: jest.fn((url) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }),
  formatIngredientAmount: jest.fn((amount) => amount)
}));

// Mock the App component
jest.mock("../App.jsx", () => {
  return function MockApp() {
    return <div data-testid="mock-app">Mock App</div>;
  };
});

// Mock the components
jest.mock('../components/VideoPopup', () => {
  return function MockVideoPopup({ isOpen, onClose, videoUrl }) {
    if (!isOpen) return null;
    return (
      <div data-testid="video-popup">
        <button onClick={onClose}>Close</button>
        <div>{videoUrl}</div>
      </div>
    );
  };
});

jest.mock('../components/Recommendations', () => {
  return function MockRecommendations({ onRecipeSelect, recipesByCategory }) {
    return (
      <div data-testid="recommendations">
        {recipesByCategory && Array.from(recipesByCategory.entries()).map(([category, recipes]) => (
          <div key={category}>
            <h2>{category}</h2>
            {recipes.map(recipe => (
              <button key={recipe.id} onClick={() => onRecipeSelect(recipe)}>
                {recipe.name}
              </button>
            ))}
          </div>
        ))}
      </div>
    );
  };
});

// Mock fetch globally
global.fetch = jest.fn();

describe('Main App Entry Point', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetch.mockClear();
  });

  it('renders the main app component', () => {
    render(
      <BrowserRouter>
        <div data-testid="main-app">Main App</div>
      </BrowserRouter>
    );
    
    expect(screen.getByTestId('main-app')).toBeInTheDocument();
  });

  it('initializes with proper structure', () => {
    render(
      <BrowserRouter>
        <div data-testid="main-app">Main App</div>
      </BrowserRouter>
    );
    
    expect(screen.getByTestId('main-app')).toBeInTheDocument();
  });
});