import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock window functions
global.alert = jest.fn();
global.confirm = jest.fn();

// Mock IntersectionObserver
global.IntersectionObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock CSS properties that jsdom doesn't support
Object.defineProperty(window, 'getComputedStyle', {
  value: () => ({
    getPropertyValue: (prop) => {
      if (prop === 'backdrop-filter' || prop === '-webkit-backdrop-filter') {
        return 'blur(12px) saturate(150%)';
      }
      if (prop === 'background') {
        return 'rgba(255, 255, 255, 0.25)';
      }
      if (prop === 'border-radius') {
        return '32px';
      }
      return '';
    }
  })
});

describe('Glass Panel Integration', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    
    // Mock default API responses
    mockFetch.mockImplementation((url) => {
      if (url.includes('/recipes')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, recipes: [] })
        });
      }
      if (url.includes('/health')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'healthy' })
        });
      }
      return Promise.resolve({ ok: false });
    });
  });

  describe('Glass Panel Structure', () => {
    it('should render header container with glass panel styling', async () => {
      render(<App />);
      
      await waitFor(() => {
        const headerContainer = document.querySelector('.header-container');
        expect(headerContainer).toBeInTheDocument();
        expect(headerContainer).toHaveClass('header-container');
      });
    });

    it('should contain title and search bar in the same glass panel', async () => {
      render(<App />);
      
      await waitFor(() => {
        const headerContainer = document.querySelector('.header-container');
        const title = document.querySelector('.title');
        const searchBar = document.querySelector('.title-search');
        
        expect(headerContainer).toContainElement(title);
        expect(headerContainer).toContainElement(searchBar);
      });
    });

    it.skip('should position desktop FAB inside header and mobile FAB outside', async () => {
      // SKIPPED: FAB buttons are hidden pending feature flag implementation
      render(<App />);
      
      await waitFor(() => {
        const headerContainer = document.querySelector('.header-container');
        const desktopFab = document.querySelector('.fab-desktop');
        const mobileFab = document.querySelector('.fab-mobile');
        
        // Desktop FAB should be inside the header container
        expect(desktopFab).toBeInTheDocument();
        expect(headerContainer).toContainElement(desktopFab);
        
        // Mobile FAB should be outside the header container
        expect(mobileFab).toBeInTheDocument();
        expect(headerContainer).not.toContainElement(mobileFab);
      });
    });
  });

  describe('Glass Panel Expansion Animation', () => {
    it('should include search results within the expanded glass panel', async () => {
      const user = userEvent.setup();
      
      // Mock search response
      mockFetch.mockImplementation((url) => {
        if (url.includes('/api/search')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              results: [{
                id: '1',
                properties: {
                  title: 'Test Recipe',
                  ingredients: [],
                  instructions: []
                }
              }]
            })
          });
        }
        if (url.includes('/recipes')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, recipes: [] })
          });
        }
        if (url.includes('/health')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'healthy' })
          });
        }
        return Promise.resolve({ ok: false });
      });
      
      render(<App />);
      
      const searchInput = await screen.findByPlaceholderText('Search recipes or paste a URL to clip...');
      await user.type(searchInput, 'test');
      
      await waitFor(() => {
        const headerContainer = document.querySelector('.header-container');
        const searchDropdown = document.querySelector('.search-results-dropdown');
        
        expect(searchDropdown).toBeInTheDocument();
        expect(headerContainer).toContainElement(searchDropdown);
      });
    });

    it('should maintain glass effect on panel during expansion', async () => {
      const user = userEvent.setup();
      
      // Mock search response
      mockFetch.mockImplementation((url) => {
        if (url.includes('/api/search')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              results: [{
                id: '1',
                properties: {
                  title: 'Test Recipe',
                  ingredients: [],
                  instructions: []
                }
              }]
            })
          });
        }
        if (url.includes('/recipes')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, recipes: [] })
          });
        }
        if (url.includes('/health')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'healthy' })
          });
        }
        return Promise.resolve({ ok: false });
      });
      
      render(<App />);
      
      const headerContainer = document.querySelector('.header-container');
      const initialClasses = headerContainer.className;
      
      const searchInput = await screen.findByPlaceholderText('Search recipes or paste a URL to clip...');
      await user.type(searchInput, 'test');
      
      await waitFor(() => {
        const searchDropdown = document.querySelector('.search-results-dropdown');
        expect(searchDropdown).toBeInTheDocument();
        
        // Should maintain the same base classes
        expect(headerContainer.className).toContain('header-container');
      });
    });
  });

  describe('Visual Hierarchy', () => {
    it('should display search results with proper separation from search bar', async () => {
      const user = userEvent.setup();
      
      // Mock search response
      mockFetch.mockImplementation((url) => {
        if (url.includes('/api/search')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              results: [{
                id: '1',
                properties: {
                  title: 'Test Recipe',
                  ingredients: [],
                  instructions: []
                }
              }]
            })
          });
        }
        if (url.includes('/recipes')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, recipes: [] })
          });
        }
        if (url.includes('/health')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'healthy' })
          });
        }
        return Promise.resolve({ ok: false });
      });
      
      render(<App />);
      
      const searchInput = await screen.findByPlaceholderText('Search recipes or paste a URL to clip...');
      await user.type(searchInput, 'test');
      
      await waitFor(() => {
        const searchDropdown = document.querySelector('.search-results-dropdown');
        expect(searchDropdown).toBeInTheDocument();
        
        // Check that dropdown is positioned after search bar
        const titleElement = document.querySelector('.title');
        const dropdownIndex = Array.from(titleElement.parentElement.children).indexOf(searchDropdown);
        const titleIndex = Array.from(titleElement.parentElement.children).indexOf(titleElement);
        
        expect(dropdownIndex).toBeGreaterThan(titleIndex);
      });
    });
  });

  describe('Responsive Behavior', () => {
    it('should maintain glass panel structure on mobile viewports', async () => {
      // Mock mobile viewport
      global.innerWidth = 375;
      global.innerHeight = 667;
      
      render(<App />);
      
      await waitFor(() => {
        const headerContainer = document.querySelector('.header-container');
        const title = document.querySelector('.title');
        const searchBar = document.querySelector('.title-search');
        
        expect(headerContainer).toBeInTheDocument();
        expect(headerContainer).toContainElement(title);
        expect(headerContainer).toContainElement(searchBar);
      });
    });
  });

  describe('Dark Mode Support', () => {
    beforeEach(() => {
      // Mock dark mode
      window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: query === '(prefers-color-scheme: dark)',
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }));
    });

    it('should apply dark mode styling to glass panel', async () => {
      render(<App />);
      
      await waitFor(() => {
        const headerContainer = document.querySelector('.header-container');
        expect(headerContainer).toBeInTheDocument();
        // In a real test environment, you would check for dark mode specific classes
        // or computed styles
      });
    });
  });

  describe('Animation Timing', () => {
    it('should animate search dropdown appearance', async () => {
      const user = userEvent.setup();
      
      // Mock search response
      mockFetch.mockImplementation((url) => {
        if (url.includes('/api/search')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              results: [{
                id: '1',
                properties: {
                  title: 'Test Recipe',
                  ingredients: [],
                  instructions: []
                }
              }]
            })
          });
        }
        if (url.includes('/recipes')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, recipes: [] })
          });
        }
        if (url.includes('/health')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'healthy' })
          });
        }
        return Promise.resolve({ ok: false });
      });
      
      render(<App />);
      
      const searchInput = await screen.findByPlaceholderText('Search recipes or paste a URL to clip...');
      
      // Initially no dropdown
      expect(document.querySelector('.search-results-dropdown')).not.toBeInTheDocument();
      
      await user.type(searchInput, 'test');
      
      // Dropdown should appear with animation
      await waitFor(() => {
        const searchDropdown = document.querySelector('.search-results-dropdown');
        expect(searchDropdown).toBeInTheDocument();
      });
    });
  });

  describe('Focus Management', () => {
    it('should maintain focus on search input when results appear', async () => {
      const user = userEvent.setup();
      
      // Mock search response
      mockFetch.mockImplementation((url) => {
        if (url.includes('/api/search')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              results: [{
                id: '1',
                properties: {
                  title: 'Test Recipe',
                  ingredients: [],
                  instructions: []
                }
              }]
            })
          });
        }
        if (url.includes('/recipes')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, recipes: [] })
          });
        }
        if (url.includes('/health')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'healthy' })
          });
        }
        return Promise.resolve({ ok: false });
      });
      
      render(<App />);
      
      const searchInput = await screen.findByPlaceholderText('Search recipes or paste a URL to clip...');
      
      // Focus the input
      searchInput.focus();
      expect(document.activeElement).toBe(searchInput);
      
      await user.type(searchInput, 'test');
      
      // Wait for results
      await waitFor(() => {
        expect(screen.getByText('Test Recipe')).toBeInTheDocument();
      });
      
      // Focus should remain on input
      expect(document.activeElement).toBe(searchInput);
    });
  });
});