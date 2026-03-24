import React from 'react'

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

export default function MealPlannerDrawer({ isOpen, onClose, isDragging, children }) {
  // Build the drawer class list. The `is-dragging` class removes the CSS transform
  // while a drag is active — see MealPlanner.css for the full explanation.
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
