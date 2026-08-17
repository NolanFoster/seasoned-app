import React from 'react'
import { Droppable, Draggable } from '@hello-pangea/dnd'
import DragPortal from './DragPortal.jsx'
import { useMealPlan } from './MealPlanContext.jsx'
import { parseDuration } from './RecipeCardDisplay.jsx'

/**
 * UpNextCard — horizontal staging area for recipes queued via "Save to Up Next".
 *
 * Renders a horizontally-scrollable Droppable zone (`droppableId="upNext"`) so
 * that recipes can be:
 *   - dragged out from here into any date/meal-type slot in the planner
 *   - dragged back from a slot into this staging area
 *   - reordered within this zone
 *
 * The component is self-contained; all state lives in MealPlanContext.
 * It does NOT manage drag events — the parent DragDropContext onDragEnd handler
 * (in MealPlanner.jsx) routes drags that involve droppableId="upNext" to
 * MealPlanContext.moveMeal.
 *
 * CSS classes (to be styled in Step 6):
 *   up-next__section         — outer section wrapper
 *   up-next__heading         — "Up Next" label
 *   up-next__container       — horizontally scrollable Droppable wrapper
 *   up-next__card            — individual mini recipe card
 *   up-next__card--dragging  — applied while card is being dragged
 *   up-next__card-image      — thumbnail image
 *   up-next__card-content    — text content area (name + meta)
 *   up-next__card-title      — recipe name
 *   up-next__card-meta       — prep/cook time metadata
 *   up-next__card-remove     — remove button
 *   up-next__empty           — empty-state placeholder
 */
/**
 * Recipes reach the staging area straight from the recipe card, which uses the
 * app's canonical field names (`image`, `prep_time`, `cook_time`), while worker
 * payloads use camelCase. Read both so an AI-generated recipe keeps its image
 * after being staged.
 */
function getImage(recipe) {
  return recipe.image || recipe.imageUrl || recipe.image_url || ''
}

function getTimeLabel(recipe, canonical, camel, suffix) {
  const value = recipe[canonical] ?? recipe[camel]
  if (value == null || value === '') return null
  // Bare numbers are already minutes; ISO durations need expanding.
  if (typeof value === 'number') return `${value}m ${suffix}`
  const parsed = parseDuration(value)
  return parsed ? `${parsed} ${suffix}` : null
}

export default function UpNextCard() {
  const { upNext, removeUpNext } = useMealPlan()

  return (
    <section className="up-next__section" aria-label="Up Next staging area">
      <h3 className="up-next__heading">Up Next</h3>

      {/* Always render the Droppable so recipes can be dragged in even when empty */}
      <Droppable droppableId="upNext" type="MEAL" direction="horizontal">
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`up-next__container${snapshot.isDraggingOver ? ' up-next__container--drag-over' : ''}`}
          >
            {upNext.length === 0 && (
              <p className="up-next__empty" aria-live="polite">
                No recipes staged yet. Use "Save to Up Next" on any recipe card.
              </p>
            )}

            {upNext.map((recipe, index) => {
              const image = getImage(recipe)
              const prepLabel = getTimeLabel(recipe, 'prep_time', 'prepTime', 'prep')
              const cookLabel = getTimeLabel(recipe, 'cook_time', 'cookTime', 'cook')

              return (
              <Draggable
                key={recipe.id}
                draggableId={`upNext-${recipe.id}`}
                index={index}
              >
                {(provided, snapshot) => (
                  <DragPortal isActive={snapshot.isDragging}>
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                      className={`up-next__card${snapshot.isDragging ? ' up-next__card--dragging' : ''}`}
                      data-testid={`up-next-card-${recipe.id}`}
                    >
                      {image && (
                        <img
                          src={image}
                          alt={recipe.name}
                          className="up-next__card-image"
                        />
                      )}

                      <div className="up-next__card-content">
                        <h4 className="up-next__card-title">{recipe.name}</h4>
                        {(prepLabel || cookLabel) && (
                          <div className="up-next__card-meta">
                            {prepLabel && <span>{prepLabel}</span>}
                            {cookLabel && <span>{cookLabel}</span>}
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        className="up-next__card-remove"
                        onClick={(e) => {
                          e.stopPropagation()
                          removeUpNext(recipe.id)
                        }}
                        aria-label={`Remove ${recipe.name} from Up Next`}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="12" height="12" aria-hidden="true">
                          <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                      </button>
                    </div>
                  </DragPortal>
                )}
              </Draggable>
              )
            })}

            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </section>
  )
}
