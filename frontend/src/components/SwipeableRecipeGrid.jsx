import React, { useRef, useEffect } from 'react';
import { useSwipeGesture } from '../hooks/useSwipeGesture.js';

/**
 * Swipeable Recipe Grid Component
 * Wraps recipe grids with enhanced touch gesture support for mobile
 */
function SwipeableRecipeGrid({ children, className = '', ...props }) {
  const gridRef = useRef(null);
  
  // Initialize swipe gesture hook with optimized settings for recipe cards
  const { scrollToCard, scrollLeft, scrollRight } = useSwipeGesture(gridRef, {
    sensitivity: 0.4, // Slightly higher sensitivity for better responsiveness
    momentumMultiplier: 2.0, // Moderate momentum for smooth but controlled scrolling
    enableMomentum: true,
    enableSnapping: true
  });

  // Add visual indicators for swipe availability on mobile
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const checkScrollability = () => {
      const isScrollable = grid.scrollWidth > grid.clientWidth;
      grid.setAttribute('data-swipeable', isScrollable ? 'true' : 'false');
    };

    // Check initially and on resize
    checkScrollability();
    window.addEventListener('resize', checkScrollability);
    
    // Also check when children change (recipes load)
    const observer = new MutationObserver(checkScrollability);
    observer.observe(grid, { childList: true, subtree: true });

    return () => {
      window.removeEventListener('resize', checkScrollability);
      observer.disconnect();
    };
  }, [children]);

  return (
    <div 
      ref={gridRef}
      className={`recipe-grid category-recipes ${className}`}
      data-swipe-container="true"
      {...props}
    >
      {children}
    </div>
  );
}

export default SwipeableRecipeGrid;