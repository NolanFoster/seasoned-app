import { Flaggly } from '@flaggly/sdk'
import { useSyncExternalStore } from 'react'

// The SDK calls new URL('/api/eval', url) — so url must be the origin only.
// The Worker intercepts /api/eval/* and proxies to Flaggly with the secret token.
const FLAGGLY_PROXY_URL =
  typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8787'

export const flaggly = new Flaggly({
  url: FLAGGLY_PROXY_URL,
  apiKey: '',
  workerFetch: fetch.bind(globalThis),
  bootstrap: {
    'voice-control': true,
  },
})

export const useFlag = (key) => {
  const store = flaggly.store
  const data = useSyncExternalStore(store.subscribe.bind(store), store.get.bind(store))
  return data?.[key]?.result ?? true
}
