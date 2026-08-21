import React, { useState, useRef, useEffect, useCallback, useId } from 'react'
import RecipeCard, { parseDuration } from './RecipeCard.jsx'
import GeneratingCard from './GeneratingCard.jsx'
import AuthScreen from './AuthScreen.jsx'
import PWAInstallPrompt from './PWAInstallPrompt.jsx'
import MealPlanner from './MealPlanner.jsx'
import { useRecentRecipes } from './useRecentRecipes.js'
import { useAuth } from './useAuth.js'
import { useMealPlan } from './MealPlanContext.jsx'
import { syncFlagglyUser, useFlag } from './flaggly.js'
import CulinaryProfile from './CulinaryProfile.jsx'
import GenerationComposer from './GenerationComposer.jsx'
import AdaptComposer from './AdaptComposer.jsx'
import { useCulinaryProfile } from './useCulinaryProfile.js'
import { usePantry } from './usePantry.js'
import PantryModal from './PantryModal.jsx'
import RecipeEditor from './RecipeEditor.jsx'
import RecipeNotesModal from './RecipeNotesModal.jsx'
import { useRecipeNotes } from './useRecipeNotes.js'
import { withAllergenSummary } from '../../shared/allergen-graph.js'
import { analyzeProcessSafety } from '../../shared/food-process-safety.js'
import { getExpiringPantryItems, isPantryItemExpired } from '../../shared/pantry-planning.js'

const SEARCH_DB_URL = import.meta.env.VITE_SEARCH_DB_URL
const CLIPPER_API_URL = import.meta.env.VITE_CLIPPER_API_URL
const RECIPE_GENERATION_URL = import.meta.env.VITE_RECIPE_GENERATION_URL
const API_URL = import.meta.env.VITE_API_URL
const RECIPE_VIEW_URL = import.meta.env.VITE_RECIPE_VIEW_URL

// Fail fast in dev if backend URLs are not configured (e.g. missing .env.development)
if (import.meta.env.DEV && [SEARCH_DB_URL, CLIPPER_API_URL, RECIPE_GENERATION_URL, API_URL].some((u) => !u || u === 'undefined')) {
  console.error(
    'Recipe app: missing backend URLs. Copy recipe-app/.env.example to .env.development or .env.local and set VITE_API_URL, VITE_SEARCH_DB_URL, VITE_CLIPPER_API_URL, VITE_RECIPE_GENERATION_URL to your Cloudflare Worker URLs.'
  )
}

function isValidUrl(str) {
  try {
    const url = new URL(str)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isYouTubeUrl(str) {
  try {
    const host = new URL(str).hostname.toLowerCase()
    return (
      host === 'youtube.com' ||
      host === 'www.youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'music.youtube.com' ||
      host === 'youtu.be'
    )
  } catch {
    return false
  }
}

// Debounce helper — cancels pending timer on unmount to prevent leaks
function useDebounce(fn, delay) {
  const timer = useRef(null)
  const fnRef = useRef(fn)

  useEffect(() => {
    fnRef.current = fn
  }, [fn])

  const cancel = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = null
  }, [])

  const schedule = useCallback((...args) => {
    cancel()
    timer.current = setTimeout(() => fnRef.current(...args), delay)
  }, [cancel, delay])

  useEffect(() => cancel, [cancel])
  return [schedule, cancel]
}

