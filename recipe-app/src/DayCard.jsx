import React from 'react'
import { Droppable, Draggable } from '@hello-pangea/dnd'
import EmptyDropZone from './EmptyDropZone.jsx'
import DragPortal from './DragPortal.jsx'
import { useMealPlan } from './MealPlanContext.jsx'

function checkIsToday(dateStr) {
  const today = new Date()
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return dateStr === `${months[today.getMonth()]} ${today.getDate()}`
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

      {/* Droppable zone — droppableId is the ISO date string so MealPlanner's
          onDragEnd handler can map it back to the correct day in context state */}
      <Droppable droppableId={dateString} type="MEAL">
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`day-card-meals${snapshot.isDraggingOver ? ' day-card--drag-over' : ''}`}
          >
            {/* Empty drop-zone — shown only when there are no meals */}
            {meals.length === 0 && <EmptyDropZone />}

            {meals.map((meal, index) => (
                /* Draggable — draggableId must be globally unique and stable;
                   combine date + index to avoid collisions across days */
                <Draggable
                  key={meal.id}
                  draggableId={meal.id}
                  index={index}
                >
                  {(provided, snapshot) => (
                    /* DragPortal moves the element to document.body while
                       dragging, escaping the drawer's CSS transform stacking
                       context so position:fixed ghost coords are viewport-
                       relative. See DragPortal.jsx for the full explanation. */
                    <DragPortal isActive={snapshot.isDragging}>
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
                        {/* Clicking the name opens the full RecipeCard via context;
                            App.jsx watches activeRecipe and closes the drawer. */}
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
                          onClick={() => onRemoveMeal(meal.id)}
                          aria-label={`Remove ${meal.name}`}
                        >
                          ×
                        </button>
                      </div>
                    </DragPortal>
                  )}
                </Draggable>
            ))}
            {/* Placeholder preserves list height while an item is being dragged */}
            {provided.placeholder}
          </div>
        )}
      </Droppable>

    </div>
  )
}
