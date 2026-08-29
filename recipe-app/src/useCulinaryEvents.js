import { useCallback, useEffect, useState } from 'react'

const USER_MANAGEMENT_URL = import.meta.env.VITE_USER_MANAGEMENT_URL

export const EMPTY_INFERRED_PREFERENCES = {
  top_cuisines: [],
  top_ingredients: [],
  top_cooking_methods: [],
  avg_prep_time_min: null,
  avg_cook_time_min: null,
  feedback_summary: {
    average_rating: null,
    tags_count: {},
  },
  total_events: 0,
  recent_events_count: 0,
}

export function useCulinaryEvents(token, enabled = true, consentGiven = true) {
  const [inferredPreferences, setInferredPreferences] = useState(EMPTY_INFERRED_PREFERENCES)
  const [loading, setLoading] = useState(false)

  const fetchInferred = useCallback(async () => {
    if (!token || !enabled || !consentGiven || !USER_MANAGEMENT_URL) {
      setInferredPreferences(EMPTY_INFERRED_PREFERENCES)
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`${USER_MANAGEMENT_URL}/me/inferred-preferences`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success && data.data) {
        setInferredPreferences(data.data)
      }
    } catch {
      // Best-effort
    } finally {
      setLoading(false)
    }
  }, [token, enabled, consentGiven])

  useEffect(() => {
    void fetchInferred()
  }, [fetchInferred])

  const recordEvent = useCallback(async (eventType, recipe, features = {}) => {
    if (!token || !enabled || !consentGiven || !USER_MANAGEMENT_URL) return

    const cuisines = []
    if (recipe?.cuisine) cuisines.push(recipe.cuisine)
    if (Array.isArray(recipe?.cuisines)) cuisines.push(...recipe.cuisines)

    const keyIngredients = []
    if (Array.isArray(recipe?.ingredients)) {
      for (const ing of recipe.ingredients.slice(0, 8)) {
        const name = typeof ing === 'string' ? ing : ing.name || ''
        if (name) keyIngredients.push(name)
      }
    }

    const payload = {
      event_type: eventType,
      recipe_id: recipe?.id || null,
      recipe_name: recipe?.name || null,
      features: {
        cuisines: cuisines.filter(Boolean),
        key_ingredients: keyIngredients,
        source: recipe?.source || null,
        ...features,
      },
    }

    try {
      await fetch(`${USER_MANAGEMENT_URL}/me/culinary-events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })
    } catch {
      // Fire-and-forget
    }
  }, [token, enabled, consentGiven])

  const clearEvents = useCallback(async () => {
    if (!token || !USER_MANAGEMENT_URL) return
    try {
      await fetch(`${USER_MANAGEMENT_URL}/me/culinary-events`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      setInferredPreferences(EMPTY_INFERRED_PREFERENCES)
    } catch {
      // Best-effort
    }
  }, [token])

  return {
    inferredPreferences,
    recordEvent,
    clearEvents,
    refreshInferred: fetchInferred,
    loading,
    available: Boolean(USER_MANAGEMENT_URL),
  }
}
