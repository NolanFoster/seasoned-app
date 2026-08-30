/**
 * Nutrition Trust & Overtrust Friction UX V1 (#538)
 *
 * Implements UK FSA-style traffic light evaluation (fat, saturates, sugar, salt),
 * confidence scoring, and forced-attention review gates to mitigate overtrust
 * in AI-generated recipe nutritional claims (ACM UMAP 2026).
 */

export const TRAFFIC_LIGHT_LEVELS = {
  GREEN: 'green',
  AMBER: 'amber',
  RED: 'red',
  UNKNOWN: 'unknown',
}

/**
 * UK FSA per-serving thresholds (grams or mg per portion for food dishes).
 * Fat: Low <= 3g, Med > 3g and <= 17.5g, High > 17.5g
 * Saturated Fat: Low <= 1.5g, Med > 1.5g and <= 5g, High > 5g
 * Sugars: Low <= 5g, Med > 5g and <= 22.5g, High > 22.5g
 * Salt (Sodium mg * 2.5 / 1000 = g salt): Low <= 0.3g (120mg Na), Med <= 1.5g (600mg Na), High > 1.5g (>600mg Na)
 */
export function computeTrafficLights(nutrition) {
  if (!nutrition || typeof nutrition !== 'object') {
    return {
      fat: { level: TRAFFIC_LIGHT_LEVELS.UNKNOWN, label: 'Unknown', value: null },
      saturates: { level: TRAFFIC_LIGHT_LEVELS.UNKNOWN, label: 'Unknown', value: null },
      sugars: { level: TRAFFIC_LIGHT_LEVELS.UNKNOWN, label: 'Unknown', value: null },
      salt: { level: TRAFFIC_LIGHT_LEVELS.UNKNOWN, label: 'Unknown', value: null },
      hasRedLight: false,
    }
  }

  const parseGrams = (val) => {
    if (typeof val === 'number') return val
    if (typeof val === 'string') {
      const match = val.match(/([\d.]+)/)
      return match ? parseFloat(match[1]) : null
    }
    return null
  }

  const fatVal = parseGrams(nutrition.fatContent)
  const satVal = parseGrams(nutrition.saturatedFatContent)
  const sugarVal = parseGrams(nutrition.sugarContent)
  const sodiumVal = parseGrams(nutrition.sodiumContent) // usually in mg

  // Fat
  let fatLevel = TRAFFIC_LIGHT_LEVELS.UNKNOWN
  if (fatVal !== null) {
    if (fatVal <= 3.0) fatLevel = TRAFFIC_LIGHT_LEVELS.GREEN
    else if (fatVal <= 17.5) fatLevel = TRAFFIC_LIGHT_LEVELS.AMBER
    else fatLevel = TRAFFIC_LIGHT_LEVELS.RED
  }

  // Saturated Fat
  let satLevel = TRAFFIC_LIGHT_LEVELS.UNKNOWN
  if (satVal !== null) {
    if (satVal <= 1.5) satLevel = TRAFFIC_LIGHT_LEVELS.GREEN
    else if (satVal <= 5.0) satLevel = TRAFFIC_LIGHT_LEVELS.AMBER
    else satLevel = TRAFFIC_LIGHT_LEVELS.RED
  }

  // Sugars
  let sugarLevel = TRAFFIC_LIGHT_LEVELS.UNKNOWN
  if (sugarVal !== null) {
    if (sugarVal <= 5.0) sugarLevel = TRAFFIC_LIGHT_LEVELS.GREEN
    else if (sugarVal <= 22.5) sugarLevel = TRAFFIC_LIGHT_LEVELS.AMBER
    else sugarLevel = TRAFFIC_LIGHT_LEVELS.RED
  }

  // Salt / Sodium
  let saltLevel = TRAFFIC_LIGHT_LEVELS.UNKNOWN
  if (sodiumVal !== null) {
    // 600mg sodium ~ 1.5g salt
    if (sodiumVal <= 120) saltLevel = TRAFFIC_LIGHT_LEVELS.GREEN
    else if (sodiumVal <= 600) saltLevel = TRAFFIC_LIGHT_LEVELS.AMBER
    else saltLevel = TRAFFIC_LIGHT_LEVELS.RED
  }

  const hasRedLight = [fatLevel, satLevel, sugarLevel, saltLevel].includes(TRAFFIC_LIGHT_LEVELS.RED)

  return {
    fat: { level: fatLevel, value: fatVal !== null ? `${fatVal}g` : '—' },
    saturates: { level: satLevel, value: satVal !== null ? `${satVal}g` : '—' },
    sugars: { level: sugarLevel, value: sugarVal !== null ? `${sugarVal}g` : '—' },
    salt: { level: saltLevel, value: sodiumVal !== null ? `${sodiumVal}mg sodium` : '—' },
    hasRedLight,
  }
}

/**
 * Computes the overall confidence level for recipe nutrition estimates.
 * @param {object} provenance
 * @returns {'high'|'medium'|'low'|'unknown'}
 */
export function computeNutritionConfidence(provenance) {
  if (!provenance) return 'unknown'
  const coverage = provenance.coverage_pct ?? 0
  if (coverage >= 90 && (!provenance.uncertain_ingredients || provenance.uncertain_ingredients.length === 0)) {
    return 'high'
  }
  if (coverage >= 60) {
    return 'medium'
  }
  return 'low'
}

/**
 * Evaluates whether a recipe requires explicit user attention / acknowledgment gate before saving or cooking.
 * @param {object} recipe
 * @returns {{ requiresGate: boolean, reasons: string[] }}
 */
export function evaluateNutritionFrictionGate(recipe) {
  if (!recipe) return { requiresGate: false, reasons: [] }
  const lights = computeTrafficLights(recipe.nutrition)
  const confidence = computeNutritionConfidence(recipe.nutritionProvenance)
  const reasons = []

  if (lights.hasRedLight) {
    reasons.push('High levels detected in one or more nutrient categories (traffic light: RED).')
  }
  if (confidence === 'low' || confidence === 'unknown') {
    reasons.push('Nutrition estimate has low confidence or partial ingredient matching.')
  }

  return {
    requiresGate: reasons.length > 0,
    reasons,
    lights,
    confidence,
  }
}
