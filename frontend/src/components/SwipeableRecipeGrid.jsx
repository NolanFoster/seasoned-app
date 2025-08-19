import React, { useRef, useEffect, useState } from 'react';

/**
 * Swipeable Recipe Grid Component
 * Carousel with native browser scrolling for both mobile and desktop
 */
function SwipeableRecipeGrid({ children, className = '', ...props }) {
  const gridRef = useRef(null);
  const [showLeftButton, setShowLeftButton] = useState(false);
  const [showRightButton, setShowRightButton] = useState(true);

  // Check scroll position to show/hide navigation buttons
  const checkScrollPosition = () => {
    const grid = gridRef.current;
    if (!grid) return;

    const scrollLeft = grid.scrollLeft;
    const scrollWidth = grid.scrollWidth;
    const clientWidth = grid.clientWidth;

    setShowLeftButton(scrollLeft > 0);
    setShowRightButton(scrollLeft < scrollWidth - clientWidth - 10);
  };

  // Scroll function for navigation buttons
  const scroll = (direction) => {
    const grid = gridRef.current;
    if (!grid) return;

    const cardWidth = 300; // Approximate card width including gap
    const scrollAmount = cardWidth * 3; // Scroll 3 cards at a time

    grid.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth'
    });
  };

  // Apply carousel class and set up scroll listeners
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    // Always use carousel layout
    grid.classList.add('carousel-layout');
    
    // Check scroll position initially and on scroll
    checkScrollPosition();
    grid.addEventListener('scroll', checkScrollPosition);
    
    // Also check when children change (recipes load)
    const observer = new MutationObserver(() => {
      setTimeout(checkScrollPosition, 50);
    });
    observer.observe(grid, { childList: true, subtree: true });

    // Check on resize
    window.addEventListener('resize', checkScrollPosition);

    return () => {
      grid.removeEventListener('scroll', checkScrollPosition);
      window.removeEventListener('resize', checkScrollPosition);
      observer.disconnect();
    };
  }, [children]);

  return (
    <div className="carousel-container">
      {/* Left navigation button */}
      {showLeftButton && (
        <button 
          className="carousel-nav carousel-nav-left"
          onClick={() => scroll('left')}
          aria-label="Scroll left"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>
      )}

      {/* Recipe grid */}
      <div 
        ref={gridRef}
        className={`recipe-grid category-recipes ${className}`}
        {...props}
      >
        {children}
      </div>

      {/* Right navigation button */}
      {showRightButton && (
        <button 
          className="carousel-nav carousel-nav-right"
          onClick={() => scroll('right')}
          aria-label="Scroll right"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>
      )}
    </div>
  );
}

export default SwipeableRecipeGrid;