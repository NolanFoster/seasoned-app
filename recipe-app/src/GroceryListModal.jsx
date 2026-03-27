import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useMealPlan } from './MealPlanContext.jsx'

// ── Utility exports (preserved for backward-compatibility and tests) ──────────

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

  Object.values(mealPlan || {}).forEach((day) => {
    Object.values(day || {}).forEach((slotRecipes) => {
      if (Array.isArray(slotRecipes)) allRecipes.push(...slotRecipes)
    })
  })

  if (Array.isArray(upNext)) allRecipes.push(...upNext)

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

// ── Category ordering ─────────────────────────────────────────────────────────

const DEFAULT_CUSTOM_CATEGORY = 'Other'

// Predefined display order for common AI-generated categories. Categories not
// in this list are sorted alphabetically and appended after.
const CATEGORY_ORDER = [
  'Produce', 'Vegetables', 'Fruits',
  'Proteins', 'Meat', 'Seafood',
  'Dairy',
  'Grains & Bread', 'Grains', 'Bread',
  'Pantry Staples', 'Pantry',
  'Frozen',
  'Beverages', 'Snacks',
  'Other',
]

/**
 * Groups a flat GroceryListItem array into sorted [category, items[]] pairs.
 * @param {Array} items
 * @returns {Array<[string, Array]>}
 */
function groupByCategory(items) {
  const groups = {}
  items.forEach((item) => {
    const cat = item.category || DEFAULT_CUSTOM_CATEGORY
    if (!groups[cat]) groups[cat] = []
    groups[cat].push(item)
  })
  return Object.entries(groups).sort(([a], [b]) => {
    const ia = CATEGORY_ORDER.indexOf(a)
    const ib = CATEGORY_ORDER.indexOf(b)
    if (ia === -1 && ib === -1) return a.localeCompare(b)
    if (ia === -1) return 1
    if (ib === -1) return -1
    return ia - ib
  })
}

// ── Icons ─────────────────────────────────────────────────────────────────────

const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

const ChevronIcon = ({ expanded }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    style={{ transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s ease' }}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
)

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * GroceryListModal
 *
 * Slide-up modal for viewing and editing the persistent grocery list stored in
 * MealPlanContext. Supports:
 *   - Adding custom items via a sticky input field
 *   - Toggling item completion (persisted to localStorage via context)
 *   - Deleting items individually
 *   - Category grouping with expand/collapse
 *
 * Generation is handled upstream by MealPlannerDrawer; this component is
 * purely for display and mutation of the already-generated list.
 *
 * @param {boolean}  props.isOpen  - Whether the modal is currently visible
 * @param {function} props.onClose - Callback fired to close the modal
 */
export default function GroceryListModal({ isOpen, onClose }) {
  const { groceryList, toggleItemCompletion, deleteItem, addCustomItem } = useMealPlan()

  const [customInput, setCustomInput] = useState('')
  const [inputError, setInputError] = useState('')
  // Track expanded state per category; defaults to true for new categories
  const [expandedCategories, setExpandedCategories] = useState({})
  const inputRef = useRef(null)

  // Group and sort items by category
  const categoryGroups = useMemo(() => groupByCategory(groceryList), [groceryList])

  // Auto-expand any newly appearing categories
  useEffect(() => {
    if (groceryList.length === 0) return
    setExpandedCategories((prev) => {
      const next = { ...prev }
      groceryList.forEach((item) => {
        const cat = item.category || DEFAULT_CUSTOM_CATEGORY
        if (!(cat in next)) next[cat] = true
      })
      return next
    })
  }, [groceryList])

  // Escape key closes the modal
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

  function toggleCategoryExpanded(category) {
    setExpandedCategories((prev) => ({ ...prev, [category]: !prev[category] }))
  }

  function handleAddItem(e) {
    e.preventDefault()
    const trimmed = customInput.trim()
    if (!trimmed) {
      setInputError('Please enter an item name.')
      return
    }
    if (trimmed.length > 50) {
      setInputError('Item name must be 50 characters or fewer.')
      return
    }
    addCustomItem({
      name: trimmed,
      quantity: '',
      unit: '',
      category: DEFAULT_CUSTOM_CATEGORY,
      completed: false,
      notes: '',
    })
    setCustomInput('')
    setInputError('')
    inputRef.current?.focus()
  }

  if (!isOpen) return null

  return (
    <div className="grocery-modal-overlay" onClick={handleBackdropClick}>
      <div
        className="grocery-modal-container"
        role="dialog"
        aria-modal="true"
        aria-labelledby="grocery-modal-title"
      >
        {/* ── Header ── */}
        <div className="grocery-modal-header">
          <h2 id="grocery-modal-title" className="grocery-modal-title">Grocery List</h2>
          <button
            type="button"
            className="grocery-modal-close"
            aria-label="Close grocery list"
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </div>

        {/* ── Sticky add-item input ── */}
        <form className="grocery-modal-add" onSubmit={handleAddItem}>
          <div className="grocery-modal-add__row">
            <input
              ref={inputRef}
              type="text"
              className="grocery-modal-add__input"
              placeholder="Add an item…"
              value={customInput}
              maxLength={50}
              aria-label="Custom item name"
              onChange={(e) => {
                setCustomInput(e.target.value)
                setInputError('')
              }}
            />
            <button type="submit" className="grocery-modal-add__btn" aria-label="Add item to grocery list">
              Add
            </button>
          </div>
          {inputError && (
            <p className="grocery-modal-add__error" role="alert">{inputError}</p>
          )}
        </form>

        {/* ── Scrollable list ── */}
        <div className="grocery-modal-content">
          {groceryList.length === 0 ? (
            <p className="grocery-modal-empty">
              No items yet — generate a list from the meal planner, or add items above.
            </p>
          ) : (
            <ul className="grocery-list" role="list">
              {categoryGroups.map(([category, items]) => {
                const isExpanded = !!expandedCategories[category]
                return (
                  <li key={category}>
                    <div className="grocery-category-header">
                      <button
                        type="button"
                        className="grocery-category-toggle"
                        aria-expanded={isExpanded}
                        onClick={() => toggleCategoryExpanded(category)}
                      >
                        <ChevronIcon expanded={isExpanded} />
                        {category}
                        <span className="grocery-category-count">{items.length}</span>
                      </button>
                    </div>

                    {isExpanded && (
                      <ul className="grocery-list" role="list">
                        {items.map((item) => (
                          <li
                            key={item.id}
                            className={[
                              'grocery-item',
                              item.completed ? 'grocery-item--checked' : '',
                              item.isCustom ? 'grocery-item--custom' : '',
                            ].filter(Boolean).join(' ')}
                          >
                            <label className="grocery-item__label" htmlFor={`gi-${item.id}`}>
                              <input
                                type="checkbox"
                                id={`gi-${item.id}`}
                                className="grocery-item__checkbox"
                                aria-label={item.name}
                                checked={!!item.completed}
                                onChange={() => toggleItemCompletion(item.id)}
                              />
                              <span className="grocery-item__text">{item.name}</span>
                              {item.quantity && (
                                <span className="grocery-item__quantity">{item.quantity}</span>
                              )}
                              {item.isCustom && (
                                <span className="grocery-item__custom-badge">Custom</span>
                              )}
                            </label>
                            <button
                              type="button"
                              className="grocery-item__delete-btn"
                              aria-label={`Delete ${item.name}`}
                              onClick={() => deleteItem(item.id)}
                            >
                              <CloseIcon />
                            </button>
                          </li>
                        ))}
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
