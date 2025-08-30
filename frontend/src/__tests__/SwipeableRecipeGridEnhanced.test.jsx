import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SwipeableRecipeGrid from '../components/SwipeableRecipeGrid';

describe('SwipeableRecipeGrid Enhanced Coverage', () => {
  describe('Component Rendering', () => {
    it('should render with default props', () => {
      render(
        <SwipeableRecipeGrid>
          <div>Test Child</div>
        </SwipeableRecipeGrid>
      );
      
      expect(screen.getByText('Test Child')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const customClass = 'custom-grid-class';
      
      render(
        <SwipeableRecipeGrid className={customClass}>
          <div>Test Child</div>
        </SwipeableRecipeGrid>
      );
      
      const grid = screen.getByText('Test Child').closest('.recipe-grid');
      expect(grid).toHaveClass('recipe-grid');
      expect(grid).toHaveClass('category-recipes');
      expect(grid).toHaveClass(customClass);
    });

    it('should pass through additional props', () => {
      const testId = 'test-grid';
      
      render(
        <SwipeableRecipeGrid data-testid={testId}>
          <div>Test Child</div>
        </SwipeableRecipeGrid>
      );
      
      expect(screen.getByTestId(testId)).toBeInTheDocument();
    });

    it('should render multiple children', () => {
      render(
        <SwipeableRecipeGrid>
          <div>Child 1</div>
          <div>Child 2</div>
          <div>Child 3</div>
        </SwipeableRecipeGrid>
      );
      
      expect(screen.getByText('Child 1')).toBeInTheDocument();
      expect(screen.getByText('Child 2')).toBeInTheDocument();
      expect(screen.getByText('Child 3')).toBeInTheDocument();
    });

    it('should render without children', () => {
      render(<SwipeableRecipeGrid />);
      
      const container = screen.getByRole('generic');
      expect(container).toBeInTheDocument();
    });
  });

  describe('CSS Class Management', () => {
    it('should add carousel-layout class to grid element', () => {
      render(
        <SwipeableRecipeGrid>
          <div>Test Child</div>
        </SwipeableRecipeGrid>
      );
      
      const grid = screen.getByText('Test Child').closest('.recipe-grid');
      expect(grid).toHaveClass('carousel-layout');
    });

    it('should maintain carousel container structure', () => {
      render(
        <SwipeableRecipeGrid>
          <div>Test Child</div>
        </SwipeableRecipeGrid>
      );
      
      const container = screen.getByText('Test Child').closest('.carousel-container');
      expect(container).toBeInTheDocument();
      expect(container).toHaveClass('carousel-container');
    });
  });

  describe('useRef and useEffect Coverage', () => {
    it('should handle null grid reference gracefully', () => {
      // Mock useRef to return null initially
      const originalUseRef = React.useRef;
      React.useRef = jest.fn(() => ({ current: null }));
      
      render(
        <SwipeableRecipeGrid>
          <div>Test Child</div>
        </SwipeableRecipeGrid>
      );
      
      // Should render without errors even with null ref
      expect(screen.getByText('Test Child')).toBeInTheDocument();
      
      // Restore original useRef
      React.useRef = originalUseRef;
    });

    it('should apply classes when grid ref is available', () => {
      render(
        <SwipeableRecipeGrid>
          <div>Test Child</div>
        </SwipeableRecipeGrid>
      );
      
      // Wait for useEffect to run
      const grid = screen.getByText('Test Child').closest('.recipe-grid');
      expect(grid).toHaveClass('carousel-layout');
    });

    it('should handle children prop changes', () => {
      const { rerender } = render(
        <SwipeableRecipeGrid>
          <div>Original Child</div>
        </SwipeableRecipeGrid>
      );
      
      expect(screen.getByText('Original Child')).toBeInTheDocument();
      
      // Rerender with different children
      rerender(
        <SwipeableRecipeGrid>
          <div>Updated Child</div>
        </SwipeableRecipeGrid>
      );
      
      expect(screen.getByText('Updated Child')).toBeInTheDocument();
      expect(screen.queryByText('Original Child')).not.toBeInTheDocument();
    });
  });

  describe('Props Spreading', () => {
    it('should spread additional props to grid element', () => {
      const additionalProps = {
        'data-testid': 'custom-grid',
        'aria-label': 'Recipe carousel',
        'role': 'region'
      };
      
      render(
        <SwipeableRecipeGrid {...additionalProps}>
          <div>Test Child</div>
        </SwipeableRecipeGrid>
      );
      
      const grid = screen.getByTestId('custom-grid');
      expect(grid).toHaveAttribute('aria-label', 'Recipe carousel');
      expect(grid).toHaveAttribute('role', 'region');
    });

    it('should handle style prop correctly', () => {
      const customStyle = { backgroundColor: 'red', padding: '10px' };
      
      render(
        <SwipeableRecipeGrid style={customStyle}>
          <div>Test Child</div>
        </SwipeableRecipeGrid>
      );
      
      const grid = screen.getByText('Test Child').closest('.recipe-grid');
      expect(grid).toHaveStyle('background-color: red');
      expect(grid).toHaveStyle('padding: 10px');
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined children', () => {
      render(<SwipeableRecipeGrid>{undefined}</SwipeableRecipeGrid>);
      
      const container = screen.getByRole('generic');
      expect(container).toBeInTheDocument();
    });

    it('should handle false children', () => {
      render(
        <SwipeableRecipeGrid>
          {false && <div>Hidden Child</div>}
          <div>Visible Child</div>
        </SwipeableRecipeGrid>
      );
      
      expect(screen.getByText('Visible Child')).toBeInTheDocument();
      expect(screen.queryByText('Hidden Child')).not.toBeInTheDocument();
    });

    it('should handle mixed children types', () => {
      render(
        <SwipeableRecipeGrid>
          <div>Div Child</div>
          <span>Span Child</span>
          <p>Paragraph Child</p>
        </SwipeableRecipeGrid>
      );
      
      expect(screen.getByText('Div Child')).toBeInTheDocument();
      expect(screen.getByText('Span Child')).toBeInTheDocument();
      expect(screen.getByText('Paragraph Child')).toBeInTheDocument();
    });
  });
});