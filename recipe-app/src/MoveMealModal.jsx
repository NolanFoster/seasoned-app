import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useMealPlan } from './MealPlanContext.jsx'
import { MEAL_TYPES, MEAL_TYPE_DISPLAY } from './utils/mealPlanMigration.js'

const STEP_DATE = 'selectDate'
const STEP_MEAL = 'selectMealType'
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
 * MoveMealModal — two-step tap-to-move flow for mobile-friendly recipe moving.
 *
 * Step 1 (STEP_DATE):  User picks the destination date from the next 7 days.
 * Step 2 (STEP_MEAL):  User picks the destination meal type.
 *
 * After both selections, calls onMove(destDate, destMealType, destIndex) where
 * destIndex is computed by appending to the end of the destination slot.
 *
 * @param {boolean}  isOpen          - Controls modal visibility.
 * @param {function} onClose         - Called to close the modal (no action).
 * @param {string}   sourceDate      - ISO date string of the recipe being moved.
 * @param {string}   sourceMealType  - Meal type of the source slot.
 * @param {number}   sourceIndex     - Index in the source meal array.
 * @param {Object}   sourceRecipe    - The recipe object being moved (for display).
 * @param {function} onMove          - Called with (destDate, destMealType, destIndex).
 */
export default function MoveMealModal({
  isOpen,
  onClose,
  sourceDate,
  sourceMealType,
  sourceIndex,
  sourceRecipe,
  onMove,
}) {
  const { mealPlan } = useMealPlan()
  const [step, setStep] = useState(STEP_DATE)
  const [selectedDate, setSelectedDate] = useState(null)
  const days = useMemo(() => generateUpcomingDays(DAY_COUNT), [])
  const firstBtnRef = useRef(null)
  const listRef = useRef(null)
  const modalId = 'move-meal-modal-title'

  // Reset step state whenever the modal is opened
  useEffect(() => {
    if (isOpen) {
      setStep(STEP_DATE)
      setSelectedDate(null)
    }
  }, [isOpen])

  // Focus the first list item when the step changes
  useEffect(() => {
    if (isOpen) firstBtnRef.current?.focus()
  }, [isOpen, step])

  // Keyboard: Escape goes back one step or closes; arrows navigate list
  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        if (step === STEP_MEAL) {
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
  }, [isOpen, step, onClose])

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onClose()
  }

  function handleDateSelect(dateString) {
    setSelectedDate(dateString)
    setStep(STEP_MEAL)
  }

  function handleMealTypeSelect(mealType) {
    // Append to the end of the destination slot
    const destMeals = mealPlan[selectedDate]?.[mealType] ?? []
    const destIndex = destMeals.length
    onMove(selectedDate, mealType, destIndex)
  }

  function handleBack() {
    setStep(STEP_DATE)
    setSelectedDate(null)
  }

  if (!isOpen) return null

  const selectedDayLabel =
    step === STEP_MEAL
      ? (days.find((d) => d.dateString === selectedDate)?.displayLabel ?? selectedDate)
      : null

  return (
    <div
      className="move-meal-modal__backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby={modalId}
    >
      <div className="move-meal-modal">
        {/* Header */}
        <div className="move-meal-modal__header">
          <div className="move-meal-modal__header-left">
            {step === STEP_MEAL && (
              <button
                type="button"
                className="move-meal-modal__back"
                onClick={handleBack}
                aria-label="Back to date selection"
              >
                ‹
              </button>
            )}
            <span id={modalId} className="move-meal-modal__title">
              {step === STEP_MEAL ? selectedDayLabel : 'Move to…'}
            </span>
          </div>
          <button
            type="button"
            className="move-meal-modal__close"
            onClick={onClose}
            aria-label="Cancel"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Source recipe context */}
        <div className="move-meal-modal__context">
          <span className="move-meal-modal__context-label">Moving:</span>
          <span className="move-meal-modal__context-recipe">{sourceRecipe?.name}</span>
        </div>

        {/* Step prompt */}
        <p className="move-meal-modal__prompt">
          {step === STEP_MEAL ? 'Which meal?' : 'Which day?'}
        </p>

        {/* Step 1: date list */}
        {step === STEP_DATE && (
          <ul className="move-meal-modal__list" ref={listRef} role="listbox">
            {days.map(({ dateString, displayLabel }, i) => (
              <li key={dateString} role="option">
                <button
                  type="button"
                  ref={i === 0 ? firstBtnRef : null}
                  className="move-meal-modal__item"
                  onClick={() => handleDateSelect(dateString)}
                  aria-label={`Move to ${displayLabel}`}
                >
                  {displayLabel}
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Step 2: meal type list */}
        {step === STEP_MEAL && (
          <ul className="move-meal-modal__list" ref={listRef} role="listbox">
            {MEAL_TYPES.map((mealType, i) => (
              <li key={mealType} role="option">
                <button
                  type="button"
                  ref={i === 0 ? firstBtnRef : null}
                  className="move-meal-modal__item"
                  onClick={() => handleMealTypeSelect(mealType)}
                  aria-label={`Move to ${MEAL_TYPE_DISPLAY[mealType]}`}
                >
                  {MEAL_TYPE_DISPLAY[mealType]}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
