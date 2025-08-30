import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SwipeableRecipeGrid from '../components/SwipeableRecipeGrid';

describe('Carousel Position Memory', () => {
  it('should save and restore scroll position', async () => {
    const mockRef = React.createRef();
    
    render(
      <SwipeableRecipeGrid ref={mockRef} categoryName="test-category">
        <div style={{ width: '100px', height: '100px' }}>Recipe 1</div>
        <div style={{ width: '100px', height: '100px' }}>Recipe 2</div>
        <div style={{ width: '100px', height: '100px' }}>Recipe 3</div>
        <div style={{ width: '100px', height: '100px' }}>Recipe 4</div>
        <div style={{ width: '100px', height: '100px' }}>Recipe 5</div>
      </SwipeableRecipeGrid>
    );

    // Mock the grid element
    const gridElement = screen.getByText('Recipe 1').closest('.recipe-grid');
    Object.defineProperty(gridElement, 'scrollLeft', {
      writable: true,
      value: 0
    });

    // Set initial scroll position
    gridElement.scrollLeft = 200;

    // Save scroll position
    const savedPosition = mockRef.current.saveScrollPosition();
    expect(savedPosition).toBe(200);

    // Change scroll position
    gridElement.scrollLeft = 400;

    // Restore scroll position
    const restored = mockRef.current.restoreScrollPosition();
    expect(restored).toBe(true);
    expect(gridElement.scrollLeft).toBe(200);
  });

  it('should track scroll position changes', async () => {
    const mockRef = React.createRef();
    
    render(
      <SwipeableRecipeGrid ref={mockRef} categoryName="test-category">
        <div style={{ width: '100px', height: '100px' }}>Recipe 1</div>
        <div style={{ width: '100px', height: '100px' }}>Recipe 2</div>
        <div style={{ width: '100px', height: '100px' }}>Recipe 3</div>
      </SwipeableRecipeGrid>
    );

    const gridElement = screen.getByText('Recipe 1').closest('.recipe-grid');
    
    // Simulate scroll event
    fireEvent.scroll(gridElement, { target: { scrollLeft: 150 } });

    // Check that scroll position was tracked
    const currentPosition = mockRef.current.getScrollPosition();
    expect(currentPosition).toBe(150);
  });

  it('should handle null grid reference gracefully', () => {
    const mockRef = React.createRef();
    
    render(
      <SwipeableRecipeGrid ref={mockRef} categoryName="test-category">
        <div>Recipe 1</div>
      </SwipeableRecipeGrid>
    );

    // Test with null grid (should not crash)
    const result = mockRef.current.saveScrollPosition();
    expect(result).toBe(0);
  });

  it('should pass category name to grid element', () => {
    render(
      <SwipeableRecipeGrid categoryName="Desserts">
        <div>Recipe 1</div>
      </SwipeableRecipeGrid>
    );

    const gridElement = screen.getByText('Recipe 1').closest('.recipe-grid');
    expect(gridElement).toHaveAttribute('data-category', 'Desserts');
  });
});