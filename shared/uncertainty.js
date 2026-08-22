/**
 * Shared uncertainty and selective-abstention contract.
 *
 * This module deliberately contains deterministic, explainable heuristics. It
 * does not expose model internals or claim that a confidence value is a
 * probability of safety. A dimension below `high` means the client should
 * explain what is unknown and ask the cook to verify it.
 */

import { analyzeRecipeAllergens, normalizeAllergenList } from './allergen-graph.js'

export const UNCERTAINTY_SCHEMA_VERSION = '1.0'
export const UNCERTAINTY_GUARDS_FLAG = 'uncertainty_guards_v1'

export const UNCERTAINTY_DIMENSIONS = Object.freeze([
  'nutrition',
  'allergen_coverage',
  'process_safety',
  'authenticity',
  'technique',
  'timing',
  'product_identity',
  'general',
])

export const UNCERTAINTY_LEVELS = Object.freeze(['high', 'medium', 'low', 'abstain'])

const LEVEL_RANK = Object.freeze({ high: 0, medium: 1, low: 2, abstain: 3 })
const DEFAULT_CONFIDENCE = Object.freeze({ high: 0.95, medium: 0.65, low: 0.3, abstain: 0 })

const OPAQUE_PRODUCT_TERMS = Object.freeze([
  /\bnatural flavors?\b/i,
  /\bartificial flavors?\b/i,
  /\bspice blend\b/i,
  /\bseasoning blend\b/i,
  /\bbouillon\b/i,
  /\b(?:chicken|beef|vegetable) (?:stock|broth)\b/i,
  /\b(?:pasta|sauce|dressing|curry paste|protein powder)\b/i,
])

const AI_SOURCES = new Set(['ai_generated', 'adapted', 'elevated'])

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function asNonEmptyString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function uniqueStrings(value, max = 8) {
  if (!Array.isArray(value)) return []
  return value
    .map(asNonEmptyString)
    .filter(Boolean)
    .filter((item, index, items) => items.indexOf(item) === index)
    .slice(0, max)
}

function levelForConfidence(value) {
  if (value >= 0.85) return 'high'
  if (value >= 0.55) return 'medium'
  if (value > 0) return 'low'
  return 'abstain'
}

function normalizedLevel(value, fallback = 'high') {
  const level = asNonEmptyString(value)?.toLowerCase()
  return UNCERTAINTY_LEVELS.includes(level) ? level : fallback
}

/** Normalize a single dimension while keeping the wire format stable. */
export function normalizeUncertaintyDimension(dimension, value = {}) {
  const source = typeof value === 'string' ? { level: value } : value && typeof value === 'object' ? value : {}
  const suppliedConfidence = Number(source.confidence)
  const level = source.level
    ? normalizedLevel(source.level)
    : Number.isFinite(suppliedConfidence)
      ? levelForConfidence(suppliedConfidence)
      : 'high'
  const confidence = Number.isFinite(suppliedConfidence)
    ? clamp(suppliedConfidence)
    : DEFAULT_CONFIDENCE[level]

  return {
    dimension,
    level,
    confidence,
    reasons: uniqueStrings(source.reasons),
    evidence_refs: uniqueStrings(source.evidence_refs || source.evidenceRefs),
  }
}

export function compareUncertaintyLevels(left, right) {
  return (LEVEL_RANK[normalizedLevel(left)] ?? LEVEL_RANK.high)
    - (LEVEL_RANK[normalizedLevel(right)] ?? LEVEL_RANK.high)
}

export function worstUncertaintyLevel(values) {
  return values.reduce((worst, value) => (
    compareUncertaintyLevels(value, worst) > 0 ? normalizedLevel(value) : worst
  ), 'high')
}

/**
 * Build the public summary. Every dimension is present so clients can render
 * a consistent contract even when a check has no concern to report.
 */
export function buildUncertaintySummary(dimensions = {}, { generatedAt = new Date().toISOString() } = {}) {
  const normalizedDimensions = {}
  for (const dimension of UNCERTAINTY_DIMENSIONS) {
    normalizedDimensions[dimension] = normalizeUncertaintyDimension(
      dimension,
      dimensions[dimension] || { level: 'high' },
    )
  }

  const activeDimensions = Object.values(normalizedDimensions)
  const level = worstUncertaintyLevel(activeDimensions.map(({ level: value }) => value))
  const confidence = Math.min(...activeDimensions.map(({ confidence: value }) => value))
  const reasons = uniqueStrings(activeDimensions.flatMap(({ reasons: value }) => value), 24)
  const evidenceRefs = uniqueStrings(activeDimensions.flatMap(({ evidence_refs: value }) => value), 24)

  return {
    schemaVersion: UNCERTAINTY_SCHEMA_VERSION,
    checked: true,
    generatedAt,
    level,
    confidence,
    abstained: level === 'abstain',
    needs_review: level !== 'high',
    reasons,
    evidence_refs: evidenceRefs,
    overall: { level, confidence, reasons },
    dimensions: normalizedDimensions,
  }
}

