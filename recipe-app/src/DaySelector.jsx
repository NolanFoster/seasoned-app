import React, { useEffect, useRef, useMemo, useState } from 'react'
import { MEAL_TYPES, MEAL_TYPE_DISPLAY } from './utils/mealPlanMigration.js'

const DAY_COUNT = 7

/** Step identifier constants — avoids magic strings in comparisons */
const STEP_DATE = 'date'
const STEP_MEAL = 'meal'

function generateUpcomingDays(count) {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const today = new Date()
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(today)
    date.setDate(today.getDate() + i)
    const dateString = date.toISOString().split('T')[0]
    const monthDay = `${monthNames[date.getMonth()]} ${date.getDate()}`
    let displayLabel
    if (i === 0) displayLabel = `Today, ${monthDay}`
    else if (i === 1) displayLabel = `Tomorrow, ${monthDay}`
    else displayLabel = `${dayNames[date.getDay()]}, ${monthDay}`
    return { dateString, displayLabel }
  })
}

/**
 * Two-step modal for adding a recipe to the meal planner.
 *
 * Step 1 (STEP_DATE): User selects a day from the next 7 days.
 * Step 2 (STEP_MEAL): User selects a meal type (Breakfast / Lunch / Dinner / Snack).
 *
 * @param {Object}   props
 * @param {function} props.onDaySelected - Called with (dateString, mealType) after both steps.
 * @param {function} props.onClose       - Called when the user cancels or closes the modal.
 *
 * Internal state:
 *   currentStep   {string}      - STEP_DATE | STEP_MEAL
 *   selectedDate  {string|null} - ISO date string chosen in Step 1, null until confirmed
 */
export default function DaySelector({ onDaySelected, onClose }) {
  const days = useMemo(() => generateUpcomingDays(DAY_COUNT), [])
  const [currentStep, setCurrentStep] = useState(STEP_DATE)
  const [selectedDate, setSelectedDate] = useState(null)
  const listRef = useRef(null)
  const firstBtnRef = useRef(null)

  // Focus first list item whenever the visible step changes
  useEffect(() => {
    firstBtnRef.current?.focus()
  }, [currentStep])

  // Escape: go back one step or close; arrow keys navigate list
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        if (currentStep === STEP_MEAL) {
          handleBack()
        } else {
          onClose()
        }
        return
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const buttons = Array.from(listRef.current?.querySelectorAll('button') ?? [])
        const idx = buttons.indexOf(document.activeElement)
        if (idx === -1) return
        const next = e.key === 'ArrowDown' ? idx + 1 : idx - 1
        buttons[Math.max(0, Math.min(next, buttons.length - 1))]?.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose, currentStep])

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onClose()
  }

  /** Advance to Step 2 with the chosen date */
  function handleDateSelect(dateString) {
    setSelectedDate(dateString)
    setCurrentStep(STEP_MEAL)
  }

  /** Complete the flow: emit callback and let the parent close */
  function handleMealTypeSelect(mealType) {
    onDaySelected(selectedDate, mealType)
  }

  /** Return to Step 1 without closing */
  function handleBack() {
    setCurrentStep(STEP_DATE)
    setSelectedDate(null)
  }

  const selectedDayLabel =
    currentStep === STEP_MEAL
      ? (days.find((d) => d.dateString === selectedDate)?.displayLabel ?? selectedDate)
      : null

  return (
    <div
      className="day-selector-backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={currentStep === STEP_MEAL ? 'Select a meal type' : 'Select a day to add this recipe'}
    >
      <div className="day-selector">
        <div className="day-selector-header">
          <span className="day-selector-title">
            {currentStep === STEP_MEAL ? (
              <>
                <button
                  type="button"
                  className="day-selector-back"
                  onClick={handleBack}
                  aria-label="Back to day selection"
                >
                  ‹
                </button>
                {selectedDayLabel}
              </>
            ) : (
              'Add to Planner'
            )}
          </span>
          <button
            type="button"
            className="day-selector-close"
            onClick={onClose}
            aria-label="Cancel"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <p className="day-selector-prompt">
          {currentStep === STEP_MEAL ? 'Which meal?' : 'Which day?'}
        </p>

        {currentStep === STEP_MEAL ? (
          <ul className="day-selector-list" ref={listRef} role="listbox">
            {MEAL_TYPES.map((mealType, i) => (
              <li key={mealType} role="option">
                <button
                  type="button"
                  ref={i === 0 ? firstBtnRef : null}
                  className="day-selector-item"
                  onClick={() => handleMealTypeSelect(mealType)}
                  aria-label={`Add to ${MEAL_TYPE_DISPLAY[mealType]}`}
                >
                  {MEAL_TYPE_DISPLAY[mealType]}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="day-selector-list" ref={listRef} role="listbox">
            {days.map(({ dateString, displayLabel }, i) => (
              <li key={dateString} role="option">
                <button
                  type="button"
                  ref={i === 0 ? firstBtnRef : null}
                  className="day-selector-item"
                  onClick={() => handleDateSelect(dateString)}
                  aria-label={`Add to ${displayLabel}`}
                >
                  {displayLabel}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
