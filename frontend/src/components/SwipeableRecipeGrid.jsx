import React, { useRef, useEffect } from 'react';

/**
 * Swipeable Recipe Grid Component
 * Carousel with native browser scrolling for both mobile and desktop
 */
function SwipeableRecipeGrid({ children, className = '', ...props }) {
  const gridRef = useRef(null);

  // Apply carousel class and set up scroll listeners
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    // Always use carousel layout
    grid.classList.add('carousel-layout');
  }, [children]);

  return (
    <div className="carousel-container">
      {/* Recipe grid */}
      <div 
        ref={gridRef}
        className={`recipe-grid category-recipes ${className}`}
        {...props}
      >
        {children}
      </div>
    </div>
  );
}

export default SwipeableRecipeGrid;