function UserMenu({ user, onSignOut, onRegisterPasskey, onOpenProfile, onOpenPantry }) {
  const [open, setOpen] = useState(false)
  const [opacity, setOpacity] = useState(1)
  const [passkeyStatus, setPasskeyStatus] = useState('idle')
  const menuRef = useRef(null)
  const triggerRef = useRef(null)

  function closeMenu({ restoreFocus = false } = {}) {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }

  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) closeMenu()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    if (!open) return
    const firstItem = menuRef.current?.querySelector('[role="menuitem"]')
    firstItem?.focus()
  }, [open])

  function handleMenuKeyDown(e) {
    const items = [...(menuRef.current?.querySelectorAll('[role="menuitem"]') || [])]
    if (e.key === 'Escape') {
      e.preventDefault()
      closeMenu({ restoreFocus: true })
      return
    }
    if (!items.length || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
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

  useEffect(() => {
    function handleScroll() {
      const y = window.scrollY
      setOpacity(Math.max(0, 1 - y / 150))
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const initial = user?.email ? user.email[0] : '?'
  const resolvedOpacity = open ? 1 : opacity
  const hidden = resolvedOpacity === 0

  return (
    <div
      className="user-menu"
      ref={menuRef}
      style={{ opacity: resolvedOpacity, pointerEvents: hidden ? 'none' : undefined }}
    >
      <button
        ref={triggerRef}
        className="user-avatar-btn"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
          }
        }}
        title={user?.email || 'Account'}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {initial}
      </button>
      {open && (
        <div className="user-menu-dropdown" role="menu" aria-label="Account options" onKeyDown={handleMenuKeyDown}>
          <div className="user-menu-info">
            <div className="user-menu-email">{user?.email}</div>
          </div>
          {onOpenProfile && (
            <button className="user-menu-item" role="menuitem" onClick={() => { closeMenu({ restoreFocus: true }); onOpenProfile() }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 3a9 9 0 100 18 9 9 0 000-18Z"/>
                <path d="M8 12h8M12 8v8"/>
              </svg>
              Kitchen profile
            </button>
          )}
          {onOpenPantry && (
            <button className="user-menu-item" role="menuitem" onClick={() => { closeMenu({ restoreFocus: true }); onOpenPantry() }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 6h16M4 12h16M4 18h16" />
                <path d="M7 4v4M17 10v4M10 16v4" />
              </svg>
              My pantry
            </button>
          )}
          {onRegisterPasskey && (
            <button
              className="user-menu-item"
              role="menuitem"
              disabled={passkeyStatus === 'loading'}
              onClick={async () => {
                setPasskeyStatus('loading')
                try {
                  await onRegisterPasskey()
                  setPasskeyStatus('success')
                  setTimeout(() => setPasskeyStatus('idle'), 2500)
                } catch {
                  setPasskeyStatus('error')
                  setTimeout(() => setPasskeyStatus('idle'), 3000)
                }
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="8" r="3"/>
                <path d="M6 21v-1a6 6 0 0112 0v1M18 15l2 2 4-4"/>
              </svg>
              {passkeyStatus === 'loading' ? 'Adding passkey…'
                : passkeyStatus === 'success' ? 'Passkey added!'
                  : passkeyStatus === 'error' ? 'Passkey failed — try again'
                    : 'Add a passkey'}
            </button>
          )}
          <button className="user-menu-item" role="menuitem" onClick={() => { closeMenu({ restoreFocus: true }); onSignOut() }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
            </svg>
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

export function buildGenerationRequest({
  dishName,
  elevate = false,
  profile = null,
  overrides = null,
  baseIngredients = null,
  pantryItems = [],
  pantryPlannerEnabled = false,
}) {
  const body = {
    recipeName: dishName,
    generateImage: true,
    elevate,
  }
  if (profile) body.culinaryProfile = profile
  if (overrides) {
    Object.assign(body, overrides)
    if (!overrides.ingredients?.length) delete body.ingredients
  }
  if (elevate && baseIngredients) body.ingredients = baseIngredients
  if (overrides?.usePantry && pantryPlannerEnabled) {
    body.usePantry = true
    const safePantryItems = (Array.isArray(pantryItems) ? pantryItems : [])
      .filter((item) => !isPantryItemExpired(item))
    const expiring = overrides.prioritizeExpiring
      ? getExpiringPantryItems(safePantryItems, 7)
      : []
    const orderedPantry = expiring.length > 0
      ? [...expiring, ...safePantryItems.filter((item) => !expiring.includes(item))]
      : safePantryItems
    body.pantryIngredients = orderedPantry
      .filter((item) => item?.name)
      .slice(0, 50)
      .map((item) => ({
        name: item.name,
        quantity: item.quantity ?? null,
        unit: item.unit || null,
        expiresOn: item.expiresOn || item.expires_on || null,
      }))
    if (overrides.prioritizeExpiring && expiring.length > 0) body.prioritizeExpiring = true
  }
  return body
}

export function buildAdaptRequest({ baseRecipe, profile = null, overrides = null }) {
  const body = { baseRecipe }
  if (profile) body.culinaryProfile = profile
  if (overrides) body.constraints = overrides
  return body
}

function getRecipeSourceLabel(recipe) {
  if (recipe.source === 'elevated') return 'Elevated'
  if (recipe.source === 'ai_generated' || recipe.id?.startsWith('ai-')) return 'AI'
  if (recipe.source === 'adapted' || recipe.id?.startsWith('adapt-')) return 'Adapted'
  if (recipe.source === 'youtube' || isYouTubeUrl(recipe.source_url || '')) return 'YouTube'
  if (recipe.source === 'clipped') return 'Clipped'

  try {
    return new URL(recipe.source_url).hostname.replace(/^www\./, '')
  } catch {
    return 'Recipe'
  }
}

/**
 * Annotate a recipe the app did not generate — a search result or a clipped
 * page — with the safety summaries the generation worker adds server-side.
 *
 * Process hazards are analyzed rather than rewritten here: a clipped recipe is
 * someone else's published text, so the app labels it and gates cook mode
 * instead of editing their steps.
 */
export function annotateRecipeForProfile(recipe, profile) {
  const processSafetySummary = recipe.processSafetySummary || analyzeProcessSafety(recipe)
  const withProcess = { ...recipe, processSafetySummary }
  const hardAllergens = profile?.hard_allergens || profile?.hardAllergens || []
  if (!Array.isArray(hardAllergens) || hardAllergens.length === 0) return withProcess
  return withAllergenSummary({
    ...withProcess,
    appliedConstraints: {
      ...(recipe.appliedConstraints || {}),
      hardAllergens,
    },
  }, hardAllergens)
}

export default function App() {
  const auth = useAuth()
  const { activeRecipe, setActiveRecipe, clearActiveRecipe } = useMealPlan()
  const mealPlannerEnabled = useFlag('meal-planner')
  const culinaryProfileEnabled = useFlag('culinary-profile')
  const constraintGenerateEnabled = useFlag('constraint-generate')
  const recipeAdaptEnabled = useFlag('recipe-adapt')
  const [profileOpen, setProfileOpen] = useState(false)
  const [pantryOpen, setPantryOpen] = useState(false)
  const [generationComposerOpen, setGenerationComposerOpen] = useState(false)
  const [adaptComposerOpen, setAdaptComposerOpen] = useState(false)
  const culinaryProfile = useCulinaryProfile(auth.token, culinaryProfileEnabled)
  const pantryEnabled = useFlag('pantry')
  const pantryPlannerEnabled = useFlag('pantry-planner')
  const pantryUserId = auth.user?.id || auth.user?.user_id || auth.user?.email || ''
  const pantry = usePantry(auth.token, pantryUserId, pantryEnabled)
  const usablePantryItems = pantry.items.filter((item) => !isPantryItemExpired(item))
  const expiringPantryItems = getExpiringPantryItems(usablePantryItems, 7)

  const pantryPlanningAvailable = Boolean(pantryEnabled && pantryPlannerEnabled && pantry.available)
  const depletePantry = useCallback(async (operations) => {
    for (const operation of operations) {
      if (operation.action === 'remove') await pantry.removeItem(operation.pantryItemId)
      else await pantry.updateItem(operation.pantryItemId, { quantity: operation.remainingQuantity })
    }
  }, [pantry.removeItem, pantry.updateItem])
  const recipeEditingEnabled = useFlag('recipe-editing')
  const recipeNotesEnabled = useFlag('recipe-notes')
  const [editorOpen, setEditorOpen] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const recipeNotes = useRecipeNotes(auth.token, pantryUserId, activeRecipe?.id || '', recipeNotesEnabled)

  // Both sheets hold a draft for the recipe they were opened on, so switching
  // recipes underneath them closes them rather than retargeting the draft.
  useEffect(() => {
    setEditorOpen(false)
    setNotesOpen(false)
  }, [activeRecipe?.id])

  useEffect(() => {
    if (auth.loading) return
    void syncFlagglyUser(auth.user ?? null)
  }, [auth.loading, auth.user])
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [input, setInput] = useState('')
  const [status, setStatus] = useState('idle') // idle | searching | clipping | generating | elevating | adapting | error
  const [errorMsg, setErrorMsg] = useState('')
  const [retryAction, setRetryAction] = useState(null)
  const [searchResults, setSearchResults] = useState([])
  const [lastSearchQuery, setLastSearchQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [activeOptionKey, setActiveOptionKey] = useState(null)
  const [saveState, setSaveState] = useState('idle') // idle | saving | saved | error
  const [savedRecipeId, setSavedRecipeId] = useState(null) // persisted KV id for share URL
  const [generatingName, setGeneratingName] = useState('')
  const [clippingFromYouTube, setClippingFromYouTube] = useState(false)
  const inputRef = useRef(null)
  const dropdownRef = useRef(null)
  const listboxId = useId()
  const latestInputRef = useRef('')
  const searchRequestIdRef = useRef(0)
  const [recentRecipes, addRecentRecipe, clearRecentRecipes] = useRecentRecipes()

  const isUrl = isValidUrl(input.trim())
  const hasText = input.trim().length >= 2 && !isUrl

  // Determine the action the primary button will take
  function getPrimaryAction() {
    if (isUrl) return 'clip'
    if (hasText) return 'search'
    return 'idle'
  }

  // --- Search ---
  async function doSearch(query) {
    const normalizedQuery = query?.trim() || ''
    const requestId = ++searchRequestIdRef.current

    if (normalizedQuery.length < 2 || isValidUrl(normalizedQuery)) {
      setSearchResults([])
      setShowDropdown(false)
      setActiveOptionKey(null)
      return
    }
    setStatus('searching')
    setRetryAction({ mode: 'search', query: normalizedQuery })
    setShowDropdown(true)
    setActiveOptionKey(null)
    try {
      const res = await fetch(`${SEARCH_DB_URL}/api/search?q=${encodeURIComponent(normalizedQuery)}&type=recipe&limit=10`)
      if (!res.ok) throw new Error(`Search failed: ${res.status}`)
      const data = await res.json()

      // Fetch full recipe data for each result
      const results = await Promise.all(
        (data.results || []).map(async (node) => {
          try {
            const r = await fetch(`${API_URL}/api/recipes/${node.id}`)
            if (!r.ok) return null
            const full = await r.json()
            const d = full.data || full
            const searchRecipe = {
              id: node.id,
              name: d.name || d.title || 'Untitled',
              description: d.description || '',
              image: d.image || d.imageUrl || d.image_url || '',
              prep_time: d.prepTime || d.prep_time || null,
              cook_time: d.cookTime || d.cook_time || null,
              recipe_yield: d.servings || d.recipeYield || d.recipe_yield || null,
              ingredients: d.ingredients || d.recipeIngredient || [],
              instructions: d.instructions || d.recipeInstructions || [],
              source_url: d.url || d.source_url || '',
              allergenSummary: d.allergenSummary || null,
            }
            return annotateRecipeForProfile(searchRecipe, culinaryProfile.profile)
          } catch {
            return null
          }
        })
      )
      if (
        requestId !== searchRequestIdRef.current ||
        latestInputRef.current.trim() !== normalizedQuery
      ) return

      setSearchResults(results.filter(Boolean))
      setLastSearchQuery(normalizedQuery)
      setRetryAction(null)
    } catch (e) {
      if (requestId !== searchRequestIdRef.current) return
      setSearchResults([])
      setShowDropdown(false)
      setActiveOptionKey(null)
      setRetryAction({ mode: 'search', query: normalizedQuery })
      setErrorMsg(e.message)
      setStatus('error')
      return
    }
    if (requestId === searchRequestIdRef.current) setStatus('idle')
  }

  const [debouncedSearch, cancelDebouncedSearch] = useDebounce(doSearch, 300)

  function invalidateSearch() {
    cancelDebouncedSearch()
    searchRequestIdRef.current += 1
    setStatus((current) => current === 'searching' ? 'idle' : current)
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target) &&
          inputRef.current && !inputRef.current.contains(e.target)) {
        invalidateSearch()
        setShowDropdown(false)
        setActiveOptionKey(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [cancelDebouncedSearch])

  const busy = status === 'searching' || status === 'clipping' || status === 'generating' || status === 'elevating' || status === 'adapting'
  const inputBusy = status === 'clipping' || status === 'generating' || status === 'elevating' || status === 'adapting'

  // Restore focus after a blocking async action completes, but don't steal focus
  // from elements the user has intentionally focused.
  useEffect(() => {
    if (!inputBusy && !activeRecipe) {
      const active = document.activeElement
      if (!active || active === document.body) inputRef.current?.focus()
    }
  }, [inputBusy, activeRecipe])

  // When a recipe is selected from the MealPlannerDrawer (via DayCard calling
  // setActiveRecipe), automatically close the drawer so the RecipeCard is visible.
  // Only fires on non-null values — clearing activeRecipe does not re-open the drawer.
  useEffect(() => {
    if (activeRecipe) {
      setIsDrawerOpen(false)
      setShowDropdown(false)
      setActiveOptionKey(null)
    }
  }, [activeRecipe])

  useEffect(() => {
    if (!mealPlannerEnabled) setIsDrawerOpen(false)
  }, [mealPlannerEnabled])

  const isSearchView = hasText
  const searchResultsMatchInput = isSearchView && lastSearchQuery === input.trim()
  const isBrowseView = input.trim().length === 0
  const dropdownVisible = showDropdown && (!activeRecipe || isSearchView)
  const isEmptyState = !activeRecipe && !busy && status !== 'error' && !input.trim() && recentRecipes.length === 0 && !dropdownVisible
  const visibleOptions = (searchResultsMatchInput
    ? searchResults.map((recipe, index) => ({
        key: `search-${recipe.id || index}-${index}`,
        kind: 'search',
        recipe,
      }))
    : isBrowseView
      ? [
        ...recentRecipes.map((recipe, index) => ({
          key: `recent-${recipe.id || index}-${index}`,
          kind: 'recent',
          recipe,
        })),
        ...searchResults.map((recipe, index) => ({
          key: `last-search-${recipe.id || index}-${index}`,
          kind: 'search',
          recipe,
        })),
      ]
      : []
  ).map((option, index) => ({ ...option, domId: `${listboxId}-option-${index}` }))

  const activeOption = visibleOptions.find((option) => option.key === activeOptionKey)
  const activeOptionDomId = activeOption?.domId

  useEffect(() => {
    if (!activeOptionDomId) return
    document.getElementById(activeOptionDomId)?.scrollIntoView?.({ block: 'nearest' })
  }, [activeOptionDomId])

  useEffect(() => () => {
    searchRequestIdRef.current += 1
  }, [])

  // --- Auth gates (after all hooks) ---

  if (auth.loading) {
    return (
      <div className="auth-screen">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <div className="auth-brand">
            <svg className="auth-brand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z"/>
              <path d="M8 12c0-2.2 1.8-4 4-4s4 1.8 4 4-1.8 4-4 4"/>
              <path d="M12 8v1M12 15v1M8.5 9.5l.7.7M14.8 14.8l.7.7M8 12H7M17 12h-1M8.5 14.5l.7-.7M14.8 9.2l.7-.7"/>
            </svg>
            <span className="auth-brand-name">Seasoned</span>
          </div>
          <svg className="auth-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: 'var(--accent)', width: 28, height: 28 }}>
            <path d="M21 12a9 9 0 11-6.219-8.56"/>
          </svg>
        </div>
      </div>
    )
  }

  if (!auth.isAuthenticated) {
    return <AuthScreen onRequestOTP={auth.requestOTP} onVerifyOTP={auth.verifyOTP} onSignInWithPasskey={auth.signInWithPasskey} />
  }

  function handleInputChange(e) {
    const val = e.target.value
    latestInputRef.current = val
    setInput(val)
    setErrorMsg('')
    setRetryAction(null)
    setActiveOptionKey(null)
    searchRequestIdRef.current += 1
    if (!isValidUrl(val.trim()) && val.trim().length >= 2) {
      if (val.trim() !== lastSearchQuery) setShowDropdown(false)
      debouncedSearch(val.trim())
    } else {
      cancelDebouncedSearch()
      if (status === 'searching') setStatus('idle')
      // Don't re-open the dropdown if a generation/clip/elevate is in
      // flight — clearing the input during those flows would otherwise
      // cause the dropdown to pop back up over the recipe/generating card
      const inFlight = status === 'generating' || status === 'elevating' || status === 'clipping'
      setShowDropdown(!inFlight && val.trim().length === 0 && (recentRecipes.length > 0 || searchResults.length > 0))
    }
  }

  // --- Clip ---
  async function doClip(url) {
    setRetryAction({ mode: 'clip', url })
    invalidateSearch()
    latestInputRef.current = ''
    setStatus('clipping')
    setClippingFromYouTube(isYouTubeUrl(url))
    setShowDropdown(false)
    clearActiveRecipe()
    setSaveState('idle')
    try {
      const res = await fetch(`${CLIPPER_API_URL}/clip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      if (!res.ok) throw new Error(`Clip failed: ${res.status}`)
      const data = await res.json()
      const d = data.recipe || data
      const isYouTube = d.sourceType === 'youtube' || isYouTubeUrl(url)
      const clippedRecipe = annotateRecipeForProfile({
        id: `clip-${Date.now()}`,
        source: isYouTube ? 'youtube' : 'clipped',
        name: d.name || d.title || 'Clipped Recipe',
        description: d.description || '',
        image: d.image || d.imageUrl || d.image_url || '',
        prep_time: d.prepTime || d.prep_time || null,
        cook_time: d.cookTime || d.cook_time || null,
        recipe_yield: d.servings || d.recipeYield || d.recipe_yield || null,
        ingredients: d.ingredients || d.recipeIngredient || [],
        instructions: d.instructions || d.recipeInstructions || [],
        source_url: url,
        allergenSummary: d.allergenSummary || null,
      }, culinaryProfile.profile)
      setActiveRecipe(clippedRecipe)
      addRecentRecipe(clippedRecipe)
      setInput('')
      setRetryAction(null)
    } catch (e) {
      setErrorMsg(e.message)
      setStatus('error')
      setClippingFromYouTube(false)
      return
    }
    setStatus('idle')
    setClippingFromYouTube(false)
  }

  // --- Generate ---
  async function doGenerate(query, { elevate = false, baseRecipe = null, overrides = null } = {}) {
    invalidateSearch()
    setRetryAction({ mode: 'generate', query, options: { elevate, baseRecipe, overrides } })
    latestInputRef.current = ''
    const dishName = elevate && baseRecipe ? baseRecipe.name : query
    setGeneratingName(dishName)
    setInput('')
    setStatus(elevate ? 'elevating' : 'generating')
    setShowDropdown(false)
    setSaveState('idle')
    try {
      const body = buildGenerationRequest({
        dishName,
        elevate,
        // Hard-allergen enforcement is safety-critical and must not depend on
        // the optional Tune/composer flag.
        profile: culinaryProfileEnabled ? culinaryProfile.profile : null,
        overrides,
        baseIngredients: baseRecipe?.ingredients || null,
        pantryItems: pantry.items,
        pantryPlannerEnabled: pantryPlanningAvailable,
      })

      const res = await fetch(`${RECIPE_GENERATION_URL}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`Generation failed: ${res.status}`)
      const data = await res.json()
      if (!data.success || !data.recipe) throw new Error(data.error || 'Generation returned no recipe')

      const r = data.recipe
      const generatedRecipe = {
        id: `ai-${Date.now()}`,
        source: elevate ? 'elevated' : 'ai_generated',
        name: r.name,
        description: r.description || '',
        image: r.image_url || '',
        prep_time: r.prepTime || null,
        cook_time: r.cookTime || null,
        recipe_yield: r.servings || null,
        ingredients: r.ingredients || [],
        instructions: r.instructions || [],
        appliedConstraints: data.appliedConstraints || r.appliedConstraints || null,
        allergenSummary: r.allergenSummary || data.allergenSummary || null,
        allergenValidation: r.allergenValidation || data.allergenValidation || null,
        processSafetySummary: r.processSafetySummary || data.processSafetySummary || null,
        processSafetyValidation: r.processSafetyValidation || null,
      }
      setActiveRecipe(generatedRecipe)
      addRecentRecipe(generatedRecipe)
      setRetryAction(null)
      setGeneratingName('')
    } catch (e) {
      setGeneratingName('')
      setErrorMsg(e.message)
      setStatus('error')
      return
    }
    setStatus('idle')
  }

  async function doAdapt(baseRecipe, overrides = null) {
    invalidateSearch()
    setRetryAction({ mode: 'adapt', recipe: baseRecipe, overrides })
    latestInputRef.current = ''
    setGeneratingName(baseRecipe.name)
    setInput('')
    setStatus('adapting')
    setShowDropdown(false)
    setSaveState('idle')
    try {
      const body = buildAdaptRequest({
        baseRecipe,
        profile: culinaryProfileEnabled ? culinaryProfile.profile : null,
        overrides,
      })
      const res = await fetch(`${RECIPE_GENERATION_URL}/adapt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`Adaptation failed: ${res.status}`)
      const data = await res.json()
      if (!data.success || !data.recipe) throw new Error(data.error || 'Adaptation returned no recipe')

      const r = data.recipe
      const adaptedRecipe = {
        id: `adapt-${Date.now()}`,
        source: 'adapted',
        name: r.name || baseRecipe.name,
        description: r.description || baseRecipe.description || '',
        image: r.image_url || r.image || baseRecipe.image || '',
        prep_time: r.prepTime || r.prep_time || baseRecipe.prep_time || null,
        cook_time: r.cookTime || r.cook_time || baseRecipe.cook_time || null,
        recipe_yield: r.servings || r.recipe_yield || baseRecipe.recipe_yield || null,
        ingredients: r.ingredients || baseRecipe.ingredients || [],
        instructions: r.instructions || baseRecipe.instructions || [],
        source_url: r.source_url || baseRecipe.source_url || '',
        dietary: r.dietary || baseRecipe.dietary || [],
        appliedConstraints: data.appliedConstraints || r.appliedConstraints || null,
        allergenSummary: r.allergenSummary || null,
        processSafetySummary: r.processSafetySummary || data.processSafetySummary || null,
        processSafetyValidation: r.processSafetyValidation || null,
        adapted_from: r.adapted_from || baseRecipe.id || baseRecipe.source_url || null,
        adaptation_constraints: r.adaptation_constraints || data.appliedConstraints || null,
        substitutions: r.substitutions || [],
        adaptationNotes: r.adaptationNotes || [],
      }
      setActiveRecipe(adaptedRecipe)
      addRecentRecipe(adaptedRecipe)
      setRetryAction(null)
      setGeneratingName('')
    } catch (e) {
      setGeneratingName('')
      setErrorMsg(e.message)
      setStatus('error')
      return
    }
    setStatus('idle')
  }

  function handleAdapt(overrides) {
    setAdaptComposerOpen(false)
    if (activeRecipe) doAdapt(activeRecipe, overrides)
  }

  function handleTunedGenerate(overrides) {
    setGenerationComposerOpen(false)
    doGenerate(input.trim(), { overrides })
  }

  // --- Primary action on Enter / button click ---
  function handleSubmit() {
    const action = getPrimaryAction()
    if (action === 'clip') doClip(input.trim())
    else if (action === 'search') {
      cancelDebouncedSearch()
      doSearch(input.trim())
    }
  }

  function selectOption(option) {
    if (option.kind === 'recent') handleRecentSelect(option.recipe)
    else handleResultSelect(option.recipe)
  }

  function handleKeyDown(e) {
    if (e.nativeEvent?.isComposing) return

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (status === 'searching' || visibleOptions.length === 0) return
      e.preventDefault()
      setShowDropdown(true)
      setActiveOptionKey((currentKey) => {
        const currentIndex = visibleOptions.findIndex((option) => option.key === currentKey)
        if (e.key === 'ArrowDown') {
          return visibleOptions[(currentIndex + 1) % visibleOptions.length].key
        }
        const previousIndex = currentIndex <= 0 ? visibleOptions.length - 1 : currentIndex - 1
        return visibleOptions[previousIndex].key
      })
      return
    }

    if (e.key === 'Enter') {
      if (dropdownVisible && activeOption) {
        e.preventDefault()
        selectOption(activeOption)
      } else {
        handleSubmit()
      }
      return
    }

    if (e.key === 'Escape') {
      e.preventDefault()
      setShowDropdown(false)
      setActiveOptionKey(null)
      setSearchResults([])
      setLastSearchQuery('')
    }
  }

  function handleResultSelect(result) {
    invalidateSearch()
    latestInputRef.current = ''
    setActiveRecipe(result)
    addRecentRecipe(result)
    setSaveState('saved')
    setSavedRecipeId(result.id)
    setShowDropdown(false)
    setActiveOptionKey(null)
    setInput('')
  }

  function handleRecentSelect(r) {
    invalidateSearch()
    latestInputRef.current = ''
    setActiveRecipe(r)
    setShowDropdown(false)
    setActiveOptionKey(null)
    setInput('')
    // Only mark as saved for real DB recipes (not temporary clip-* / ai-* ids)
    if (r.id && !r.id.startsWith('clip-') && !r.id.startsWith('ai-')) {
      setSaveState('saved')
      setSavedRecipeId(r.id)
    } else {
      setSaveState('idle')
    }
  }

  function handleInputFocus() {
    setActiveOptionKey(null)
    if (!input.trim() && (recentRecipes.length > 0 || searchResults.length > 0)) setShowDropdown(true)
  }

  function handleClearRecentRecipes() {
    clearRecentRecipes()
    setActiveOptionKey(null)
    if (searchResults.length === 0) setShowDropdown(false)
    inputRef.current?.focus()
  }

  function renderOption(option) {
    const isActive = option.key === activeOptionKey
    const r = option.recipe
    return (
      <button
        key={option.key}
        id={option.domId}
        type="button"
        role="option"
        aria-selected={isActive}
        tabIndex={-1}
        className="dropdown-item"
        onMouseDown={(e) => e.preventDefault()}
        onMouseEnter={() => setActiveOptionKey(option.key)}
        onClick={() => selectOption(option)}
      >
        {r.image ? (
          <img className="dropdown-thumbnail" src={r.image} alt="" loading="lazy" />
        ) : (
          <span className="dropdown-thumbnail dropdown-thumbnail--placeholder" aria-hidden="true" />
        )}
        <span className="dropdown-item-content">
          <span className="dropdown-name">{r.name}</span>
          <span className="dropdown-meta">
            <span className="dropdown-pill dropdown-source-pill">{getRecipeSourceLabel(r)}</span>
            {r.prep_time && <span className="dropdown-pill">Prep: {parseDuration(r.prep_time)}</span>}
            {r.cook_time && <span className="dropdown-pill">Cook: {parseDuration(r.cook_time)}</span>}
            {r.recipe_yield && <span className="dropdown-pill">Serves: {r.recipe_yield}</span>}
          </span>
        </span>
      </button>
    )
  }

  function applySuggestion(suggestion) {
    latestInputRef.current = suggestion
    setInput(suggestion)
    setErrorMsg('')
    setRetryAction(null)
    setActiveOptionKey(null)
    setShowDropdown(false)
    inputRef.current?.focus()
  }

  // --- Save ---
  async function doSave(r) {
    setSaveState('saving')
    const recipeUrl = r.source === 'adapted'
      ? `https://seasoned.app/adapted/${r.id}`
      : r.source_url || `https://seasoned.app/ai/${r.id}`
    try {
      const res = await fetch(`${API_URL}/recipe/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipe: {
            url: recipeUrl,
            title: r.name,
            description: r.description || '',
            imageUrl: r.image || '',
            prepTime: r.prep_time || null,
            cookTime: r.cook_time || null,
            servings: r.recipe_yield || null,
            ingredients: r.ingredients || [],
            instructions: r.instructions || [],
            source: r.source || null,
            adapted_from: r.adapted_from || null,
            adaptation_constraints: r.adaptation_constraints || null,
            substitutions: r.substitutions || [],
            adaptationNotes: r.adaptationNotes || [],
          },
          options: { overwrite: false },
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        // 409 = already exists — treat as saved
        if (res.status === 409) {
          if (body.id) setSavedRecipeId(body.id)
          if (body.data) {
            setActiveRecipe({
              ...activeRecipe,
              ...body.data,
              image: body.data.imageUrl || body.data.image || activeRecipe.image
            })
          }
          setSaveState('saved')
          return
        }
        throw new Error(body.error || `Save failed: ${res.status}`)
      }
      const data = await res.json().catch(() => ({}))
      if (data.id) setSavedRecipeId(data.id)
      if (data.data) {
        setActiveRecipe({
          ...activeRecipe,
          ...data.data,
          image: data.data.imageUrl || data.data.image || activeRecipe.image
        })
      }
      setSaveState('saved')
    } catch (e) {
      setSaveState('error')
    }
  }

  // --- Edit ---
  // The stored record uses the save worker's camelCase schema while the card
  // works in the display shape, so the patch is translated on the way out and
  // applied to the open card on the way back.
  async function doUpdate(patch) {
    if (!activeRecipe?.id) throw new Error('Save this recipe before editing it')
    const res = await fetch(`${API_URL}/recipe/update`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipeId: activeRecipe.id,
        updates: {
          title: patch.name,
          description: patch.description,
          imageUrl: patch.image,
          prepTime: patch.prep_time,
          cookTime: patch.cook_time,
          servings: patch.recipe_yield,
          ingredients: patch.ingredients,
          instructions: patch.instructions,
        },
      }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `Could not save your changes: ${res.status}`)
    }
    setActiveRecipe(annotateRecipeForProfile({ ...activeRecipe, ...patch }, culinaryProfile.profile))
    setEditorOpen(false)
  }

  function handleClose() {
    setEditorOpen(false)
    setNotesOpen(false)
    clearActiveRecipe()
    setGeneratingName('')
    setErrorMsg('')
    setRetryAction(null)
    setStatus('idle')
    setSaveState('idle')
    setSavedRecipeId(null)
  }

  const shareUrl = savedRecipeId && RECIPE_VIEW_URL
    ? `${RECIPE_VIEW_URL}/recipe/${savedRecipeId}`
    : null

  return (
    <div className="app">
      <PWAInstallPrompt />
      {mealPlannerEnabled && (
        <MealPlanner
          isOpen={isDrawerOpen}
          onToggle={() => setIsDrawerOpen((prev) => !prev)}
          onClose={() => setIsDrawerOpen(false)}
          pantryItems={pantryPlanningAvailable ? pantry.items : []}
          pantryPlannerEnabled={pantryPlanningAvailable}
          onOpenPantry={pantryPlanningAvailable ? () => { setIsDrawerOpen(false); setPantryOpen(true) } : undefined}
        />
      )}
      <UserMenu
        user={auth.user}
        onSignOut={auth.signOut}
        onRegisterPasskey={auth.registerPasskey}
        onOpenProfile={culinaryProfileEnabled && culinaryProfile.available ? () => setProfileOpen(true) : undefined}
        onOpenPantry={pantryEnabled && pantry.available ? () => setPantryOpen(true) : undefined}
      />
      <div className="omnibox-wrapper">
        <div className="brand">
          <div className="brand-header">
            <svg className="brand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z"/>
              <path d="M8 12c0-2.2 1.8-4 4-4s4 1.8 4 4-1.8 4-4 4"/>
              <path d="M12 8v1M12 15v1M8.5 9.5l.7.7M14.8 14.8l.7.7M8 12H7M17 12h-1M8.5 14.5l.7-.7M14.8 9.2l.7-.7"/>
            </svg>
            <span className="brand-name">Seasoned</span>
          </div>
          <span className="brand-tagline">Clip, Organize, Season Every Recipe to Your Taste</span>
        </div>

        {culinaryProfileEnabled && culinaryProfile.available && culinaryProfile.profile && (
          <button type="button" className="culinary-profile-summary" onClick={() => setProfileOpen(true)}>
            <span className="culinary-profile-summary-label">Kitchen profile</span>
            {culinaryProfile.profile.diet_tags.slice(0, 3).map((tag) => (
              <span key={tag} className="culinary-profile-chip">{tag.replace(/_/g, ' ')}</span>
            ))}
            {culinaryProfile.profile.hard_allergens.length > 0 && (
              <span className="culinary-profile-chip culinary-profile-chip--safety">{culinaryProfile.profile.hard_allergens.length} allergen{culinaryProfile.profile.hard_allergens.length === 1 ? '' : 's'} saved</span>
            )}
            <span className="culinary-profile-summary-edit">Edit</span>
          </button>
        )}

        <div className="omnibox">
          <div className={`omnibox-inner ${busy ? 'busy' : ''} ${status === 'error' ? 'has-error' : ''}`}>
            <label className="sr-only" htmlFor="recipe-omnibox-input">
              Search, clip, or generate a recipe
            </label>
            <span id="omnibox-instructions" className="sr-only">
              Type to search saved recipes, paste a link to clip, or describe a dish to generate one. Use the up and down arrow keys to review suggestions, then press Enter to open one.
            </span>
            <input
              id="recipe-omnibox-input"
              ref={inputRef}
              className="omnibox-input"
              type="text"
              role="combobox"
              placeholder="Search recipes, paste a link, or describe a dish…"
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onFocus={handleInputFocus}
              disabled={inputBusy}
              aria-autocomplete="list"
              aria-haspopup="listbox"
              aria-expanded={dropdownVisible}
              aria-controls={dropdownVisible ? listboxId : undefined}
              aria-activedescendant={dropdownVisible && activeOption ? activeOption.domId : undefined}
              aria-busy={status === 'searching'}
              aria-describedby={`omnibox-instructions omnibox-helper${status === 'error' && errorMsg ? ' omnibox-error' : ''}`}
              autoFocus
              autoComplete="off"
              spellCheck="false"
            />

            <div className={`omnibox-actions ${isUrl ? 'omnibox-actions--clip' : ''}`}>
              {/* Search is the contextual primary for text queries; generation stays secondary. */}
              {hasText && (
                <>
                  <button
                    className="action-btn primary-btn search-btn"
                    title="Search saved recipes"
                    onClick={handleSubmit}
                    disabled={busy}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="7" />
                      <path d="m16.5 16.5 4 4" />
                    </svg>
                    <span>Search</span>
                  </button>
                  {constraintGenerateEnabled && (
                    <button
                      className="action-btn tune-btn"
                      title="Tune generation constraints"
                      onClick={() => setGenerationComposerOpen(true)}
                      disabled={inputBusy}
                    >
                      <span>Tune</span>
                      <span className="sr-only">generation constraints</span>
                    </button>
                  )}
                  <button
                    className="action-btn generate-btn"
                    title="Generate AI recipe"
                    onClick={() => doGenerate(input.trim())}
                    disabled={inputBusy}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 107.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
                    </svg>
                    <span>Generate</span>
                  </button>
                </>
              )}

              {/* Primary action button — only shown for URL clipping */}
              {isUrl && (
                <button
                  className={`action-btn primary-btn clip`}
                  title="Clip recipe from URL"
                  onClick={handleSubmit}
                  disabled={busy}
                >
                  {busy ? (
                    <svg className="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12a9 9 0 11-6.219-8.56"/>
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
                      <path d="M20 4H8.12a2 2 0 00-1.99 1.78c-.07.81.83 2.22.83 2.22"/>
                      <path d="M14 12l-2.5 2.5L9 12"/>
                      <path d="M20 20H8.12a2 2 0 01-1.99-1.78c-.07-.81.83-2.22.83-2.22"/>
                    </svg>
                  )}
                  <span>Clip</span>
                </button>
              )}
            </div>
          </div>
          <p id="omnibox-helper" className="omnibox-helper">
            Paste a recipe link to clip · type to search · describe a dish to generate
          </p>

          {/* Loading label — for search/clip only; generate/elevate use GeneratingCard */}
          {busy && (status === 'searching' || status === 'clipping') && (
            <div className="status-label" role="status" aria-live="polite">
              {status === 'searching' && 'Searching…'}
              {status === 'clipping' && (clippingFromYouTube ? 'Clipping recipe from YouTube…' : 'Clipping recipe…')}
            </div>
          )}

          {/* Error */}
          {status === 'error' && errorMsg && (
            <div id="omnibox-error" className="error-label" role="alert">
              <span>{errorMsg}</span>
              {retryAction && (
                <button
                  type="button"
                  className="error-retry"
                  onClick={() => {
                    if (retryAction.mode === 'search') doSearch(retryAction.query)
                    else if (retryAction.mode === 'clip') doClip(retryAction.url)
                    else if (retryAction.mode === 'adapt') doAdapt(retryAction.recipe, retryAction.overrides)
                    else doGenerate(retryAction.query, retryAction.options)
                  }}
                >
                  {retryAction.mode === 'generate' || retryAction.mode === 'adapt' ? 'Retry generation' : 'Retry'}
                </button>
              )}
            </div>
          )}

          {/* Search dropdown */}
          {dropdownVisible && (
            <div className="dropdown" ref={dropdownRef}>
              {!isSearchView && recentRecipes.length > 0 && (
                <div className="dropdown-section-label">
                  <span id="recent-recipes-label">Recently Viewed</span>
                  <button
                    type="button"
                    className="dropdown-clear-btn"
                    aria-label="Clear recently viewed recipes"
                    onClick={handleClearRecentRecipes}
                  >
                    Clear
                  </button>
                </div>
              )}

              <div
                id={listboxId}
                role="listbox"
                aria-label="Recipe suggestions"
                aria-busy={status === 'searching'}
              >
                {status !== 'searching' && searchResultsMatchInput && visibleOptions.length > 0 && (
                  <div role="group" aria-label="Search results">
                    {visibleOptions.map(renderOption)}
                  </div>
                )}
                {status !== 'searching' && isBrowseView && (
                  <>
                    {recentRecipes.length > 0 && (
                      <div role="group" aria-labelledby="recent-recipes-label">
                        {visibleOptions
                          .filter((option) => option.kind === 'recent')
                          .map(renderOption)}
                      </div>
                    )}
                    {searchResults.length > 0 && (
                      <div
                        role="group"
                        aria-label={lastSearchQuery ? `Last search: ${lastSearchQuery}` : 'Last search'}
                        className="dropdown-option-group dropdown-option-group--labeled"
                        data-label={lastSearchQuery ? `Last Search: “${lastSearchQuery}”` : 'Last Search'}
                      >
                        {visibleOptions
                          .filter((option) => option.kind === 'search')
                          .map(renderOption)}
                      </div>
                    )}
                  </>
                )}
              </div>

              {status === 'searching' && (
                <div aria-hidden="true">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="skeleton-item">
                      <div className="skeleton-line title" />
                      <div className="skeleton-line meta" />
                    </div>
                  ))}
                </div>
              )}

              {status !== 'searching' && searchResultsMatchInput && visibleOptions.length === 0 && (
                <div className="dropdown-empty" role="status">
                  No recipes found for "{input}"
                </div>
              )}

              {status !== 'searching' && visibleOptions.length > 0 && (
                <div className="dropdown-shortcuts" aria-hidden="true">
                  <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
                  <span><kbd>Enter</kbd> Open</span>
                  <span><kbd>Esc</kbd> Close</span>
                </div>
              )}
            </div>
          )}
        </div>

        {isEmptyState && (
          <section className="omnibox-empty-state" aria-labelledby="omnibox-empty-title">
            <h2 id="omnibox-empty-title">Start with a recipe idea</h2>
            <p>Search your collection, clip a favorite link, or let Seasoned shape a dish around your constraints.</p>
            <div className="omnibox-suggestions" aria-label="Recipe ideas">
              <button type="button" className="suggestion-chip" onClick={() => applySuggestion('20-minute vegetarian dinner')}>
                20-minute vegetarian dinner
              </button>
              <button type="button" className="suggestion-chip" onClick={() => applySuggestion('high-protein weeknight pasta')}>
                High-protein weeknight pasta
              </button>
              <button type="button" className="suggestion-chip" onClick={() => applySuggestion('cozy one-pot meal')}>
                Cozy one-pot meal
              </button>
            </div>
          </section>
        )}

        {/* GeneratingCard — shown while generate/elevate is in-flight */}
        <GenerationComposer
          open={generationComposerOpen && constraintGenerateEnabled && hasText}
          profile={culinaryProfile.profile}
          query={input.trim()}
          busy={inputBusy}
          onClose={() => setGenerationComposerOpen(false)}
          onGenerate={handleTunedGenerate}
          pantryItems={usablePantryItems}
          expiringPantryItems={expiringPantryItems}
          pantryPlannerEnabled={pantryPlanningAvailable}
        />

        <AdaptComposer
          open={adaptComposerOpen && recipeAdaptEnabled && Boolean(activeRecipe)}
          recipe={activeRecipe}
          profile={culinaryProfile.profile}
          busy={status === 'adapting'}
          onClose={() => setAdaptComposerOpen(false)}
          onAdapt={handleAdapt}
        />

        {(status === 'generating' || status === 'elevating' || status === 'adapting') && generatingName && (
          <GeneratingCard dishName={generatingName} />
        )}

        {/* Recipe card */}
        {activeRecipe && !['generating', 'adapting'].includes(status) && !(dropdownVisible && isSearchView) && (
          <RecipeCard
            recipe={activeRecipe}
            onClose={handleClose}
            onElevate={() => doGenerate(activeRecipe.name, { elevate: true, baseRecipe: activeRecipe })}
            onAdapt={recipeAdaptEnabled ? () => setAdaptComposerOpen(true) : undefined}
            isElevating={status === 'elevating'}
            isAdapting={status === 'adapting'}
            onSave={() => doSave(activeRecipe)}
            saveState={saveState}
            shareUrl={shareUrl}
            onEdit={recipeEditingEnabled ? () => setEditorOpen(true) : undefined}
            onOpenNotes={recipeNotesEnabled ? () => setNotesOpen(true) : undefined}
            noteCount={recipeNotes.notes.length}
            pantryItems={pantryPlanningAvailable ? pantry.items : []}
            pantryPlannerEnabled={pantryPlanningAvailable}
            onDepletePantry={pantryPlanningAvailable ? depletePantry : undefined}
          />
        )}

        {editorOpen && activeRecipe && recipeEditingEnabled && (
          <RecipeEditor
            recipe={activeRecipe}
            onSave={doUpdate}
            onClose={() => setEditorOpen(false)}
          />
        )}

        {notesOpen && activeRecipe && recipeNotesEnabled && (
          <RecipeNotesModal
            recipe={activeRecipe}
            notes={recipeNotes.notes}
            loading={recipeNotes.loading}
            syncError={recipeNotes.syncError}
            onAdd={recipeNotes.addNote}
            onUpdate={recipeNotes.updateNote}
            onRemove={recipeNotes.removeNote}
            onClose={() => setNotesOpen(false)}
          />
        )}

        <CulinaryProfile
          open={profileOpen && culinaryProfileEnabled && culinaryProfile.available}
          profile={culinaryProfile.profile}
          loading={culinaryProfile.loading}
          saving={culinaryProfile.saving}
          error={culinaryProfile.error}
          onSave={culinaryProfile.saveProfile}
          onClose={() => setProfileOpen(false)}
        />
        <PantryModal
          open={pantryOpen && pantryEnabled && pantry.available}
          items={pantry.items}
          loading={pantry.loading}
          syncError={pantry.syncError}
          activeRecipe={activeRecipe}
          onAdd={pantry.addItem}
          onUpdate={pantry.updateItem}
          onRemove={pantry.removeItem}
          onClose={() => setPantryOpen(false)}
        />
      </div>
    </div>
  )
}
