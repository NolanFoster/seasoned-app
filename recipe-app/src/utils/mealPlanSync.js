/**
 * Client half of meal plan / grocery list persistence.
 *
 * The planner used to live only in localStorage, which is per-browser and
 * per-origin: a plan built on a phone was invisible on a laptop, cleared site
 * data wiped it, and signing in as somebody else showed them the previous
 * person's week. These helpers talk to the user-management worker, which keeps
 * one plan and one grocery list per account, and namespace the local copy by
 * user so the cache behaves like a cache rather than the source of truth.
 */

export const GUEST_SCOPE = 'guest'

const BASE_KEYS = {
  plan: 'seasoned_meal_plan',
  grocery: 'mealPlan_groceryList',
  groceryMeta: 'mealPlan_groceryList_metadata',
}

/**
 * Storage key for one document in one scope. The guest scope keeps the historic
 * un-suffixed keys so a plan made before signing in is still there afterwards.
 * @param {'plan'|'grocery'|'groceryMeta'} document
 * @param {string|null} userId
 */
export function storageKey(document, userId) {
  const base = BASE_KEYS[document]
  if (!base) throw new Error(`Unknown meal plan document: ${document}`)
  const scope = userId ? String(userId) : GUEST_SCOPE
  return scope === GUEST_SCOPE ? base : `${base}::${scope}`
}

export function isMealPlanEmpty(mealPlan, upNext) {
  const hasScheduled = Object.values(mealPlan || {}).some((day) =>
    Object.values(day || {}).some((meals) => Array.isArray(meals) && meals.length > 0)
  )
  return !hasScheduled && !(Array.isArray(upNext) && upNext.length > 0)
}

export function isGroceryListEmpty(items) {
  return !(Array.isArray(items) && items.length > 0)
}

/**
 * Picks the copy to keep when the browser and the server disagree.
 *
 * Newer wins, measured by the client timestamp stamped at edit time on
 * whichever device made the change. Content breaks the tie: an empty document
 * never displaces a non-empty one, which is what makes the first sign-in adopt
 * the plan the person just built as a guest instead of blanking it.
 *
 * @returns {'local'|'remote'} which copy should become the live one
 */
export function chooseWinner({ localUpdatedAt = 0, remoteUpdatedAt = 0, localEmpty, remoteEmpty }) {
  if (remoteEmpty && !localEmpty) return 'local'
  if (localEmpty && !remoteEmpty) return 'remote'
  if (localEmpty && remoteEmpty) return 'remote'
  return localUpdatedAt > remoteUpdatedAt ? 'local' : 'remote'
}

/** Thrown for a 409, carrying the newer document the server kept. */
export class StaleWriteError extends Error {
  constructor(data) {
    super('A newer version is already stored')
    this.name = 'StaleWriteError'
    this.data = data
  }
}

async function request(apiUrl, token, path, options = {}) {
  if (!apiUrl || !token) throw new Error('Meal plan sync is unavailable')
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  })
  const body = await response.json().catch(() => ({}))
  if (response.status === 409) throw new StaleWriteError(body.data || null)
  if (!response.ok || !body.success) {
    throw new Error(body.message || `Meal plan sync failed: ${response.status}`)
  }
  return body
}

function normalizeMealPlanDocument(data) {
  return {
    mealPlan: data?.mealPlan && typeof data.mealPlan === 'object' && !Array.isArray(data.mealPlan) ? data.mealPlan : {},
    upNext: Array.isArray(data?.upNext) ? data.upNext : [],
    clientUpdatedAt: Number(data?.clientUpdatedAt || 0),
  }
}

function normalizeGroceryDocument(data) {
  const rawItems = Array.isArray(data?.items) ? data.items : [];
  const normalizedItems = rawItems.map(item => ({
    id: String(item?.id || Math.random().toString(36).substr(2)),
    name: typeof item?.name === 'string' ? item.name : 'Unknown Item',
    category: typeof item?.category === 'string' ? item.category : 'Other',
    completed: Boolean(item?.completed),
    quantity: typeof item?.quantity === 'number' || typeof item?.quantity === 'string' ? item.quantity : null,
    unit: typeof item?.unit === 'string' ? item.unit : null,
  }));

  return {
    items: normalizedItems,
    lastGeneratedAt: data?.lastGeneratedAt == null ? null : Number(data.lastGeneratedAt),
    clientUpdatedAt: Number(data?.clientUpdatedAt || 0),
  }
}

export async function fetchMealPlan(apiUrl, token) {
  const body = await request(apiUrl, token, '/me/meal-plan')
  return { exists: Boolean(body.exists), ...normalizeMealPlanDocument(body.data) }
}

export async function saveMealPlan(apiUrl, token, { mealPlan, upNext, clientUpdatedAt }) {
  const body = await request(apiUrl, token, '/me/meal-plan', {
    method: 'PUT',
    body: JSON.stringify({ mealPlan, upNext, clientUpdatedAt }),
  })
  return normalizeMealPlanDocument(body.data)
}

export async function fetchGroceryList(apiUrl, token) {
  const body = await request(apiUrl, token, '/me/grocery-list')
  return { exists: Boolean(body.exists), ...normalizeGroceryDocument(body.data) }
}

export async function saveGroceryList(apiUrl, token, { items, lastGeneratedAt, clientUpdatedAt }) {
  const body = await request(apiUrl, token, '/me/grocery-list', {
    method: 'PUT',
    body: JSON.stringify({ items, lastGeneratedAt, clientUpdatedAt }),
  })
  return normalizeGroceryDocument(body.data)
}

export function normalizeStaleDocument(kind, data) {
  return kind === 'plan' ? normalizeMealPlanDocument(data) : normalizeGroceryDocument(data)
}
