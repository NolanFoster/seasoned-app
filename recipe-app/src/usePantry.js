import { useCallback, useEffect, useMemo, useState } from 'react'

const USER_MANAGEMENT_URL = import.meta.env.VITE_USER_MANAGEMENT_URL
const CACHE_PREFIX = 'seasoned_pantry_'

export const PANTRY_LOCATIONS = ['fridge', 'freezer', 'pantry', 'other']

function cacheKey(userId) {
  return `${CACHE_PREFIX}${encodeURIComponent(String(userId || 'guest'))}`
}

function readCache(userId) {
  if (typeof localStorage === 'undefined') return []
  try {
    const value = JSON.parse(localStorage.getItem(cacheKey(userId)) || '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

function writeCache(userId, items) {
  if (typeof localStorage === 'undefined') return
  try { localStorage.setItem(cacheKey(userId), JSON.stringify(items)) } catch { /* storage is best effort */ }
}

function itemPayload(item) {
  return {
    name: item.name,
    quantity: item.quantity === '' ? null : item.quantity ?? null,
    unit: item.unit || null,
    location: item.location || 'pantry',
    expiresOn: item.expiresOn || item.expires_on || null,
    tags: Array.isArray(item.tags) ? item.tags : [],
  }
}

function normalizeItem(item) {
  return {
    ...item,
    id: item.id ?? `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    quantity: item.quantity === '' || item.quantity === undefined ? null : item.quantity,
    unit: item.unit || null,
    location: PANTRY_LOCATIONS.includes(item.location) ? item.location : 'pantry',
    expiresOn: item.expiresOn || item.expires_on || null,
    tags: Array.isArray(item.tags) ? item.tags : [],
  }
}

function errorMessage(error, fallback = 'Pantry sync is unavailable') {
  return error instanceof Error ? error.message : fallback
}

export function sortPantryItems(items) {
  return [...items].sort((a, b) => {
    if (!a.expiresOn && !a.expires_on) return !b.expiresOn && !b.expires_on ? 0 : 1
    if (!b.expiresOn && !b.expires_on) return -1
    return String(a.expiresOn || a.expires_on).localeCompare(String(b.expiresOn || b.expires_on))
  })
}

export function usePantry(token, userId, enabled = true, apiUrl = USER_MANAGEMENT_URL) {
  const initialItems = useMemo(() => readCache(userId), [userId])
  const [items, setItems] = useState(initialItems)
  const [loading, setLoading] = useState(Boolean(token && userId && enabled && apiUrl))
  const [syncError, setSyncError] = useState('')

  const persist = useCallback((nextItems) => {
    setItems(nextItems)
    writeCache(userId, nextItems)
  }, [userId])

  const request = useCallback(async (path, options = {}) => {
    if (!apiUrl || !token) throw new Error('Pantry sync is unavailable')
    const response = await fetch(`${apiUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok || !body.success) throw new Error(body.message || `Pantry request failed: ${response.status}`)
    return body
  }, [apiUrl, token])

  const refresh = useCallback(async () => {
    if (!enabled || !token || !userId || !apiUrl) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const body = await request('/me/pantry-items')
      persist((body.data || []).map(normalizeItem))
      setSyncError('')
    } catch (error) {
      setSyncError(errorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [apiUrl, enabled, persist, request, token, userId])

  useEffect(() => {
    setItems(readCache(userId))
    void refresh()
  }, [refresh, userId])

  const addItem = useCallback(async (input) => {
    const optimistic = normalizeItem(itemPayload(input))
    const previous = items
    persist([optimistic, ...items])
    if (!token || !apiUrl) return optimistic
    try {
      const body = await request('/me/pantry-items', { method: 'POST', body: JSON.stringify(itemPayload(input)) })
      const saved = normalizeItem(body.data || optimistic)
      persist([saved, ...previous])
      setSyncError('')
      return saved
    } catch (error) {
      setSyncError(errorMessage(error))
      return optimistic
    }
  }, [apiUrl, items, persist, request, token])

  const updateItem = useCallback(async (id, input) => {
    const previous = items
    const nextItem = normalizeItem({ ...items.find((item) => item.id === id), ...input, id })
    const nextItems = items.map((item) => item.id === id ? nextItem : item)
    persist(nextItems)
    if (!token || !apiUrl || String(id).startsWith('local-')) return nextItem
    try {
      const body = await request(`/me/pantry-items/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(itemPayload(input)),
      })
      const saved = normalizeItem(body.data || nextItem)
      persist(items.map((item) => item.id === id ? saved : item))
      setSyncError('')
      return saved
    } catch (error) {
      persist(previous)
      setSyncError(errorMessage(error))
      throw error
    }
  }, [apiUrl, items, persist, request, token])

  const removeItem = useCallback(async (id) => {
    const previous = items
    persist(items.filter((item) => item.id !== id))
    if (!token || !apiUrl || String(id).startsWith('local-')) return
    try {
      await request(`/me/pantry-items/${encodeURIComponent(id)}`, { method: 'DELETE' })
      setSyncError('')
    } catch (error) {
      persist(previous)
      setSyncError(errorMessage(error))
      throw error
    }
  }, [apiUrl, items, persist, request, token])

  return {
    items: sortPantryItems(items),
    loading,
    syncError,
    refresh,
    addItem,
    updateItem,
    removeItem,
    available: Boolean(enabled && (apiUrl || !token)),
  }
}
