import { Flaggly } from '@flaggly/sdk'
import { useSyncExternalStore } from 'react'

// The SDK calls new URL('/api/eval', url) — so url must be the origin only.
// The Worker intercepts /api/eval/* and proxies to Flaggly with the secret token.
const FLAGGLY_PROXY_URL =
  typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8787'

let flaggly
try {
  flaggly = new Flaggly({
    url: FLAGGLY_PROXY_URL,
    apiKey: '',
    workerFetch: (url, init) => fetch(url, init),
    bootstrap: {
      'voice-control': true,
      'gesture-support': true,
    },
  })
} catch (err) {
  console.error('[flaggly] SDK failed to initialize — all flags will default to true:', err)
  // Minimal no-op store so consumers render safely with defaults
  flaggly = { store: { subscribe: () => () => {}, get: () => ({}) } }
}

export { flaggly }

// Log each flag's resolved value once when the store updates.
const _logged = new Set()
flaggly.store.subscribe(() => {
  const state = flaggly.store.get()
  if (!state) return
  for (const [key, val] of Object.entries(state)) {
    const result = val?.result ?? true
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
  const store = flaggly.store
  const data = useSyncExternalStore(store.subscribe.bind(store), store.get.bind(store))
  return data?.[key]?.result ?? true
}
