import { useEffect, useRef } from 'react';

/**
 * Custom hook for enhanced swipe gesture support on mobile carousels
 * Provides smooth scrolling and momentum-based interactions
 */
export const useSwipeGesture = (containerRef, options = {}) => {
  const {
    sensitivity = 0.3,
    momentumMultiplier = 2.5,
    snapThreshold = 0.3,
    enableMomentum = true,
    enableSnapping = true
  } = options;

  const touchStartRef = useRef({ x: 0, y: 0, time: 0 });
  const touchMoveRef = useRef({ x: 0, y: 0, time: 0 });
  const isDraggingRef = useRef(false);
  const initialScrollLeftRef = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let animationFrame = null;

    const handleTouchStart = (e) => {
      const touch = e.touches[0];
      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now()
      };
      initialScrollLeftRef.current = container.scrollLeft;
      isDraggingRef.current = false;
      
      // Cancel any ongoing animations
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
      
      // Prevent default to avoid issues with touch handling
      container.style.scrollBehavior = 'auto';
    };

    const handleTouchMove = (e) => {
      const touch = e.touches[0];
      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;
      
      // Check if this is a horizontal swipe (not vertical scroll)
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
        isDraggingRef.current = true;
        e.preventDefault(); // Prevent vertical scrolling when swiping horizontally
        
        // Apply sensitivity multiplier for more responsive scrolling
        const scrollDelta = deltaX * sensitivity;
        container.scrollLeft = initialScrollLeftRef.current - scrollDelta;
      }
      
      touchMoveRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now()
      };
    };

    const handleTouchEnd = (e) => {
      if (!isDraggingRef.current) return;
      
      const deltaX = touchMoveRef.current.x - touchStartRef.current.x;
      const deltaTime = touchMoveRef.current.time - touchStartRef.current.time;
      const velocity = deltaX / deltaTime; // pixels per millisecond
      
      if (enableMomentum && Math.abs(velocity) > 0.5) {
        // Apply momentum scrolling
        const momentumDistance = velocity * momentumMultiplier * 100; // Convert to reasonable distance
        const targetScrollLeft = container.scrollLeft - momentumDistance;
        
        // Smooth scroll to target position with momentum
        smoothScrollTo(container, targetScrollLeft, 300);
      } else if (enableSnapping) {
        // Snap to nearest card
        snapToNearestCard(container);
      }
      
      isDraggingRef.current = false;
    };

    const smoothScrollTo = (element, targetScrollLeft, duration) => {
      const startScrollLeft = element.scrollLeft;
      const distance = targetScrollLeft - startScrollLeft;
      const startTime = Date.now();
      
      // Clamp target to valid scroll range
      const maxScrollLeft = element.scrollWidth - element.clientWidth;
      const clampedTarget = Math.max(0, Math.min(targetScrollLeft, maxScrollLeft));
      const clampedDistance = clampedTarget - startScrollLeft;
      
      const animate = () => {
        const currentTime = Date.now();
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Easing function for smooth deceleration
        const easeOut = 1 - Math.pow(1 - progress, 3);
        
        element.scrollLeft = startScrollLeft + (clampedDistance * easeOut);
        
        if (progress < 1) {
          animationFrame = requestAnimationFrame(animate);
        } else {
          // Final snap to ensure we're exactly on target
          element.scrollLeft = clampedTarget;
          if (enableSnapping) {
            snapToNearestCard(element);
          }
        }
      };
      
      animationFrame = requestAnimationFrame(animate);
    };

    const snapToNearestCard = (element) => {
      const cardWidth = 280; // Base card width, will be adjusted based on screen size
      const gap = 16; // Gap between cards
      const effectiveCardWidth = cardWidth + gap;
      
      // Calculate which card we're closest to
      const currentPosition = element.scrollLeft;
      const cardIndex = Math.round(currentPosition / effectiveCardWidth);
      const targetPosition = cardIndex * effectiveCardWidth;
      
      // Use CSS scroll-behavior for smooth snapping
      element.style.scrollBehavior = 'smooth';
      element.scrollLeft = targetPosition;
      
      // Reset scroll behavior after animation
      setTimeout(() => {
        element.style.scrollBehavior = 'auto';
      }, 300);
    };

    // Add passive listeners for better performance
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    // Cleanup
    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [sensitivity, momentumMultiplier, snapThreshold, enableMomentum, enableSnapping]);

  // Return utility functions for external control
  return {
    scrollToCard: (cardIndex) => {
      const container = containerRef.current;
      if (!container) return;
      
      const cardWidth = 280;
      const gap = 16;
      const targetPosition = cardIndex * (cardWidth + gap);
      
      container.style.scrollBehavior = 'smooth';
      container.scrollLeft = targetPosition;
      
      setTimeout(() => {
        container.style.scrollBehavior = 'auto';
      }, 300);
    },
    
    scrollLeft: () => {
      const container = containerRef.current;
      if (!container) return;
      
      const cardWidth = 280;
      const gap = 16;
      const currentPosition = container.scrollLeft;
      const cardIndex = Math.floor(currentPosition / (cardWidth + gap));
      const targetPosition = Math.max(0, (cardIndex - 1) * (cardWidth + gap));
      
      container.style.scrollBehavior = 'smooth';
      container.scrollLeft = targetPosition;
      
      setTimeout(() => {
        container.style.scrollBehavior = 'auto';
      }, 300);
    },
    
    scrollRight: () => {
      const container = containerRef.current;
      if (!container) return;
      
      const cardWidth = 280;
      const gap = 16;
      const currentPosition = container.scrollLeft;
      const maxScrollLeft = container.scrollWidth - container.clientWidth;
      const cardIndex = Math.ceil(currentPosition / (cardWidth + gap));
      const targetPosition = Math.min(maxScrollLeft, (cardIndex + 1) * (cardWidth + gap));
      
      container.style.scrollBehavior = 'smooth';
      container.scrollLeft = targetPosition;
      
      setTimeout(() => {
        container.style.scrollBehavior = 'auto';
      }, 300);
    }
  };
};