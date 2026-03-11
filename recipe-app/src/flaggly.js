import { Flaggly } from '@flaggly/sdk'
import { useSyncExternalStore } from 'react'

const FLAGGLY_PROXY_URL =
  (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8787') +
  '/api/flaggly'

export const flaggly = new Flaggly({
  url: FLAGGLY_PROXY_URL,
  apiKey: '',
  lazy: true,
  bootstrap: {
    'voice-control': false,
    'gesture-support': false,
  },
})

export const useFlag = (key) => {
  const data = useSyncExternalStore(flaggly.store.subscribe, flaggly.store.get)
  return data?.[key]?.result ?? false
}
