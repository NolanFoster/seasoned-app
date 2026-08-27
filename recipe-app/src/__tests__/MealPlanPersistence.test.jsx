import React from 'react'
import { render, screen, act, waitFor } from '@testing-library/react'
import { MealPlanProvider, useMealPlan } from '../MealPlanContext.jsx'

const API = 'https://users.example.test'
const PUSH_DEBOUNCE_MS = 800

function day(overrides = {}) {
  return { breakfast: [], lunch: [], dinner: [], snack: [], ...overrides }
}

/**
 * Routes the four sync calls. `state` is mutated in place so a PUT is visible
 * to a later GET, the way the worker's row behaves.
 */
function mockWorker(state, { failWith } = {}) {
  global.fetch.mockImplementation((url, options = {}) => {
    if (failWith) return Promise.reject(new Error(failWith))
    const isPlan = String(url).endsWith('/me/meal-plan')
    const key = isPlan ? 'plan' : 'grocery'
    if ((options.method || 'GET') === 'GET') {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, exists: Boolean(state[key]), data: state[key] || (isPlan
          ? { mealPlan: {}, upNext: [], clientUpdatedAt: 0 }
          : { items: [], lastGeneratedAt: null, clientUpdatedAt: 0 }) }),
      })
    }
    state[key] = JSON.parse(options.body)
    state.writes = (state.writes || []).concat({ key, body: state[key] })
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true, data: state[key] }) })
  })
}

let controls

function Harness({ identity }) {
  const plan = useMealPlan()
  controls = plan
  React.useEffect(() => {
    plan.setSyncIdentity(identity)
  }, [identity, plan.setSyncIdentity])

  const scheduled = Object.entries(plan.mealPlan).flatMap(([date, meals]) =>
    Object.entries(meals).flatMap(([mealType, recipes]) => recipes.map((r) => `${date}/${mealType}/${r.name}`))
  )
  return (
    <div>
      <div data-testid="scheduled">{scheduled.join(',')}</div>
      <div data-testid="upnext">{plan.upNext.map((r) => r.name).join(',')}</div>
      <div data-testid="grocery">{plan.groceryList.map((item) => item.name).join(',')}</div>
      <div data-testid="status">{plan.syncStatus}</div>
    </div>
  )
}

function renderPlanner(identity) {
  return render(
    <MealPlanProvider apiUrl={API}>
      <Harness identity={identity} />
    </MealPlanProvider>
  )
}

/** Lets the hydration promises settle without leaning on real timers. */
async function settle() {
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
}

beforeEach(() => {
  localStorage.clear()
  controls = null
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})

