import React, { useEffect, useRef, useMemo } from 'react'

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

export default function DaySelector({ onDaySelected, onClose }) {
  const days = useMemo(() => generateUpcomingDays(DAY_COUNT), [])
  const listRef = useRef(null)
  const firstBtnRef = useRef(null)

  // Focus first item on mount
  useEffect(() => {
    firstBtnRef.current?.focus()
  }, [])

  // Close on Escape; arrow-key navigation
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        onClose()
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
  }, [onClose])

  // Close on backdrop click
  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      className="day-selector-backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Select a day to add this recipe"
    >
      <div className="day-selector">
        <div className="day-selector-header">
          <span>Add to Planner</span>
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
        <ul className="day-selector-list" ref={listRef} role="listbox">
          {days.map(({ dateString, displayLabel }, i) => (
            <li key={dateString} role="option">
              <button
                type="button"
                ref={i === 0 ? firstBtnRef : null}
                className="day-selector-item"
                onClick={() => onDaySelected(dateString)}
                aria-label={`Add to ${displayLabel}`}
              >
                {displayLabel}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
