/**
 * Shared allergen detection and safety helpers.
 *
 * This module intentionally uses a conservative, explainable ingredient graph
 * instead of treating a model's dietary label as proof of safety. It is used
 * at the boundary where generated or recommended recipes are returned.
 */

import { HARD_ALLERGENS } from './culinary-profile.js'

export const ALLERGEN_LABELS = Object.freeze({
  milk: 'Milk',
  eggs: 'Eggs',
  fish: 'Fish',
  shellfish: 'Shellfish',
  tree_nuts: 'Tree nuts',
  peanuts: 'Peanuts',
  wheat: 'Wheat',
  soy: 'Soy',
  sesame: 'Sesame',
})

const ALLERGEN_ALIASES = Object.freeze({
  dairy: 'milk',
  milk: 'milk',
  egg: 'eggs',
  eggs: 'eggs',
  fish: 'fish',
  seafood: 'shellfish',
  shellfish: 'shellfish',
  'tree nut': 'tree_nuts',
  'tree nuts': 'tree_nuts',
  treenut: 'tree_nuts',
  treenuts: 'tree_nuts',
  peanut: 'peanuts',
  peanuts: 'peanuts',
  wheat: 'wheat',
  gluten: 'wheat',
  soy: 'soy',
  soybean: 'soy',
  soybeans: 'soy',
  sesame: 'sesame',
})

/** Common ingredient terms that imply an FDA major allergen. */
const ALLERGEN_TERMS = Object.freeze({
  milk: [
    'milk', 'dairy', 'butter', 'ghee', 'cheese', 'cream', 'whey', 'casein',
    'lactose', 'buttermilk', 'yogurt', 'yoghurt', 'curd', 'kefir',
    'mozzarella', 'parmesan', 'ricotta', 'cheddar', 'brie', 'mascarpone',
    'sour cream', 'half-and-half', 'ice cream',
  ],
  eggs: ['egg', 'eggs', 'albumin', 'ovalbumin', 'mayonnaise', 'meringue'],
  fish: [
    'fish', 'salmon', 'tuna', 'cod', 'anchovy', 'anchovies', 'sardine',
    'sardines', 'tilapia', 'trout', 'haddock', 'pollock', 'fish sauce',
    'worcestershire sauce',
  ],
  shellfish: [
    'shellfish', 'shrimp', 'prawn', 'prawns', 'crab', 'lobster', 'crawfish',
    'crayfish', 'scallop', 'scallops', 'mussel', 'mussels', 'oyster', 'oysters',
    'clam', 'clams',
  ],
  tree_nuts: [
    'almond', 'almonds', 'walnut', 'walnuts', 'pecan', 'pecans', 'cashew',
    'cashews', 'pistachio', 'pistachios', 'hazelnut', 'hazelnuts', 'macadamia',
    'brazil nut', 'pine nut', 'pine nuts', 'nut butter', 'marzipan', 'praline',
  ],
  peanuts: ['peanut', 'peanuts', 'groundnut', 'groundnuts', 'arachis', 'peanut butter'],
  wheat: [
    'wheat', 'gluten', 'flour', 'bread', 'pasta', 'semolina', 'couscous',
    'seitan', 'panko', 'breadcrumb', 'breadcrumbs', 'malt', 'farina',
  ],
  soy: [
    'soy', 'soya', 'soybean', 'soybeans', 'tofu', 'tempeh', 'edamame', 'miso',
    'tamari', 'soy sauce', 'lecithin',
  ],
  sesame: ['sesame', 'tahini', 'benne', 'gomasio', 'sesame oil', 'sesame seed', 'sesame seeds'],
})

const UNCERTAIN_TERMS = Object.freeze([
  /\bmay contain\b/i,
  /\bprocessed in a facility\b/i,
  /\bshared equipment\b/i,
  /\bnatural flavors?\b/i,
  /\bartificial flavors?\b/i,
  /\bspice blend\b/i,
  /\bseasoning blend\b/i,
  /\bbouillon\b/i,
  /\b(?:chicken|beef|vegetable) stock\b/i,
  /\b(?:chicken|beef|vegetable) broth\b/i,
  /\bprotein powder\b/i,
])

const KNOWN_ALLERGENS = new Set(HARD_ALLERGENS)

