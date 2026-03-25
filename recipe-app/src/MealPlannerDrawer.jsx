import React, { useEffect } from 'react'
import { useDragContext } from './useDragContext.js'

const XIcon = ({ size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

/**
 * MealPlannerDrawer
 *
 * Slide-over panel housing the weekly meal grid. Reads `isDragging` from
 * DragContext (rather than receiving it as a prop) to apply the `.is-dragging`
 * CSS class that strips the drawer's CSS transform during drag operations.
 *
 * Why the transform must be removed during drag:
 *   Any `transform` on an ancestor creates a containing block for
 *   `position: fixed` children. @hello-pangea/dnd uses `position: fixed` for
 *   its drag ghost, so the ghost's coordinates become drawer-relative rather
 *   than viewport-relative, producing a visible cursor offset.
 *   See MealPlanner.css (.meal-planner-drawer.is-open.is-dragging) for the rule.
 *   DragPortal in DayCard.jsx provides belt-and-suspenders coverage at the
 *   individual draggable level.
 */
export default function MealPlannerDrawer({ isOpen, onClose, children }) {
  const { isDragging } = useDragContext()

  // Lock body scroll when the drawer is open to prevent "scroll leakage"
  // to the main page background.
  useEffect(() => {
    if (isOpen) {
      const originalStyle = window.getComputedStyle(document.body).overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = originalStyle
      }
    }
  }, [isOpen])

  let drawerClassName = 'meal-planner-drawer'
  if (isOpen) drawerClassName += ' is-open'
  if (isDragging) drawerClassName += ' is-dragging'

  return (
    <>
      <div
        className={`meal-planner-backdrop${isOpen ? ' is-open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={drawerClassName}
        aria-label="Meal planner"
        aria-hidden={!isOpen}
        data-testid="meal-planner-drawer"
      >
        <div className="drawer-header">
          <span className="drawer-title">Meal Planner</span>
          <button
            type="button"
            className="drawer-close-btn"
            onClick={onClose}
            aria-label="Close meal planner"
          >
            <XIcon size={16} />
          </button>
        </div>
        <div className="drawer-content">
          <div className="day-cards-grid">{children}</div>
        </div>
      </aside>
    </>
  )
}
