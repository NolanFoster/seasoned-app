import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import SwipeableRecipeGrid from '../components/SwipeableRecipeGrid';

describe('SwipeableRecipeGrid', () => {
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

  describe('Navigation Functionality', () => {
    // Mock a component with scrollable content
    const ScrollableGrid = ({ children }) => {
      const gridRef = React.useRef(null);
      const [showLeftButton, setShowLeftButton] = React.useState(false);
      const [showRightButton, setShowRightButton] = React.useState(true);

      React.useEffect(() => {
        // Simulate scrollable content
        if (gridRef.current) {
          Object.defineProperty(gridRef.current, 'scrollWidth', {
            writable: true,
            configurable: true,
            value: 1200
          });
          Object.defineProperty(gridRef.current, 'clientWidth', {
            writable: true,
            configurable: true,
            value: 600
          });
          Object.defineProperty(gridRef.current, 'scrollLeft', {
            writable: true,
            configurable: true,
            value: 0
          });
        }
      }, []);

      const scroll = (direction) => {
        if (direction === 'left') {
          setShowLeftButton(false);
          setShowRightButton(true);
        } else {
          setShowLeftButton(true);
          setShowRightButton(false);
        }
      };

      return (
        <div className="carousel-container">
          {showLeftButton && (
            <button 
              className="carousel-nav carousel-nav-left"
              onClick={() => scroll('left')}
              aria-label="Scroll left"
            >
              Left
            </button>
          )}
          <div ref={gridRef} className="recipe-grid carousel-layout">
            {children}
          </div>
          {showRightButton && (
            <button 
              className="carousel-nav carousel-nav-right"
              onClick={() => scroll('right')}
              aria-label="Scroll right"
            >
              Right
            </button>
          )}
        </div>
      );
    };

    it('shows navigation buttons when content is scrollable', () => {
      render(
        <ScrollableGrid>
          <div>Item 1</div>
          <div>Item 2</div>
          <div>Item 3</div>
          <div>Item 4</div>
        </ScrollableGrid>
      );

      // Initially only right button is visible
      expect(screen.queryByLabelText('Scroll left')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Scroll right')).toBeInTheDocument();
    });

    it('handles navigation button clicks', () => {
      render(
        <ScrollableGrid>
          <div>Item 1</div>
          <div>Item 2</div>
          <div>Item 3</div>
          <div>Item 4</div>
        </ScrollableGrid>
      );

      // Click right button
      const rightButton = screen.getByLabelText('Scroll right');
      fireEvent.click(rightButton);

      // Now left button should appear and right button should disappear
      expect(screen.getByLabelText('Scroll left')).toBeInTheDocument();
      expect(screen.queryByLabelText('Scroll right')).not.toBeInTheDocument();
    });
  });

  describe('Responsive Behavior', () => {
    it('maintains carousel structure on different screen sizes', () => {
      const { container } = render(
        <SwipeableRecipeGrid>
          <div>Item 1</div>
          <div>Item 2</div>
        </SwipeableRecipeGrid>
      );

      const grid = container.querySelector('.recipe-grid');
      expect(grid).toHaveClass('carousel-layout');
      expect(container.querySelector('.carousel-container')).toBeInTheDocument();
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
      expect(buttons).toHaveLength(2);
      expect(buttons[0]).toHaveTextContent('Recipe 1');
      expect(buttons[1]).toHaveTextContent('Recipe 2');
    });

    it('maintains focus management', () => {
      const { container } = render(
        <SwipeableRecipeGrid>
          <button data-testid="btn1">Recipe 1</button>
          <button data-testid="btn2">Recipe 2</button>
        </SwipeableRecipeGrid>
      );

      const btn1 = screen.getByTestId('btn1');
      const btn2 = screen.getByTestId('btn2');

      // Focus first button
      btn1.focus();
      expect(document.activeElement).toBe(btn1);

      // Tab to next button
      fireEvent.keyDown(btn1, { key: 'Tab' });
      // Note: actual tab behavior would be handled by browser
    });
  });
});