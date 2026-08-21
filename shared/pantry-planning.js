/*
 * Deterministic pantry/planner helpers shared by the browser and workers.
 *
 * Pantry matching is deliberately conservative: a match must share a
 * meaningful ingredient token (or a known alias), and expired inventory never
 * satisfies a grocery line. This keeps a fuzzy convenience feature from
 * silently hiding an item the cook still needs to buy.
 */

const UNIT_ALIASES = {
  bag: 'bag', bags: 'bag', bottle: 'bottle', bottles: 'bottle', box: 'box', boxes: 'box',
  can: 'can', cans: 'can', cup: 'cup', cups: 'cup', c: 'cup',
  gram: 'g', grams: 'g', g: 'g', kilogram: 'kg', kilograms: 'kg', kg: 'kg',
  pound: 'lb', pounds: 'lb', lb: 'lb', lbs: 'lb', ounce: 'oz', ounces: 'oz', oz: 'oz',
  tablespoon: 'tbsp', tablespoons: 'tbsp', tbsp: 'tbsp', teaspoon: 'tsp', teaspoons: 'tsp', tsp: 'tsp',
  milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml', ml: 'ml',
  liter: 'l', liters: 'l', litre: 'l', litres: 'l', l: 'l',
  pinch: 'pinch', pinches: 'pinch', bunch: 'bunch', bunches: 'bunch',
  clove: 'clove', cloves: 'clove', slice: 'slice', slices: 'slice',
  piece: 'piece', pieces: 'piece', sprig: 'sprig', sprigs: 'sprig',
}

const UNIT_TOKENS = new Set(Object.keys(UNIT_ALIASES))
const NUMBER_PATTERN = '(?:\\d+\\s+\\d+\\s*\\/\\s*\\d+|\\d+\\s*\\/\\s*\\d+|\\d+(?:\\.\\d+)?|\\.\\d+|[¼½¾⅓⅔⅛⅜⅝⅞])'
const LEADING_AMOUNT_RE = new RegExp(`^\\s*(${NUMBER_PATTERN})(?:\\s*[-–]\\s*${NUMBER_PATTERN})?\\s*`, 'i')

const ALIASES = new Map([
  ['scallion', 'green onion'], ['scallions', 'green onion'], ['green onions', 'green onion'],
  ['spring onion', 'green onion'], ['spring onions', 'green onion'],
  ['garbanzo bean', 'chickpea'], ['garbanzo beans', 'chickpea'], ['chickpeas', 'chickpea'],
  ['chiles', 'chili'], ['chile', 'chili'], ['chilies', 'chili'], ['chilli', 'chili'], ['chillies', 'chili'],
  ['tomatoes', 'tomato'], ['potatoes', 'potato'], ['onions', 'onion'], ['carrots', 'carrot'],
  ['lemons', 'lemon'], ['limes', 'lime'], ['apples', 'apple'], ['bananas', 'banana'],
  ['eggs', 'egg'], ['mushrooms', 'mushroom'], ['berries', 'berry'], ['strawberries', 'strawberry'],
])

const STOP_WORDS = new Set(['a', 'an', 'and', 'of', 'or', 'the', 'to', 'for', 'with', 'divided', 'as', 'needed'])

function asText(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return String(value.name || value.ingredient || value.text || '')
  return String(value)
}

function parseNumber(value) {
  const text = String(value).trim()
  const unicode = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875 }
  if (unicode[text] !== undefined) return unicode[text]
  const mixed = text.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/)
  if (mixed && Number(mixed[3]) !== 0) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3])
  const fraction = text.match(/^(\d+)\s*\/\s*(\d+)$/)
  if (fraction && Number(fraction[2]) !== 0) return Number(fraction[1]) / Number(fraction[2])
  const number = Number(text)
  return Number.isFinite(number) ? number : null
}

function singularizeToken(token) {
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1)
  return token
}

function aliasPhrase(value) {
  let result = value
  for (const [from, to] of ALIASES) {
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    result = result.replace(new RegExp(`\\b${escaped}\\b`, 'g'), to)
  }
  return result
}

