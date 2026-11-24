/**
 * Deterministic serving scaler for a saved recipe.
 *
 * Scales leading ingredient quantities only. Times, temperatures, and
 * unparsed lines ("salt to taste") are left alone and reported.
 */

const UNICODE_FRACTIONS = {
  '½': '1/2',
  '⅓': '1/3',
  '⅔': '2/3',
  '¼': '1/4',
  '¾': '3/4',
  '⅛': '1/8',
  '⅜': '3/8',
  '⅝': '5/8',
  '⅞': '7/8',
}

const FRACTION_LABELS = [
  [0.125, '1/8'],
  [0.25, '1/4'],
  [1 / 3, '1/3'],
  [0.375, '3/8'],
  [0.5, '1/2'],
  [2 / 3, '2/3'],
  [0.75, '3/4'],
  [0.875, '7/8'],
]

const LEADING_QTY = /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)(?:\s*[-–]\s*(\d+\/\d+|\d+(?:\.\d+)?))?/

export function parseServings(yieldValue) {
  if (typeof yieldValue === 'number' && Number.isFinite(yieldValue) && yieldValue > 0) {
    return yieldValue
  }
  const text = String(yieldValue ?? '').trim()
  const match = text.match(/(\d+(?:\.\d+)?)/)
  if (!match) return null
  const value = Number(match[1])
  return value > 0 ? value : null
}

export function formatYield(original, target) {
  const text = String(original ?? '').trim()
  const next = String(target)
  if (!text) return next
  if (/^\d+(?:\.\d+)?$/.test(text)) return next
  return text.replace(/\d+(?:\.\d+)?(?:\s*[-–]\s*\d+(?:\.\d+)?)?/, next)
}

function normalizeFractions(text) {
  return text.replace(/[½⅓⅔¼¾⅛⅜⅝⅞]/g, (ch) => UNICODE_FRACTIONS[ch] || ch)
}

function parseQtyToken(token) {
  const mixed = String(token).match(/^(\d+)\s+(\d+)\/(\d+)$/)
  if (mixed) {
    const denom = Number(mixed[3])
    return denom ? Number(mixed[1]) + Number(mixed[2]) / denom : null
  }
  const frac = String(token).match(/^(\d+)\/(\d+)$/)
  if (frac) {
    const denom = Number(frac[2])
    return denom ? Number(frac[1]) / denom : null
  }
  const value = Number(token)
  return Number.isFinite(value) ? value : null
}

export function formatQuantity(value) {
  if (!Number.isFinite(value) || value <= 0) return null
  const whole = Math.floor(value + 1e-9)
  const frac = value - whole
  if (frac < 0.02) return String(Math.max(whole, value < 1 ? 0 : whole) || (value < 0.02 ? null : whole))
  let best = null
  for (const [amount, label] of FRACTION_LABELS) {
    const diff = Math.abs(frac - amount)
    if (diff <= 0.02 && (!best || diff < best.diff)) best = { diff, label }
  }
  if (best) return whole ? `${whole} ${best.label}` : best.label
  const rounded = Math.round(value * 100) / 100
  return String(rounded)
}

export function scaleIngredientLine(line, factor) {
  if (typeof line !== 'string' || !Number.isFinite(factor) || factor <= 0) {
    return { line, scaled: false }
  }
  const normalized = normalizeFractions(line)
  const match = normalized.match(LEADING_QTY)
  if (!match) return { line, scaled: false }
  const start = parseQtyToken(match[1])
  if (!start) return { line, scaled: false }
  const scaledStart = formatQuantity(start * factor)
  if (!scaledStart) return { line, scaled: false }
  let replacement = scaledStart
  if (match[2]) {
    const end = parseQtyToken(match[2])
    const scaledEnd = end ? formatQuantity(end * factor) : null
    if (!scaledEnd) return { line, scaled: false }
    replacement = `${scaledStart}–${scaledEnd}`
  }
  return { line: `${replacement}${normalized.slice(match[0].length)}`, scaled: true }
}

export function scaleRecipe(recipe, targetServings) {
  const current = parseServings(recipe?.recipe_yield)
  const target = Number(targetServings)
  if (!recipe || !current || !Number.isFinite(target) || target < 1 || target > 48) {
    return { ok: false, reason: 'invalid_servings', recipe, unscaled: [] }
  }
  const factor = target / current
  const unscaled = []
  const ingredients = (recipe.ingredients || []).map((ingredient) => {
    if (typeof ingredient !== 'string') return ingredient
    const result = scaleIngredientLine(ingredient, factor)
    if (!result.scaled) unscaled.push(ingredient)
    return result.line
  })
  const next = {
    ...recipe,
    ingredients,
    recipe_yield: formatYield(recipe.recipe_yield, target),
    scaledFromServings: current,
    scaledToServings: target,
  }
  if (Math.abs(factor - 1) > 1e-9) {
    next.scaleNote = `Scaled from ${current} to ${target} servings. Times and oven temperatures are unchanged.`
  }
  return { ok: true, factor, recipe: next, unscaled }
}
