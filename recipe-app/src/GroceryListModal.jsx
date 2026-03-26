import React, { useCallback, useEffect, useState } from 'react'
import { useMealPlan } from './MealPlanContext.jsx'

const RECIPE_GENERATION_URL = import.meta.env.VITE_RECIPE_GENERATION_URL

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
 * Flattens all ingredients from mealPlan and upNext into a raw string array
 * (no deduplication) for the API call.
 *
 * @param {Object} mealPlan - date-keyed meal plan from MealPlanContext
 * @param {Array}  upNext   - staged recipes from MealPlanContext
 * @returns {string[]}
 */
export function flattenIngredients(mealPlan, upNext) {
  const allRecipes = []

  Object.values(mealPlan || {}).forEach((day) => {
    Object.values(day || {}).forEach((slotRecipes) => {
      if (Array.isArray(slotRecipes)) allRecipes.push(...slotRecipes)
    })
  })

  if (Array.isArray(upNext)) allRecipes.push(...upNext)

  const result = []
  allRecipes.forEach((recipe) => {
    if (!recipe || !Array.isArray(recipe.ingredients)) return
    recipe.ingredients.forEach((ing) => {
      if (typeof ing === 'string' && ing.trim() !== '') {
        result.push(ing)
      }
    })
  })

  return result
}

/**
 * GroceryListModal
 *
 * Slide-up modal that fetches a categorized grocery list from the API using all
 * ingredients across the entire meal plan (all days + upNext staging area).
 * Supports shimmer loading, error state with retry, category expand/collapse,
 * and item-level / category-level checkboxes.
 *
 * The component reads `mealPlan` and `upNext` directly from MealPlanContext so
 * the parent only needs to manage visibility.
 *
 * @param {boolean}  props.isOpen  - Whether the modal is currently visible
 * @param {function} props.onClose - Callback fired to close the modal
 */
export default function GroceryListModal({ isOpen, onClose }) {
  const { mealPlan, upNext } = useMealPlan()

  // 'loading' | 'success' | 'error'
  const [status, setStatus] = useState('loading')
  const [categories, setCategories] = useState([])
  const [errorMsg, setErrorMsg] = useState('')
  const [checkedItems, setCheckedItems] = useState({})
  const [expandedCategories, setExpandedCategories] = useState({})

  const fetchGroceryList = useCallback(async () => {
    setStatus('loading')
    setCheckedItems({})
    setExpandedCategories({})
    const ingredients = flattenIngredients(mealPlan, upNext)
    if (ingredients.length === 0) {
      setStatus('success')
      setCategories([])
      return
    }
    try {
      const controller = new AbortController()
      const tid = setTimeout(() => controller.abort(), 15000)
      const res = await fetch(`${RECIPE_GENERATION_URL}/grocery-list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredients }),
        signal: controller.signal,
      })
      clearTimeout(tid)
      if (!res.ok) throw new Error(`Server error: ${res.status}`)
      const data = await res.json()
      if (!data.success || !Array.isArray(data.categories))
        throw new Error('Invalid response from server. Please try again.')
      setCategories(data.categories)
      setExpandedCategories(
        Object.fromEntries(data.categories.map((c) => [c.category, true]))
      )
      setStatus('success')
    } catch (err) {
      setErrorMsg(
        err.name === 'AbortError'
          ? 'Request timed out. Please try again.'
          : err.message || 'Unable to generate grocery list. Please try again.'
      )
      setStatus('error')
    }
  }, [mealPlan, upNext])

  useEffect(() => {
    if (isOpen) fetchGroceryList()
  }, [isOpen, fetchGroceryList])

  // Escape key closes modal
  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onClose()
  }

  function toggleItemChecked(itemId) {
    setCheckedItems((prev) => ({ ...prev, [itemId]: !prev[itemId] }))
  }

  function toggleCategoryExpanded(category) {
    setExpandedCategories((prev) => ({ ...prev, [category]: !prev[category] }))
  }

  function handleCategoryCheckbox(category, items) {
    const allChecked = items.every((item) => checkedItems[`${category}::${item.name}`])
    setCheckedItems((prev) => {
      const next = { ...prev }
      items.forEach((item) => {
        next[`${category}::${item.name}`] = !allChecked
      })
      return next
    })
  }

  function isCategoryAllChecked(category, items) {
    return items.length > 0 && items.every((item) => checkedItems[`${category}::${item.name}`])
  }

  if (!isOpen) return null

  return (
    <div
      className="grocery-modal-overlay"
      onClick={handleBackdropClick}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="grocery-modal-title"
      >
        <div className="grocery-modal-header">
          <h2 id="grocery-modal-title">Grocery List</h2>
          <button
            type="button"
            aria-label="Close grocery list"
            onClick={onClose}
          >
            X
          </button>
        </div>

        <div className="grocery-modal-content">
          {status === 'loading' && (
            <div
              data-testid="grocery-shimmer"
              aria-busy="true"
              className="grocery-shimmer"
            >
              <div className="grocery-shimmer__line" />
              <div className="grocery-shimmer__line" />
              <div className="grocery-shimmer__line" />
            </div>
          )}

          {status === 'error' && (
            <div role="alert">
              <p>{errorMsg}</p>
              <button type="button" onClick={fetchGroceryList}>
                Try Again
              </button>
            </div>
          )}

          {status === 'success' && categories.length === 0 && (
            <p>No recipes planned yet — add recipes to your meal plan to generate a grocery list.</p>
          )}

          {status === 'success' && categories.length > 0 && (
            <ul role="list">
              {categories.map(({ category, items }) => {
                const isExpanded = !!expandedCategories[category]
                const allChecked = isCategoryAllChecked(category, items)
                return (
                  <li key={category}>
                    <div>
                      <input
                        type="checkbox"
                        aria-label={`Select all items in ${category}`}
                        checked={allChecked}
                        onChange={() => handleCategoryCheckbox(category, items)}
                      />
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        onClick={() => toggleCategoryExpanded(category)}
                      >
                        {category}
                      </button>
                    </div>
                    {isExpanded && (
                      <ul role="list">
                        {items.map((item) => {
                          const itemId = `${category}::${item.name}`
                          const isChecked = !!checkedItems[itemId]
                          return (
                            <li
                              key={itemId}
                              className={`grocery-item${isChecked ? ' grocery-item--checked' : ''}`}
                            >
                              <label htmlFor={itemId}>
                                <input
                                  type="checkbox"
                                  id={itemId}
                                  aria-label={item.name}
                                  checked={isChecked}
                                  onChange={() => toggleItemChecked(itemId)}
                                />
                                <span>{item.name}</span>
                                {item.quantity && <span>{item.quantity}</span>}
                              </label>
                            </li>
                          )
                        })}
                      </ul>
                    )}
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
