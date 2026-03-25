import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useMealPlan } from './MealPlanContext.jsx'

/**
 * Aggregates ingredients from all recipes across mealPlan and upNext into a
 * deduplicated, counted list.
 *
 * @param {Object} mealPlan - date-keyed meal plan from MealPlanContext
 * @param {Array}  upNext   - staged recipes from MealPlanContext
 * @returns {Array<{ id: string, ingredient: string, count: number }>}
 */
export function aggregateIngredients(mealPlan, upNext) {
  const allRecipes = []

  // Gather every recipe from every day / meal slot
  Object.values(mealPlan || {}).forEach((day) => {
    Object.values(day || {}).forEach((slotRecipes) => {
      if (Array.isArray(slotRecipes)) allRecipes.push(...slotRecipes)
    })
  })

  // Include staged (upNext) recipes
  if (Array.isArray(upNext)) allRecipes.push(...upNext)

  // Flatten, filter empty strings, deduplicate with count
  const countMap = new Map()
  allRecipes.forEach((recipe) => {
    if (!recipe || !Array.isArray(recipe.ingredients)) return
    recipe.ingredients.forEach((ing) => {
      if (typeof ing === 'string' && ing.trim() !== '') {
        countMap.set(ing, (countMap.get(ing) ?? 0) + 1)
      }
    })
  })

  return Array.from(countMap.entries()).map(([ingredient, count], idx) => ({
    id: `ingredient-${idx}`,
    ingredient,
    count,
  }))
}

/**
 * GroceryListModal
 *
 * Slide-up modal that shows a single checklist of all ingredients across the
 * entire meal plan (all days + upNext staging area).  Checked state is
 * session-local — it resets every time the modal is opened.
 *
 * The component reads `mealPlan` and `upNext` directly from MealPlanContext so
 * the parent only needs to manage visibility.
 *
 * @param {boolean}  props.isOpen  - Whether the modal is currently visible
 * @param {function} props.onClose - Callback fired to close the modal
 */
export default function GroceryListModal({ isOpen, onClose }) {
  const { mealPlan, upNext } = useMealPlan()

  // Aggregate once per render; recomputes only when the plan changes
  const ingredients = useMemo(
    () => aggregateIngredients(mealPlan, upNext),
    [mealPlan, upNext]
  )

  // checked: { [ingredientId]: true }  — keys present only when checked
  const [checkedItems, setCheckedItems] = useState({})

  // Reset checked state every time the modal opens (fresh session)
  useEffect(() => {
    if (isOpen) setCheckedItems({})
  }, [isOpen])

  // Escape key closes modal
  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  const handleCheckToggle = useCallback((id) => {
    setCheckedItems((prev) => ({ ...prev, [id]: !prev[id] }))
  }, [])

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onClose()
  }

  // Don't render anything while closed — fresh state is guaranteed by the
  // useEffect above that resets checkedItems when isOpen flips to true.
  if (!isOpen) return null

  return (
    <div
      className="grocery-modal-overlay"
      onClick={handleBackdropClick}
      aria-hidden="false"
    >
      <div
        className="grocery-modal-container"
        role="dialog"
        aria-modal="true"
        aria-label="Grocery list"
      >
        <div className="grocery-modal-header">
          <h2 className="grocery-modal-title">Grocery List</h2>
          <button
            type="button"
            className="grocery-modal-close"
            onClick={onClose}
            aria-label="Close grocery list"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="grocery-modal-content">
          {ingredients.length === 0 ? (
            <p className="grocery-modal-empty">
              No recipes planned yet — add recipes to your meal plan to generate a grocery list.
            </p>
          ) : (
            <ul className="grocery-list" role="list">
              {ingredients.map(({ id, ingredient, count }) => {
                const isChecked = !!checkedItems[id]
                return (
                  <li
                    key={id}
                    className={`grocery-item${isChecked ? ' grocery-item--checked' : ''}`}
                  >
                    <label className="grocery-item__label" htmlFor={id}>
                      <input
                        type="checkbox"
                        id={id}
                        className="grocery-item__checkbox"
                        checked={isChecked}
                        onChange={() => handleCheckToggle(id)}
                        aria-label={ingredient}
                      />
                      <span className="grocery-item__text">{ingredient}</span>
                      {count > 1 && (
                        <span className="grocery-item__count" aria-label={`needed ${count} times`}>
                          ×{count}
                        </span>
                      )}
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
