import { describe, it, expect } from 'vitest'
import {
  normalizeCollection,
  createCollectionFromMealPlan,
  toggleRecipeInCollection,
} from '../recipe-collections.js'

describe('recipe-collections helpers', () => {
  it('normalizes a partial collection object with defaults', () => {
    const norm = normalizeCollection({ title: 'Quick Dinners' })
    expect(norm.title).toBe('Quick Dinners')
    expect(norm.source).toBe('manual')
    expect(norm.visibility).toBe('private')
    expect(norm.recipeIds).toEqual([])
  })

  it('creates a collection extracting distinct recipeIds from a meal plan', () => {
    const plan = {
      days: [
        { meals: [{ recipeId: 'rec-1' }, { recipeId: 'rec-2' }] },
        { meals: [{ recipeId: 'rec-1' }, { recipeId: 'rec-3' }] },
      ],
    }
    const col = createCollectionFromMealPlan(plan, 'My Favorite Week')
    expect(col.title).toBe('My Favorite Week')
    expect(col.source).toBe('from_plan')
    expect(col.recipeIds).toEqual(['rec-1', 'rec-2', 'rec-3'])
  })

  it('toggles recipe ID inclusion in collection', () => {
    const initial = normalizeCollection({ recipeIds: ['rec-1', 'rec-2'] })
    const afterAdd = toggleRecipeInCollection(initial, 'rec-3')
    expect(afterAdd.recipeIds).toEqual(['rec-1', 'rec-2', 'rec-3'])

    const afterRemove = toggleRecipeInCollection(afterAdd, 'rec-1')
    expect(afterRemove.recipeIds).toEqual(['rec-2', 'rec-3'])
  })
})
