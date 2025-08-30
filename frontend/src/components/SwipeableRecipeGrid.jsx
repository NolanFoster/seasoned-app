import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';

/**
 * Swipeable Recipe Grid Component
 * Carousel with native browser scrolling for both mobile and desktop
 * Enhanced with scroll position memory for fullscreen view navigation
 */
const SwipeableRecipeGrid = forwardRef(({ children, className = '', categoryName = '', ...props }, ref) => {
  const gridRef = useRef(null);
  const scrollPositionRef = useRef(0);

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    // Save current scroll position
    saveScrollPosition: () => {
      if (gridRef.current) {
        scrollPositionRef.current = gridRef.current.scrollLeft;
        return scrollPositionRef.current;
      }
      return 0;
    },
    // Restore saved scroll position
    restoreScrollPosition: () => {
      if (gridRef.current && scrollPositionRef.current > 0) {
        gridRef.current.scrollLeft = scrollPositionRef.current;
        return true;
      }
      return false;
    },
    // Get current scroll position
    getScrollPosition: () => {
      return gridRef.current ? gridRef.current.scrollLeft : 0;
    },
    // Get the grid element reference
    getGridElement: () => gridRef.current
  }));

  // Apply carousel class and set up scroll listeners
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    // Always use carousel layout
    grid.classList.add('carousel-layout');

    // Store scroll position when scrolling
    const handleScroll = () => {
      scrollPositionRef.current = grid.scrollLeft;
    };

    grid.addEventListener('scroll', handleScroll);

    return () => {
      grid.removeEventListener('scroll', handleScroll);
    };
  }, [children]);

  return (
    <div className="carousel-container">
      {/* Recipe grid */}
      <div 
        ref={gridRef}
        className={`recipe-grid category-recipes ${className}`}
        data-category={categoryName}
        {...props}
      >
        {children}
      </div>
    </div>
  );
});

SwipeableRecipeGrid.displayName = 'SwipeableRecipeGrid';

export default SwipeableRecipeGrid;