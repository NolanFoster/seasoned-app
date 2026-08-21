import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

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

function itemPayload(item, { partial = false } = {}) {
  const payload = {}
  const has = (key) => Object.prototype.hasOwnProperty.call(item || {}, key)
  const hasExpiry = has('expiresOn') || has('expires_on')

  if (!partial || has('name')) payload.name = item?.name
  if (!partial || has('quantity')) payload.quantity = item?.quantity === '' ? null : item?.quantity ?? null
  if (!partial || has('unit')) payload.unit = item?.unit || null
  if (!partial || has('location')) payload.location = item?.location || 'pantry'
  if (!partial || hasExpiry) payload.expiresOn = item?.expiresOn || item?.expires_on || null
  if (!partial || has('tags')) payload.tags = Array.isArray(item?.tags) ? item.tags : []
  return payload
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
  const itemsRef = useRef(initialItems)
  const [loading, setLoading] = useState(Boolean(token && userId && enabled && apiUrl))
  const [syncError, setSyncError] = useState('')

  const persist = useCallback((nextItems) => {
    itemsRef.current = nextItems
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
    const cached = readCache(userId)
    itemsRef.current = cached
    setItems(cached)
    void refresh()
  }, [refresh, userId])

  const addItem = useCallback(async (input) => {
    const optimistic = normalizeItem(itemPayload(input))
    persist([optimistic, ...itemsRef.current])
    if (!token || !apiUrl) return optimistic
    try {
      const body = await request('/me/pantry-items', { method: 'POST', body: JSON.stringify(itemPayload(input)) })
      const saved = normalizeItem(body.data || optimistic)
      persist([saved, ...itemsRef.current.filter((item) => item.id !== optimistic.id)])
      setSyncError('')
      return saved
    } catch (error) {
      setSyncError(errorMessage(error))
      return optimistic
    }
  }, [apiUrl, persist, request, token])

  const updateItem = useCallback(async (id, input) => {
    const previousItem = itemsRef.current.find((item) => item.id === id)
    const nextItem = normalizeItem({ ...previousItem, ...input, id })
    persist(itemsRef.current.map((item) => item.id === id ? nextItem : item))
    if (!token || !apiUrl || String(id).startsWith('local-')) return nextItem
    try {
      const body = await request(`/me/pantry-items/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(itemPayload(input, { partial: true })),
      })
      const saved = normalizeItem(body.data || nextItem)
      persist(itemsRef.current.map((item) => item.id === id ? saved : item))
      setSyncError('')
      return saved
    } catch (error) {
      if (previousItem) persist(itemsRef.current.map((item) => item.id === id ? previousItem : item))
      setSyncError(errorMessage(error))
      throw error
    }
  }, [apiUrl, persist, request, token])

  const removeItem = useCallback(async (id) => {
    const previousItem = itemsRef.current.find((item) => item.id === id)
    persist(itemsRef.current.filter((item) => item.id !== id))
    if (!token || !apiUrl || String(id).startsWith('local-')) return
    try {
      await request(`/me/pantry-items/${encodeURIComponent(id)}`, { method: 'DELETE' })
      setSyncError('')
    } catch (error) {
      if (previousItem && !itemsRef.current.some((item) => item.id === id)) persist([...itemsRef.current, previousItem])
      setSyncError(errorMessage(error))
      throw error
    }
  }, [apiUrl, persist, request, token])

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
