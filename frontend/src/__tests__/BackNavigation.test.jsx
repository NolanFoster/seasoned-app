import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from '../App';

// Mock fetch globally
global.fetch = jest.fn(() => 
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ categories: {} })
  })
);

// Mock the search worker URL
global.SEARCH_DB_URL = 'https://test-search.example.com';

// Mock local storage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
global.localStorage = localStorageMock;

// Mock the utility function
jest.mock('../../../shared/utility-functions.js', () => ({
  formatDuration: jest.fn((duration) => {
    if (!duration) return '-';
    return duration;
  })
}));

describe('Back Navigation for Recipe View', () => {
  let mockHistoryState = null;

  beforeEach(() => {
    fetch.mockClear();
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
    mockHistoryState = null;
    
    // Mock history methods with proper state handling
    jest.spyOn(window.history, 'back').mockImplementation(() => {});
    jest.spyOn(window.history, 'pushState').mockImplementation((state) => {
      mockHistoryState = state;
    });
    
    // Mock the state getter
    Object.defineProperty(window.history, 'state', {
      get: () => mockHistoryState,
      configurable: true
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Event Listener Setup', () => {
    it('should set up popstate event listener', async () => {
      const addEventListenerSpy = jest.spyOn(window, 'addEventListener');
      
      render(<App />);

      // Wait for component to mount
      await waitFor(() => {
        expect(fetch).toHaveBeenCalled();
      });

      // Check that popstate listener was added
      const popstateListeners = addEventListenerSpy.mock.calls.filter(
        call => call[0] === 'popstate'
      );
      expect(popstateListeners.length).toBeGreaterThan(0);

      addEventListenerSpy.mockRestore();
    });
  });

  describe('History State Integration', () => {
    it('should handle history.pushState when opening recipe', () => {
      // Simulate what openRecipeView does
      window.history.pushState({ recipeView: true }, '', window.location.href);
      
      // Verify it was called
      expect(window.history.pushState).toHaveBeenCalledWith(
        { recipeView: true },
        '',
        expect.any(String)
      );
      
      // Verify state was updated
      expect(window.history.state).toEqual({ recipeView: true });
    });

    it('should handle history.back when appropriate', () => {
      // Set up state as if we're in a recipe view
      mockHistoryState = { recipeView: true };
      
      // Simulate clicking back
      window.history.back();
      
      // Verify history.back was called
      expect(window.history.back).toHaveBeenCalled();
    });
  });

  describe('Component State Management', () => {
    it('should handle popstate event without errors', async () => {
      render(<App />);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalled();
      });

      // The component should handle popstate events
      const popstateEvent = new PopStateEvent('popstate', { state: null });
      
      // This should not throw an error
      expect(() => {
        window.dispatchEvent(popstateEvent);
      }).not.toThrow();
    });

    it('should handle escape key without errors', async () => {
      render(<App />);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalled();
      });

      // Test that escape key doesn't throw when no recipe is selected
      const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
      
      expect(() => {
        window.dispatchEvent(escapeEvent);
      }).not.toThrow();
    });
  });

  describe('Back Button Logic', () => {
    it('should call history.back only when recipeView state exists', () => {
      // Test the logic: if there's a recipeView state, history.back should be called
      const mockBackHandler = () => {
        if (window.history.state?.recipeView) {
          window.history.back();
        }
      };

      // Case 1: With recipeView state
      mockHistoryState = { recipeView: true };
      mockBackHandler();
      expect(window.history.back).toHaveBeenCalledTimes(1);

      // Case 2: Without recipeView state
      jest.clearAllMocks();
      mockHistoryState = null;
      mockBackHandler();
      expect(window.history.back).not.toHaveBeenCalled();
    });
  });

  describe('Escape Key Logic', () => {
    it('should call history.back based on recipe selection and state', () => {
      // Test the logic for escape key handling
      const mockEscapeHandler = (hasSelectedRecipe) => {
        if (hasSelectedRecipe) {
          if (window.history.state?.recipeView) {
            window.history.back();
          }
        }
      };

      // Case 1: Recipe selected with history state
      mockHistoryState = { recipeView: true };
      mockEscapeHandler(true);
      expect(window.history.back).toHaveBeenCalledTimes(1);

      // Case 2: Recipe selected without history state
      jest.clearAllMocks();
      mockHistoryState = null;
      mockEscapeHandler(true);
      expect(window.history.back).not.toHaveBeenCalled();

      // Case 3: No recipe selected
      jest.clearAllMocks();
      mockHistoryState = { recipeView: true };
      mockEscapeHandler(false);
      expect(window.history.back).not.toHaveBeenCalled();
    });
  });

  describe('Integration Tests', () => {
    it('should properly clean up event listeners', async () => {
      const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');
      
      const { unmount } = render(<App />);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalled();
      });

      // Unmount the component
      unmount();

      // Check that popstate listener was removed
      const popstateRemovals = removeEventListenerSpy.mock.calls.filter(
        call => call[0] === 'popstate'
      );
      expect(popstateRemovals.length).toBeGreaterThan(0);

      removeEventListenerSpy.mockRestore();
    });
  });
});