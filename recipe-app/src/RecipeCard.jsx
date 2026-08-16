import React, { useState, useRef, useEffect, useId } from 'react'
import CookingNavigator from './CookingNavigator.jsx'
import { useFlag } from './flaggly.js'
import RecipeCardDisplay, { parseDuration } from './RecipeCardDisplay.jsx'
import DaySelector from './DaySelector.jsx'
import { useMealPlan } from './MealPlanContext.jsx'

export { parseDuration }

function parseDurationToMinutes(val) {
  if (!val) return 0
  if (typeof val === 'number') return val
  const str = String(val).trim().toUpperCase()
  if (!str.startsWith('PT') && !str.startsWith('P')) return 0
  let mins = 0
  const h = str.match(/(\d+)H/); if (h) mins += parseInt(h[1]) * 60
  const m = str.match(/(\d+)M/); if (m) mins += parseInt(m[1])
  return mins
}

export default function RecipeCard({ recipe, onClose, onElevate, onAdapt, isElevating, isAdapting = false, onSave, saveState, shareUrl }) {
  const elevateRecipeEnabled = useFlag('elevate-recipe')
  const recipeAdaptEnabled = useFlag('recipe-adapt')
  const mealPlannerEnabled = useFlag('meal-planner')
  const [shareCopied, setShareCopied] = useState(false)
  const [isCooking, setIsCooking] = useState(false)
  const [cookBlocked, setCookBlocked] = useState(false)
  const [wakeLockActive, setWakeLockActive] = useState(false)
  // null | 'remix' | 'options'
  const [openMenu, setOpenMenu] = useState(null)
  const [showDaySelector, setShowDaySelector] = useState(false)
  // null | 'success' | 'error'
  const [plannerFeedback, setPlannerFeedback] = useState(null)
  const plannerFeedbackTimerRef = useRef(null)
  const cookBlockedTimerRef = useRef(null)
  const wakeLockRef = useRef(null)
  const wakeLockTimerRef = useRef(null)
  const menusRef = useRef(null)
  const menuTriggerRefs = useRef({})
  const menuIdPrefix = useId()

  const mealPlanContext = useMealPlan()
  const hardAllergens = recipe?.appliedConstraints?.hardAllergens
    || recipe?.appliedConstraints?.hard_allergens
    || []
  const hasUnresolvedAllergenConflict = hardAllergens.length > 0
    && recipe?.allergenSummary
    && recipe.allergenSummary.safe === false
  // A blocked or template-gated technique cannot be cooked from these
  // instructions, so it cannot be planned as a meal either.
  const processCookGate = recipe?.processSafetySummary?.cook_gate || 'allow'
  const hasBlockedProcessHazard = processCookGate === 'block'
  const canAddToPlanner = Boolean(
    mealPlannerEnabled
      && mealPlanContext
      && recipe?.id
      && recipe?.name
      && !hasUnresolvedAllergenConflict
      && !hasBlockedProcessHazard
  )

  const recipeDurationMins =
    parseDurationToMinutes(recipe.prep_time) + parseDurationToMinutes(recipe.cook_time)

  async function acquireWakeLock(autoOffMinutes = 0) {
    try {
      if (!('wakeLock' in navigator)) return
      wakeLockRef.current = await navigator.wakeLock.request('screen')
      setWakeLockActive(true)
      wakeLockRef.current.addEventListener('release', () => {
        setWakeLockActive(false)
        wakeLockRef.current = null
      })
      if (autoOffMinutes > 0) {
        clearTimeout(wakeLockTimerRef.current)
        wakeLockTimerRef.current = setTimeout(() => releaseWakeLock(), autoOffMinutes * 60 * 1000)
      }
    } catch {
      // Permission denied or API unavailable
    }
  }

  function releaseWakeLock() {
    clearTimeout(wakeLockTimerRef.current)
    wakeLockTimerRef.current = null
    if (wakeLockRef.current) {
      wakeLockRef.current.release()
      wakeLockRef.current = null
    }
    setWakeLockActive(false)
  }

  function handleWakeLockToggle() {
    if (wakeLockActive) {
      releaseWakeLock()
    } else {
      const autoOff = recipeDurationMins > 0 ? recipeDurationMins + 15 : 0
      acquireWakeLock(autoOff)
    }
  }

  // Release on unmount; clear planner feedback timer
  useEffect(() => () => {
    releaseWakeLock()
    clearTimeout(plannerFeedbackTimerRef.current)
    clearTimeout(cookBlockedTimerRef.current)
  }, [])

  // Re-acquire after tab switch
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && wakeLockActive && !wakeLockRef.current) {
        acquireWakeLock()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [wakeLockActive])

  useEffect(() => {
    if (!mealPlannerEnabled) setShowDaySelector(false)
  }, [mealPlannerEnabled])

  function handleCookClick() {
    if (hasBlockedProcessHazard) {
      setCookBlocked(true)
      clearTimeout(cookBlockedTimerRef.current)
      cookBlockedTimerRef.current = setTimeout(() => setCookBlocked(false), 4000)
      return
    }
    setIsCooking(true)
  }

  function handleDaySelected(dateString, mealType) {
    setShowDaySelector(false)
    setOpenMenu(null)
    if (hasUnresolvedAllergenConflict || hasBlockedProcessHazard) {
      setPlannerFeedback(hasUnresolvedAllergenConflict ? 'blocked' : 'process-blocked')
    } else {
      try {
        mealPlanContext.addMeal(dateString, mealType, recipe)
        setPlannerFeedback('success')
      } catch {
        setPlannerFeedback('error')
      }
    }
    clearTimeout(plannerFeedbackTimerRef.current)
    plannerFeedbackTimerRef.current = setTimeout(() => setPlannerFeedback(null), 2500)
  }

  function closeMenu({ restoreFocus = false } = {}) {
    const trigger = menuTriggerRefs.current[openMenu]
    setOpenMenu(null)
    if (restoreFocus) trigger?.focus()
  }

  function handleMenuKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault()
      closeMenu({ restoreFocus: true })
      return
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
    const items = [...(e.currentTarget.querySelectorAll('[role="menuitem"]') || [])]
    if (!items.length) return
    e.preventDefault()
    const currentIndex = items.indexOf(document.activeElement)
    const nextIndex = e.key === 'Home'
      ? 0
      : e.key === 'End'
        ? items.length - 1
        : e.key === 'ArrowDown'
          ? (currentIndex + 1) % items.length
          : (currentIndex <= 0 ? items.length - 1 : currentIndex - 1)
    items[nextIndex].focus()
  }

  // Close menus on outside click and move focus into an opened menu.
  useEffect(() => {
    if (!openMenu) return
    function handleClick(e) {
      if (menusRef.current && !menusRef.current.contains(e.target)) {
        closeMenu()
      }
    }
    document.addEventListener('mousedown', handleClick)
    const firstItem = menusRef.current?.querySelector('[role="menuitem"]')
    firstItem?.focus()
    return () => document.removeEventListener('mousedown', handleClick)
  }, [openMenu])

  return (
    <div className="recipe-card">
      <div className="card-menus" ref={menusRef}>
        {/* Remix menu */}
        {(elevateRecipeEnabled || (recipeAdaptEnabled && onAdapt)) && (
        <div className="action-menu">
          <button
            ref={(node) => { menuTriggerRefs.current.remix = node }}
            className="action-menu-btn"
            onClick={() => setOpenMenu(o => o === 'remix' ? null : 'remix')}
            title="Remix with AI"
            aria-label="Remix with AI"
            aria-haspopup="menu"
            aria-expanded={openMenu === 'remix'}
            aria-controls={openMenu === 'remix' ? `${menuIdPrefix}-remix-menu` : undefined}
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 1l2.5 8.5L23 12l-8.5 2.5L12 23l-2.5-8.5L1 12l8.5-2.5z"/>
            </svg>
          </button>
          {openMenu === 'remix' && (
            <div id={`${menuIdPrefix}-remix-menu`} className="action-menu-dropdown" role="menu" aria-label="Remix actions" onKeyDown={handleMenuKeyDown}>
              <button
                className="action-menu-item elevate-item"
                role="menuitem"
                onClick={() => { if (!isElevating) { onElevate(); closeMenu({ restoreFocus: true }); } }}
                disabled={isElevating}
                title="Elevate this recipe with AI — improve instructions, suggest variations, add tips"
              >
                {isElevating ? (
                  <svg className="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 11-6.219-8.56"/>
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 3l14 9-14 9V3z"/>
                  </svg>
                )}
                {isElevating ? 'Elevating…' : 'Elevate'}
              </button>
              {recipeAdaptEnabled && onAdapt && (
                <button
                  className="action-menu-item adapt-item"
                  role="menuitem"
                  onClick={() => { if (!isAdapting) { onAdapt(); closeMenu({ restoreFocus: true }); } }}
                  disabled={isAdapting}
                  title="Adapt this recipe to your diet, time, or equipment"
                >
                  {isAdapting ? (
                    <svg className="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12a9 9 0 11-6.219-8.56"/>
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 7h16M4 12h10M4 17h16"/>
                      <circle cx="17" cy="12" r="2"/>
                    </svg>
                  )}
                  {isAdapting ? 'Adapting…' : 'Adapt'}
                </button>
              )}
            </div>
          )}
        </div>
        )}

        {/* More options menu */}
        <div className="action-menu">
          <button
            ref={(node) => { menuTriggerRefs.current.options = node }}
            className="action-menu-btn"
            onClick={() => setOpenMenu(o => o === 'options' ? null : 'options')}
            title="More options"
            aria-label="More recipe options"
            aria-haspopup="menu"
            aria-expanded={openMenu === 'options'}
            aria-controls={openMenu === 'options' ? `${menuIdPrefix}-options-menu` : undefined}
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
            </svg>
          </button>
          {openMenu === 'options' && (
            <div id={`${menuIdPrefix}-options-menu`} className="action-menu-dropdown" role="menu" aria-label="Recipe actions" onKeyDown={handleMenuKeyDown}>
              <button
                className="action-menu-item"
                role="menuitem"
                onClick={() => { closeMenu({ restoreFocus: true }); onClose(); }}
                title="Close"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
                Close
              </button>
              <button
                className="action-menu-item"
                role="menuitem"
                onClick={() => { closeMenu({ restoreFocus: true }); setShowDaySelector(true) }}
                disabled={!canAddToPlanner}
                title={
                  canAddToPlanner
                    ? 'Add to meal planner'
                    : hasUnresolvedAllergenConflict
                      ? 'Resolve the allergen warning before adding to the planner'
                      : hasBlockedProcessHazard
                        ? 'This technique is blocked by the food-process safety check'
                        : !mealPlannerEnabled
                          ? 'Meal planner is off'
                          : 'Meal planner unavailable'
                }
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                  <line x1="12" y1="14" x2="12" y2="18"/>
                  <line x1="10" y1="16" x2="14" y2="16"/>
                </svg>
                Add to Planner
              </button>
              <button
                className={`action-menu-item${saveState === 'saved' ? ' saved' : saveState === 'error' ? ' error' : ''}`}
                role="menuitem"
                onClick={() => { if (saveState !== 'saving' && saveState !== 'saved') { onSave(); closeMenu({ restoreFocus: true }); } }}
                disabled={saveState === 'saving' || saveState === 'saved'}
                title={saveState === 'saved' ? 'Recipe saved' : 'Save recipe'}
              >
                {saveState === 'saving' ? (
                  <svg className="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 11-6.219-8.56"/>
                  </svg>
                ) : saveState === 'saved' ? (
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M5 3a2 2 0 00-2 2v16l9-4 9 4V5a2 2 0 00-2-2H5z"/>
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 21l-7-3-7 3V5a2 2 0 012-2h10a2 2 0 012 2v16z"/>
                  </svg>
                )}
                {saveState === 'saved' ? 'Saved' : saveState === 'saving' ? 'Saving…' : 'Save'}
              </button>
              {shareUrl && (
                <button
                  className={`action-menu-item${shareCopied ? ' copied' : ''}`}
                  role="menuitem"
                  onClick={() => {
                    const copyToClipboard = () => {
                      navigator.clipboard.writeText(shareUrl).then(() => {
                        setShareCopied(true)
                        setTimeout(() => setShareCopied(false), 2000)
                      })
                    }
                    if (navigator.share) {
                      navigator.share({ title: recipe.name, url: shareUrl }).catch(copyToClipboard)
                    } else {
                      copyToClipboard()
                    }
                  }}
                  title={shareCopied ? 'Copied!' : 'Share recipe'}
                >
                  {shareCopied ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M20 6L9 17l-5-5"/>
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"/>
                    </svg>
                  )}
                  {shareCopied ? 'Copied!' : 'Share'}
                </button>
              )}
              {'wakeLock' in navigator && (
                <button
                  className={`action-menu-item${wakeLockActive ? ' active' : ''}`}
                  role="menuitem"
                  onClick={handleWakeLockToggle}
                  title={wakeLockActive ? 'Screen is staying on – tap to disable' : 'Keep screen on while cooking'}
                >
                  <span className="wake-lock-icon">{wakeLockActive ? '☀️' : '🌙'}</span>
                  {wakeLockActive ? (
                    <>
                      Screen on
                      {recipeDurationMins > 0 && <span className="wake-lock-label">{recipeDurationMins + 15}m</span>}
                    </>
                  ) : 'Keep awake'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <RecipeCardDisplay recipe={recipe} onCookClick={handleCookClick} />

      {cookBlocked && (
        <div className="planner-feedback planner-feedback--process-blocked" role="alert">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
          Cooking mode is unavailable: follow a tested process from the safety notice above.
        </div>
      )}

      {isCooking && <CookingNavigator recipe={recipe} onClose={() => setIsCooking(false)} />}

      {mealPlannerEnabled && showDaySelector && (
        <DaySelector
          recipe={recipe}
          onDaySelected={handleDaySelected}
          onClose={() => setShowDaySelector(false)}
        />
      )}

      {plannerFeedback && (
        <div
          className={`planner-feedback planner-feedback--${plannerFeedback}`}
          role="status"
          aria-live="polite"
        >
          {plannerFeedback === 'success' ? (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
              Added to planner
            </>
          ) : plannerFeedback === 'blocked' ? (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
              Resolve the allergen warning before planning this recipe
            </>
          ) : plannerFeedback === 'process-blocked' ? (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
              This technique is blocked by the food-process safety check
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
              Could not add to planner
            </>
          )}
          <button
            type="button"
            className="planner-feedback-dismiss"
            onClick={() => setPlannerFeedback(null)}
            aria-label="Dismiss notification"
          >×</button>
        </div>
      )}
    </div>
  )
}