describe('meal plan persistence across sessions', () => {
  it('loads the account plan on sign-in, even in a browser that has never seen it', async () => {
    mockWorker({
      plan: { mealPlan: { '2026-03-02': day({ dinner: [{ id: 'r1', name: 'Miso Soup' }] }) }, upNext: [], clientUpdatedAt: 500 },
      grocery: { items: [{ id: 'g1', name: 'Miso paste' }], lastGeneratedAt: 500, clientUpdatedAt: 500 },
    })

    renderPlanner({ token: 'token-a', userId: 'user-a' })
    await settle()

    await waitFor(() => expect(screen.getByTestId('scheduled')).toHaveTextContent('2026-03-02/dinner/Miso Soup'))
    expect(screen.getByTestId('grocery')).toHaveTextContent('Miso paste')
    expect(screen.getByTestId('status')).toHaveTextContent('synced')
  })

  it('carries a plan built before signing in into the account instead of dropping it', async () => {
    localStorage.setItem('seasoned_meal_plan', JSON.stringify({
      mealPlan: { '2026-03-03': day({ lunch: [{ id: 'r9', name: 'Guest Salad' }] }) },
      upNext: [],
      updatedAt: 900,
    }))
    const state = {}
    mockWorker(state)

    renderPlanner({ token: 'token-a', userId: 'user-a' })
    await settle()

    await waitFor(() => expect(state.plan).toBeTruthy())
    expect(state.plan.mealPlan['2026-03-03'].lunch[0].name).toBe('Guest Salad')
    expect(screen.getByTestId('scheduled')).toHaveTextContent('Guest Salad')
  })

  it('saves an edit made while signed in so the next session starts from it', async () => {
    const state = {}
    mockWorker(state)
    renderPlanner({ token: 'token-a', userId: 'user-a' })
    await settle()

    await act(async () => {
      controls.addMeal('2026-03-04', 'dinner', { id: 'r2', name: 'Ramen' })
    })
    await act(async () => { jest.advanceTimersByTime(PUSH_DEBOUNCE_MS) })
    await settle()

    await waitFor(() => expect(state.plan?.mealPlan?.['2026-03-04']?.dinner?.[0]?.name).toBe('Ramen'))
    expect(state.plan.clientUpdatedAt).toBeGreaterThan(0)
  })

  it('saves grocery list edits too, so a checked-off list is not lost with the tab', async () => {
    const state = {}
    mockWorker(state)
    renderPlanner({ token: 'token-a', userId: 'user-a' })
    await settle()

    await act(async () => {
      controls.setGroceryList([{ id: 'g1', name: 'Scallions', completed: false }])
    })
    await act(async () => { jest.advanceTimersByTime(PUSH_DEBOUNCE_MS) })
    await settle()

    await waitFor(() => expect(state.grocery?.items?.[0]?.name).toBe('Scallions'))
  })

  it('coalesces a burst of edits into a single save', async () => {
    const state = {}
    mockWorker(state)
    renderPlanner({ token: 'token-a', userId: 'user-a' })
    await settle()
    const before = global.fetch.mock.calls.filter(([, options]) => options?.method === 'PUT').length

    await act(async () => {
      controls.addUpNext({ id: 'r3', name: 'Pho' })
      controls.addUpNext({ id: 'r4', name: 'Congee' })
      controls.addUpNext({ id: 'r5', name: 'Bibimbap' })
    })
    await act(async () => { jest.advanceTimersByTime(PUSH_DEBOUNCE_MS) })
    await settle()

    const planWrites = global.fetch.mock.calls.filter(([url, options]) =>
      options?.method === 'PUT' && String(url).endsWith('/me/meal-plan')).length
    expect(planWrites - before).toBe(1)
    expect(state.plan.upNext.map((r) => r.name)).toEqual(['Pho', 'Congee', 'Bibimbap'])
  })

  it('never shows one account the plan of the account that used the browser before it', async () => {
    mockWorker({
      plan: { mealPlan: { '2026-03-05': day({ dinner: [{ id: 'r6', name: 'A Dinner' }] }) }, upNext: [], clientUpdatedAt: 100 },
    })
    const view = renderPlanner({ token: 'token-a', userId: 'user-a' })
    await settle()
    await waitFor(() => expect(screen.getByTestId('scheduled')).toHaveTextContent('A Dinner'))

    mockWorker({
      plan: { mealPlan: { '2026-03-06': day({ dinner: [{ id: 'r7', name: 'B Dinner' }] }) }, upNext: [], clientUpdatedAt: 100 },
    })
    view.rerender(
      <MealPlanProvider apiUrl={API}>
        <Harness identity={{ token: 'token-b', userId: 'user-b' }} />
      </MealPlanProvider>
    )
    await settle()

    await waitFor(() => expect(screen.getByTestId('scheduled')).toHaveTextContent('B Dinner'))
    expect(screen.getByTestId('scheduled')).not.toHaveTextContent('A Dinner')
  })

  it('leaves the planner usable on the local copy when the worker is unreachable', async () => {
    localStorage.setItem('seasoned_meal_plan::user-a', JSON.stringify({
      mealPlan: { '2026-03-07': day({ dinner: [{ id: 'r8', name: 'Offline Stew' }] }) },
      upNext: [],
      updatedAt: 10,
    }))
    mockWorker({}, { failWith: 'network down' })

    renderPlanner({ token: 'token-a', userId: 'user-a' })
    await settle()

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error'))
    expect(screen.getByTestId('scheduled')).toHaveTextContent('Offline Stew')
  })

  it('stays local and never calls the worker while signed out', async () => {
    mockWorker({})
    renderPlanner(null)
    await settle()

    await act(async () => {
      controls.addMeal('2026-03-08', 'dinner', { id: 'r10', name: 'Guest Dinner' })
    })
    await act(async () => { jest.advanceTimersByTime(PUSH_DEBOUNCE_MS) })
    await settle()

    expect(global.fetch).not.toHaveBeenCalled()
    expect(screen.getByTestId('status')).toHaveTextContent('idle')
    const stored = JSON.parse(localStorage.getItem('seasoned_meal_plan'))
    expect(stored.mealPlan['2026-03-08'].dinner[0].name).toBe('Guest Dinner')
  })

  it('adopts the newer plan the worker kept when a stale tab tries to save over it', async () => {
    const state = {}
    mockWorker(state)
    renderPlanner({ token: 'token-a', userId: 'user-a' })
    await settle()

    global.fetch.mockImplementation((url, options = {}) => {
      if ((options.method || 'GET') !== 'PUT') {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true, exists: false, data: { mealPlan: {}, upNext: [], clientUpdatedAt: 0 } }) })
      }
      return Promise.resolve({
        ok: false,
        status: 409,
        json: () => Promise.resolve({
          success: false,
          stale: true,
          data: { mealPlan: { '2026-03-09': day({ dinner: [{ id: 'r11', name: 'Phone Dinner' }] }) }, upNext: [], clientUpdatedAt: 9_999_999_999_999 },
        }),
      })
    })

    await act(async () => {
      controls.addMeal('2026-03-10', 'dinner', { id: 'r12', name: 'Stale Dinner' })
    })
    await act(async () => { jest.advanceTimersByTime(PUSH_DEBOUNCE_MS) })
    await settle()

    await waitFor(() => expect(screen.getByTestId('scheduled')).toHaveTextContent('Phone Dinner'))
    expect(screen.getByTestId('scheduled')).not.toHaveTextContent('Stale Dinner')
  })
  it('sends a pending save when the tab goes away instead of dropping it', async () => {
    const state = {}
    mockWorker(state)
    renderPlanner({ token: 'token-a', userId: 'user-a' })
    await settle()

    await act(async () => {
      controls.addMeal('2026-03-11', 'lunch', { id: 'r13', name: 'Closing Lunch' })
    })
    // No timer advance: the debounce is still pending when the tab is hidden.
    await act(async () => { window.dispatchEvent(new Event('pagehide')) })
    await settle()

    await waitFor(() => expect(state.plan?.mealPlan?.['2026-03-11']?.lunch?.[0]?.name).toBe('Closing Lunch'))
  })

  it('reports a rejected save without losing the edit locally', async () => {
    const state = {}
    mockWorker(state)
    renderPlanner({ token: 'token-a', userId: 'user-a' })
    await settle()

    global.fetch.mockImplementation((url, options = {}) => (options.method === 'PUT'
      ? Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ success: false, message: 'Internal server error' }) })
      : Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true, exists: false, data: { mealPlan: {}, upNext: [] } }) })))

    await act(async () => {
      controls.addMeal('2026-03-12', 'dinner', { id: 'r14', name: 'Unsaved Dinner' })
    })
    await act(async () => { jest.advanceTimersByTime(PUSH_DEBOUNCE_MS) })
    await settle()

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error'))
    expect(screen.getByTestId('scheduled')).toHaveTextContent('Unsaved Dinner')
    const stored = JSON.parse(localStorage.getItem('seasoned_meal_plan::user-a'))
    expect(stored.mealPlan['2026-03-12'].dinner[0].name).toBe('Unsaved Dinner')
  })

  it('carries a grocery list built before signing in into the account', async () => {
    localStorage.setItem('mealPlan_groceryList', JSON.stringify({ items: [{ id: 'g2', name: 'Guest Eggs' }], updatedAt: 800 }))
    localStorage.setItem('mealPlan_groceryList_metadata', JSON.stringify({ lastGeneratedAt: 800, version: '1.0' }))
    const state = {}
    mockWorker(state)

    renderPlanner({ token: 'token-a', userId: 'user-a' })
    await settle()

    await waitFor(() => expect(state.grocery?.items?.[0]?.name).toBe('Guest Eggs'))
    expect(state.grocery.lastGeneratedAt).toBe(800)
    expect(screen.getByTestId('grocery')).toHaveTextContent('Guest Eggs')
  })

  it('starts from an empty plan when the cached copy is unreadable', async () => {
    localStorage.setItem('seasoned_meal_plan::user-a', '{not json')
    localStorage.setItem('mealPlan_groceryList::user-a', 'also not json')
    localStorage.setItem('mealPlan_groceryList_metadata::user-a', '{{')
    mockWorker({})

    renderPlanner({ token: 'token-a', userId: 'user-a' })
    await settle()

    expect(screen.getByTestId('scheduled')).toHaveTextContent('')
    expect(screen.getByTestId('grocery')).toHaveTextContent('')
  })

  it('ignores a cached grocery list stored in an unexpected shape', async () => {
    localStorage.setItem('mealPlan_groceryList::user-a', JSON.stringify({ items: 'eggs' }))
    mockWorker({})

    renderPlanner({ token: 'token-a', userId: 'user-a' })
    await settle()

    expect(screen.getByTestId('grocery')).toHaveTextContent('')
  })

  it('migrates a plan saved in the pre-mealType format', async () => {
    localStorage.setItem('seasoned_meal_plan', JSON.stringify({
      '2026-03-13': [{ id: 'r15', name: 'Legacy Dinner' }],
    }))
    mockWorker({})

    renderPlanner(null)
    await settle()

    expect(screen.getByTestId('scheduled')).toHaveTextContent('Legacy Dinner')
  })
})
