/**
 * Meal-as-Atom Hybrid Plates V1 (#530)
 *
 * Implements MealV1 schema, component orchestration (shared vs divergent diner variants),
 * and grocery line unification for mixed-diet households.
 */

export const MEAL_MODES = {
  SHARED: 'shared',
  INDIVIDUAL: 'individual',
  HYBRID: 'hybrid',
}

export const COMPONENT_ROLES = {
  HERO: 'hero',
  SIDE: 'side',
  SAUCE: 'sauce',
  GARNISH: 'garnish',
  DRINK: 'drink',
}

/**
 * Normalizes a MealV1 object.
 * @param {object} raw
 * @returns {object}
 */
export function normalizeMealAtom(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      id: `meal-${Date.now()}`,
      title: 'Untitled Meal',
      mode: MEAL_MODES.SHARED,
      components: [],
      notes: '',
      groceryPolicy: 'union',
    }
  }

  const rawComponents = Array.isArray(raw.components) ? raw.components : []

  return {
    id: String(raw.id || `meal-${Date.now()}`),
    title: String(raw.title || 'Untitled Meal').trim(),
    mode: Object.values(MEAL_MODES).includes(raw.mode) ? raw.mode : MEAL_MODES.SHARED,
    components: rawComponents.map((c, idx) => ({
      id: c.id || `comp-${idx}`,
      name: String(c.name || `Component ${idx + 1}`),
      role: Object.values(COMPONENT_ROLES).includes(c.role) ? c.role : COMPONENT_ROLES.HERO,
      recipeId: c.recipeId ? String(c.recipeId) : null,
      diners: Array.isArray(c.diners) ? c.diners : 'all',
      servings: typeof c.servings === 'number' ? c.servings : 2,
      ingredients: Array.isArray(c.ingredients) ? c.ingredients : [],
    })),
    notes: String(raw.notes || ''),
    groceryPolicy: raw.groceryPolicy === 'per_diner_bags' ? 'per_diner_bags' : 'union',
  }
}

/**
 * Merges grocery ingredients across meal components avoiding double-counting shared items.
 * @param {object} meal
 * @returns {Array<string>}
 */
export function extractMealGroceryLines(meal) {
  const norm = normalizeMealAtom(meal)
  const set = new Set()

  for (const comp of norm.components) {
    if (Array.isArray(comp.ingredients)) {
      for (const ing of comp.ingredients) {
        const text = typeof ing === 'string' ? ing.trim() : (ing.name || '').trim()
        if (text) set.add(text)
      }
    }
  }

  return Array.from(set)
}
