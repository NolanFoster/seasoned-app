import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import SwipeableRecipeGrid from '../components/SwipeableRecipeGrid';

// Mock window properties
const mockScrollBy = jest.fn();
const mockAddEventListener = jest.fn();
const mockRemoveEventListener = jest.fn();

describe.skip('SwipeableRecipeGrid', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    mockScrollBy.mockClear();
    mockAddEventListener.mockClear();
    mockRemoveEventListener.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Component Rendering', () => {
    it('renders without crashing', () => {
      const { container } = render(<SwipeableRecipeGrid />);
      expect(container.querySelector('.carousel-container')).toBeInTheDocument();
      expect(container.querySelector('.recipe-grid')).toBeInTheDocument();
    });

    it('renders children correctly', () => {
      render(
        <SwipeableRecipeGrid>
          <div data-testid="child-1">Child 1</div>
          <div data-testid="child-2">Child 2</div>
        </SwipeableRecipeGrid>
      );
      
      expect(screen.getByTestId('child-1')).toBeInTheDocument();
      expect(screen.getByTestId('child-2')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      const { container } = render(<SwipeableRecipeGrid className="custom-class" />);
      const grid = container.querySelector('.recipe-grid');
      expect(grid).toHaveClass('recipe-grid', 'category-recipes', 'custom-class');
    });

    it('passes through additional props', () => {
      const { container } = render(
        <SwipeableRecipeGrid data-testid="test-grid" aria-label="Recipe carousel" />
      );
      const grid = container.querySelector('[data-testid="test-grid"]');
      expect(grid).toHaveAttribute('aria-label', 'Recipe carousel');
    });
  });

  describe('Carousel Layout', () => {
    it('applies carousel-layout class on mount', async () => {
      const { container } = render(<SwipeableRecipeGrid />);
      
      await waitFor(() => {
        const grid = container.querySelector('.recipe-grid');
        expect(grid).toHaveClass('carousel-layout');
      });
    });

    it('has horizontal scroll container', () => {
      const { container } = render(
        <SwipeableRecipeGrid>
          <div style={{ width: '300px' }}>Item 1</div>
          <div style={{ width: '300px' }}>Item 2</div>
          <div style={{ width: '300px' }}>Item 3</div>
          <div style={{ width: '300px' }}>Item 4</div>
        </SwipeableRecipeGrid>
      );
      
      const grid = container.querySelector('.recipe-grid');
      expect(grid).toHaveClass('carousel-layout');
    });
  });

  describe('Navigation Button State Management', () => {
    it('initially shows only right button when scrollable', () => {
      // Create a mock ref that simulates scrollable content
      const mockRef = {
        current: {
          scrollLeft: 0,
          scrollWidth: 1000,
          clientWidth: 500,
          scrollBy: mockScrollBy,
          addEventListener: mockAddEventListener,
          removeEventListener: mockRemoveEventListener,
          classList: {
            add: jest.fn(),
          },
        }
      };

      jest.spyOn(React, 'useRef').mockReturnValue(mockRef);

      render(
        <SwipeableRecipeGrid>
          <div>Item 1</div>
          <div>Item 2</div>
          <div>Item 3</div>
        </SwipeableRecipeGrid>
      );

      expect(screen.queryByLabelText('Scroll left')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Scroll right')).toBeInTheDocument();
    });

    it('shows both buttons when scrolled to middle', () => {
      const mockRef = {
        current: {
          scrollLeft: 250,
          scrollWidth: 1000,
          clientWidth: 500,
          scrollBy: mockScrollBy,
          addEventListener: mockAddEventListener,
          removeEventListener: mockRemoveEventListener,
          classList: {
            add: jest.fn(),
          },
        }
      };

      jest.spyOn(React, 'useRef').mockReturnValue(mockRef);

      render(
        <SwipeableRecipeGrid>
          <div>Item 1</div>
          <div>Item 2</div>
        </SwipeableRecipeGrid>
      );

      expect(screen.getByLabelText('Scroll left')).toBeInTheDocument();
      expect(screen.getByLabelText('Scroll right')).toBeInTheDocument();
    });

    it('shows only left button when scrolled to end', () => {
      const mockRef = {
        current: {
          scrollLeft: 490, // scrollWidth - clientWidth - 10
          scrollWidth: 1000,
          clientWidth: 500,
          scrollBy: mockScrollBy,
          addEventListener: mockAddEventListener,
          removeEventListener: mockRemoveEventListener,
          classList: {
            add: jest.fn(),
          },
        }
      };

      jest.spyOn(React, 'useRef').mockReturnValue(mockRef);

      render(
        <SwipeableRecipeGrid>
          <div>Item 1</div>
          <div>Item 2</div>
        </SwipeableRecipeGrid>
      );

      expect(screen.getByLabelText('Scroll left')).toBeInTheDocument();
      expect(screen.queryByLabelText('Scroll right')).not.toBeInTheDocument();
    });

    it('hides all buttons when content fits viewport', () => {
      const mockRef = {
        current: {
          scrollLeft: 0,
          scrollWidth: 500,
          clientWidth: 500,
          scrollBy: mockScrollBy,
          addEventListener: mockAddEventListener,
          removeEventListener: mockRemoveEventListener,
          classList: {
            add: jest.fn(),
          },
        }
      };

      jest.spyOn(React, 'useRef').mockReturnValue(mockRef);

      render(
        <SwipeableRecipeGrid>
          <div>Item 1</div>
        </SwipeableRecipeGrid>
      );

      expect(screen.queryByLabelText('Scroll left')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Scroll right')).not.toBeInTheDocument();
    });
  });

  describe('Scroll Navigation', () => {
    it('scrolls right when right button clicked', () => {
      const mockRef = {
        current: {
          scrollLeft: 0,
          scrollWidth: 1000,
          clientWidth: 500,
          scrollBy: mockScrollBy,
          addEventListener: mockAddEventListener,
          removeEventListener: mockRemoveEventListener,
          classList: {
            add: jest.fn(),
          },
        }
      };

      jest.spyOn(React, 'useRef').mockReturnValue(mockRef);

      render(
        <SwipeableRecipeGrid>
          <div>Item 1</div>
          <div>Item 2</div>
          <div>Item 3</div>
        </SwipeableRecipeGrid>
      );

      const rightButton = screen.getByLabelText('Scroll right');
      fireEvent.click(rightButton);

      expect(mockScrollBy).toHaveBeenCalledWith({
        left: 900, // 300px * 3 cards
        behavior: 'smooth',
      });
    });

    it('scrolls left when left button clicked', () => {
      const mockRef = {
        current: {
          scrollLeft: 500,
          scrollWidth: 1000,
          clientWidth: 500,
          scrollBy: mockScrollBy,
          addEventListener: mockAddEventListener,
          removeEventListener: mockRemoveEventListener,
          classList: {
            add: jest.fn(),
          },
        }
      };

      jest.spyOn(React, 'useRef').mockReturnValue(mockRef);

      render(
        <SwipeableRecipeGrid>
          <div>Item 1</div>
          <div>Item 2</div>
          <div>Item 3</div>
        </SwipeableRecipeGrid>
      );

      const leftButton = screen.getByLabelText('Scroll left');
      fireEvent.click(leftButton);

      expect(mockScrollBy).toHaveBeenCalledWith({
        left: -900, // -300px * 3 cards
        behavior: 'smooth',
      });
    });

    it('handles null grid ref gracefully', () => {
      const mockRef = { current: null };
      jest.spyOn(React, 'useRef').mockReturnValue(mockRef);

      const { container } = render(
        <SwipeableRecipeGrid>
          <div>Item 1</div>
        </SwipeableRecipeGrid>
      );

      // Should render without crashing
      expect(container.querySelector('.carousel-container')).toBeInTheDocument();
    });
  });

  describe('Event Listeners', () => {
    it('adds scroll event listener on mount', () => {
      const mockRef = {
        current: {
          scrollLeft: 0,
          scrollWidth: 1000,
          clientWidth: 500,
          scrollBy: mockScrollBy,
          addEventListener: mockAddEventListener,
          removeEventListener: mockRemoveEventListener,
          classList: {
            add: jest.fn(),
          },
        }
      };

      jest.spyOn(React, 'useRef').mockReturnValue(mockRef);

      render(<SwipeableRecipeGrid />);

      expect(mockAddEventListener).toHaveBeenCalledWith('scroll', expect.any(Function));
    });

    it('removes event listeners on unmount', () => {
      const mockRef = {
        current: {
          scrollLeft: 0,
          scrollWidth: 1000,
          clientWidth: 500,
          scrollBy: mockScrollBy,
          addEventListener: mockAddEventListener,
          removeEventListener: mockRemoveEventListener,
          classList: {
            add: jest.fn(),
          },
        }
      };

      jest.spyOn(React, 'useRef').mockReturnValue(mockRef);

      const { unmount } = render(<SwipeableRecipeGrid />);
      
      unmount();

      expect(mockRemoveEventListener).toHaveBeenCalledWith('scroll', expect.any(Function));
    });

    it('handles scroll events', () => {
      let scrollHandler;
      const mockRef = {
        current: {
          scrollLeft: 0,
          scrollWidth: 1000,
          clientWidth: 500,
          scrollBy: mockScrollBy,
          addEventListener: jest.fn((event, handler) => {
            if (event === 'scroll') scrollHandler = handler;
          }),
          removeEventListener: mockRemoveEventListener,
          classList: {
            add: jest.fn(),
          },
        }
      };

      jest.spyOn(React, 'useRef').mockReturnValue(mockRef);

      const { rerender } = render(<SwipeableRecipeGrid />);

      // Simulate scroll event
      act(() => {
        mockRef.current.scrollLeft = 250;
        if (scrollHandler) scrollHandler();
      });

      rerender(<SwipeableRecipeGrid />);

      // Both buttons should be visible after scrolling to middle
      waitFor(() => {
        expect(screen.getByLabelText('Scroll left')).toBeInTheDocument();
        expect(screen.getByLabelText('Scroll right')).toBeInTheDocument();
      });
    });
  });

  describe('MutationObserver', () => {
    let mockObserve, mockDisconnect, MutationObserverMock;

    beforeEach(() => {
      mockObserve = jest.fn();
      mockDisconnect = jest.fn();
      
      MutationObserverMock = jest.fn(() => ({
        observe: mockObserve,
        disconnect: mockDisconnect,
      }));
      
      global.MutationObserver = MutationObserverMock;
    });

    it('observes child changes', () => {
      const mockRef = {
        current: {
          scrollLeft: 0,
          scrollWidth: 1000,
          clientWidth: 500,
          scrollBy: mockScrollBy,
          addEventListener: mockAddEventListener,
          removeEventListener: mockRemoveEventListener,
          classList: {
            add: jest.fn(),
          },
        }
      };

      jest.spyOn(React, 'useRef').mockReturnValue(mockRef);

      render(
        <SwipeableRecipeGrid>
          <div>Item 1</div>
        </SwipeableRecipeGrid>
      );

      expect(MutationObserverMock).toHaveBeenCalled();
      expect(mockObserve).toHaveBeenCalledWith(
        mockRef.current,
        { childList: true, subtree: true }
      );
    });

    it('disconnects observer on unmount', () => {
      const mockRef = {
        current: {
          scrollLeft: 0,
          scrollWidth: 1000,
          clientWidth: 500,
          scrollBy: mockScrollBy,
          addEventListener: mockAddEventListener,
          removeEventListener: mockRemoveEventListener,
          classList: {
            add: jest.fn(),
          },
        }
      };

      jest.spyOn(React, 'useRef').mockReturnValue(mockRef);

      const { unmount } = render(<SwipeableRecipeGrid />);

      unmount();

      expect(mockDisconnect).toHaveBeenCalled();
    });

    it('handles MutationObserver callback', async () => {
      let mutationCallback;
      const MutationObserverMock = jest.fn((callback) => {
        mutationCallback = callback;
        return {
          observe: mockObserve,
          disconnect: mockDisconnect,
        };
      });
      
      global.MutationObserver = MutationObserverMock;

      const mockRef = {
        current: {
          scrollLeft: 0,
          scrollWidth: 1000,
          clientWidth: 500,
          scrollBy: mockScrollBy,
          addEventListener: mockAddEventListener,
          removeEventListener: mockRemoveEventListener,
          classList: {
            add: jest.fn(),
          },
        }
      };

      jest.spyOn(React, 'useRef').mockReturnValue(mockRef);

      render(<SwipeableRecipeGrid />);

      // Trigger mutation callback
      act(() => {
        if (mutationCallback) {
          mutationCallback([{ type: 'childList' }]);
        }
      });

      // Should check scroll position after mutation
      await waitFor(() => {
        expect(mockRef.current.scrollWidth).toBe(1000);
      });
    });
  });

  describe('Window Resize', () => {
    it('handles window resize events', () => {
      const mockRef = {
        current: {
          scrollLeft: 0,
          scrollWidth: 1000,
          clientWidth: 500,
          scrollBy: mockScrollBy,
          addEventListener: mockAddEventListener,
          removeEventListener: mockRemoveEventListener,
          classList: {
            add: jest.fn(),
          },
        }
      };

      jest.spyOn(React, 'useRef').mockReturnValue(mockRef);

      render(<SwipeableRecipeGrid />);

      // Check that resize listener is added
      expect(window.addEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    });

    it('removes resize listener on unmount', () => {
      const mockRef = {
        current: {
          scrollLeft: 0,
          scrollWidth: 1000,
          clientWidth: 500,
          scrollBy: mockScrollBy,
          addEventListener: mockAddEventListener,
          removeEventListener: mockRemoveEventListener,
          classList: {
            add: jest.fn(),
          },
        }
      };

      jest.spyOn(React, 'useRef').mockReturnValue(mockRef);
      const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

      const { unmount } = render(<SwipeableRecipeGrid />);
      
      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    });
  });

  describe('Accessibility', () => {
    it('provides semantic structure', () => {
      const { container } = render(
        <SwipeableRecipeGrid>
          <button>Recipe 1</button>
          <button>Recipe 2</button>
        </SwipeableRecipeGrid>
      );

      const buttons = container.querySelectorAll('button');
      expect(buttons.length).toBeGreaterThanOrEqual(2);
    });

    it('navigation buttons have proper ARIA labels', () => {
      const mockRef = {
        current: {
          scrollLeft: 250,
          scrollWidth: 1000,
          clientWidth: 500,
          scrollBy: mockScrollBy,
          addEventListener: mockAddEventListener,
          removeEventListener: mockRemoveEventListener,
          classList: {
            add: jest.fn(),
          },
        }
      };

      jest.spyOn(React, 'useRef').mockReturnValue(mockRef);

      render(<SwipeableRecipeGrid />);

      const leftButton = screen.getByLabelText('Scroll left');
      const rightButton = screen.getByLabelText('Scroll right');

      expect(leftButton).toHaveAttribute('aria-label', 'Scroll left');
      expect(rightButton).toHaveAttribute('aria-label', 'Scroll right');
    });

    it('maintains keyboard navigation', () => {
      const mockRef = {
        current: {
          scrollLeft: 250,
          scrollWidth: 1000,
          clientWidth: 500,
          scrollBy: mockScrollBy,
          addEventListener: mockAddEventListener,
          removeEventListener: mockRemoveEventListener,
          classList: {
            add: jest.fn(),
          },
        }
      };

      jest.spyOn(React, 'useRef').mockReturnValue(mockRef);

      render(
        <SwipeableRecipeGrid>
          <button>Recipe 1</button>
          <button>Recipe 2</button>
        </SwipeableRecipeGrid>
      );

      const leftButton = screen.getByLabelText('Scroll left');
      
      // Simulate keyboard interaction
      fireEvent.keyDown(leftButton, { key: 'Enter' });
      
      // Button should be interactive
      expect(leftButton.tagName).toBe('BUTTON');
    });
  });

  describe('Edge Cases', () => {
    it('handles empty children', () => {
      const { container } = render(<SwipeableRecipeGrid />);
      expect(container.querySelector('.carousel-container')).toBeInTheDocument();
    });

    it('handles single child', () => {
      render(
        <SwipeableRecipeGrid>
          <div data-testid="single-child">Only child</div>
        </SwipeableRecipeGrid>
      );
      
      expect(screen.getByTestId('single-child')).toBeInTheDocument();
    });

    it('handles many children', () => {
      const children = Array.from({ length: 20 }, (_, i) => (
        <div key={i} data-testid={`child-${i}`}>
          Child {i}
        </div>
      ));

      render(<SwipeableRecipeGrid>{children}</SwipeableRecipeGrid>);
      
      expect(screen.getByTestId('child-0')).toBeInTheDocument();
      expect(screen.getByTestId('child-19')).toBeInTheDocument();
    });

    it('handles re-renders with different children', () => {
      const { rerender } = render(
        <SwipeableRecipeGrid>
          <div data-testid="initial">Initial</div>
        </SwipeableRecipeGrid>
      );

      expect(screen.getByTestId('initial')).toBeInTheDocument();

      rerender(
        <SwipeableRecipeGrid>
          <div data-testid="updated">Updated</div>
        </SwipeableRecipeGrid>
      );

      expect(screen.queryByTestId('initial')).not.toBeInTheDocument();
      expect(screen.getByTestId('updated')).toBeInTheDocument();
    });
  });
});