function linesFromRecipe(recipe) {
  if (Array.isArray(recipe)) return recipe
  if (!recipe || typeof recipe !== 'object') return []
  const values = [recipe.ingredients, recipe.sourceIngredients, recipe.recipeIngredient]
  return values.flatMap((value) => Array.isArray(value) ? value : [])
}

function lineText(value) {
  if (typeof value === 'string') return value.trim()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ''
  return [value.name, value.text, value.ingredient, value.original]
    .find((candidate) => typeof candidate === 'string' && candidate.trim())?.trim() || ''
}

function recipeLines(recipe) {
  return linesFromRecipe(recipe).map(lineText).filter(Boolean)
}

function parseMinutes(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const text = value.trim().toUpperCase()
  if (!text) return null
  if (text.startsWith('P')) {
    const hours = Number(text.match(/(\d+(?:\.\d+)?)H/)?.[1] || 0)
    const minutes = Number(text.match(/(\d+(?:\.\d+)?)M/)?.[1] || 0)
    return hours * 60 + minutes || null
  }
  const hours = Number(text.match(/(\d+(?:\.\d+)?)\s*(?:HOUR|HR)/)?.[1] || 0)
  const minutes = Number(text.match(/(\d+(?:\.\d+)?)\s*(?:MINUTE|MIN)/)?.[1] || 0)
  return hours || minutes ? hours * 60 + minutes : null
}

function dimension(level, confidence, reasons = [], evidenceRefs = []) {
  return { level, confidence, reasons, evidence_refs: evidenceRefs }
}

function assessAllergenCoverage(recipe, hardAllergens, providedSummary) {
  const summary = providedSummary || analyzeRecipeAllergens(recipe, hardAllergens)
  const uncertain = Array.isArray(summary.may_contain_uncertain) ? summary.may_contain_uncertain : []
  const blocked = Array.isArray(summary.blocked) ? summary.blocked : []
  const unknown = Array.isArray(summary.unknown_hard_allergens) ? summary.unknown_hard_allergens : []
  const noIngredientData = summary.ingredient_data_available === false
  const reasons = [
    ...(blocked.length > 0 ? ['allergen_conflict'] : []),
    ...(uncertain.length > 0 ? ['opaque_or_precautionary_ingredient_terms'] : []),
    ...(unknown.length > 0 ? ['custom_allergen_not_in_graph'] : []),
    ...(noIngredientData && hardAllergens.length > 0 ? ['ingredient_data_unavailable'] : []),
  ]

  if (blocked.length > 0 || summary.safe === false || (hardAllergens.length > 0 && (uncertain.length > 0 || unknown.length > 0 || noIngredientData))) {
    return dimension('abstain', 0, reasons)
  }
  if (uncertain.length > 0 || unknown.length > 0 || summary.needs_review) {
    return dimension('medium', 0.55, reasons.length > 0 ? reasons : ['allergen_coverage_partial'])
  }
  return dimension('high', 0.97)
}

function assessProcessSafety(recipe, summary) {
  if (!summary || summary.checked !== true) return dimension('medium', 0.55, ['process_safety_not_checked'])
  if (summary.safe === false || summary.blocked?.length > 0 || summary.requires_template?.length > 0 || summary.cook_gate === 'block') {
    return dimension('abstain', 0, ['process_safety_blocked'])
  }
  if (summary.needs_review || summary.warnings?.length > 0 || summary.cook_gate === 'confirm') {
    return dimension('medium', 0.6, ['process_safety_requires_review'])
  }
  return dimension('high', 0.98)
}

function assessNutrition(recipe) {
  const nutrition = recipe?.nutrition
  if (!nutrition || typeof nutrition !== 'object' || Object.keys(nutrition).length === 0) {
    return dimension('abstain', 0, ['nutrition_not_calculated'])
  }
  const suppliedLevel = nutrition.uncertainty?.level || nutrition.uncertaintyLevel
  if (suppliedLevel) {
    const supplied = normalizeUncertaintyDimension('nutrition', nutrition.uncertainty)
    return dimension(supplied.level, supplied.confidence, supplied.reasons, supplied.evidence_refs)
  }
  if (nutrition.source === 'labeled' || nutrition.provenance === 'labeled') {
    return dimension('high', 0.94, [], ['package_label'])
  }
  const coverage = Number(
    nutrition.coverage ?? nutrition.coveragePercent ?? recipe.nutritionCoverage ?? recipe.provenance?.nutritionCoverage,
  )
  if (!Number.isFinite(coverage)) return dimension('medium', 0.55, ['nutrition_coverage_unknown'])
  if (coverage < 60) return dimension('abstain', 0, ['nutrition_coverage_insufficient'])
  if (coverage < 90) return dimension('medium', 0.65, ['nutrition_is_estimated'])
  return dimension('medium', 0.75, ['nutrition_is_estimated'])
}

