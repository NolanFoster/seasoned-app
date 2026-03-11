import { Flaggly } from '@flaggly/sdk'
import { useSyncExternalStore } from 'react'

const FLAGGLY_PROXY_URL =
  (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8787') +
  '/api/flaggly'

const bootstrap = {
  'voice-control': false,
  'gesture-support': false,
}

let flaggly
try {
  flaggly = new Flaggly({
    url: FLAGGLY_PROXY_URL,
    apiKey: '',
    lazy: true,
    bootstrap,
  })
} catch (err) {
  console.error('[flaggly] SDK failed to initialize — all flags will default to false:', err)
  // Minimal no-op store so consumers render safely with defaults
  flaggly = { store: { subscribe: () => () => {}, get: () => ({}) } }
}

export { flaggly }

// Log each flag's resolved value once when the store updates.
// Uses a Set to avoid duplicate logs on every re-render.
const _logged = new Set()
flaggly.store.subscribe(() => {
  const state = flaggly.store.get()
  if (!state) return
  for (const [key, val] of Object.entries(state)) {
    const result = val?.result ?? false
    const cacheKey = `${key}:${result}`
    if (_logged.has(cacheKey)) continue
    _logged.add(cacheKey)
    if (result) {
      console.info(`[flaggly] "${key}" is enabled`)
    } else {
      console.warn(`[flaggly] "${key}" is disabled — feature will not be available`)
    }
  }
})

export const useFlag = (key) => {
  const data = useSyncExternalStore(flaggly.store.subscribe, flaggly.store.get)
  return data?.[key]?.result ?? false
}
