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
      console.log('🔍 SwipeableRecipeGrid: saveScrollPosition called');
      if (gridRef.current) {
        scrollPositionRef.current = gridRef.current.scrollLeft;
        console.log('💾 Saved scroll position:', scrollPositionRef.current, 'from grid.scrollLeft:', gridRef.current.scrollLeft);
        return scrollPositionRef.current;
      }
      console.log('⚠️ gridRef.current is null');
      return 0;
    },
    // Restore saved scroll position
    restoreScrollPosition: () => {
      console.log('🔍 SwipeableRecipeGrid: restoreScrollPosition called, saved position:', scrollPositionRef.current);
      if (gridRef.current && scrollPositionRef.current > 0) {
        gridRef.current.scrollLeft = scrollPositionRef.current;
        console.log('🔄 Restored scroll position to:', gridRef.current.scrollLeft);
        return true;
      }
      console.log('⚠️ Cannot restore - gridRef.current:', Boolean(gridRef.current), 'saved position:', scrollPositionRef.current);
      return false;
    },
    // Get current scroll position
    getScrollPosition: () => {
      const position = gridRef.current ? gridRef.current.scrollLeft : 0;
      console.log('🔍 SwipeableRecipeGrid: getScrollPosition called, current position:', position);
      return position;
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
      {/* Debug info - only show in development */}
      {process.env.NODE_ENV === 'development' && (
        <div style={{ 
          position: 'absolute', 
          top: '5px', 
          right: '5px', 
          background: 'rgba(0,0,0,0.7)', 
          color: 'white', 
          padding: '2px 6px', 
          borderRadius: '4px', 
          fontSize: '12px',
          zIndex: 1000
        }}>
          {categoryName || 'no-category'}
          <br />
          <button 
            onClick={() => {
              if (gridRef.current) {
                const currentPos = gridRef.current.scrollLeft;
                const newPos = currentPos + 300;
                gridRef.current.scrollLeft = newPos;
                console.log('🧪 Test scroll: moved from', currentPos, 'to', newPos);
              }
            }}
            style={{ 
              background: 'rgba(255,255,255,0.2)', 
              border: 'none', 
              color: 'white', 
              padding: '1px 3px',
              fontSize: '10px',
              cursor: 'pointer'
            }}
          >
            Test Scroll
          </button>
        </div>
      )}
      
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