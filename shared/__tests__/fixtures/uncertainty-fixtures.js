const SAFE_PROCESS = {
  checked: true,
  safe: true,
  needs_review: false,
  warnings: [],
  blocked: [],
  requires_template: [],
  cook_gate: 'allow',
}

const SAFE_ALLERGENS = {
  checked: true,
  safe: true,
  ingredient_data_available: true,
  needs_review: false,
  blocked: [],
  may_contain_uncertain: [],
  unknown_hard_allergens: [],
}

const BASE_RECIPE = {
  source: 'clipped',
  ingredients: ['1 cup rice', '1 carrot'],
  instructions: ['Cook the rice and carrot until tender.'],
  prepTime: '10 minutes',
  cookTime: '20 minutes',
  totalTime: '30 minutes',
  processSafetySummary: SAFE_PROCESS,
  allergenSummary: SAFE_ALLERGENS,
  qualityBar: { status: 'passed' },
}

const fixture = (id, recipe, dimension, expected) => ({
  id,
  recipe: { ...BASE_RECIPE, ...recipe },
  dimension,
  expected,
})

/** Gold cases for selective prediction. Keep expected levels conservative. */
export const UNCERTAINTY_GOLD_FIXTURES = Object.freeze([
  fixture('safe-complete', { nutrition: { source: 'labeled', calories: 400 } }, 'nutrition', 'high'),
  fixture('nutrition-missing', {}, 'nutrition', 'abstain'),
  fixture('nutrition-low-coverage', { nutrition: { coveragePercent: 40 } }, 'nutrition', 'abstain'),
  fixture('nutrition-mid-coverage', { nutrition: { coveragePercent: 70 } }, 'nutrition', 'medium'),
  fixture('nutrition-high-estimated', { nutrition: { coveragePercent: 95 } }, 'nutrition', 'medium'),
  fixture('nutrition-labeled', { nutrition: { provenance: 'labeled' } }, 'nutrition', 'high'),
  fixture('seasoning-no-profile', {
    ingredients: ['1 cup seasoning blend'],
    allergenSummary: { ...SAFE_ALLERGENS, needs_review: true, may_contain_uncertain: ['1 cup seasoning blend'] },
  }, 'allergen_coverage', 'medium'),
  fixture('seasoning-hard-profile', {
    ingredients: ['1 cup seasoning blend'],
    appliedConstraints: { hardAllergens: ['peanuts'] },
    allergenSummary: { ...SAFE_ALLERGENS, needs_review: true, may_contain_uncertain: ['1 cup seasoning blend'] },
  }, 'allergen_coverage', 'abstain'),
  fixture('natural-flavor-no-profile', {
    ingredients: ['1 teaspoon natural flavors'],
    allergenSummary: { ...SAFE_ALLERGENS, needs_review: true, may_contain_uncertain: ['1 teaspoon natural flavors'] },
  }, 'allergen_coverage', 'medium'),
  fixture('custom-allergen', {
    appliedConstraints: { hardAllergens: ['mustard'] },
    allergenSummary: { ...SAFE_ALLERGENS, needs_review: true, unknown_hard_allergens: ['mustard'] },
  }, 'allergen_coverage', 'abstain'),
  fixture('ingredient-data-missing', {
    ingredients: [],
    appliedConstraints: { hardAllergens: ['peanuts'] },
    allergenSummary: { checked: true, safe: false, ingredient_data_available: false, needs_review: true, blocked: [], may_contain_uncertain: [], unknown_hard_allergens: [] },
  }, 'allergen_coverage', 'abstain'),
  fixture('ingredient-data-no-profile', {
    ingredients: [],
    allergenSummary: { checked: true, safe: true, ingredient_data_available: false, needs_review: false, blocked: [], may_contain_uncertain: [], unknown_hard_allergens: [] },
  }, 'allergen_coverage', 'high'),
  fixture('fermentation-review', {
    processSafetySummary: { ...SAFE_PROCESS, needs_review: true, warnings: [{ tag: 'fermentation_anaerobic' }], cook_gate: 'confirm' },
  }, 'process_safety', 'medium'),
  fixture('process-blocked', {
    processSafetySummary: { ...SAFE_PROCESS, safe: false, blocked: ['home_canning_low_acid'], cook_gate: 'block' },
  }, 'process_safety', 'abstain'),
  fixture('process-not-checked', { processSafetySummary: null }, 'process_safety', 'medium'),
  fixture('timing-incomplete', { prepTime: null }, 'timing', 'medium'),
  fixture('timing-inconsistent', { totalTime: '90 minutes' }, 'timing', 'medium'),
  fixture('timing-consistent', {}, 'timing', 'high'),
  fixture('ai-authenticity', { source: 'ai_generated' }, 'authenticity', 'medium'),
  fixture('clipped-authenticity', {}, 'authenticity', 'high'),
  fixture('resolved-product', { ingredients: ['1 package pasta sauce'], productId: 'product-1' }, 'product_identity', 'medium'),
  fixture('unresolved-product', { ingredients: ['1 package pasta sauce'] }, 'product_identity', 'low'),
  fixture('quality-review', { qualityBar: { status: 'needs_review' } }, 'technique', 'medium'),
  fixture('quality-blocked', { qualityBar: { status: 'blocked' } }, 'general', 'abstain'),
  fixture('hard-allergen-block', {
    appliedConstraints: { hardAllergens: ['peanuts'] },
    allergenSummary: { ...SAFE_ALLERGENS, safe: false, blocked: ['peanuts'] },
  }, 'allergen_coverage', 'abstain'),
  fixture('safe-process-and-label', { nutrition: { source: 'labeled', calories: 400 } }, 'process_safety', 'high'),
])
