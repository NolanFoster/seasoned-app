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
    app: import.meta.env.VITE_FLAGGLY_APP_ID || 'default',
    env: import.meta.env.VITE_FLAGGLY_ENV_ID || 'production',
    lazy: true, // prevent SDK's internal fetch which has binding issues in Vite modules
    bootstrap: {
      'voice-control': true,
      'gesture-support': true,
      'dictation': true,
      'elevate-recipe': true,
      'meal-planner': true,
    },
  })
} catch (err) {
  console.error('[flaggly] SDK failed to initialize — all flags will default to true:', err)
  flaggly = { store: { subscribe: () => () => {}, get: () => ({}) } }
}

export { flaggly }

/**
 * Re-evaluate flags with the logged-in user (for JEXL segments, e.g. `user.email`).
 * Uses the SDK so the request matches Flaggly (`id`, `user`, `page.url`). The Pages
 * worker overwrites `Authorization` when proxying to Flaggly.
 */
function formatFlagglyErrorCause(err) {
  const c = err?.cause
  if (c == null) return ''
  if (typeof c === 'string') return c
  try {
    return JSON.stringify(c)
  } catch {
    return String(c)
  }
}

export async function syncFlagglyUser(user) {
  if (typeof flaggly.fetchFlags !== 'function') return
  try {
    if (user?.id != null && String(user.id).length > 0) {
      const traits = {}
      if (user.email) traits.email = user.email
      await flaggly.identify(String(user.id), traits)
    } else {
      flaggly.id = undefined
      flaggly.user = undefined
      await flaggly.fetchFlags()
    }

    const state = flaggly.store.get()
    const keys = state ? Object.keys(state) : []
    if (keys.length === 0) {
      console.warn(
        '[flaggly] Eval succeeded but returned zero flags. In Flaggly admin, create flags with the same ids as in code (voice-control, gesture-support, dictation, elevate-recipe, meal-planner) for app `default` / env `production`, or set VITE_FLAGGLY_APP_ID / VITE_FLAGGLY_ENV_ID if you use other names.'
      )
    } else if (import.meta.env.DEV) {
      console.info(`[flaggly] Eval OK — ${keys.length} flag(s):`, keys.join(', '))
    }
  } catch (err) {
    // bootstrap / previous store values remain on error
    const cause = formatFlagglyErrorCause(err)
    console.warn(
      '[flaggly] Flag sync failed:',
      err?.message || err,
      cause ? `(response: ${cause})` : '',
      '— Pages secret FLAGGLY_API_KEY must be the `user` JWT from Flaggly POST /__generate (not the admin JWT, not JWT_SECRET). Put the secret on this **Pages** project (omni-recipe), and ensure the FLAGGLY service binding targets your Flaggly worker.'
    )
  }
}

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
