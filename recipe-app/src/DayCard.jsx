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
 * Encodes a dateString and mealType into a single droppableId string.
 * Format: "${dateString}::${mealType}"
 * Parsed by MealPlanner's onDragEnd handler via split('::').
 */
export function encodeDroppableId(dateString, mealType) {
  return `${dateString}::${mealType}`
}

/**
 * DayCard — renders a single day column in the meal planner.
 *
 * When all four meal-type slots are empty, a single card-level EmptyDropZone
 * is shown. Once at least one slot has recipes, the four named sections
 * (Breakfast, Lunch, Dinner, Snack) become visible, each with its own
 * Droppable zone.
 *
 * @param {string}   day           - Display day name, e.g. "Monday"
 * @param {string}   date          - Display date, e.g. "Mar 25"
 * @param {string}   dateString    - ISO date string used as droppable key, e.g. "2026-03-25"
 * @param {Object}   meals         - Shape: { breakfast: [], lunch: [], dinner: [], snack: [] }
 * @param {function} onRemoveMeal  - Called with (mealType, recipeId) when a recipe is removed
 */
export default function DayCard({ day, date, dateString, meals, onRemoveMeal }) {
  const { setActiveRecipe } = useMealPlan()
  const todayCard = checkIsToday(date)
  const wideCard = day === 'Sunday'

  // Defensive: if meals is missing or a slot key is absent, treat as empty array
  const safeMeals = meals || { breakfast: [], lunch: [], dinner: [], snack: [] }

  const isAllEmpty = MEAL_TYPES.every(
    (type) => !safeMeals[type] || safeMeals[type].length === 0
  )

  let className = 'day-card'
  if (todayCard) className += ' day-card--today'
  if (wideCard) className += ' day-card--wide'

  return (
    <div className={className}>
      <div className="day-card-header">
        <span className="day-name">{day}</span>
        <span className="day-date">{date}</span>
      </div>

      {isAllEmpty ? (
        // Single card-level placeholder when the entire day has no meals
        <EmptyDropZone />
      ) : (
        // Four named sections — each with its own droppable zone
        MEAL_TYPES.map((mealType) => {
          const slotMeals = safeMeals[mealType] ?? []
          const droppableId = encodeDroppableId(dateString, mealType)

          return (
            <div
              key={mealType}
              className={`day-card-meal-section meal-zone-${mealType}`}
              role="region"
              aria-label={MEAL_TYPE_DISPLAY[mealType]}
            >
              <span className="meal-type-label">{MEAL_TYPE_DISPLAY[mealType]}</span>

              <Droppable droppableId={droppableId} type="MEAL">
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`day-card-meals${snapshot.isDraggingOver ? ' day-card--drag-over' : ''}`}
                  >
                    {slotMeals.length === 0 && (
                      <p className="meal-slot-empty" aria-label="No meals planned for this slot">
                        No meals
                      </p>
                    )}

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
        })
      )}
    </div>
  )
}
