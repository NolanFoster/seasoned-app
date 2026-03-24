import React, { useState } from 'react'
import { DragDropContext } from '@hello-pangea/dnd'
import MealPlannerDrawer from './MealPlannerDrawer.jsx'
import DayCard from './DayCard.jsx'
import { useMealPlan } from './MealPlanContext.jsx'
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

// --- Week data ---
// Builds a 7-day scaffold starting from today.
// Returns both a display date and an ISO dateString used to key into mealPlan context.
function buildWeekDays() {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const today = new Date()
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(today)
    date.setDate(today.getDate() + i)
    return {
      day: dayNames[date.getDay()],
      date: `${months[date.getMonth()]} ${date.getDate()}`,
      dateString: date.toISOString().split('T')[0],
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

  // Tracks whether a drag operation is in progress.
  // Passed to MealPlannerDrawer so it can remove its CSS transform while dragging.
  // See MealPlanner.css — .meal-planner-drawer.is-open.is-dragging — for why this
  // is necessary: any ancestor with a `transform` breaks position:fixed coordinates
  // used by @hello-pangea/dnd's drag portal, causing a cursor-offset visual glitch.
  const [isDragging, setIsDragging] = useState(false)

  const { mealPlan, removeMeal, moveMeal } = useMealPlan()
  const weekDays = buildWeekDays()

  const toggleDrawer = () => setIsOpen((prev) => !prev)
  const closeDrawer = () => setIsOpen(false)

  const handleDragStart = () => setIsDragging(true)

  const handleDragEnd = (result) => {
    setIsDragging(false)

    // Ignore cancelled drags or drops outside valid zones
    if (!result.destination) return

    const { draggableId, source, destination } = result
    moveMeal(draggableId, source.droppableId, destination.droppableId, destination.index)
  }

  const handleAddMeal = (day, type) => {
    // TODO: open a recipe picker for the given day and meal type
    console.log('Add meal:', day, type)
  }

  return (
    <>
      {/* Calendar toggle button — fixed top-right by MealPlanner.css.
          aria-expanded drives the accent-border open-state style. */}
      <button
        type="button"
        className="meal-planner-toggle"
        onClick={toggleDrawer}
        aria-label={isOpen ? 'Close meal planner' : 'Open meal planner'}
        aria-expanded={isOpen}
      >
        <CalendarIcon size={20} />
      </button>

      {/* Slide-over drawer — MealPlannerDrawer controls animation and backdrop */}
      <MealPlannerDrawer isOpen={isOpen} onClose={closeDrawer} isDragging={isDragging}>
        <DragDropContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          {weekDays.map(({ day, date, dateString }) => (
            <DayCard
              key={dateString}
              day={day}
              date={date}
              dateString={dateString}
              meals={mealPlan[dateString] || []}
              onRemoveMeal={(recipeId) => {
                if (recipeId) removeMeal(dateString, recipeId)
              }}
            />
          ))}
        </DragDropContext>
      </MealPlannerDrawer>
    </>
  )
}
