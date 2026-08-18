import { useCallback, useEffect, useMemo, useState } from 'react'

const USER_MANAGEMENT_URL = import.meta.env.VITE_USER_MANAGEMENT_URL
const CACHE_PREFIX = 'seasoned_recipe_notes_'

function cacheKey(userId, recipeId) {
  return `${CACHE_PREFIX}${encodeURIComponent(String(userId || 'guest'))}_${encodeURIComponent(String(recipeId || ''))}`
}

function readCache(userId, recipeId) {
  if (typeof localStorage === 'undefined') return []
  try {
    const value = JSON.parse(localStorage.getItem(cacheKey(userId, recipeId)) || '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

function writeCache(userId, recipeId, notes) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(cacheKey(userId, recipeId), JSON.stringify(notes))
  } catch { /* storage is best effort */ }
}

function normalizeNote(note) {
  return {
    ...note,
    id: note.id ?? `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    recipeId: note.recipeId || note.recipe_id || '',
    recipeTitle: note.recipeTitle || note.recipe_title || null,
    body: typeof note.body === 'string' ? note.body : '',
    createdAt: note.createdAt || note.created_at || new Date().toISOString(),
    updatedAt: note.updatedAt || note.updated_at || note.createdAt || note.created_at || new Date().toISOString(),
  }
}

function errorMessage(error, fallback = 'Notes sync is unavailable') {
  return error instanceof Error ? error.message : fallback
}

/** Newest first, matching the order the worker returns. */
export function sortNotes(notes) {
  return [...notes].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
}

/**
 * Private per-user notes for one recipe. Notes live beside the user's other
 * data in the user-management worker, so writing one never mutates the shared
 * recipe record and never changes what anyone else sees.
 */
export function useRecipeNotes(token, userId, recipeId, enabled = true, apiUrl = USER_MANAGEMENT_URL) {
  const initialNotes = useMemo(() => readCache(userId, recipeId), [userId, recipeId])
  const [notes, setNotes] = useState(initialNotes)
  const [loading, setLoading] = useState(Boolean(token && userId && recipeId && enabled && apiUrl))
  const [syncError, setSyncError] = useState('')

  const persist = useCallback((nextNotes) => {
    setNotes(nextNotes)
    writeCache(userId, recipeId, nextNotes)
  }, [userId, recipeId])

  const request = useCallback(async (path, options = {}) => {
    if (!apiUrl || !token) throw new Error('Notes sync is unavailable')
    const response = await fetch(`${apiUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok || !body.success) throw new Error(body.message || `Notes request failed: ${response.status}`)
    return body
  }, [apiUrl, token])

  const refresh = useCallback(async () => {
    if (!enabled || !token || !userId || !recipeId || !apiUrl) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const body = await request(`/me/recipe-notes?recipeId=${encodeURIComponent(recipeId)}`)
      persist((body.data || []).map(normalizeNote))
      setSyncError('')
    } catch (error) {
      setSyncError(errorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [apiUrl, enabled, persist, recipeId, request, token, userId])

  useEffect(() => {
    setNotes(readCache(userId, recipeId))
    void refresh()
  }, [refresh, userId, recipeId])

  const addNote = useCallback(async (body, recipeTitle) => {
    const text = String(body || '').trim()
    if (!text) throw new Error('A note needs some text')
    const optimistic = normalizeNote({ recipeId, recipeTitle: recipeTitle || null, body: text })
    const previous = notes
    persist([optimistic, ...notes])
    if (!token || !apiUrl) return optimistic
    try {
      const saved = await request('/me/recipe-notes', {
        method: 'POST',
        body: JSON.stringify({ recipeId, recipeTitle: recipeTitle || null, body: text }),
      })
      const note = normalizeNote(saved.data || optimistic)
      persist([note, ...previous])
      setSyncError('')
      return note
    } catch (error) {
      setSyncError(errorMessage(error))
      return optimistic
    }
  }, [apiUrl, notes, persist, recipeId, request, token])

  const updateNote = useCallback(async (id, body) => {
    const text = String(body || '').trim()
    if (!text) throw new Error('A note needs some text')
    const previous = notes
    const nextNote = normalizeNote({ ...notes.find((note) => note.id === id), body: text, id })
    persist(notes.map((note) => note.id === id ? nextNote : note))
    if (!token || !apiUrl || String(id).startsWith('local-')) return nextNote
    try {
      const saved = await request(`/me/recipe-notes/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ body: text }),
      })
      const note = normalizeNote(saved.data || nextNote)
      persist(previous.map((existing) => existing.id === id ? note : existing))
      setSyncError('')
      return note
    } catch (error) {
      persist(previous)
      setSyncError(errorMessage(error))
      throw error
    }
  }, [apiUrl, notes, persist, request, token])

  const removeNote = useCallback(async (id) => {
    const previous = notes
    persist(notes.filter((note) => note.id !== id))
    if (!token || !apiUrl || String(id).startsWith('local-')) return
    try {
      await request(`/me/recipe-notes/${encodeURIComponent(id)}`, { method: 'DELETE' })
      setSyncError('')
    } catch (error) {
      persist(previous)
      setSyncError(errorMessage(error))
      throw error
    }
  }, [apiUrl, notes, persist, request, token])

  return {
    notes: sortNotes(notes),
    loading,
    syncError,
    refresh,
    addNote,
    updateNote,
    removeNote,
    available: Boolean(enabled && recipeId && (apiUrl || !token)),
  }
}
