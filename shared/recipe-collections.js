/**
 * Shared helpers and schemas for Recipe Collections and Personal Cookbooks (#345).
 */

/**
 * Normalizes a recipe collection object.
 * @param {object} raw
 * @returns {object}
 */
export function normalizeCollection(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      id: `col-${Date.now()}`,
      title: 'Untitled Collection',
      description: '',
      coverImage: null,
      recipeIds: [],
      source: 'manual',
      visibility: 'private',
      updatedAt: new Date().toISOString(),
    }
  }

  return {
    id: String(raw.id || `col-${Date.now()}`),
    title: String(raw.title || 'Untitled Collection').trim(),
    description: String(raw.description || '').trim(),
    coverImage: raw.coverImage || null,
    recipeIds: Array.isArray(raw.recipeIds) ? raw.recipeIds.map(String) : [],
    source: ['manual', 'ai_generated', 'from_plan'].includes(raw.source) ? raw.source : 'manual',
    constraintsSnapshot: raw.constraintsSnapshot || null,
    visibility: raw.visibility === 'unlisted_link' ? 'unlisted_link' : 'private',
    updatedAt: raw.updatedAt || new Date().toISOString(),
  }
}

/**
 * Creates a collection from a weekly meal plan structure.
 * @param {object} plan - Weekly plan object { days: [...] }
 * @param {string} [title]
 * @returns {object}
 */
export function createCollectionFromMealPlan(plan, title = 'Weekly Meal Plan Collection') {
  const recipeIds = []
  if (plan && Array.isArray(plan.days)) {
    for (const day of plan.days) {
      if (Array.isArray(day.meals)) {
        for (const meal of day.meals) {
          if (meal && meal.recipeId && !recipeIds.includes(String(meal.recipeId))) {
            recipeIds.push(String(meal.recipeId))
          }
        }
      }
    }
  }

  return normalizeCollection({
    id: `col-plan-${Date.now()}`,
    title,
    description: `Saved from meal plan with ${recipeIds.length} recipe(s).`,
    recipeIds,
    source: 'from_plan',
    visibility: 'private',
  })
}

/**
 * Adds or removes a recipe ID from a collection.
 * @param {object} collection
 * @param {string} recipeId
 * @returns {object}
 */
export function toggleRecipeInCollection(collection, recipeId) {
  const norm = normalizeCollection(collection)
  const idStr = String(recipeId)
  const exists = norm.recipeIds.includes(idStr)
  const nextIds = exists
    ? norm.recipeIds.filter(id => id !== idStr)
    : [...norm.recipeIds, idStr]

  return {
    ...norm,
    recipeIds: nextIds,
    updatedAt: new Date().toISOString(),
  }
}
