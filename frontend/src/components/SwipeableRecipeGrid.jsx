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
    sensitivity: 0.8, // Higher sensitivity for better touch responsiveness
    momentumMultiplier: 3.0, // Increased momentum for smoother scrolling
    snapThreshold: 0.2, // Lower threshold for easier snapping
    enableMomentum: true,
    enableSnapping: true
  });

  // Add mobile carousel functionality
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const checkMobileLayout = () => {
      const isMobile = window.innerWidth <= 768;
      const isScrollable = grid.scrollWidth > grid.clientWidth;
      
      // Add mobile-carousel class on mobile devices
      if (isMobile) {
        grid.classList.add('mobile-carousel');
        console.log('Mobile carousel activated - width:', window.innerWidth);
      } else {
        grid.classList.remove('mobile-carousel');
        console.log('Desktop layout activated - width:', window.innerWidth);
      }
      
      grid.setAttribute('data-swipeable', isScrollable ? 'true' : 'false');
      grid.setAttribute('data-mobile', isMobile ? 'true' : 'false');
    };

    // Check initially and on resize
    checkMobileLayout();
    window.addEventListener('resize', checkMobileLayout);
    
    // Also check when children change (recipes load)
    const observer = new MutationObserver(() => {
      // Small delay to ensure DOM is updated
      setTimeout(checkMobileLayout, 100);
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
      data-swipe-container="true"
      onTouchStart={(e) => {
        // Prevent event bubbling that might interfere with swipe detection
        e.stopPropagation();
      }}
      onTouchMove={(e) => {
        // Allow horizontal scrolling, prevent vertical scrolling conflicts
        const touch = e.touches[0];
        if (touch) {
          const rect = gridRef.current?.getBoundingClientRect();
          if (rect && touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
            e.stopPropagation();
          }
        }
      }}
      style={{
        // Ensure the container is properly positioned for touch events
        position: 'relative',
        zIndex: 100,
        isolation: 'isolate' // Create new stacking context
      }}
      {...props}
    >
      {children}
    </div>
  );
}

export default SwipeableRecipeGrid;