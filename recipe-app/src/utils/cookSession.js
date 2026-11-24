/**
 * Persist an in-progress Cooking Navigator session so a reload, tab discard,
 * or lock-screen does not lose the step or a running timer.
 *
 * Timers store an absolute end time. Remaining seconds are recomputed on
 * restore, so a suspended tab does not freeze the countdown.
 */

export const COOK_SESSION_PREFIX = 'cn-cook-session:'

export function cookSessionKey(recipe) {
  const id = recipe?.id || recipe?.name || 'unknown'
  return `${COOK_SESSION_PREFIX}${id}`
}

export function serializeCookSession({
  dishProgress,
  activeDishIndex = 0,
  usedIngredients,
  timers,
  now = Date.now(),
} = {}) {
  return {
    version: 1,
    dishProgress: Array.isArray(dishProgress) ? dishProgress.map((step) => (
      Number.isInteger(step) ? step : -1
    )) : [],
    activeDishIndex: Number.isInteger(activeDishIndex) ? activeDishIndex : 0,
    usedIngredients: [...(usedIngredients || [])],
    timers: Object.entries(timers || {}).map(([id, timer]) => {
      const remaining = Number(timer?.remainingSeconds) || 0
      const running = Boolean(timer) && !timer.isPaused && !timer.isDone && remaining > 0
      return {
        id,
        label: timer?.label || 'Timer',
        totalSeconds: Number(timer?.totalSeconds) || remaining,
        remainingSeconds: remaining,
        isPaused: Boolean(timer?.isPaused),
        isDone: Boolean(timer?.isDone),
        endsAt: running ? now + remaining * 1000 : null,
      }
    }),
    savedAt: now,
  }
}

export function hydrateCookSession(raw, { dishCount = 1, now = Date.now() } = {}) {
  if (!raw || raw.version !== 1 || !Array.isArray(raw.dishProgress)) return null
  if (raw.dishProgress.length !== dishCount) return null

  const timers = {}
  for (const timer of raw.timers || []) {
    if (!timer?.id) continue
    let remaining = Number(timer.remainingSeconds) || 0
    let isDone = Boolean(timer.isDone)
    let isPaused = Boolean(timer.isPaused)
    if (!isPaused && !isDone && timer.endsAt) {
      remaining = Math.max(0, Math.round((Number(timer.endsAt) - now) / 1000))
      if (remaining === 0) isDone = true
    }
    timers[timer.id] = {
      label: timer.label || 'Timer',
      totalSeconds: Number(timer.totalSeconds) || remaining,
      remainingSeconds: remaining,
      isPaused: isPaused && !isDone,
      isDone,
    }
  }

  const activeDishIndex = Number.isInteger(raw.activeDishIndex) ? raw.activeDishIndex : 0
  return {
    dishProgress: raw.dishProgress.map((step) => (Number.isInteger(step) ? step : -1)),
    activeDishIndex: activeDishIndex >= 0 && activeDishIndex < dishCount ? activeDishIndex : 0,
    usedIngredients: Array.isArray(raw.usedIngredients) ? raw.usedIngredients : [],
    timers,
  }
}

export function loadCookSession(storage, recipe, dishCount, now = Date.now()) {
  if (!storage || typeof storage.getItem !== 'function') return null
  try {
    const raw = storage.getItem(cookSessionKey(recipe))
    if (!raw) return null
    return hydrateCookSession(JSON.parse(raw), { dishCount, now })
  } catch {
    return null
  }
}

export function saveCookSession(storage, recipe, session, now = Date.now()) {
  if (!storage || typeof storage.setItem !== 'function') return
  storage.setItem(
    cookSessionKey(recipe),
    JSON.stringify(serializeCookSession({ ...session, now })),
  )
}

export function clearCookSession(storage, recipe) {
  if (!storage || typeof storage.removeItem !== 'function') return
  storage.removeItem(cookSessionKey(recipe))
}
