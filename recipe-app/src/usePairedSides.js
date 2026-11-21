import { useCallback, useEffect, useRef, useState } from 'react'

const RECIPE_GENERATION_URL = import.meta.env.VITE_RECIPE_GENERATION_URL

// Pairings are deterministic enough per dish that one request per session is
// plenty; the worker also caches generated sets in KV.
const pairingsCache = new Map()

function hardAllergensFor(recipe) {
  return recipe?.appliedConstraints?.hardAllergens
    || recipe?.appliedConstraints?.hard_allergens
    || []
}

function cacheKeyFor(recipe) {
  const ingredients = (recipe.ingredients || [])
    .map((ing) => (typeof ing === 'string' ? ing : ing?.name || ing?.text || ''))
  return JSON.stringify([recipe.name, ingredients, [...hardAllergensFor(recipe)].sort()])
}

function canRequestPairings(recipe) {
  return Boolean(
    RECIPE_GENERATION_URL
      // Generation is triggered on scroll; without an observer (very old
      // browsers, SSR, jsdom) the curated pairings are shown instead.
      && typeof IntersectionObserver !== 'undefined'
      && recipe?.name
      && Array.isArray(recipe.ingredients)
      && recipe.ingredients.length > 0
      && recipe.generationMethod !== 'complete-meal-composer'
  )
}

/** Clears the in-memory pairings cache (tests only). */
export function resetPairedSidesCache() {
  pairingsCache.clear()
}

/**
 * Fetches pairings generated for this specific dish once the Complete the Meal
 * section scrolls into view.
 *
 * Returns { sides, method, pending, sectionRef }. While `pending`, generated
 * pairings are still expected. Once settled, `sides` is the generated set, or
 * null when generation is off or failed so callers show the curated pairings.
 * All state is keyed by dish, so a card that switches recipes never shows the
 * previous dish's pairings and re-observes its section for the new one.
 */
export default function usePairedSides(recipe, enabled = true) {
  const active = enabled && canRequestPairings(recipe)
  const key = active ? cacheKeyFor(recipe) : null
  const [inViewKey, setInViewKey] = useState(null)
  const [failedKey, setFailedKey] = useState(null)
  // Bumped when a response lands in the module cache, to re-render from it.
  const [, setResolvedKey] = useState(null)
  const observerRef = useRef(null)

  // Depends on `key` so React re-runs it (and re-observes) when the dish changes,
  // even though the section DOM node itself is reused.
  const sectionRef = useCallback((node) => {
    observerRef.current?.disconnect()
    observerRef.current = null
    if (!node || !key) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setInViewKey(key)
        observer.disconnect()
      }
    }, { rootMargin: '200px' })
    observer.observe(node)
    observerRef.current = observer
  }, [key])

  useEffect(() => () => observerRef.current?.disconnect(), [])

  const inView = key !== null && inViewKey === key
  useEffect(() => {
    if (!inView || pairingsCache.has(key)) return undefined
    const controller = new AbortController()
    fetch(`${RECIPE_GENERATION_URL}/pairings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        heroRecipe: {
          name: recipe.name,
          description: recipe.description,
          cuisine: recipe.cuisine,
          ingredients: recipe.ingredients,
          instructions: recipe.instructions,
        },
        hardAllergens: hardAllergensFor(recipe),
      }),
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (controller.signal.aborted) return
        const sides = Array.isArray(data?.sides) && data.sides.length > 0 ? data.sides : null
        pairingsCache.set(key, sides ? { sides, method: data.method } : { sides: null, method: 'curated' })
        setResolvedKey(key)
      })
      .catch(() => {
        // Network failure: show the curated pairings, retry on the next mount.
        if (!controller.signal.aborted) setFailedKey(key)
      })
    return () => controller.abort()
    // recipe fields are captured by `key`; re-run only when the dish changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, inView])

  const result = key ? pairingsCache.get(key) || null : null
  return {
    sides: result?.sides || null,
    method: result?.method || null,
    pending: active && !result && failedKey !== key,
    sectionRef: active ? sectionRef : undefined,
  }
}
