import { useCallback, useEffect, useState } from 'react'

const USER_MANAGEMENT_URL = import.meta.env.VITE_USER_MANAGEMENT_URL

export const EMPTY_CULINARY_PROFILE = {
  diet_tags: [],
  hard_allergens: [],
  soft_avoids: [],
  cuisine_likes: [],
  cuisine_dislikes: [],
  spice_level: 2,
  skill_level: 'intermediate',
  default_servings: 4,
  max_cook_time_min: 60,
  equipment: [],
  nutrition_goals: { focus: null, targets: {} },
  units_pref: 'us',
  exclude_ingredients: [],
  notes_freeform: '',
  consent_flags: { learn_from_activity: false, share_anon_evals: false },
}

function profileUrl() {
  return `${USER_MANAGEMENT_URL}/me/culinary-profile`
}

export function useCulinaryProfile(token, enabled = true) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(Boolean(token && enabled && USER_MANAGEMENT_URL))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    if (!token || !enabled || !USER_MANAGEMENT_URL) {
      setLoading(false)
      setProfile(null)
      return undefined
    }

    setLoading(true)
    setError('')
    fetch(profileUrl(), { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}))
        if (!response.ok || !data.success) throw new Error(data.message || 'Unable to load kitchen profile')
        return data.data
      })
      .then((data) => {
        if (!cancelled) setProfile({ ...EMPTY_CULINARY_PROFILE, ...(data || {}) })
      })
      .catch((reason) => {
        if (!cancelled) setError(reason.message || 'Unable to load kitchen profile')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [token, enabled])

  const saveProfile = useCallback(async (nextProfile) => {
    if (!token || !USER_MANAGEMENT_URL) throw new Error('Kitchen profile is unavailable')
    setSaving(true)
    setError('')
    try {
      const response = await fetch(profileUrl(), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(nextProfile),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) throw new Error(data.message || 'Unable to save kitchen profile')
      const saved = { ...EMPTY_CULINARY_PROFILE, ...(data.data || nextProfile) }
      setProfile(saved)
      return saved
    } catch (reason) {
      const message = reason.message || 'Unable to save kitchen profile'
      setError(message)
      throw reason
    } finally {
      setSaving(false)
    }
  }, [token])

  return { profile, setProfile, loading, saving, error, saveProfile, available: Boolean(USER_MANAGEMENT_URL) }
}
