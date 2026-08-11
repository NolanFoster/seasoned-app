import { describe, expect, it, vi } from 'vitest'
import { enhanceRecommendationsWithRecipes } from '../src/recommendation-service.js'

describe('recommendation allergen filtering', () => {
  it('removes recipes with hard allergens and annotates verified results', async () => {
    const storage = new Map([
      ['recipe-peanut', JSON.stringify({ data: { ingredients: ['1 cup peanuts', 'rice'] } })],
      ['recipe-safe', JSON.stringify({ data: { ingredients: ['rice', 'carrots'] } })],
    ])
    const env = {
      SEARCH_WORKER: {
        fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({
          results: [
            { id: 'recipe-peanut', properties: { title: 'Peanut bowl' } },
            { id: 'recipe-safe', properties: { title: 'Rice bowl' } },
          ],
          strategy: 'test',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
      },
      RECIPE_STORAGE: {
        get: vi.fn((id) => Promise.resolve(storage.get(id))),
      },
    }

    const result = await enhanceRecommendationsWithRecipes(
      { 'Test bowls': ['peanut bowl', 'rice bowl'] },
      2,
      env,
      'allergen-test',
      ['peanuts'],
    )

    expect(result['Test bowls']).toHaveLength(1)
    expect(result['Test bowls'][0]).toMatchObject({
      id: 'recipe-safe',
      name: 'Rice bowl',
      allergenValidation: 'PASSED',
      allergenSummary: { checked: true, blocked: [] },
    })
  })

  it('does not return name-only fallbacks while hard allergens are active', async () => {
    const result = await enhanceRecommendationsWithRecipes(
      { 'Unavailable': ['peanut satay'] },
      1,
      { SEARCH_WORKER: { fetch: vi.fn().mockRejectedValue(new Error('offline')) } },
      'allergen-fallback-test',
      ['peanuts'],
    )

    expect(result).toEqual({ Unavailable: [] })
  })
})
