import React, { useEffect, useState } from 'react'
import { useDragContext } from './useDragContext.js'
import { useMealPlan } from './MealPlanContext.jsx'
import GroceryListModal from './GroceryListModal.jsx'
import GeneratingGroceryCard from './GeneratingGroceryCard.jsx'
import { flattenIngredients } from './GroceryListModal.jsx'

const RECIPE_GENERATION_URL = import.meta.env.VITE_RECIPE_GENERATION_URL

const XIcon = ({ size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

const ShoppingCartIcon = ({ size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="9" cy="21" r="1"/>
    <circle cx="20" cy="21" r="1"/>
    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
  </svg>
)

/**
 * Converts the API grocery response (categories array) into a flat array
 * of GroceryListItem objects suitable for MealPlanContext storage.
 *
 * @param {Array<{ category: string, items: Array<{ name: string, quantity: string }> }>} categories
 * @returns {Array<Object>}
 */
function normalizeApiResponse(categories) {
  const items = []
  const now = Date.now()
  categories.forEach(({ category, items: apiItems }) => {
    apiItems.forEach((apiItem) => {
      items.push({
        id: now.toString(36) + Math.random().toString(36).substr(2),
        name: apiItem.name,
        quantity: apiItem.quantity || '',
        unit: '',
        category,
        completed: false,
        isCustom: false,
        notes: '',
        createdAt: now,
        source: 'ai-generated',
      })
    })
  })
  return items
}

/**
 * MealPlannerDrawer
 *
 * Slide-over panel housing the weekly meal grid. Reads `isDragging` from
 * DragContext (rather than receiving it as a prop) to apply the `.is-dragging`
 * CSS class that strips the drawer's CSS transform during drag operations.
 *
 * Why the transform must be removed during drag:
 *   Any `transform` on an ancestor creates a containing block for
 *   `position: fixed` children. @hello-pangea/dnd uses `position: fixed` for
 *   its drag ghost, so the ghost's coordinates become drawer-relative rather
 *   than viewport-relative, producing a visible cursor offset.
 *   See MealPlanner.css (.meal-planner-drawer.is-open.is-dragging) for the rule.
 *   DragPortal in DayCard.jsx provides belt-and-suspenders coverage at the
 *   individual draggable level.
 *
 * Footer state machine:
 *   IDLE    — no groceryList generated yet; shows "Generate Grocery List" button.
 *   LOADING — isGeneratingList === true; shows GeneratingGroceryCard animation.
 *   LOADED  — groceryList.length > 0; shows "View List" + "Regenerate" buttons.
 */
export default function MealPlannerDrawer({ isOpen, onClose, children }) {
  const { isDragging } = useDragContext()
  const [isGroceryModalOpen, setIsGroceryModalOpen] = useState(false)

  const {
    mealPlan,
    upNext,
    groceryList,
    isGeneratingList,
    listGenerationError,
    generateGroceryListStart,
    generateGroceryListError,
    setGroceryList,
    clearGroceryList,
  } = useMealPlan()

  // True if the meal plan has at least one scheduled or staged recipe
  const hasMeals =
    upNext.length > 0 ||
    Object.values(mealPlan || {}).some((day) =>
      Object.values(day || {}).some((slot) => Array.isArray(slot) && slot.length > 0)
    )

  // Lock body scroll when the drawer is open to prevent "scroll leakage"
  // to the main page background.
  useEffect(() => {
    if (isOpen) {
      const originalStyle = window.getComputedStyle(document.body).overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = originalStyle
      }
    }
  }, [isOpen])

  /**
   * Initiates grocery list generation:
   * 1. Signals loading start to context (shows GeneratingGroceryCard).
   * 2. POSTs flattened ingredients to the grocery-list worker.
   * 3. On success, normalises the API response and stores it in context.
   * 4. On failure, stores the error message in context.
   */
  async function handleGenerate() {
    generateGroceryListStart()

    const ingredients = flattenIngredients(mealPlan, upNext)
    if (ingredients.length === 0) {
      generateGroceryListError('No ingredients found. Add recipes to your meal plan first.')
      return
    }

    try {
      const controller = new AbortController()
      const tid = setTimeout(() => controller.abort(), 20000)
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
      setGroceryList(normalizeApiResponse(data.categories))
    } catch (err) {
      generateGroceryListError(
        err.name === 'AbortError'
          ? 'Request timed out. Please try again.'
          : err.message || 'Unable to generate grocery list. Please try again.'
      )
    }
  }

  /**
   * Clears the existing list and re-triggers generation.
   * Transitions the footer back to the LOADING state.
   */
  function handleRegenerate() {
    clearGroceryList()
    handleGenerate()
  }

  /**
   * Renders the correct footer content based on the three states:
   *   LOADING → GeneratingGroceryCard
   *   LOADED  → "View List" + "Regenerate" buttons
   *   IDLE    → "Generate Grocery List" button (disabled if no meals)
   */
  function renderFooterContent() {
    if (isGeneratingList) {
      return <GeneratingGroceryCard />
    }

    if (groceryList.length > 0) {
      return (
        <div className="drawer-footer-actions">
          <button
            type="button"
            className="drawer-view-list-btn"
            onClick={() => setIsGroceryModalOpen(true)}
            aria-label="View generated grocery list"
          >
            <ShoppingCartIcon size={15} />
            View List
          </button>
          <button
            type="button"
            className="drawer-regenerate-btn"
            onClick={handleRegenerate}
            aria-label="Regenerate grocery list"
          >
            Regenerate
          </button>
        </div>
      )
    }

    return (
      <>
        <button
          type="button"
          className="drawer-grocery-btn"
          onClick={handleGenerate}
          disabled={!hasMeals}
          aria-label={
            hasMeals
              ? 'Generate grocery list from meal plan'
              : 'Add meals to generate a grocery list'
          }
          title={hasMeals ? undefined : 'Add meals to your plan first'}
        >
          <ShoppingCartIcon size={15} />
          Generate Grocery List
        </button>
        {listGenerationError && (
          <p className="drawer-footer-error" role="alert">
            {listGenerationError}
          </p>
        )}
      </>
    )
  }

  let drawerClassName = 'meal-planner-drawer'
  if (isOpen) drawerClassName += ' is-open'
  if (isDragging) drawerClassName += ' is-dragging'

  return (
    <>
      <div
        className={`meal-planner-backdrop${isOpen ? ' is-open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={drawerClassName}
        aria-label="Meal planner"
        aria-hidden={!isOpen}
        data-testid="meal-planner-drawer"
      >
        <div className="drawer-header">
          <span className="drawer-title">Meal Planner</span>
          <button
            type="button"
            className="drawer-close-btn"
            onClick={onClose}
            aria-label="Close meal planner"
          >
            <XIcon size={16} />
          </button>
        </div>
        <div className="drawer-content">
          {children}
        </div>
        <div className="drawer-footer">
          {renderFooterContent()}
        </div>
      </aside>

      <GroceryListModal
        isOpen={isGroceryModalOpen}
        onClose={() => setIsGroceryModalOpen(false)}
      />
    </>
  )
}
