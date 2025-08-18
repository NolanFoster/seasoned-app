import React, { useRef, useEffect } from 'react';

/**
 * Swipeable Recipe Grid Component
 * Simple mobile carousel with native browser scrolling
 */
function SwipeableRecipeGrid({ children, className = '', ...props }) {
  const gridRef = useRef(null);

  // Simple mobile detection and class application
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const checkMobileLayout = () => {
      const isMobile = window.innerWidth <= 768;
      
      // Add mobile-carousel class on mobile devices
      if (isMobile) {
        grid.classList.add('mobile-carousel');
      } else {
        grid.classList.remove('mobile-carousel');
      }
    };

    // Check initially and on resize
    checkMobileLayout();
    window.addEventListener('resize', checkMobileLayout);
    
    // Also check when children change (recipes load)
    const observer = new MutationObserver(() => {
      setTimeout(checkMobileLayout, 50);
    });
    observer.observe(grid, { childList: true, subtree: true });

    return () => {
      window.removeEventListener('resize', checkMobileLayout);
      observer.disconnect();
    };
  }, [children]);

  return (
    <div 
      ref={gridRef}
      className={`recipe-grid category-recipes ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export default SwipeableRecipeGrid;