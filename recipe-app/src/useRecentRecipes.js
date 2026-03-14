import { useState } from 'react'

const STORAGE_KEY = 'seasoned_recent_recipes'
const MAX_ENTRIES = 10

export function useRecentRecipes() {
  const [recents, setRecents] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []
    } catch {
      return []
    }
  })

  function add(recipe) {
    setRecents((prev) => {
      const filtered = prev.filter((r) => r.id !== recipe.id)
      const next = [recipe, ...filtered].slice(0, MAX_ENTRIES)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }

  function clear() {
    localStorage.removeItem(STORAGE_KEY)
    setRecents([])
  }

  return [recents, add, clear]
}
