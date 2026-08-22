import React from 'react'

const EMPTY_DROP_ZONE_TEXT = 'Drop meals here'

/**
 * EmptyDropZone — purely presentational empty-state indicator.
 * Rendered inside the Droppable container when a day has no scheduled meals,
 * providing a clear visual affordance for drag-and-drop operations.
 * Must NOT contain interactive elements (no click handlers, buttons, or inputs).
 */
export default function EmptyDropZone({ text = EMPTY_DROP_ZONE_TEXT }) {
  return (
    <div
      className="day-card__empty-state"
      aria-label="No meals planned. Drag a meal here to add it."
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" style={{ opacity: 0.5, marginBottom: '8px' }}>
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" strokeLinecap="round" strokeLinejoin="round"/>
        <line x1="16" y1="2" x2="16" y2="6" strokeLinecap="round" strokeLinejoin="round"/>
        <line x1="8" y1="2" x2="8" y2="6" strokeLinecap="round" strokeLinejoin="round"/>
        <line x1="3" y1="10" x2="21" y2="10" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <span className="day-card__empty-state__text">{text}</span>
    </div>
  )
}
