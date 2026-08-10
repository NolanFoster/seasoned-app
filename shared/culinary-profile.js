/**
 * Canonical culinary profile helpers shared by the app and Workers.
 *
 * Profile values are deliberately plain JSON so they can be stored in D1 and
 * sent across worker boundaries without coupling the UI to a database shape.
 */

export const DIET_TAGS = Object.freeze([
  'vegetarian',
  'vegan',
  'pescatarian',
  'flexitarian',
  'halal',
  'kosher',
  'keto',
  'paleo',
  'mediterranean',
  'low_carb',
  'gluten_free',
  'dairy_free',
])

export const HARD_ALLERGENS = Object.freeze([
  'milk',
  'eggs',
  'fish',
  'shellfish',
  'tree_nuts',
  'peanuts',
  'wheat',
  'soy',
  'sesame',
])

export const EQUIPMENT = Object.freeze([
  'oven',
  'stovetop',
  'air_fryer',
  'instant_pot',
  'slow_cooker',
  'grill',
  'blender',
  'food_processor',
  'microwave',
])

export const SKILL_LEVELS = Object.freeze(['beginner', 'intermediate', 'advanced'])
export const UNITS = Object.freeze(['us', 'metric'])

export const DEFAULT_CULINARY_PROFILE = Object.freeze({
  diet_tags: Object.freeze([]),
  hard_allergens: Object.freeze([]),
  soft_avoids: Object.freeze([]),
  cuisine_likes: Object.freeze([]),
  cuisine_dislikes: Object.freeze([]),
  spice_level: 2,
  skill_level: 'intermediate',
  default_servings: 4,
  max_cook_time_min: 60,
  equipment: Object.freeze([]),
  nutrition_goals: Object.freeze({ focus: null, targets: Object.freeze({}) }),
  units_pref: 'us',
  exclude_ingredients: Object.freeze([]),
  notes_freeform: '',
  consent_flags: Object.freeze({ learn_from_activity: false, share_anon_evals: false }),
})

const ALLERGEN_ALIASES = Object.freeze({
  dairy: 'milk',
  milk: 'milk',
  eggs: 'eggs',
  egg: 'eggs',
  fish: 'fish',
  seafood: 'shellfish',
  shellfish: 'shellfish',
  'tree nuts': 'tree_nuts',
  'tree nut': 'tree_nuts',
  treenuts: 'tree_nuts',
  peanut: 'peanuts',
  peanuts: 'peanuts',
  wheat: 'wheat',
  gluten: 'wheat',
  soy: 'soy',
  soybeans: 'soy',
  sesame: 'sesame',
})

function asTag(value) {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_')
  return normalized || null
}

function normalizeList(value, aliases = {}) {
  if (!Array.isArray(value)) return []
  const result = []
  for (const item of value) {
    const tag = asTag(item)
    if (!tag) continue
    const normalized = aliases[tag.replace(/_/g, ' ')] || aliases[tag] || tag
    if (!result.includes(normalized)) result.push(normalized)
  }
  return result.slice(0, 100)
}

function numberOrDefault(value, fallback, min, max) {
  if (value === undefined || value === null || value === '') return fallback
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.round(number)))
}

function objectOrDefault(value, fallback) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback
}

function normalizeNutritionGoals(value, fallback = DEFAULT_CULINARY_PROFILE.nutrition_goals) {
  const source = objectOrDefault(value, fallback)
  const targets = objectOrDefault(source.targets, {})
  const normalizedTargets = {}
  for (const key of ['protein_g', 'sodium_mg', 'calories_min', 'calories_max']) {
    if (targets[key] === undefined || targets[key] === null || targets[key] === '') continue
    const number = Number(targets[key])
    if (Number.isFinite(number) && number >= 0) normalizedTargets[key] = Math.round(number)
  }
  const focus = typeof source.focus === 'string' && source.focus.trim()
    ? asTag(source.focus)
    : null
  return { focus, targets: normalizedTargets }
}

