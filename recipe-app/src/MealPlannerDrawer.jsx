import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useDragContext } from './useDragContext.js'
import { useMealPlan } from './MealPlanContext.jsx'
import GroceryListModal from './GroceryListModal.jsx'
import GeneratingGroceryCard from './GeneratingGroceryCard.jsx'
import { flattenIngredients } from './GroceryListModal.jsx'
import { classifyGroceryItems, getExpiringPantryItems } from '../../shared/pantry-planning.js'
import PlannerSuggestions from './PlannerSuggestions.jsx'

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

const SparklesIcon = ({ size = 16 }) => (
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
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
    <path d="M19 15l.9 2.4L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.6L19 15z" />
  </svg>
)

const CalendarPlusIcon = ({ size = 16 }) => (
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
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <line x1="12" y1="13" x2="12" y2="19" />
    <line x1="9" y1="16" x2="15" y2="16" />
  </svg>
)

/**
 * Converts the API grocery response (categories array) into a flat array
 * of GroceryListItem objects suitable for MealPlanContext storage.
 *
 * @param {Array<{ category: string, items: Array<{ name: string, quantity: string }> }>} categories
 * @returns {Array<Object>}
 */
export function normalizeApiResponse(categories, pantryItems = [], pantryPlannerEnabled = false) {
  const items = []
  const now = Date.now()
  const safeCategories = Array.isArray(categories) ? categories : []
  safeCategories.forEach(({ category, items: apiItems }) => {
    const safeItems = Array.isArray(apiItems) ? apiItems : []
    safeItems.forEach((apiItem) => {
      if (!apiItem || typeof apiItem !== 'object' || !apiItem.name) return
      const isStaple = Boolean(apiItem.isStaple || apiItem.is_staple || apiItem.optionalStaple)
      items.push({
        id: now.toString(36) + Math.random().toString(36).substr(2),
        name: apiItem.name,
        quantity: apiItem.quantity || '',
        unit: apiItem.unit || '',
        category,
        completed: false,
        isCustom: false,
        notes: '',
        createdAt: now,
        source: 'ai-generated',
        isStaple,
        optionalStaple: isStaple,
        // Preserve the worker's deterministic gap-fill metadata. The client
        // rechecks it below against its current pantry snapshot, which keeps
        // a list accurate if inventory changed while the request was running.
        ...(apiItem.inventoryStatus ? { inventoryStatus: apiItem.inventoryStatus } : {}),
        ...(Array.isArray(apiItem.pantryItemIds) ? { pantryItemIds: apiItem.pantryItemIds } : {}),
        ...(apiItem.pantryQuantity != null ? { pantryQuantity: apiItem.pantryQuantity } : {}),
        ...(apiItem.missingQuantity != null ? { missingQuantity: apiItem.missingQuantity } : {}),
        ...(apiItem.requestedQuantity != null ? { requestedQuantity: apiItem.requestedQuantity } : {}),
      })
    })
  })
  return pantryPlannerEnabled ? classifyGroceryItems(items, pantryItems) : items
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
export default function MealPlannerDrawer({
  isOpen,
  onClose,
  children,
  pantryItems = [],
  pantryPlannerEnabled = false,
  onOpenPantry,
  autofillEnabled = false,
  onOpenAutofill,
  bulkScheduleEnabled = false,
  onOpenBulkSchedule,
  recentRecipes = [],
}) {
  const { isDragging } = useDragContext()
  const [isGroceryModalOpen, setIsGroceryModalOpen] = useState(false)
  const drawerRef = useRef(null)
  const closeButtonRef = useRef(null)
  const previousFocusRef = useRef(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  // Keep keyboard focus inside the drawer while it is modal, then restore the
  // calendar toggle (or whichever control opened it) when it closes.
  useEffect(() => {
    if (!isOpen) {
      const previous = previousFocusRef.current
      if (previous && document.contains(previous) && !drawerRef.current?.contains(previous)) previous.focus()
      return undefined
    }

    previousFocusRef.current = document.activeElement
    closeButtonRef.current?.focus()
    function getFocusable() {
      return [...(drawerRef.current?.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) || [])]
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const focusable = getFocusable()
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

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

  const expiringPantryItems = useMemo(
    () => pantryPlannerEnabled ? getExpiringPantryItems(pantryItems, 7) : [],
    [pantryItems, pantryPlannerEnabled]
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
        body: JSON.stringify({
          ingredients,
          // The worker performs the same deterministic gap-fill pass as the
          // client. Send only the fields it needs; the client still
          // reclassifies with its live pantry snapshot for offline changes.
          ...(pantryPlannerEnabled ? {
            pantryItems: pantryItems.map(({ id, name, quantity, unit, expiresOn, expires_on }) => ({
              id,
              name,
              quantity,
              unit,
              expiresOn: expiresOn || expires_on || null,
            }))
          } : {})
        }),
        signal: controller.signal,
      })
      clearTimeout(tid)
      if (!res.ok) {
        // The worker returns { error, code } on failure; surface it instead of a
        // bare status so users (and bug reports) say what actually went wrong.
        const detail = await res.json().catch(() => null)
        throw new Error(
          detail?.error
            ? `${detail.error}${detail.code ? ` (${detail.code})` : ''}`
            : `Server error: ${res.status}`
        )
      }
      const data = await res.json()
      if (!data.success || !Array.isArray(data.categories))
        throw new Error('Invalid response from server. Please try again.')
      setGroceryList(normalizeApiResponse(data.categories, pantryItems, pantryPlannerEnabled))
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
        ref={drawerRef}
        className={drawerClassName}
        role="dialog"
        aria-modal={isOpen ? 'true' : undefined}
        aria-labelledby="meal-planner-title"
        aria-hidden={!isOpen}
        inert={!isOpen ? '' : undefined}
        data-testid="meal-planner-drawer"
      >
        <div className="drawer-header">
          <span id="meal-planner-title" className="drawer-title">Meal Planner</span>
          {autofillEnabled && typeof onOpenAutofill === 'function' && (
            <button
              type="button"
              className="drawer-autofill-btn"
              onClick={onOpenAutofill}
              aria-label="Auto-fill my week"
              title="Auto-fill empty slots with recipes"
            >
              <SparklesIcon size={16} />
              <span>Auto-fill</span>
            </button>
          )}
          {bulkScheduleEnabled && typeof onOpenBulkSchedule === 'function' && (
            <button
              type="button"
              className="drawer-bulk-schedule-btn"
              onClick={onOpenBulkSchedule}
              disabled={upNext.length === 0}
              aria-label="Schedule all staged recipes"
              title={
                upNext.length === 0
                  ? 'Stage recipes in Up Next first'
                  : 'Schedule every recipe staged in Up Next'
              }
            >
              <CalendarPlusIcon size={16} />
              <span>Schedule all</span>
            </button>
          )}
          <button
            type="button"
            ref={closeButtonRef}
            className="drawer-close-btn"
            onClick={onClose}
            aria-label="Close meal planner"
          >
            <XIcon size={16} />
          </button>
        </div>
        <div className="drawer-content">
          {pantryPlannerEnabled && expiringPantryItems.length > 0 && (
            <div className="pantry-planner-use-soon" role="status">
              <div>
                <strong>Use soon</strong>
                <span>{expiringPantryItems.slice(0, 3).map((item) => item.name).join(' · ')}</span>
              </div>
              {onOpenPantry && (
                <button type="button" onClick={onOpenPantry}>Open pantry</button>
              )}
            </div>
          )}
          {/* Only while the drawer is open: the panel stays mounted when closed,
              and a hidden copy of every recent recipe helps nobody. */}
          {isOpen && bulkScheduleEnabled && <PlannerSuggestions recipes={recentRecipes} />}
          {children}
        </div>
        <div className="drawer-footer">
          {renderFooterContent()}
        </div>
      </aside>

      <GroceryListModal
        isOpen={isGroceryModalOpen}
        onClose={() => setIsGroceryModalOpen(false)}
        pantryItems={pantryPlannerEnabled ? pantryItems : []}
        pantryPlannerEnabled={pantryPlannerEnabled}
      />
    </>
  )
}
