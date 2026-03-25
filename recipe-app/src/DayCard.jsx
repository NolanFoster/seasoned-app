import React, { useState } from 'react'
import { Droppable, Draggable } from '@hello-pangea/dnd'
import EmptyDropZone from './EmptyDropZone.jsx'
import DragPortal from './DragPortal.jsx'
import MoveMealModal from './MoveMealModal.jsx'
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
 * Each recipe item shows a Move button (↔) that opens MoveMealModal — a
 * two-step tap-to-move flow for mobile-friendly repositioning.
 *
 * @param {string}   day           - Display day name, e.g. "Monday"
 * @param {string}   date          - Display date, e.g. "Mar 25"
 * @param {string}   dateString    - ISO date string used as droppable key, e.g. "2026-03-25"
 * @param {Object}   meals         - Shape: { breakfast: [], lunch: [], dinner: [], snack: [] }
 * @param {function} onRemoveMeal  - Called with (mealType, recipeId) when a recipe is removed
 */
export default function DayCard({ day, date, dateString, meals, onRemoveMeal }) {
  const { setActiveRecipe, moveMeal } = useMealPlan()
  const [movingMeal, setMovingMeal] = useState(null) // { recipe, mealType, index } | null

  const todayCard = checkIsToday(date)

  // Defensive: if meals is missing or a slot key is absent, treat as empty array
  const safeMeals = meals || { breakfast: [], lunch: [], dinner: [], snack: [] }

  const isAllEmpty = MEAL_TYPES.every(
    (type) => !safeMeals[type] || safeMeals[type].length === 0
  )

  let className = 'day-card'
  if (todayCard) className += ' day-card--today'

  function handleMoveClick(e, meal, mealType, index) {
    e.stopPropagation()
    setMovingMeal({ recipe: meal, mealType, index })
  }

  function handleMoveConfirm(destDate, destMealType, destIndex) {
    moveMeal(dateString, movingMeal.mealType, destDate, destMealType, movingMeal.index, destIndex)
    setMovingMeal(null)
  }

  return (
    <div className={className}>
      <div className="day-card-header">
        <span className="day-name">{day}</span>
        <span className="day-date">{date}</span>
      </div>

      {MEAL_TYPES.map((mealType) => {
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
                            onClick={() => setActiveRecipe(meal)}
                          >
                            <span
                              className="drag-handle"
                              title="Drag to reorder"
                              aria-label="Drag handle"
                            >
                              ⠿
                            </span>
                            <span
                              className="meal-item-name"
                              aria-label={`View ${meal.name}`}
                            >
                              {meal.name}
                            </span>
                            <div className="meal-item-actions">
                              <button
                                type="button"
                                className="meal-item-action-btn meal-item-view"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setActiveRecipe(meal)
                                }}
                                aria-label={`View ${meal.name}`}
                                title="View recipe"
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12" aria-hidden="true">
                                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                                  <circle cx="12" cy="12" r="3"/>
                                </svg>
                              </button>
                              <button
                                type="button"
                                className="meal-item-action-btn meal-item-move"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleMoveClick(e, meal, mealType, index)
                                }}
                                aria-label={`Move ${meal.name}`}
                                title="Move to another slot"
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12" aria-hidden="true">
                                  <path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/>
                                </svg>
                              </button>
                              <button
                                type="button"
                                className="meal-item-action-btn meal-item-remove"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onRemoveMeal(mealType, meal.id)
                                }}
                                aria-label={`Remove ${meal.name}`}
                                title="Remove recipe"
                              >
                                ×
                              </button>
                            </div>
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

      {movingMeal && (
        <MoveMealModal
          isOpen={true}
          onClose={() => setMovingMeal(null)}
          sourceDate={dateString}
          sourceMealType={movingMeal.mealType}
          sourceIndex={movingMeal.index}
          sourceRecipe={movingMeal.recipe}
          onMove={handleMoveConfirm}
        />
      )}
    </div>
  )
}