function normalizeConsentFlags(value, fallback = DEFAULT_CULINARY_PROFILE.consent_flags) {
  const source = objectOrDefault(value, fallback)
  return {
    learn_from_activity: source.learn_from_activity === true,
    share_anon_evals: source.share_anon_evals === true,
  }
}

/**
 * Normalize a complete or partial profile into the canonical API/storage shape.
 * Unknown keys are ignored so a client cannot persist arbitrary profile data.
 */
export function normalizeCulinaryProfile(input = {}, base = DEFAULT_CULINARY_PROFILE) {
  const source = objectOrDefault(input, {})
  const fallback = objectOrDefault(base, DEFAULT_CULINARY_PROFILE)
  const pick = (snake, camel, defaultValue) =>
    source[snake] !== undefined ? source[snake] : source[camel] !== undefined ? source[camel] : defaultValue
  const skill = pick('skill_level', 'skillLevel', fallback.skill_level)
  const units = pick('units_pref', 'unitsPref', fallback.units_pref)
  return {
    diet_tags: normalizeList(pick('diet_tags', 'dietTags', fallback.diet_tags)),
    hard_allergens: normalizeList(pick('hard_allergens', 'hardAllergens', fallback.hard_allergens), ALLERGEN_ALIASES),
    soft_avoids: normalizeList(pick('soft_avoids', 'softAvoids', fallback.soft_avoids)),
    cuisine_likes: normalizeList(pick('cuisine_likes', 'cuisineLikes', fallback.cuisine_likes)),
    cuisine_dislikes: normalizeList(pick('cuisine_dislikes', 'cuisineDislikes', fallback.cuisine_dislikes)),
    spice_level: numberOrDefault(pick('spice_level', 'spiceLevel', fallback.spice_level), 2, 0, 5),
    skill_level: SKILL_LEVELS.includes(skill) ? skill : 'intermediate',
    default_servings: numberOrDefault(pick('default_servings', 'defaultServings', fallback.default_servings), 4, 1, 24),
    max_cook_time_min: numberOrDefault(pick('max_cook_time_min', 'maxCookTimeMin', fallback.max_cook_time_min), 60, 5, 720),
    equipment: normalizeList(pick('equipment', 'equipment', fallback.equipment)),
    nutrition_goals: normalizeNutritionGoals(pick('nutrition_goals', 'nutritionGoals', fallback.nutrition_goals)),
    units_pref: UNITS.includes(units) ? units : 'us',
    exclude_ingredients: normalizeList(pick('exclude_ingredients', 'excludeIngredients', fallback.exclude_ingredients)),
    notes_freeform: typeof pick('notes_freeform', 'notesFreeform', fallback.notes_freeform) === 'string'
      ? String(pick('notes_freeform', 'notesFreeform', fallback.notes_freeform)).trim().slice(0, 500)
      : '',
    consent_flags: normalizeConsentFlags(pick('consent_flags', 'consentFlags', fallback.consent_flags)),
  }
}

/** Merge a partial update into an existing profile without losing omitted values. */
export function mergeCulinaryProfile(current, update) {
  const base = normalizeCulinaryProfile(current)
  return normalizeCulinaryProfile(update, base)
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null)
}

function constraintList(value) {
  if (!Array.isArray(value)) return value
  return value
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, items) => items.indexOf(item) === index)
}

/**
 * Build the generation-facing constraint contract.
 * Explicit request fields win over persisted profile fields, which win over
 * safe defaults. Arrays are replaced (not concatenated) so a user can clear a
 * profile value for one generation.
 */
