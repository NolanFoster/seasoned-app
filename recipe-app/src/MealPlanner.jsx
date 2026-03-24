import React, { useState } from 'react'
import MealPlannerDrawer from './MealPlannerDrawer.jsx'
import DayCard from './DayCard.jsx'
import './MealPlanner.css'

// --- Inline SVG Icons ---
// No external icon library; all icons are defined here as lightweight SVG components.

const CalendarIcon = ({ size = 24, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
)

const ChevronRightIcon = ({ size = 20, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <polyline points="9 18 15 12 9 6" />
  </svg>
)

const PlusIcon = ({ size = 20, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)

// Export icons so child components (MealPlannerDrawer, DayCard) can reuse them
export { CalendarIcon, ChevronRightIcon, PlusIcon }

// --- Sample week data ---
// Provides a default 7-day scaffold; meal data will come from state/API in later steps.
function buildWeekDays() {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const today = new Date()
  // Start the week from today so the planner always shows the current week onward
  return days.map((day, i) => {
    const date = new Date(today)
    date.setDate(today.getDate() + i)
    return {
      day: days[date.getDay()],
      date: `${months[date.getMonth()]} ${date.getDate()}`,
      meals: [],
    }
  })
}

/**
 * MealPlanner
 *
 * Main meal planning component that manages the visibility state of the meal planner drawer.
 * Provides a calendar icon button entry point to toggle the drawer open/closed.
 *
 * Child components:
 *  - MealPlannerDrawer — slide-over panel container with header and close button
 *  - DayCard           — individual day cards showing planned meals
 *
 * @component
 * @example
 * return <MealPlanner />
 */
export default function MealPlanner() {
  // Controls whether the slide-over drawer is visible
  const [isOpen, setIsOpen] = useState(false)

  // Week data is static for now; will be replaced with persisted state in a later step
  const weekDays = buildWeekDays()

  const toggleDrawer = () => setIsOpen((prev) => !prev)
  const closeDrawer = () => setIsOpen(false)

  // Placeholder handlers — real implementations come in a later step
  const handleAddMeal = (day, type) => {
    // TODO: open a recipe picker for the given day and meal type
    console.log('Add meal:', day, type)
  }

  const handleRemoveMeal = (id) => {
    // TODO: remove meal from state/persistence
    console.log('Remove meal:', id)
  }

  return (
    <>
      {/* Calendar toggle button — positioned in the top-right by MealPlanner.css */}
      <button
        type="button"
        className="meal-planner-toggle"
        onClick={toggleDrawer}
        aria-label="Open meal planner"
        aria-expanded={isOpen}
      >
        <CalendarIcon size={22} />
      </button>

      {/* Slide-over drawer — MealPlannerDrawer controls animation and backdrop */}
      <MealPlannerDrawer isOpen={isOpen} onClose={closeDrawer}>
        {weekDays.map(({ day, date, meals }) => (
          <DayCard
            key={`${day}-${date}`}
            day={day}
            date={date}
            meals={meals}
            onAddMeal={handleAddMeal}
            onRemoveMeal={handleRemoveMeal}
          />
        ))}
      </MealPlannerDrawer>
    </>
  )
}
