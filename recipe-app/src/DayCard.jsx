import React from 'react'
import { Droppable, Draggable } from '@hello-pangea/dnd'
import { PlusIcon } from './MealPlanner.jsx'

function checkIsToday(dateStr) {
  const today = new Date()
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return dateStr === `${months[today.getMonth()]} ${today.getDate()}`
}

export default function DayCard({ day, date, dateString, meals, onAddMeal, onRemoveMeal }) {
  const todayCard = checkIsToday(date)
  const wideCard = day === 'Sunday'

  let className = 'day-card'
  if (todayCard) className += ' day-card--today'
  if (wideCard) className += ' day-card--wide'

  return (
    <div className={className}>
      <div className="day-card-header">
        <span className="day-name">{day}</span>
        <span className="day-date">{date}</span>
      </div>

      {/* Droppable zone — droppableId is the ISO date string so MealPlanner's
          onDragEnd handler can map it back to the correct day in context state */}
      <Droppable droppableId={dateString} type="MEAL">
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`day-card-meals${snapshot.isDraggingOver ? ' day-card--drag-over' : ''}`}
          >
            {meals.length === 0 && !snapshot.isDraggingOver ? (
              <div className="meal-slot-empty">No meals planned</div>
            ) : (
              meals.map((meal, index) => (
                /* Draggable — draggableId must be globally unique and stable;
                   combine date + index to avoid collisions across days */
                <Draggable
                  key={meal.id}
                  draggableId={meal.id}
                  index={index}
                >
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      className={`meal-item${snapshot.isDragging ? ' meal-item--dragging' : ''}`}
                    >
                      {/* Drag handle — only this element initiates a drag */}
                      <span
                        {...provided.dragHandleProps}
                        className="drag-handle"
                        title="Drag to reorder"
                        aria-label="Drag handle"
                      >
                        ⠿
                      </span>
                      <span className="meal-item-name">{meal.name}</span>
                      <button
                        type="button"
                        className="meal-item-remove"
                        onClick={() => onRemoveMeal(meal.id)}
                        aria-label={`Remove ${meal.name}`}
                      >
                        ×
                      </button>
                    </div>
                  )}
                </Draggable>
              ))
            )}
            {/* Placeholder preserves list height while an item is being dragged */}
            {provided.placeholder}
          </div>
        )}
      </Droppable>

      <div className="day-card-actions">
        <button
          type="button"
          className="add-meal-btn"
          onClick={() => onAddMeal(day)}
          aria-label={`Add meal for ${day}`}
        >
          <PlusIcon size={12} />
          Add meal
        </button>
      </div>
    </div>
  )
}
