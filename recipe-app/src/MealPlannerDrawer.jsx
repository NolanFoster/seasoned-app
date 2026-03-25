import React, { useEffect, useState } from 'react'
import { useDragContext } from './useDragContext.js'
import GroceryListModal from './GroceryListModal.jsx'

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

const ShoppingCartIcon = ({ size = 16 }) => (
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
    <circle cx="9" cy="21" r="1"/>
    <circle cx="20" cy="21" r="1"/>
    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
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
  const [isGroceryModalOpen, setIsGroceryModalOpen] = useState(false)

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
          {children}
        </div>
        <div className="drawer-footer">
          <button
            type="button"
            className="drawer-grocery-btn"
            onClick={() => setIsGroceryModalOpen(true)}
            aria-label="Generate grocery list from meal plan"
          >
            <ShoppingCartIcon size={15} />
            Generate Grocery List
          </button>
        </div>
      </aside>

      <GroceryListModal
        isOpen={isGroceryModalOpen}
        onClose={() => setIsGroceryModalOpen(false)}
      />
    </>
  )
}
