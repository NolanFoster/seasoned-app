import React, { useState, useRef, useEffect, useCallback } from 'react'
import RecipeCard, { parseDuration } from './RecipeCard.jsx'
import GeneratingCard from './GeneratingCard.jsx'
import AuthScreen from './AuthScreen.jsx'
import PWAInstallPrompt from './PWAInstallPrompt.jsx'
import { useRecentRecipes } from './useRecentRecipes.js'
import { useAuth } from './useAuth.js'

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

// Debounce helper — cancels pending timer on unmount to prevent leaks
function useDebounce(fn, delay) {
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])
  return useCallback((...args) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => fn(...args), delay)
  }, [fn, delay])
}

function UserMenu({ user, onSignOut }) {
  const [open, setOpen] = useState(false)
  const [opacity, setOpacity] = useState(1)
  const menuRef = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

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
        className="user-avatar-btn"
        onClick={() => setOpen((o) => !o)}
        title={user?.email || 'Account'}
        aria-label="Account menu"
      >
        {initial}
      </button>
      {open && (
        <div className="user-menu-dropdown">
          <div className="user-menu-info">
            <div className="user-menu-email">{user?.email}</div>
          </div>
          <button className="user-menu-item" onClick={() => { setOpen(false); onSignOut() }}>
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

export default function App() {
  const auth = useAuth()
  const [input, setInput] = useState('')
  const [status, setStatus] = useState('idle') // idle | searching | clipping | generating | elevating | error
  const [errorMsg, setErrorMsg] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [lastSearchQuery, setLastSearchQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [recipe, setRecipe] = useState(null) // currently displayed recipe
  const [saveState, setSaveState] = useState('idle') // idle | saving | saved | error
  const [savedRecipeId, setSavedRecipeId] = useState(null) // persisted KV id for share URL
  const [generatingName, setGeneratingName] = useState('')
  const inputRef = useRef(null)
  const dropdownRef = useRef(null)
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
    if (!query || query.trim().length < 2) {
      setSearchResults([])
      setShowDropdown(false)
      return
    }
    setStatus('searching')
    setShowDropdown(true)
    try {
      const res = await fetch(`${SEARCH_DB_URL}/api/search?q=${encodeURIComponent(query)}&type=recipe&limit=10`)
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
            return {
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
            }
          } catch {
            return null
          }
        })
      )
      setSearchResults(results.filter(Boolean))
      setLastSearchQuery(query)
    } catch (e) {
      setErrorMsg(e.message)
      setStatus('error')
      return
    }
    setStatus('idle')
  }

  const debouncedSearch = useDebounce(doSearch, 300)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target) &&
          inputRef.current && !inputRef.current.contains(e.target)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const busy = status === 'searching' || status === 'clipping' || status === 'generating' || status === 'elevating'
  const inputBusy = status === 'clipping' || status === 'generating' || status === 'elevating'

  // Restore focus after a blocking async action completes, but don't steal focus
  // from elements the user has intentionally focused.
  useEffect(() => {
    if (!inputBusy) {
      const active = document.activeElement
      if (!active || active === document.body) inputRef.current?.focus()
    }
  }, [inputBusy])

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
    return <AuthScreen onRequestOTP={auth.requestOTP} onVerifyOTP={auth.verifyOTP} />
  }

  function handleInputChange(e) {
    const val = e.target.value
    setInput(val)
    setErrorMsg('')
    if (!isValidUrl(val.trim()) && val.trim().length >= 2) {
      debouncedSearch(val.trim())
    } else {
      setShowDropdown(val.trim().length === 0 && (recentRecipes.length > 0 || searchResults.length > 0))
    }
  }

  // --- Clip ---
  async function doClip(url) {
    setStatus('clipping')
    setShowDropdown(false)
    setRecipe(null)
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
      const clippedRecipe = {
        id: `clip-${Date.now()}`,
        source: 'clipped',
        name: d.name || d.title || 'Clipped Recipe',
        description: d.description || '',
        image: d.image || d.imageUrl || d.image_url || '',
        prep_time: d.prepTime || d.prep_time || null,
        cook_time: d.cookTime || d.cook_time || null,
        recipe_yield: d.servings || d.recipeYield || d.recipe_yield || null,
        ingredients: d.ingredients || d.recipeIngredient || [],
        instructions: d.instructions || d.recipeInstructions || [],
        source_url: url,
      }
      setRecipe(clippedRecipe)
      addRecentRecipe(clippedRecipe)
      setInput('')
    } catch (e) {
      setErrorMsg(e.message)
      setStatus('error')
      return
    }
    setStatus('idle')
  }

  // --- Generate ---
  async function doGenerate(query, { elevate = false, baseRecipe = null } = {}) {
    const dishName = elevate && baseRecipe ? baseRecipe.name : query
    setGeneratingName(dishName)
    setInput('')
    setStatus(elevate ? 'elevating' : 'generating')
    setShowDropdown(false)
    setSaveState('idle')
    try {
      const body = {
        recipeName: dishName,
        generateImage: true,
        elevate: elevate,
      }
      if (elevate && baseRecipe) {
        body.ingredients = baseRecipe.ingredients
      }

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
      }
      setRecipe(generatedRecipe)
      addRecentRecipe(generatedRecipe)
      setGeneratingName('')
    } catch (e) {
      setGeneratingName('')
      setErrorMsg(e.message)
      setStatus('error')
      return
    }
    setStatus('idle')
  }

  // --- Primary action on Enter / button click ---
  function handleSubmit() {
    const action = getPrimaryAction()
    if (action === 'clip') doClip(input.trim())
    else if (action === 'search') doSearch(input.trim())
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleSubmit()
    if (e.key === 'Escape') {
      setShowDropdown(false)
      setSearchResults([])
      setLastSearchQuery('')
    }
  }

  function handleResultSelect(result) {
    setRecipe(result)
    addRecentRecipe(result)
    setSaveState('saved')
    setSavedRecipeId(result.id)
    setShowDropdown(false)
    setInput('')
  }

  function handleRecentSelect(r) {
    setRecipe(r)
    setShowDropdown(false)
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
    if (!input.trim() && (recentRecipes.length > 0 || searchResults.length > 0)) setShowDropdown(true)
  }

  // --- Save ---
  async function doSave(r) {
    setSaveState('saving')
    const recipeUrl = r.source_url || `https://seasoned.app/ai/${r.id}`
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
          },
          options: { overwrite: false },
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        // 409 = already exists — treat as saved
        if (res.status === 409) {
          if (body.id) setSavedRecipeId(body.id)
          setSaveState('saved')
          return
        }
        throw new Error(body.error || `Save failed: ${res.status}`)
      }
      const data = await res.json().catch(() => ({}))
      if (data.id) setSavedRecipeId(data.id)
      setSaveState('saved')
    } catch (e) {
      setSaveState('error')
    }
  }

  function handleClose() {
    setRecipe(null)
    setGeneratingName('')
    setErrorMsg('')
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
      <UserMenu user={auth.user} onSignOut={auth.signOut} />
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

        <div className="omnibox">
          <div className={`omnibox-inner ${busy ? 'busy' : ''} ${status === 'error' ? 'has-error' : ''}`}>
            <input
              ref={inputRef}
              className="omnibox-input"
              type="text"
              placeholder="Search recipes, paste a URL, or describe a dish…"
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onFocus={handleInputFocus}
              disabled={inputBusy}
              autoFocus
              autoComplete="off"
              spellCheck="false"
            />

            <div className="omnibox-actions">
              {/* Generate button — always visible when there's text and it's not a URL */}
              {hasText && (
                <button
                  className="action-btn generate-btn"
                  title="Generate AI recipe"
                  onClick={() => doGenerate(input.trim())}
                  disabled={inputBusy}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
                  </svg>
                  <span>Generate</span>
                </button>
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

          {/* Loading label — for search/clip only; generate/elevate use GeneratingCard */}
          {busy && (status === 'searching' || status === 'clipping') && (
            <div className="status-label">
              {status === 'searching' && 'Searching…'}
              {status === 'clipping' && 'Clipping recipe…'}
            </div>
          )}

          {/* Error */}
          {status === 'error' && errorMsg && (
            <div className="error-label">{errorMsg}</div>
          )}

          {/* Search dropdown */}
          {showDropdown && (
            <div className="dropdown" ref={dropdownRef}>
              {status === 'searching' ? (
                [0, 1, 2].map((i) => (
                  <div key={i} className="skeleton-item">
                    <div className="skeleton-line title" />
                    <div className="skeleton-line meta" />
                  </div>
                ))
              ) : input.trim().length >= 2 ? (
                searchResults.length > 0 ? (
                  searchResults.map((r) => (
                    <button key={r.id} className="dropdown-item" onClick={() => handleResultSelect(r)}>
                      <span className="dropdown-name">{r.name}</span>
                      <span className="dropdown-meta">
                        {r.prep_time && <span className="dropdown-pill">Prep: {parseDuration(r.prep_time)}</span>}
                        {r.cook_time && <span className="dropdown-pill">Cook: {parseDuration(r.cook_time)}</span>}
                        {r.recipe_yield && <span className="dropdown-pill">Serves: {r.recipe_yield}</span>}
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="dropdown-empty">No recipes found for "{input}"</div>
                )
              ) : (
                <>
                  {recentRecipes.length > 0 && (
                    <>
                      <div className="dropdown-section-label">
                        <span>Recently Viewed</span>
                        <button className="dropdown-clear-btn" onClick={clearRecentRecipes}>Clear</button>
                      </div>
                      {recentRecipes.map((r) => (
                        <button key={r.id} className="dropdown-item" onClick={() => handleRecentSelect(r)}>
                          <span className="dropdown-name">{r.name}</span>
                          <span className="dropdown-meta">
                            {r.prep_time && <span className="dropdown-pill">Prep: {parseDuration(r.prep_time)}</span>}
                            {r.cook_time && <span className="dropdown-pill">Cook: {parseDuration(r.cook_time)}</span>}
                            {r.recipe_yield && <span className="dropdown-pill">Serves: {r.recipe_yield}</span>}
                          </span>
                        </button>
                      ))}
                    </>
                  )}
                  {searchResults.length > 0 && (
                    <>
                      <div className="dropdown-section-label">
                        <span>Last Search{lastSearchQuery ? `: "${lastSearchQuery}"` : ''}</span>
                      </div>
                      {searchResults.map((r) => (
                        <button key={r.id} className="dropdown-item" onClick={() => handleResultSelect(r)}>
                          <span className="dropdown-name">{r.name}</span>
                          <span className="dropdown-meta">
                            {r.prep_time && <span className="dropdown-pill">Prep: {parseDuration(r.prep_time)}</span>}
                            {r.cook_time && <span className="dropdown-pill">Cook: {parseDuration(r.cook_time)}</span>}
                            {r.recipe_yield && <span className="dropdown-pill">Serves: {r.recipe_yield}</span>}
                          </span>
                        </button>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* GeneratingCard — shown while generate/elevate is in-flight */}
        {(status === 'generating' || status === 'elevating') && generatingName && (
          <GeneratingCard dishName={generatingName} />
        )}

        {/* Recipe card */}
        {recipe && !(status === 'generating') && (
          <RecipeCard
            recipe={recipe}
            onClose={handleClose}
            onElevate={() => doGenerate(recipe.name, { elevate: true, baseRecipe: recipe })}
            isElevating={status === 'elevating'}
            onSave={() => doSave(recipe)}
            saveState={saveState}
            shareUrl={shareUrl}
          />
        )}
      </div>
    </div>
  )
}