/** Return a stable, quantity-free ingredient name for fuzzy matching. */
export function normalizeIngredientName(value) {
  let text = asText(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[()\[\]{},;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  text = text.replace(LEADING_AMOUNT_RE, '')
  const words = text.split(/\s+/)
  while (words.length && UNIT_TOKENS.has(words[0])) words.shift()
  text = aliasPhrase(words.join(' ')).replace(/\s+/g, ' ').trim()
  return text.split(' ').map(singularizeToken).filter((token) => !STOP_WORDS.has(token)).join(' ')
}

/** Parse a grocery/pantry quantity while preserving the unit for safe comparison. */
export function parsePantryQuantity(value, unit = '') {
  if (value === null || value === undefined || value === '') return { amount: null, unit: null }
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? { amount: value, unit: UNIT_ALIASES[String(unit).toLowerCase()] || null } : { amount: null, unit: null }
  const text = String(value).trim()
  const match = text.match(new RegExp(`^(${NUMBER_PATTERN})\\s*([a-zA-Z]+)?`, 'i'))
  if (!match) return { amount: null, unit: null }
  const parsed = parseNumber(match[1])
  if (parsed === null || parsed < 0) return { amount: null, unit: null }
  const parsedUnit = (match[2] || unit || '').toLowerCase()
  return { amount: parsed, unit: UNIT_ALIASES[parsedUnit] || null }
}

/** Parse an ingredient line into a matchable name and optional amount. */
export function parsePantryIngredient(value) {
  if (value && typeof value === 'object') {
    const rawName = value.name || value.ingredient || value.text || ''
    const embedded = parsePantryIngredient(rawName)
    const hasQuantity = value.quantity !== undefined || value.amount !== undefined || value.unit !== undefined
    if (!hasQuantity) return embedded
    const quantity = parsePantryQuantity(value.quantity ?? value.amount, value.unit || '')
    return {
      raw: asText(value).trim(),
      name: embedded.name,
      amount: quantity.amount ?? embedded.amount,
      unit: quantity.unit || embedded.unit,
    }
  }
  const raw = asText(value).trim()
  const match = raw.match(LEADING_AMOUNT_RE)
  const amount = match ? parsePantryQuantity(match[1]) : { amount: null, unit: null }
  const rest = match ? raw.slice(match[0].length) : raw
  const unitMatch = rest.match(/^([a-zA-Z]+)\b\s*/)
  const unit = unitMatch && UNIT_TOKENS.has(unitMatch[1].toLowerCase())
    ? UNIT_ALIASES[unitMatch[1].toLowerCase()]
    : null
  const name = unitMatch && unit ? rest.slice(unitMatch[0].length) : rest
  return { raw, name: normalizeIngredientName(name), amount: amount.amount, unit: unit || amount.unit }
}

function tokenSet(name) {
  return new Set(normalizeIngredientName(name).split(' ').filter((token) => token.length > 1))
}

/**
 * Return true when two ingredient names are safely equivalent enough for a
 * grocery/pantry convenience match.
 */
export function pantryNamesMatch(left, right) {
  const leftName = normalizeIngredientName(left)
  const rightName = normalizeIngredientName(right)
  if (!leftName || !rightName) return false
  if (leftName === rightName) return true
  const leftTokens = tokenSet(leftName)
  const rightTokens = tokenSet(rightName)
  if (!leftTokens.size || !rightTokens.size) return false
  const [smaller, larger] = leftTokens.size <= rightTokens.size
    ? [leftTokens, rightTokens]
    : [rightTokens, leftTokens]
  const overlap = [...smaller].filter((token) => larger.has(token)).length
  return overlap === smaller.size && (smaller.size > 1 || [...smaller][0].length >= 3)
}

function isExpired(expiresOn, now = new Date()) {
  if (!expiresOn) return false
  const expiry = new Date(`${String(expiresOn).slice(0, 10)}T23:59:59.999Z`)
  return !Number.isNaN(expiry.getTime()) && expiry.getTime() < now.getTime()
}

/** Return whether a pantry record is past its expiry date. */
export function isPantryItemExpired(item, { now = new Date() } = {}) {
  return isExpired(item?.expiresOn || item?.expires_on, now)
}

function compatibleUnits(left, right) {
  if (!left && !right) return true
  if (!left || !right) return false
  if (left === right) return true
  const mass = new Set(['g', 'kg', 'oz', 'lb'])
  const volume = new Set(['ml', 'l', 'tsp', 'tbsp', 'cup'])
  return (mass.has(left) && mass.has(right)) || (volume.has(left) && volume.has(right))
}

function convertAmount(amount, from, to) {
  if (amount === null || !from || !to || from === to) return amount
  const conversions = {
    g: { kg: 0.001, oz: 0.035273962, lb: 0.00220462 },
    kg: { g: 1000, oz: 35.273962, lb: 2.20462 },
    oz: { g: 28.3495, kg: 0.0283495, lb: 0.0625 },
    lb: { g: 453.592, kg: 0.453592, oz: 16 },
    ml: { l: 0.001, tsp: 0.202884, tbsp: 0.067628, cup: 0.00422675 },
    l: { ml: 1000, tsp: 202.884, tbsp: 67.628, cup: 4.22675 },
    tsp: { tbsp: 1 / 3, cup: 1 / 48, ml: 4.92892, l: 0.00492892 },
    tbsp: { tsp: 3, cup: 1 / 16, ml: 14.7868, l: 0.0147868 },
    cup: { tsp: 48, tbsp: 16, ml: 236.588, l: 0.236588 },
  }
  const multiplier = conversions[from]?.[to]
  return multiplier ? amount * multiplier : null
}

function itemName(item) {
  return item?.name || item?.ingredient || item?.text || ''
}

function pantryMatchesFor(groceryItem, pantryItems, now) {
  const ingredient = parsePantryIngredient(groceryItem?.name || groceryItem?.ingredient || groceryItem)
  return (Array.isArray(pantryItems) ? pantryItems : []).filter((item) => {
    return item && !isExpired(item.expiresOn || item.expires_on, now) && pantryNamesMatch(ingredient.name, itemName(item))
  }).map((item) => ({ item, ingredient }))
}

function formatAmount(amount) {
  if (amount === null || amount === undefined) return ''
  if (Math.abs(amount - Math.round(amount)) < 0.0001) return String(Math.round(amount))
  return String(Math.round(amount * 100) / 100)
}

/** Find the best non-expired pantry match for an ingredient. */
export function findPantryMatch(groceryItem, pantryItems, { now = new Date() } = {}) {
  const matches = pantryMatchesFor(groceryItem, pantryItems, now)
  if (!matches.length) return null
  const wanted = matches[0].ingredient
  return matches.sort((a, b) => {
    const aName = normalizeIngredientName(itemName(a.item))
    const bName = normalizeIngredientName(itemName(b.item))
    return Math.abs(aName.length - wanted.name.length) - Math.abs(bName.length - wanted.name.length)
  })[0].item
}

/**
 * Mark generated grocery lines as buy, owned, or optional_staple. Quantities
 * are reduced only when both sides provide compatible numeric units. The
 * original requested quantity remains available for transparency.
 */
export function classifyGroceryItems(items, pantryItems, { now = new Date() } = {}) {
  return (Array.isArray(items) ? items : []).map((item) => {
    if (!item || typeof item !== 'object') return item
    const matches = pantryMatchesFor(item, pantryItems, now)
    const groceryQuantity = parsePantryQuantity(item.quantity, item.unit)
    let available = 0
    let hasMeasuredInventory = false
    let hasUnknownInventory = false
    let hasIncompatibleUnit = false
    const pantryItemIds = []
    for (const { item: pantryItem } of matches) {
      pantryItemIds.push(pantryItem.id)
      const pantryQuantity = parsePantryQuantity(pantryItem.quantity, pantryItem.unit)
      if (pantryQuantity.amount === null) {
        hasUnknownInventory = true
        continue
      }
      if (groceryQuantity.amount !== null && !compatibleUnits(groceryQuantity.unit, pantryQuantity.unit)) {
        hasIncompatibleUnit = true
        continue
      }
      const converted = groceryQuantity.unit && pantryQuantity.unit
        ? convertAmount(pantryQuantity.amount, pantryQuantity.unit, groceryQuantity.unit)
        : pantryQuantity.amount
      if (converted !== null) {
        hasMeasuredInventory = true
        available += converted
      }
    }

    let inventoryStatus = 'buy'
    let missingQuantity = null
    if (matches.length && (hasUnknownInventory || groceryQuantity.amount === null)) {
      inventoryStatus = 'owned'
    } else if (matches.length && groceryQuantity.amount !== null && hasMeasuredInventory) {
      if (available + 0.0001 >= groceryQuantity.amount) inventoryStatus = 'owned'
      else {
        missingQuantity = groceryQuantity.amount - available
        inventoryStatus = 'buy'
      }
    } else if (matches.length && !hasIncompatibleUnit) {
      inventoryStatus = 'owned'
    } else if (item.optionalStaple || item.isStaple || /pantry|staple/i.test(item.category || '')) {
      inventoryStatus = 'optional_staple'
    }

    const next = {
      ...item,
      inventoryStatus,
      pantryItemIds,
      requestedQuantity: item.requestedQuantity || item.quantity || '',
    }
    if (missingQuantity !== null) {
      next.pantryQuantity = `${formatAmount(available)}${groceryQuantity.unit ? ` ${groceryQuantity.unit}` : ''}`
      next.missingQuantity = `${formatAmount(missingQuantity)}${groceryQuantity.unit ? ` ${groceryQuantity.unit}` : ''}`
      next.quantity = next.missingQuantity
    } else if (matches.length) {
      next.pantryQuantity = item.quantity || 'On hand'
    }
    return next
  })
}

/** Return pantry items that expire today or within the next `days` days. */
export function getExpiringPantryItems(items, days = 7, { now = new Date() } = {}) {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + Math.max(0, days))
  end.setHours(23, 59, 59, 999)
  return (Array.isArray(items) ? items : [])
    .filter((item) => {
      const value = item?.expiresOn || item?.expires_on
      if (!value) return false
      const expiry = new Date(`${String(value).slice(0, 10)}T23:59:59.999Z`)
      return !Number.isNaN(expiry.getTime()) && expiry >= start && expiry <= end
    })
    .sort((a, b) => String(a.expiresOn || a.expires_on).localeCompare(String(b.expiresOn || b.expires_on)))
}

/**
 * Build explicit, user-confirmable pantry operations for a completed recipe.
 * Unknown quantities are represented as remove operations because the user
 * has opted into consuming the item and cannot be given a safe numeric delta.
 */
export function buildPantryDepletionPlan(recipe, pantryItems, { now = new Date() } = {}) {
  const requirements = new Map()
  const recipeIngredients = Array.isArray(recipe?.ingredients) ? recipe.ingredients : []
  for (const ingredient of recipeIngredients) {
    const parsed = parsePantryIngredient(ingredient)
    if (!parsed.name) continue

    const existing = requirements.get(parsed.name)
    if (!existing) {
      requirements.set(parsed.name, { ...parsed })
      continue
    }
    // Combine repeated recipe lines so an ingredient is never deducted twice
    // from the same pantry item. If quantities cannot be combined safely, keep
    // the requirement unmeasured and ask the user to confirm removing one item.
    if (existing.amount === null || parsed.amount === null || !compatibleUnits(existing.unit, parsed.unit)) {
      existing.amount = null
      existing.unit = null
      continue
    }
    const converted = existing.unit && parsed.unit
      ? convertAmount(parsed.amount, parsed.unit, existing.unit)
      : parsed.amount
    if (converted === null) {
      existing.amount = null
      existing.unit = null
    } else {
      existing.amount += converted
    }
  }

  const operations = []
  for (const requirement of requirements.values()) {
    if (requirement.amount !== null && requirement.amount <= 0) continue
    const matches = pantryMatchesFor({ name: requirement.name }, pantryItems, now)
      .filter(({ item }) => parsePantryQuantity(item.quantity, item.unit).amount !== 0)
      .sort((a, b) => {
        const aExpiry = a.item.expiresOn || a.item.expires_on
        const bExpiry = b.item.expiresOn || b.item.expires_on
        if (!aExpiry && !bExpiry) return 0
        if (!aExpiry) return 1
        if (!bExpiry) return -1
        return String(aExpiry).localeCompare(String(bExpiry))
      })
    if (!matches.length) continue

    // A recipe line without a measurable amount ("salt to taste", for
    // example) cannot produce a numeric delta. Removing one matched item is
    // deliberately explicit in the review UI rather than silently mutating it.
    if (requirement.amount === null) {
      const match = matches[0].item
      operations.push({ pantryItemId: match.id, ingredient: requirement.name, action: 'remove', amount: null, unit: null })
      continue
    }

    let remainingNeed = requirement.amount
    let appliedMeasuredOperation = false
    for (const { item } of matches) {
      if (remainingNeed <= 0.0001) break
      const pantryQuantity = parsePantryQuantity(item.quantity, item.unit)
      if (pantryQuantity.amount === null || !compatibleUnits(requirement.unit, pantryQuantity.unit)) continue
      const neededInPantryUnit = requirement.unit && pantryQuantity.unit
        ? convertAmount(remainingNeed, requirement.unit, pantryQuantity.unit)
        : remainingNeed
      if (neededInPantryUnit === null) continue

      const decrement = Math.min(pantryQuantity.amount, neededInPantryUnit)
      const remainingQuantity = pantryQuantity.amount - decrement
      remainingNeed -= requirement.unit && pantryQuantity.unit
        ? convertAmount(decrement, pantryQuantity.unit, requirement.unit)
        : decrement
      appliedMeasuredOperation = true
      operations.push({
        pantryItemId: item.id,
        ingredient: requirement.name,
        action: remainingQuantity > 0.0001 ? 'update' : 'remove',
        amount: Math.round(decrement * 10000) / 10000,
        unit: pantryQuantity.unit || requirement.unit || null,
        remainingQuantity: remainingQuantity > 0.0001 ? Math.round(remainingQuantity * 10000) / 10000 : null,
      })
    }

    // Preserve the previous conservative behavior when an item matches by
    // name but has no usable quantity/unit: let the user approve removing it.
    if (!appliedMeasuredOperation && matches.length > 0) {
      const match = matches[0].item
      operations.push({ pantryItemId: match.id, ingredient: requirement.name, action: 'remove', amount: null, unit: null })
    }
  }
  return operations
}

export function formatPantryQuantity(value, unit = '') {
  const parsed = parsePantryQuantity(value, unit)
  if (parsed.amount === null) return String(value || '').trim()
  return `${formatAmount(parsed.amount)}${parsed.unit ? ` ${parsed.unit}` : ''}`
}
