import {
  cookSessionKey,
  serializeCookSession,
  hydrateCookSession,
  loadCookSession,
  saveCookSession,
  clearCookSession,
} from '../cookSession'

function memoryStorage(initial = {}) {
  const data = { ...initial }
  return {
    data,
    getItem: (key) => (Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value) },
    removeItem: (key) => { delete data[key] },
  }
}

describe('cookSession', () => {
  const recipe = { id: 'turkey-1', name: 'Roast turkey' }
  const now = Date.parse('2026-11-26T16:00:00Z')

  test('keys a session by recipe id, then name', () => {
    expect(cookSessionKey(recipe)).toBe('cn-cook-session:turkey-1')
    expect(cookSessionKey({ name: 'Gravy' })).toBe('cn-cook-session:Gravy')
    expect(cookSessionKey(null)).toBe('cn-cook-session:unknown')
  })

  test('stores a running timer as an absolute end time', () => {
    const saved = serializeCookSession({
      dishProgress: [2],
      activeDishIndex: 0,
      usedIngredients: new Set([0, 2]),
      timers: {
        'timer-2-0': { label: '3 hours', totalSeconds: 10800, remainingSeconds: 600, isPaused: false, isDone: false },
      },
      now,
    })

    expect(saved.timers[0].endsAt).toBe(now + 600 * 1000)
    expect(saved.usedIngredients).toEqual([0, 2])
  })

  test('keeps a paused timer on remaining seconds instead of an end time', () => {
    const saved = serializeCookSession({
      dishProgress: [0],
      timers: {
        paused: { label: '10 minutes', totalSeconds: 600, remainingSeconds: 90, isPaused: true, isDone: false },
      },
      now,
    })
    expect(saved.timers[0].endsAt).toBeNull()
    expect(saved.timers[0].remainingSeconds).toBe(90)
  })

  test('recomputes remaining time after the tab was suspended', () => {
    const saved = serializeCookSession({
      dishProgress: [1, -1],
      activeDishIndex: 0,
      usedIngredients: [1],
      timers: {
        roast: { label: '45 minutes', totalSeconds: 2700, remainingSeconds: 120, isPaused: false, isDone: false },
      },
      now,
    })

    const restored = hydrateCookSession(saved, { dishCount: 2, now: now + 30 * 1000 })
    expect(restored.dishProgress).toEqual([1, -1])
    expect(restored.usedIngredients).toEqual([1])
    expect(restored.timers.roast.remainingSeconds).toBe(90)
    expect(restored.timers.roast.isDone).toBe(false)
  })

  test('marks a timer done when its end time has passed', () => {
    const saved = serializeCookSession({
      dishProgress: [0],
      timers: {
        pie: { label: '12 minutes', totalSeconds: 720, remainingSeconds: 5, isPaused: false, isDone: false },
      },
      now,
    })
    const restored = hydrateCookSession(saved, { dishCount: 1, now: now + 10 * 1000 })
    expect(restored.timers.pie.remainingSeconds).toBe(0)
    expect(restored.timers.pie.isDone).toBe(true)
    expect(restored.timers.pie.isPaused).toBe(false)
  })

  test('rejects a session saved for a different dish count', () => {
    const saved = serializeCookSession({ dishProgress: [0, 1], now })
    expect(hydrateCookSession(saved, { dishCount: 1, now })).toBeNull()
    expect(hydrateCookSession(null, { dishCount: 1 })).toBeNull()
    expect(hydrateCookSession({ version: 2, dishProgress: [0] }, { dishCount: 1 })).toBeNull()
  })

  test('round-trips through storage and clears on a graceful exit', () => {
    const storage = memoryStorage()
    saveCookSession(storage, recipe, {
      dishProgress: [0],
      usedIngredients: [0],
      timers: {},
    }, now)

    expect(loadCookSession(storage, recipe, 1, now).dishProgress).toEqual([0])
    clearCookSession(storage, recipe)
    expect(loadCookSession(storage, recipe, 1, now)).toBeNull()
  })

  test('ignores corrupt storage and missing storage', () => {
    const storage = memoryStorage({ [cookSessionKey(recipe)]: '{not json' })
    expect(loadCookSession(storage, recipe, 1)).toBeNull()
    expect(loadCookSession(null, recipe, 1)).toBeNull()
    expect(() => saveCookSession(null, recipe, {})).not.toThrow()
    expect(() => clearCookSession(undefined, recipe)).not.toThrow()
  })
})
