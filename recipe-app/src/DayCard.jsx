import React from 'react'
import { Droppable, Draggable } from '@hello-pangea/dnd'
import EmptyDropZone from './EmptyDropZone.jsx'
import DragPortal from './DragPortal.jsx'
import { useMealPlan } from './MealPlanContext.jsx'
import { MEAL_TYPES, MEAL_TYPE_DISPLAY } from './utils/mealPlanMigration.js'

function checkIsToday(dateStr) {
  const today = new Date()
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return dateStr === `${months[today.getMonth()]} ${today.getDate()}`
}

/**
 * Encodes a date + mealType into a single droppableId string.
 * Used as the key between DayCard and MealPlanner's drag handlers.
 */
export function encodeDroppableId(dateString, mealType) {
  return `${dateString}||${mealType}`
}

export default function DayCard({ day, date, dateString, meals, onRemoveMeal }) {
  const { setActiveRecipe } = useMealPlan()
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

      {MEAL_TYPES.map((mealType) => {
        const slotMeals = meals?.[mealType] ?? []
        const droppableId = encodeDroppableId(dateString, mealType)

        return (
          <div key={mealType} className="day-card-meal-section">
            <span className="meal-type-label">{MEAL_TYPE_DISPLAY[mealType]}</span>

            {/* Each meal type is its own drop zone */}
            <Droppable droppableId={droppableId} type="MEAL">
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`day-card-meals${snapshot.isDraggingOver ? ' day-card--drag-over' : ''}`}
                >
                  {slotMeals.length === 0 && <EmptyDropZone />}

                  {slotMeals.map((meal, index) => (
                    <Draggable
                      key={meal.id}
                      draggableId={meal.id}
                      index={index}
                    >
                      {(provided, snapshot) => (
                        <DragPortal isActive={snapshot.isDragging}>
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={`meal-item${snapshot.isDragging ? ' meal-item--dragging' : ''}`}
                            data-testid={`meal-item-${meal.id}`}
                          >
                            <span
                              className="drag-handle"
                              title="Drag to reorder"
                              aria-label="Drag handle"
                            >
                              ⠿
                            </span>
                            <button
                              type="button"
                              className="meal-item-name"
                              onClick={() => setActiveRecipe(meal)}
                              aria-label={`View ${meal.name}`}
                            >
                              {meal.name}
                            </button>
                            <button
                              type="button"
                              className="meal-item-remove"
                              onClick={(e) => {
                                e.stopPropagation()
                                onRemoveMeal(mealType, meal.id)
                              }}
                              aria-label={`Remove ${meal.name}`}
                            >
                              ×
                            </button>
                          </div>
                        </DragPortal>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>
        )
      })}
    </div>
  )
}