function assessTiming(recipe) {
  const prep = parseMinutes(recipe?.prepTime ?? recipe?.prep_time)
  const cook = parseMinutes(recipe?.cookTime ?? recipe?.cook_time)
  const total = parseMinutes(recipe?.totalTime ?? recipe?.total_time)
  if (prep === null || cook === null || total === null) return dimension('medium', 0.55, ['timing_fields_incomplete'])
  const expected = prep + cook
  const tolerance = Math.max(5, expected * 0.25)
  return total >= expected - tolerance && total <= expected + tolerance
    ? dimension('high', 0.92)
    : dimension('medium', 0.55, ['timing_consistency_uncertain'])
}

function assessProductIdentity(recipe) {
  const lines = recipeLines(recipe)
  const opaque = lines.filter((line) => OPAQUE_PRODUCT_TERMS.some((pattern) => pattern.test(line)))
  if (opaque.length === 0) return dimension('high', 0.9)
  const hasProductEvidence = Boolean(recipe.productIdentity || recipe.product_id || recipe.productId)
  return hasProductEvidence
    ? dimension('medium', 0.65, ['packaged_product_components_need_label_review'])
    : dimension('low', 0.3, ['packaged_product_identity_missing'])
}

/**
 * Calculate a recipe-level uncertainty summary from existing deterministic
 * safety/quality metadata. This is a selective-prediction layer: it never
 * changes allergen or process enforcement decisions.
 */
export function buildRecipeUncertainty(recipe = {}, {
  hardAllergens = recipe?.appliedConstraints?.hardAllergens || recipe?.appliedConstraints?.hard_allergens || [],
  allergenSummary = recipe?.allergenSummary,
  processSafetySummary = recipe?.processSafetySummary,
  qualityBar = recipe?.qualityBar || recipe?.quality_bar,
  generatedAt,
} = {}) {
  const normalizedHardAllergens = normalizeAllergenList(hardAllergens)
  const qualityStatus = qualityBar?.status
  const source = recipe?.source || recipe?.provenance?.source
  const lines = recipeLines(recipe)
  const technique = qualityStatus === 'blocked'
    ? dimension('abstain', 0, ['quality_validation_blocked'])
    : qualityStatus === 'needs_review'
      ? dimension('medium', 0.6, ['quality_checks_need_review'])
      : dimension('high', 0.9)
  const authenticity = AI_SOURCES.has(source)
    ? dimension('medium', 0.6, ['generated_content_not_independently_verified'])
    : dimension('high', 0.9)
  const general = qualityStatus === 'blocked'
    ? dimension('abstain', 0, ['quality_validation_blocked'])
    : qualityStatus === 'needs_review'
      ? dimension('medium', 0.6, ['quality_checks_need_review'])
      : dimension('high', 0.9)

  return buildUncertaintySummary({
    nutrition: assessNutrition(recipe),
    allergen_coverage: assessAllergenCoverage(recipe, normalizedHardAllergens, allergenSummary),
    process_safety: assessProcessSafety(recipe, processSafetySummary),
    authenticity,
    technique,
    timing: assessTiming(recipe),
    product_identity: lines.length > 0 ? assessProductIdentity(recipe) : dimension('medium', 0.55, ['ingredient_data_unavailable']),
    general,
  }, { generatedAt })
}

/** Attach a summary without mutating the recipe object. */
export function withRecipeUncertainty(recipe, options = {}) {
  return {
    ...recipe,
    uncertaintySummary: buildRecipeUncertainty(recipe, options),
  };
}

export function isUncertaintyGuardsEnabled(env = {}) {
  const raw = env.UNCERTAINTY_GUARDS_V1
    ?? env.FEATURE_UNCERTAINTY_GUARDS_V1
    ?? env.uncertainty_guards_v1
  return ['true', '1', 'on', 'enabled'].includes(String(raw ?? '').trim().toLowerCase())
}

export function isUncertainLevel(level) {
  return compareUncertaintyLevels(level, 'high') > 0
}

export function isSafetyUncertain(summary) {
  const dimensions = summary?.dimensions || {}
  return isUncertainLevel(dimensions.allergen_coverage?.level)
    || isUncertainLevel(dimensions.process_safety?.level)
}

export function isNutritionAbstained(summary) {
  return normalizedLevel(summary?.dimensions?.nutrition?.level, 'high') === 'abstain'
}
