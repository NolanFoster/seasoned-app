import { describe, expect, it } from 'vitest'
import {
  analyzeRecipeAllergens,
  buildAllergenGraph,
  detectAllergens,
  enforceAllergenSafety,
  isRecipeSafe,
  normalizeAllergenList,
} from '../allergen-graph.js'

describe('allergen graph', () => {
  it('normalizes canonical ids and common profile aliases', () => {
    expect(normalizeAllergenList(['dairy', 'tree nuts', 'peanut', 'gluten', 'sesame']))
      .toEqual(['milk', 'tree_nuts', 'peanuts', 'wheat', 'sesame'])
  })

  it('detects Big 9 allergens from ingredient phrases', () => {
    const matches = detectAllergens([
      '1 cup almond milk',
      '2 tablespoons tahini',
      '1 tablespoon soy sauce',
      '1 cup wheat flour',
      '1 egg',
    ])

    expect(matches.map((match) => match.allergen)).toEqual(expect.arrayContaining([
      'tree_nuts',
      'sesame',
      'soy',
      'wheat',
      'eggs',
    ]))
    expect(matches.find((match) => match.allergen === 'sesame')).toMatchObject({
      matchedTerm: 'tahini',
      confidence: 'high',
    })
  })

  it('does not classify plant milk as dairy milk', () => {
    const matches = detectAllergens(['2 cups coconut milk', '1 cup oat milk'])
    expect(matches.map((match) => match.allergen)).not.toContain('milk')
  })

  it('builds explainable nodes and ingredient edges', () => {
    const graph = buildAllergenGraph({ ingredients: ['1 tablespoon peanut butter'] })
    expect(graph.nodes).toEqual([{ id: 'peanuts', label: 'Peanuts' }])
    expect(graph.edges[0]).toMatchObject({
      from: '1 tablespoon peanut butter',
      to: 'peanuts',
      matchedTerm: 'peanut butter',
    })
  })

  it('reports blocked and uncertain ingredients for hard-allergen profiles', () => {
    const summary = analyzeRecipeAllergens({
      ingredients: ['1 cup vegetable broth', '2 cups rice'],
    }, ['peanuts'])

    expect(summary.checked).toBe(true)
    expect(summary.safe).toBe(false)
    expect(summary.blocked).toEqual([])
    expect(summary.may_contain_uncertain).toEqual(['1 cup vegetable broth'])
  })

  it('surfaces needs_review for opaque terms and missing ingredient data', () => {
    const uncertain = analyzeRecipeAllergens({
      ingredients: ['1 cup seasoning blend'],
    }, ['peanuts'])
    const incomplete = analyzeRecipeAllergens({ name: 'Unverified recipe' }, ['peanuts'])

    expect(uncertain).toMatchObject({
      safe: false,
      needs_review: true,
      review_reasons: ['opaque_or_precautionary_ingredient_terms'],
    })
    expect(incomplete).toMatchObject({
      safe: false,
      needs_review: true,
      review_reasons: ['ingredient_data_unavailable'],
    })
  })

  it('checks structured ingredients and hidden instruction additives', () => {
    const summary = analyzeRecipeAllergens({
      ingredients: [{ name: '2 cups rice' }],
      instructions: [{ text: 'Grease the pan with butter before adding the rice.' }],
    }, ['milk'])

    expect(summary.safe).toBe(false)
    expect(summary.blocked).toEqual(['milk'])
    expect(summary.matches).toEqual(expect.arrayContaining([
      expect.objectContaining({ ingredient: 'Grease the pan with butter before adding the rice.' }),
    ]))
  })

  it('fails closed when hard-allergen checks have no ingredient data', () => {
    const summary = analyzeRecipeAllergens({ name: 'Incomplete recipe' }, ['peanuts'])
    expect(summary.ingredient_data_available).toBe(false)
    expect(summary.safe).toBe(false)
    expect(() => enforceAllergenSafety({ name: 'Incomplete recipe' }, ['peanuts']))
      .toThrow(/allergen safety validation/)
  })

  it('fails closed for a matched hard allergen and passes safe recipes', () => {
    expect(isRecipeSafe({ ingredients: ['2 cups rice', '1 cup carrots'] }, ['peanuts'])).toBe(true)
    expect(isRecipeSafe({ ingredients: ['2 tablespoons peanut butter'] }, ['peanuts'])).toBe(false)

    expect(() => enforceAllergenSafety({ ingredients: ['peanuts'] }, ['peanuts']))
      .toThrow(/allergen safety validation/)

    const safeRecipe = enforceAllergenSafety({ ingredients: ['rice'] }, ['peanuts'])
    expect(safeRecipe).toMatchObject({ allergenValidation: 'PASSED' })
    expect(safeRecipe.allergenSummary).toMatchObject({ checked: true, blocked: [] })
  })

  it('supports nested KV recipe data', () => {
    expect(isRecipeSafe({ data: { ingredients: ['1 cup milk'] } }, ['milk'])).toBe(false)
  })
})
