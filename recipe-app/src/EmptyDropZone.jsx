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
      <span className="day-card__empty-state__text">{text}</span>
    </div>
  )
}
