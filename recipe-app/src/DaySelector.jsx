import React, { useEffect, useRef, useMemo, useState } from 'react'
import { MEAL_TYPES, MEAL_TYPE_DISPLAY } from './utils/mealPlanMigration.js'

const DAY_COUNT = 7

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
 * Two-step modal: first pick a day, then pick a meal type.
 * Calls onDaySelected(dateString, mealType) when both are chosen.
 */
export default function DaySelector({ onDaySelected, onClose }) {
  const days = useMemo(() => generateUpcomingDays(DAY_COUNT), [])
  const [selectedDate, setSelectedDate] = useState(null)
  const listRef = useRef(null)
  const firstBtnRef = useRef(null)

  // Focus first item whenever the step changes
  useEffect(() => {
    firstBtnRef.current?.focus()
  }, [selectedDate])

  // Close on Escape; arrow-key navigation within the visible list
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        if (selectedDate) {
          setSelectedDate(null)
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
  }, [onClose, selectedDate])

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onClose()
  }

  function handleDayClick(dateString) {
    setSelectedDate(dateString)
  }

  function handleMealTypeClick(mealType) {
    onDaySelected(selectedDate, mealType)
  }

  const isMealTypeStep = Boolean(selectedDate)
  const selectedDayLabel = isMealTypeStep
    ? days.find((d) => d.dateString === selectedDate)?.displayLabel ?? selectedDate
    : null

  return (
    <div
      className="day-selector-backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={isMealTypeStep ? 'Select a meal type' : 'Select a day to add this recipe'}
    >
      <div className="day-selector">
        <div className="day-selector-header">
          <span>
            {isMealTypeStep ? (
              <>
                <button
                  type="button"
                  className="day-selector-back"
                  onClick={() => setSelectedDate(null)}
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
            aria-label="Close day selector"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {isMealTypeStep ? (
          <ul className="day-selector-list" ref={listRef} role="listbox">
            {MEAL_TYPES.map((mealType, i) => (
              <li key={mealType} role="option">
                <button
                  type="button"
                  ref={i === 0 ? firstBtnRef : null}
                  className="day-selector-item"
                  onClick={() => handleMealTypeClick(mealType)}
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
                  onClick={() => handleDayClick(dateString)}
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
