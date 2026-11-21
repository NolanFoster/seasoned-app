import { describe, expect, it } from 'vitest'
import {
  buildRecipeUncertainty,
  buildUncertaintySummary,
  withRecipeUncertainty,
  compareUncertaintyLevels,
  isNutritionAbstained,
  isSafetyUncertain,
  isUncertainLevel,
  isUncertaintyGuardsEnabled,
  normalizeUncertaintyDimension,
  UNCERTAINTY_DIMENSIONS,
  UNCERTAINTY_GUARDS_FLAG,
  worstUncertaintyLevel,
} from '../uncertainty.js'
import { UNCERTAINTY_GOLD_FIXTURES } from './fixtures/uncertainty-fixtures.js'

describe('uncertainty contract', () => {
  it('normalizes levels, confidence, reasons, and evidence references', () => {
    expect(normalizeUncertaintyDimension('nutrition', {
      confidence: 0.2,
      reasons: ['opaque package', 'opaque package', null],
      evidenceRefs: ['product:123'],
    })).toEqual({
      dimension: 'nutrition',
      level: 'low',
      confidence: 0.2,
      reasons: ['opaque package'],
      evidence_refs: ['product:123'],
    })
    expect(normalizeUncertaintyDimension('general', 'abstain')).toMatchObject({
      level: 'abstain',
      confidence: 0,
    })
  })

  it('builds a stable summary with every dimension and an overall worst level', () => {
    const summary = buildUncertaintySummary({
      timing: { level: 'medium', reasons: ['timing_fields_incomplete'] },
      product_identity: { level: 'abstain', confidence: 0, reasons: ['identity_miss'] },
    }, { generatedAt: '2026-08-23T00:00:00.000Z' })

    expect(summary).toMatchObject({
      schemaVersion: '1.0',
      checked: true,
      generatedAt: '2026-08-23T00:00:00.000Z',
      level: 'abstain',
      confidence: 0,
      abstained: true,
      needs_review: true,
      reasons: ['timing_fields_incomplete', 'identity_miss'],
      overall: { level: 'abstain', confidence: 0 },
    })
    expect(Object.keys(summary.dimensions)).toEqual(UNCERTAINTY_DIMENSIONS)
  })

  it('attaches summaries without mutating the original recipe', () => {
    const recipe = { ingredients: ['rice'], instructions: ['Cook rice.'] }
    const annotated = withRecipeUncertainty(recipe)
    expect(annotated).toMatchObject({ uncertaintySummary: { checked: true } })
    expect(recipe).not.toHaveProperty('uncertaintySummary')
  })

  it('orders confidence levels from high to abstain', () => {
    expect(compareUncertaintyLevels('abstain', 'low')).toBeGreaterThan(0)
    expect(compareUncertaintyLevels('high', 'medium')).toBeLessThan(0)
    expect(worstUncertaintyLevel(['high', 'medium', 'low'])).toBe('low')
    expect(isUncertainLevel('high')).toBe(false)
    expect(isUncertainLevel('abstain')).toBe(true)
  })

  it('keeps the rollout flag off unless explicitly enabled', () => {
    expect(UNCERTAINTY_GUARDS_FLAG).toBe('uncertainty_guards_v1')
    expect(isUncertaintyGuardsEnabled({})).toBe(false)
    expect(isUncertaintyGuardsEnabled({ UNCERTAINTY_GUARDS_V1: 'false' })).toBe(false)
    expect(isUncertaintyGuardsEnabled({ FEATURE_UNCERTAINTY_GUARDS_V1: 'on' })).toBe(true)
    expect(isUncertaintyGuardsEnabled({ uncertainty_guards_v1: 1 })).toBe(true)
  })
})

describe('buildRecipeUncertainty', () => {
  const completeRecipe = {
    source: 'ai_generated',
    ingredients: ['1 cup rice', '1 carrot'],
    instructions: ['Cook the rice and carrot until tender.'],
    prepTime: '10 minutes',
    cookTime: '20 minutes',
    totalTime: '30 minutes',
    allergenSummary: {
      checked: true,
      safe: true,
      ingredient_data_available: true,
      needs_review: false,
      blocked: [],
      may_contain_uncertain: [],
      unknown_hard_allergens: [],
    },
    processSafetySummary: {
      checked: true,
      safe: true,
      needs_review: false,
      warnings: [],
      blocked: [],
      requires_template: [],
      cook_gate: 'allow',
    },
    qualityBar: { status: 'passed' },
  }

  it('abstains on unavailable nutrition instead of inventing a macro clearance', () => {
    const summary = buildRecipeUncertainty(completeRecipe)
    expect(summary.dimensions.nutrition).toMatchObject({
      level: 'abstain',
      reasons: ['nutrition_not_calculated'],
    })
    expect(isNutritionAbstained(summary)).toBe(true)
    expect(summary.dimensions.allergen_coverage.level).toBe('high')
  })

  it('abstains for uncertain allergen evidence when a hard allergen is configured', () => {
    const summary = buildRecipeUncertainty({
      ...completeRecipe,
      ingredients: ['1 cup seasoning blend'],
      allergenSummary: {
        ...completeRecipe.allergenSummary,
        needs_review: true,
        may_contain_uncertain: ['1 cup seasoning blend'],
      },
    }, { hardAllergens: ['peanuts'] })

    expect(summary.dimensions.allergen_coverage).toMatchObject({
      level: 'abstain',
      reasons: ['opaque_or_precautionary_ingredient_terms'],
    })
    expect(isSafetyUncertain(summary)).toBe(true)
  })

  it('uses a medium review level for uncertain ingredients without a hard-allergen profile', () => {
    const summary = buildRecipeUncertainty({
      ...completeRecipe,
      ingredients: ['1 cup natural flavors'],
      allergenSummary: {
        ...completeRecipe.allergenSummary,
        needs_review: true,
        may_contain_uncertain: ['1 cup natural flavors'],
      },
    })
    expect(summary.dimensions.allergen_coverage.level).toBe('medium')
    expect(summary.dimensions.product_identity.level).toBe('low')
  })

  it('distinguishes labeled nutrition from estimated nutrition', () => {
    const labeled = buildRecipeUncertainty({ ...completeRecipe, nutrition: { source: 'labeled', calories: 400 } })
    expect(labeled.dimensions.nutrition).toMatchObject({ level: 'high', evidence_refs: ['package_label'] })

    const estimated = buildRecipeUncertainty({ ...completeRecipe, nutrition: { coveragePercent: 70, calories: 400 } })
    expect(estimated.dimensions.nutrition).toMatchObject({ level: 'medium', reasons: ['nutrition_is_estimated'] })
  })

  it('abstains process safety and lowers timing confidence when evidence is incomplete', () => {
    const summary = buildRecipeUncertainty({
      ...completeRecipe,
      prepTime: null,
      processSafetySummary: {
        ...completeRecipe.processSafetySummary,
        needs_review: true,
        warnings: [{ tag: 'fermentation_anaerobic' }],
        cook_gate: 'confirm',
      },
    })
    expect(summary.dimensions.process_safety).toMatchObject({ level: 'medium' })
    expect(summary.dimensions.timing).toMatchObject({ level: 'medium', reasons: ['timing_fields_incomplete'] })
  })
})

describe('uncertainty gold fixtures', () => {
  it.each(UNCERTAINTY_GOLD_FIXTURES)('keeps $id conservative for $dimension', ({ recipe, dimension, expected }) => {
    const summary = buildRecipeUncertainty(recipe)
    expect(summary.dimensions[dimension].level).toBe(expected)
  })
})