export function buildGenerationConstraints(profile = {}, overrides = {}) {
  const normalizedProfile = normalizeCulinaryProfile(profile)
  const request = objectOrDefault(overrides, {})
  const dietary = firstDefined(request.dietary, request.diet_tags, normalizedProfile.diet_tags)
  const hardAllergens = firstDefined(request.hardAllergens, request.hard_allergens, normalizedProfile.hard_allergens)
  const softAvoids = firstDefined(request.softAvoids, request.soft_avoids, normalizedProfile.soft_avoids)
  const cuisine = firstDefined(request.cuisine, normalizedProfile.cuisine_likes[0])
  const equipment = firstDefined(request.equipment, normalizedProfile.equipment)
  const servings = firstDefined(request.servings, normalizedProfile.default_servings)
  const maxCookTime = firstDefined(request.maxCookTime, request.max_cook_time_min, normalizedProfile.max_cook_time_min)
  const spiceLevel = firstDefined(request.spiceLevel, request.spice_level, normalizedProfile.spice_level)
  const skillLevel = firstDefined(request.skillLevel, request.skill_level, normalizedProfile.skill_level)
  const excludeIngredients = firstDefined(
    request.excludeIngredients,
    request.exclude_ingredients,
    normalizedProfile.exclude_ingredients,
  )

  return {
    dietary: constraintList(dietary),
    hardAllergens: constraintList(hardAllergens),
    softAvoids: constraintList(softAvoids),
    cuisine: typeof cuisine === 'string' ? cuisine : '',
    cuisineLikes: normalizedProfile.cuisine_likes,
    cuisineDislikes: normalizedProfile.cuisine_dislikes,
    equipment: constraintList(equipment),
    servings: numberOrDefault(servings, 4, 1, 24),
    maxCookTime: numberOrDefault(maxCookTime, 60, 5, 720),
    spiceLevel: numberOrDefault(spiceLevel, 2, 0, 5),
    skillLevel: SKILL_LEVELS.includes(skillLevel) ? skillLevel : 'intermediate',
    excludeIngredients: constraintList(excludeIngredients),
    nutritionGoals: request.nutritionGoals ?? request.nutrition_goals ?? normalizedProfile.nutrition_goals,
    units: request.units ?? request.units_pref ?? normalizedProfile.units_pref,
  }
}

/** Validate user input before it is accepted by the profile API. */
export function validateCulinaryProfileInput(input) {
  const errors = []
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return ['Profile must be a JSON object']
  }
  const listFields = [
    'diet_tags', 'dietTags', 'hard_allergens', 'hardAllergens', 'soft_avoids', 'softAvoids',
    'cuisine_likes', 'cuisineLikes', 'cuisine_dislikes', 'cuisineDislikes', 'equipment',
    'exclude_ingredients', 'excludeIngredients',
  ]
  for (const field of listFields) {
    if (input[field] !== undefined && (!Array.isArray(input[field]) || input[field].some((item) => typeof item !== 'string'))) {
      errors.push(`${field} must be an array of strings`)
    }
  }
  const numericFields = {
    spice_level: [0, 5], spiceLevel: [0, 5], default_servings: [1, 24], defaultServings: [1, 24],
    max_cook_time_min: [5, 720], maxCookTimeMin: [5, 720],
  }
  for (const [field, [min, max]] of Object.entries(numericFields)) {
    if (input[field] !== undefined && (!Number.isFinite(Number(input[field])) || Number(input[field]) < min || Number(input[field]) > max)) {
      errors.push(`${field} must be between ${min} and ${max}`)
    }
  }
  const skill = input.skill_level ?? input.skillLevel
  if (skill !== undefined && !SKILL_LEVELS.includes(skill)) errors.push('skill_level must be beginner, intermediate, or advanced')
  const units = input.units_pref ?? input.unitsPref
  if (units !== undefined && !UNITS.includes(units)) errors.push('units_pref must be us or metric')
  if (input.notes_freeform !== undefined && typeof input.notes_freeform !== 'string') errors.push('notes_freeform must be a string')
  if (input.nutrition_goals !== undefined && (!input.nutrition_goals || typeof input.nutrition_goals !== 'object' || Array.isArray(input.nutrition_goals))) {
    errors.push('nutrition_goals must be an object')
  }
  if (input.consent_flags !== undefined && (!input.consent_flags || typeof input.consent_flags !== 'object' || Array.isArray(input.consent_flags))) {
    errors.push('consent_flags must be an object')
  }
  return errors
}
