import React from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import SwipeableRecipeGrid from '../components/SwipeableRecipeGrid';

describe('Component Branch Coverage Tests', () => {
  describe('SwipeableRecipeGrid - checkScrollPosition branches', () => {
    it('handles null grid reference in checkScrollPosition', () => {
      // Force useRef to return null initially
      const mockRef = { current: null };
      jest.spyOn(React, 'useRef').mockReturnValue(mockRef);

      const { container } = render(<SwipeableRecipeGrid />);
      
      // Should not crash when grid is null
      expect(container.querySelector('.carousel-container')).toBeInTheDocument();
    });

    it('handles edge case where scrollWidth equals clientWidth', () => {
      const mockRef = {
        current: {
          scrollLeft: 0,
          scrollWidth: 500,
          clientWidth: 500, // Equal to scrollWidth
          scrollBy: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          classList: {
            add: jest.fn(),
          },
        }
      };

      jest.spyOn(React, 'useRef').mockReturnValue(mockRef);

      render(<SwipeableRecipeGrid />);

      // No navigation buttons should appear
      expect(screen.queryByLabelText('Scroll left')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Scroll right')).not.toBeInTheDocument();
    });

    it('handles scrollLeft at exact boundary', () => {
      const mockRef = {
        current: {
          scrollLeft: 490, // Exactly scrollWidth - clientWidth - 10
          scrollWidth: 1000,
          clientWidth: 500,
          scrollBy: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          classList: {
            add: jest.fn(),
          },
        }
      };

      jest.spyOn(React, 'useRef').mockReturnValue(mockRef);

      render(<SwipeableRecipeGrid />);

      // Only left button should show
      expect(screen.getByLabelText('Scroll left')).toBeInTheDocument();
      expect(screen.queryByLabelText('Scroll right')).not.toBeInTheDocument();
    });

    it('handles negative scrollLeft edge case', () => {
      const mockRef = {
        current: {
          scrollLeft: -1, // Invalid but possible edge case
          scrollWidth: 1000,
          clientWidth: 500,
          scrollBy: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          classList: {
            add: jest.fn(),
          },
        }
      };

      jest.spyOn(React, 'useRef').mockReturnValue(mockRef);

      render(<SwipeableRecipeGrid />);

      // Should treat as scrollLeft = 0
      expect(screen.queryByLabelText('Scroll left')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Scroll right')).toBeInTheDocument();
    });
  });

  describe('SwipeableRecipeGrid - scroll function branches', () => {
    it('handles scroll function with null grid', () => {
      // Start with valid grid
      const mockRef = {
        current: {
          scrollLeft: 250,
          scrollWidth: 1000,
          clientWidth: 500,
          scrollBy: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          classList: {
            add: jest.fn(),
          },
        }
      };

      jest.spyOn(React, 'useRef').mockReturnValue(mockRef);

      const { rerender } = render(<SwipeableRecipeGrid />);

      // Now set grid to null
      mockRef.current = null;
      rerender(<SwipeableRecipeGrid />);

      // Should not crash
      expect(screen.queryByRole('button')).toBeNull();
    });
  });

  describe('SwipeableRecipeGrid - useEffect branches', () => {
    it('handles missing classList methods', () => {
      const mockRef = {
        current: {
          scrollLeft: 0,
          scrollWidth: 1000,
          clientWidth: 500,
          scrollBy: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          classList: {
            // Missing add method
          },
        }
      };

      jest.spyOn(React, 'useRef').mockReturnValue(mockRef);

      // Should not crash
      const { container } = render(<SwipeableRecipeGrid />);
      expect(container.querySelector('.carousel-container')).toBeInTheDocument();
    });

    it('handles grid becoming null after mount', () => {
      const mockRef = {
        current: {
          scrollLeft: 0,
          scrollWidth: 1000,
          clientWidth: 500,
          scrollBy: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          classList: {
            add: jest.fn(),
          },
        }
      };

      jest.spyOn(React, 'useRef').mockReturnValue(mockRef);

      const { rerender } = render(<SwipeableRecipeGrid />);

      // Simulate grid becoming null
      act(() => {
        mockRef.current = null;
      });

      rerender(<SwipeableRecipeGrid />);

      // Should handle gracefully
      expect(screen.queryByLabelText('Scroll left')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Scroll right')).not.toBeInTheDocument();
    });
  });

  describe('Edge Case Scenarios', () => {
    it('handles extremely large scroll values', () => {
      const mockRef = {
        current: {
          scrollLeft: 0,
          scrollWidth: Number.MAX_SAFE_INTEGER,
          clientWidth: 500,
          scrollBy: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          classList: {
            add: jest.fn(),
          },
        }
      };

      jest.spyOn(React, 'useRef').mockReturnValue(mockRef);

      render(<SwipeableRecipeGrid />);

      // Should show right button
      expect(screen.getByLabelText('Scroll right')).toBeInTheDocument();
    });

    it('handles zero clientWidth', () => {
      const mockRef = {
        current: {
          scrollLeft: 0,
          scrollWidth: 1000,
          clientWidth: 0, // Hidden or collapsed element
          scrollBy: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          classList: {
            add: jest.fn(),
          },
        }
      };

      jest.spyOn(React, 'useRef').mockReturnValue(mockRef);

      render(<SwipeableRecipeGrid />);

      // Should show navigation since scrollWidth > clientWidth
      expect(screen.getByLabelText('Scroll right')).toBeInTheDocument();
    });

    it('handles fractional scroll values', () => {
      const mockRef = {
        current: {
          scrollLeft: 250.5, // Fractional value
          scrollWidth: 1000.7,
          clientWidth: 500.3,
          scrollBy: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          classList: {
            add: jest.fn(),
          },
        }
      };

      jest.spyOn(React, 'useRef').mockReturnValue(mockRef);

      render(<SwipeableRecipeGrid />);

      // Should handle fractional values correctly
      expect(screen.getByLabelText('Scroll left')).toBeInTheDocument();
      expect(screen.getByLabelText('Scroll right')).toBeInTheDocument();
    });
  });

  describe('Conditional Rendering Branches', () => {
    it('renders without navigation when not scrollable', () => {
      const mockRef = {
        current: {
          scrollLeft: 0,
          scrollWidth: 400,
          clientWidth: 500, // Content fits in viewport
          scrollBy: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          classList: {
            add: jest.fn(),
          },
        }
      };

      jest.spyOn(React, 'useRef').mockReturnValue(mockRef);

      const { container } = render(
        <SwipeableRecipeGrid>
          <div>Small content</div>
        </SwipeableRecipeGrid>
      );

      // No navigation buttons
      expect(screen.queryByLabelText('Scroll left')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Scroll right')).not.toBeInTheDocument();
      
      // But carousel structure exists
      expect(container.querySelector('.carousel-container')).toBeInTheDocument();
    });

    it('handles rapid state changes', async () => {
      let showLeft = false;
      let showRight = true;

      const TestWrapper = () => {
        const [leftVisible, setLeftVisible] = React.useState(showLeft);
        const [rightVisible, setRightVisible] = React.useState(showRight);

        React.useEffect(() => {
          setLeftVisible(showLeft);
          setRightVisible(showRight);
        }, []);

        return (
          <div className="carousel-container">
            {leftVisible && <button aria-label="Scroll left">Left</button>}
            <div className="recipe-grid carousel-layout">Content</div>
            {rightVisible && <button aria-label="Scroll right">Right</button>}
          </div>
        );
      };

      const { rerender } = render(<TestWrapper />);

      // Initial state
      expect(screen.queryByLabelText('Scroll left')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Scroll right')).toBeInTheDocument();

      // Change state
      showLeft = true;
      showRight = false;
      rerender(<TestWrapper />);

      // Updated state
      act(() => {
        expect(screen.queryByLabelText('Scroll left')).toBeInTheDocument();
        expect(screen.queryByLabelText('Scroll right')).not.toBeInTheDocument();
      });
    });
  });

  describe('Function Call Coverage', () => {
    it('covers all scroll direction branches', () => {
      const mockScrollBy = jest.fn();
      const mockRef = {
        current: {
          scrollLeft: 500,
          scrollWidth: 1500,
          clientWidth: 500,
          scrollBy: mockScrollBy,
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          classList: {
            add: jest.fn(),
          },
        }
      };

      jest.spyOn(React, 'useRef').mockReturnValue(mockRef);

      render(<SwipeableRecipeGrid />);

      // Test left scroll
      const leftButton = screen.getByLabelText('Scroll left');
      leftButton.click();
      
      expect(mockScrollBy).toHaveBeenLastCalledWith({
        left: -900,
        behavior: 'smooth'
      });

      // Test right scroll
      const rightButton = screen.getByLabelText('Scroll right');
      rightButton.click();
      
      expect(mockScrollBy).toHaveBeenLastCalledWith({
        left: 900,
        behavior: 'smooth'
      });
    });

    it('covers setTimeout branch in MutationObserver', () => {
      jest.useFakeTimers();
      
      let mutationCallback;
      const MutationObserverMock = jest.fn((callback) => {
        mutationCallback = callback;
        return {
          observe: jest.fn(),
          disconnect: jest.fn(),
        };
      });
      
      global.MutationObserver = MutationObserverMock;

      const mockRef = {
        current: {
          scrollLeft: 0,
          scrollWidth: 1000,
          clientWidth: 500,
          scrollBy: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          classList: {
            add: jest.fn(),
          },
        }
      };

      jest.spyOn(React, 'useRef').mockReturnValue(mockRef);

      render(<SwipeableRecipeGrid />);

      // Trigger mutation
      act(() => {
        if (mutationCallback) {
          mutationCallback([{ type: 'childList' }]);
        }
      });

      // Fast-forward timers
      act(() => {
        jest.advanceTimersByTime(50);
      });

      jest.useRealTimers();
    });
  });
});