function normalizeText(value) {
  return typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[\u2019']/g, '').replace(/[\s-]+/g, ' ')
    : ''
}

function normalizeKey(value) {
  return normalizeText(value).replace(/[^a-z0-9_ ]/g, '').replace(/\s+/g, '_')
}

/** Normalize canonical IDs and the aliases accepted by culinary profiles. */
export function normalizeAllergen(value) {
  const text = normalizeText(value)
  if (!text) return null
  return ALLERGEN_ALIASES[text] || ALLERGEN_ALIASES[text.replace(/_/g, ' ')] || normalizeKey(text)
}

/** Normalize and de-duplicate a hard-allergen list without dropping custom tags. */
export function normalizeAllergenList(value) {
  if (!Array.isArray(value)) return []
  return value
    .map(normalizeAllergen)
    .filter(Boolean)
    .filter((item, index, items) => items.indexOf(item) === index)
}

function normalizeRecipeLine(value) {
  if (typeof value === 'string') return value.trim()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ''
  for (const field of ['name', 'text', 'ingredient', 'original']) {
    if (typeof value[field] === 'string' && value[field].trim()) return value[field].trim()
  }
  return ''
}

function recipeLineValues(recipeOrIngredients, fields) {
  if (!recipeOrIngredients || typeof recipeOrIngredients !== 'object') return []
  return fields.flatMap((field) => Array.isArray(recipeOrIngredients[field])
    ? recipeOrIngredients[field].map(normalizeRecipeLine)
    : [])
}

/**
 * Return recipe text that can introduce an allergen. Instructions are included
 * deliberately: recipes occasionally hide an additive (for example, butter
 * used to grease a pan) in a step instead of the ingredient list.
 */
function toIngredientLines(recipeOrIngredients) {
  if (Array.isArray(recipeOrIngredients)) {
    return recipeOrIngredients.map(normalizeRecipeLine).filter(Boolean)
  }
  if (!recipeOrIngredients || typeof recipeOrIngredients !== 'object') return []

  const lines = [
    ...recipeLineValues(recipeOrIngredients, [
      'ingredients', 'sourceIngredients', 'recipeIngredient',
    ]),
    ...recipeLineValues(recipeOrIngredients, [
      'instructions', 'steps', 'directions', 'recipeInstructions',
    ]),
  ]
  if (recipeOrIngredients.data && typeof recipeOrIngredients.data === 'object') {
    lines.push(...toIngredientLines(recipeOrIngredients.data))
  }
  return lines.filter(Boolean)
}

function hasIngredientData(recipeOrIngredients) {
  if (Array.isArray(recipeOrIngredients)) return recipeOrIngredients.some((item) => normalizeRecipeLine(item))
  if (!recipeOrIngredients || typeof recipeOrIngredients !== 'object') return false
  const direct = recipeLineValues(recipeOrIngredients, [
    'ingredients', 'sourceIngredients', 'recipeIngredient',
  ])
  return direct.some(Boolean) || hasIngredientData(recipeOrIngredients.data)
}

function termPattern(term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
  return new RegExp(`(?:^|[^a-z])${escaped}(?:$|[^a-z])`, 'i')
}

const TERM_PATTERNS = Object.freeze(Object.fromEntries(
  Object.entries(ALLERGEN_TERMS).map(([allergen, terms]) => [
    allergen,
    terms
      .map((term) => ({ term, pattern: termPattern(term) }))
      .sort((left, right) => right.term.length - left.term.length),
  ]),
))

function isPlantMilkException(line, term, allergen) {
  if (allergen !== 'milk') return false
  if (term === 'milk') {
    return /\b(?:almond|coconut|oat|rice|hemp|pea|cashew)\s+milk\b/i.test(line)
  }
  if (term === 'butter') {
    return /\b(?:peanut|almond|cashew|sunflower|seed)\s+butter\b/i.test(line)
  }
  return false
}

/**
 * Detect known allergens in ingredient lines. Matches are intentionally
 * explainable so a UI or audit log can show the exact ingredient and term.
 */
export function detectAllergens(recipeOrIngredients) {
  const lines = toIngredientLines(recipeOrIngredients)
  const matches = []

  for (const [allergen, terms] of Object.entries(TERM_PATTERNS)) {
    for (const line of lines) {
      for (const { term, pattern } of terms) {
        if (!pattern.test(line) || isPlantMilkException(line, term, allergen)) continue
        matches.push({
          allergen,
          label: ALLERGEN_LABELS[allergen],
          ingredient: line,
          matchedTerm: term,
          confidence: 'high',
        })
      }
    }
  }

  return matches.filter((match, index, items) => items.findIndex((candidate) =>
    candidate.allergen === match.allergen && candidate.ingredient === match.ingredient
  ) === index)
}

function findUncertainIngredients(recipeOrIngredients) {
  const lines = toIngredientLines(recipeOrIngredients)
  return lines.filter((line) => UNCERTAIN_TERMS.some((pattern) => pattern.test(line)))
}

/**
 * Build the allergen graph for a recipe. Nodes represent canonical allergen
 * IDs and edges explain which ingredient line caused each node to be present.
 */
export function buildAllergenGraph(recipeOrIngredients) {
  const matches = detectAllergens(recipeOrIngredients)
  const nodes = [...new Set(matches.map((match) => match.allergen))].map((id) => ({
    id,
    label: ALLERGEN_LABELS[id] || id,
  }))
  const edges = matches.map((match) => ({
    from: match.ingredient,
    to: match.allergen,
    matchedTerm: match.matchedTerm,
    confidence: match.confidence,
  }))
  return { nodes, edges }
}

/**
 * Analyze a recipe against a user's hard allergen list. Unknown custom hard
 * allergens and opaque ingredient terms fail closed when any hard allergen is
 * configured; they must be reviewed rather than silently passed through.
 */
export function analyzeRecipeAllergens(recipeOrIngredients, hardAllergens = []) {
  const hard = normalizeAllergenList(hardAllergens)
  const matches = detectAllergens(recipeOrIngredients)
  const contains = [...new Set(matches.map((match) => match.allergen))]
  const blocked = contains.filter((allergen) => hard.includes(allergen))
  const ingredientDataAvailable = hasIngredientData(recipeOrIngredients)
  const mayContainUncertain = findUncertainIngredients(recipeOrIngredients)
  const unknownHardAllergens = hard.filter((allergen) => !KNOWN_ALLERGENS.has(allergen))
  const needsReview = mayContainUncertain.length > 0
    || unknownHardAllergens.length > 0
    || (hard.length > 0 && !ingredientDataAvailable)
  const reviewReasons = [
    ...(mayContainUncertain.length > 0 ? ['opaque_or_precautionary_ingredient_terms'] : []),
    ...(unknownHardAllergens.length > 0 ? ['custom_allergen_not_in_graph'] : []),
    ...(hard.length > 0 && !ingredientDataAvailable ? ['ingredient_data_unavailable'] : []),
  ]

  return {
    checked: true,
    ingredient_data_available: ingredientDataAvailable,
    needs_review: needsReview,
    review_reasons: reviewReasons,
    safe: hard.length === 0 || (ingredientDataAvailable && blocked.length === 0 && mayContainUncertain.length === 0 && unknownHardAllergens.length === 0),
    contains,
    blocked,
    matches,
    may_contain_uncertain: mayContainUncertain,
    unknown_hard_allergens: unknownHardAllergens,
  }
}

export function isRecipeSafe(recipeOrIngredients, hardAllergens = []) {
  return analyzeRecipeAllergens(recipeOrIngredients, hardAllergens).safe
}

/** Add the machine-readable safety result to a recipe without mutating it. */
export function withAllergenSummary(recipe, hardAllergens = []) {
  const allergenSummary = analyzeRecipeAllergens(recipe, hardAllergens)
  return {
    ...recipe,
    allergenSummary,
    allergenValidation: allergenSummary.safe ? 'PASSED' : 'FAILED',
  }
}

export class AllergenSafetyError extends Error {
  constructor(summary) {
    const blocked = summary.blocked.length > 0
      ? `blocked allergens: ${summary.blocked.join(', ')}`
      : 'ingredient safety could not be verified'
    super(`Recipe failed allergen safety validation (${blocked})`)
    this.name = 'AllergenSafetyError'
    this.code = 'ALLERGEN_SAFETY_BLOCK'
    this.status = 422
    this.summary = summary
  }
}

/**
 * Annotate a recipe and throw before it crosses an API boundary if it is not
 * safe for the configured hard allergens.
 */
export function enforceAllergenSafety(recipe, hardAllergens = []) {
  const annotated = withAllergenSummary(recipe, hardAllergens)
  if (!annotated.allergenSummary.safe && normalizeAllergenList(hardAllergens).length > 0) {
    throw new AllergenSafetyError(annotated.allergenSummary)
  }
  return annotated
}
