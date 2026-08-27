import {
  GUEST_SCOPE,
  StaleWriteError,
  chooseWinner,
  fetchGroceryList,
  fetchMealPlan,
  isGroceryListEmpty,
  isMealPlanEmpty,
  saveGroceryList,
  saveMealPlan,
  storageKey,
} from '../utils/mealPlanSync.js'

const API = 'https://users.example.test'

function jsonResponse(body, status = 200) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) })
}

describe('storage scoping', () => {
  it('keeps the historic keys for a signed-out browser', () => {
    expect(storageKey('plan', null)).toBe('seasoned_meal_plan')
    expect(storageKey('grocery', null)).toBe('mealPlan_groceryList')
    expect(storageKey('groceryMeta', GUEST_SCOPE)).toBe('mealPlan_groceryList_metadata')
  })

  it('gives each account its own cache so a second sign-in never inherits the first', () => {
    expect(storageKey('plan', 'user-a')).toBe('seasoned_meal_plan::user-a')
    expect(storageKey('plan', 'user-b')).not.toBe(storageKey('plan', 'user-a'))
  })

  it('rejects an unknown document name', () => {
    expect(() => storageKey('nope', 'user-a')).toThrow(/Unknown meal plan document/)
  })
})

describe('emptiness checks', () => {
  it('treats a week of empty slots as empty', () => {
    expect(isMealPlanEmpty({ '2026-01-01': { breakfast: [], lunch: [], dinner: [], snack: [] } }, [])).toBe(true)
    expect(isMealPlanEmpty({}, [])).toBe(true)
    expect(isMealPlanEmpty(undefined, undefined)).toBe(true)
  })

  it('counts a staged recipe as content even with nothing scheduled', () => {
    expect(isMealPlanEmpty({}, [{ id: 'r1' }])).toBe(false)
    expect(isMealPlanEmpty({ '2026-01-01': { dinner: [{ id: 'r1' }] } }, [])).toBe(false)
  })

  it('reads a missing grocery list as empty', () => {
    expect(isGroceryListEmpty([])).toBe(true)
    expect(isGroceryListEmpty(null)).toBe(true)
    expect(isGroceryListEmpty([{ name: 'Eggs' }])).toBe(false)
  })
})

describe('chooseWinner', () => {
  it('keeps the local plan when the account has none, so a guest plan survives sign-in', () => {
    expect(chooseWinner({ localUpdatedAt: 5, remoteUpdatedAt: 0, localEmpty: false, remoteEmpty: true })).toBe('local')
  })

  it('adopts the stored plan when this browser has nothing', () => {
    expect(chooseWinner({ localUpdatedAt: 0, remoteUpdatedAt: 5, localEmpty: true, remoteEmpty: false })).toBe('remote')
  })

  it('takes the newer copy when both hold a plan', () => {
    expect(chooseWinner({ localUpdatedAt: 10, remoteUpdatedAt: 5, localEmpty: false, remoteEmpty: false })).toBe('local')
    expect(chooseWinner({ localUpdatedAt: 5, remoteUpdatedAt: 10, localEmpty: false, remoteEmpty: false })).toBe('remote')
  })

  it('prefers the server on an exact tie so every device converges on one copy', () => {
    expect(chooseWinner({ localUpdatedAt: 7, remoteUpdatedAt: 7, localEmpty: false, remoteEmpty: false })).toBe('remote')
    expect(chooseWinner({ localUpdatedAt: 0, remoteUpdatedAt: 0, localEmpty: true, remoteEmpty: true })).toBe('remote')
  })
})

describe('worker requests', () => {
  it('sends the bearer token and normalizes a missing plan to empty', async () => {
    global.fetch.mockImplementation(() => jsonResponse({ success: true, exists: false, data: { mealPlan: null, upNext: null } }))
    const document = await fetchMealPlan(API, 'token-1')
    expect(document).toEqual({ exists: false, mealPlan: {}, upNext: [], clientUpdatedAt: 0 })
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toBe(`${API}/me/meal-plan`)
    expect(options.headers.Authorization).toBe('Bearer token-1')
  })

  it('puts the plan with the timestamp of the edit that produced it', async () => {
    global.fetch.mockImplementation(() => jsonResponse({ success: true, data: { mealPlan: {}, upNext: [], clientUpdatedAt: 42 } }))
    await saveMealPlan(API, 'token-1', { mealPlan: { '2026-01-01': { dinner: [{ id: 'r1' }] } }, upNext: [], clientUpdatedAt: 42 })
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toBe(`${API}/me/meal-plan`)
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toMatchObject({ clientUpdatedAt: 42 })
  })

  it('surfaces a rejected stale write with the newer stored plan attached', async () => {
    global.fetch.mockImplementation(() => jsonResponse({ success: false, stale: true, data: { mealPlan: { '2026-01-02': { dinner: [] } }, upNext: [], clientUpdatedAt: 99 } }, 409))
    await expect(saveMealPlan(API, 'token-1', { mealPlan: {}, upNext: [], clientUpdatedAt: 1 }))
      .rejects.toBeInstanceOf(StaleWriteError)
    try {
      await saveMealPlan(API, 'token-1', { mealPlan: {}, upNext: [], clientUpdatedAt: 1 })
    } catch (error) {
      expect(error.data.clientUpdatedAt).toBe(99)
    }
  })

  it('reports the worker message on a failed read', async () => {
    global.fetch.mockImplementation(() => jsonResponse({ success: false, message: 'Authentication required' }, 401))
    await expect(fetchGroceryList(API, 'token-1')).rejects.toThrow('Authentication required')
  })

  it('refuses to call the worker without a token or a configured url', async () => {
    await expect(fetchMealPlan(API, '')).rejects.toThrow('Meal plan sync is unavailable')
    await expect(saveGroceryList('', 'token-1', { items: [] })).rejects.toThrow('Meal plan sync is unavailable')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('normalizes a grocery list that the worker returns without metadata', async () => {
    global.fetch.mockImplementation(() => jsonResponse({ success: true, exists: true, data: { items: [{ name: 'Eggs' }] } }))
    await expect(fetchGroceryList(API, 'token-1')).resolves.toEqual({
      exists: true,
      items: [{ name: 'Eggs' }],
      lastGeneratedAt: null,
      clientUpdatedAt: 0,
    })
  })
})
