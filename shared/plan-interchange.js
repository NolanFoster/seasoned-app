/**
 * Portable meal-plan interchange helpers.
 *
 * The interchange format is intentionally dependency-free and conservative:
 * user-provided files are parsed into the same date/slot shape used by the
 * planner, while every lossy or unsafe mapping is reported for review.
 */

import { analyzeRecipeAllergens, normalizeAllergenList } from './allergen-graph.js'

export const PLAN_INTERCHANGE_VERSION = 1
export const PLAN_INTERCHANGE_SCHEMA = 'https://seasoned.app/schemas/seasoned-week.json'
export const PLAN_CSV_HEADERS = Object.freeze([
  'date',
  'slot',
  'title',
  'servings',
  'ingredients',
  'notes',
  'recipe_id',
])
export const PLAN_SLOTS = Object.freeze(['breakfast', 'lunch', 'dinner', 'snack'])

const FORMAT_NAMES = Object.freeze({
  json: 'seasoned-week.json',
  csv: 'seasoned-week.csv',
  schemaorg: 'schema.org ItemList',
  cooklang: 'Cooklang bundle',
})

export class PlanInterchangeError extends Error {
  constructor(message, code = 'INVALID_PLAN_FILE') {
    super(message)
    this.name = 'PlanInterchangeError'
    this.code = code
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function asText(value) {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim()
}

function uniqueId(prefix, index) {
  return `${prefix}-${index + 1}`
}

function normalizeDate(value) {
  const date = asText(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : ''
}

function normalizeSlot(value) {
  const slot = asText(value).toLowerCase().replace(/[\s-]+/g, '_')
  const aliases = {
    morning: 'breakfast',
    brunch: 'breakfast',
    midday: 'lunch',
    noon: 'lunch',
    evening: 'dinner',
    night: 'dinner',
    dessert: 'snack',
  }
  return PLAN_SLOTS.includes(slot) ? slot : aliases[slot] || ''
}

function normalizeServings(value) {
  if (value === '' || value == null) return null
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

function normalizeIngredient(value) {
  if (typeof value === 'string') {
    const parsed = parseIngredientBlob(value)
    return parsed[0] || null
  }
  if (!isObject(value)) return null
  const name = asText(value.name || value.ingredient || value.text || value.original)
  if (!name) return null
  return {
    name,
    quantity: asText(value.quantity ?? value.amount),
    unit: asText(value.unit),
  }
}

function normalizeIngredients(value) {
  if (Array.isArray(value)) return value.map(normalizeIngredient).filter(Boolean)
  if (typeof value === 'string') return parseIngredientBlob(value)
  return []
}

function ingredientToText(ingredient) {
  const item = normalizeIngredient(ingredient)
  if (!item) return ''
  return [item.quantity, item.unit, item.name].filter(Boolean).join(' ')
}

function parseIngredientBlob(value) {
  const text = asText(value)
  if (!text) return []
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text)
      if (Array.isArray(parsed)) return normalizeIngredients(parsed)
    } catch {
      // A human-authored string that starts with '[' is still useful below.
    }
  }
  return text
    .split(/[;\n]/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      // The quantity and unit remain best-effort; the complete original line
      // is retained as `name` when it cannot be safely split.
      const match = line.match(/^(?:(\d+(?:[./]\d+)?|\d+\s+\d+\/\d+)\s+)?(teaspoons?|tsp|tablespoons?|tbsp|cups?|oz|ounces?|lb|pounds?|g|grams?|kg|ml|liters?|l|pieces?|cloves?)\s+(.+)$/i)
      if (match) return { name: match[3].trim(), quantity: match[1] || '', unit: match[2] || '' }
      const amountOnly = line.match(/^(\d+(?:[./]\d+)?|\d+\s+\d+\/\d+)\s+(.+)$/)
      if (amountOnly) return { name: amountOnly[2].trim(), quantity: amountOnly[1], unit: '' }
      return { name: line, quantity: '', unit: '' }
    })
}

function recipePayload(recipe = {}) {
  const source = isObject(recipe) ? recipe : {}
  return {
    id: asText(source.id),
    name: asText(source.name || source.title) || 'Untitled meal',
    ingredients: normalizeIngredients(source.ingredients || source.recipeIngredient),
    instructions: Array.isArray(source.instructions)
      ? source.instructions
      : Array.isArray(source.recipeInstructions) ? source.recipeInstructions : [],
    servings: normalizeServings(source.servings ?? source.recipeYield),
    notes: asText(source.notes || source.description),
    source_url: asText(source.source_url || source.sourceUrl || source.url),
  }
}

function report() {
  return {
    mapped: [],
    partial: [],
    skipped: [],
    warnings: [],
    blocked: [],
    format: null,
    version: PLAN_INTERCHANGE_VERSION,
    constraintValidation: {
      hardAllergens: [],
      canCommit: true,
      blocked: [],
      needsReview: [],
    },
  }
}

function addMapping(reportState, status, index, details = {}) {
  reportState[status].push({ sourceIndex: index, ...details })
}

function normalizeEntry(raw, index, reportState, prefix = 'imported') {
  const entry = isObject(raw) ? raw : {}
  const nested = isObject(entry.recipe) ? entry.recipe : {}
  const source = { ...nested, ...entry }
  const date = normalizeDate(source.date || source.dateString || source.day || source.mealDate)
  const originalSlot = asText(source.slot || source.mealType || source.meal || source.category)
  const slot = normalizeSlot(originalSlot)
  const title = asText(source.title || source.name || nested.title || nested.name)

  if (!date) {
    addMapping(reportState, 'skipped', index, { reason: 'missing_or_invalid_date', title })
    return null
  }
  if (!title) {
    addMapping(reportState, 'skipped', index, { reason: 'missing_title', date, slot: slot || originalSlot })
    return null
  }

  let resolvedSlot = slot
  const partialReasons = []
  if (!resolvedSlot) {
    // A missing slot is common in pasted exports. Keep the meal rather than
    // dropping it, but make the lossy default explicit in the review report.
    resolvedSlot = 'dinner'
    partialReasons.push('slot_defaulted_to_dinner')
  }
  if (originalSlot && !slot) partialReasons.push('unknown_slot_defaulted_to_dinner')

  const payload = recipePayload({
    ...nested,
    ...entry,
    name: title,
    ingredients: source.ingredients || source.recipeIngredient,
    instructions: source.instructions || source.recipeInstructions,
    servings: source.servings ?? source.recipeYield,
    notes: source.notes || source.description,
    source_url: source.source_url || source.sourceUrl || source.url,
  })
  const id = payload.id || asText(source.recipeId || source.recipe_id) || uniqueId(prefix, index)
  const recipe = {
    ...payload,
    id,
    name: title,
    ...(normalizeServings(source.servings ?? source.recipeYield) != null
      ? { servings: normalizeServings(source.servings ?? source.recipeYield) }
      : {}),
  }

  const details = { date, slot: resolvedSlot, title, id }
  if (partialReasons.length) addMapping(reportState, 'partial', index, { ...details, reasons: partialReasons })
  else addMapping(reportState, 'mapped', index, details)
  return { date, slot: resolvedSlot, recipe }
}

function emptyMealPlan() {
  return {}
}

function addToMealPlan(mealPlan, normalized) {
  if (!normalized) return
  const day = mealPlan[normalized.date] || {
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
  }
  day[normalized.slot] = [...(Array.isArray(day[normalized.slot]) ? day[normalized.slot] : []), normalized.recipe]
  mealPlan[normalized.date] = day
}

function normalizeGroceryItems(value) {
  const items = Array.isArray(value) ? value : []
  return items
    .filter((item) => isObject(item) && asText(item.name))
    .map((item, index) => ({
      id: asText(item.id) || uniqueId('grocery', index),
      name: asText(item.name),
      quantity: asText(item.quantity),
      unit: asText(item.unit),
      category: asText(item.category) || 'Other',
      completed: item.completed === true,
      notes: asText(item.notes),
      isCustom: item.isCustom === true,
      source: asText(item.source) || 'imported',
    }))
}

function canonicalEntriesFromPlan(mealPlan = {}, upNext = []) {
  const entries = []
  Object.entries(isObject(mealPlan) ? mealPlan : {}).forEach(([date, day]) => {
    if (!isObject(day)) return
    PLAN_SLOTS.forEach((slot) => {
      const recipes = Array.isArray(day[slot]) ? day[slot] : []
      recipes.forEach((recipe) => {
        const payload = recipePayload(recipe)
        entries.push({
          id: payload.id || uniqueId('meal', entries.length),
          recipeId: payload.id || undefined,
          date,
          slot,
          title: payload.name,
          servings: payload.servings,
          ingredients: payload.ingredients,
          instructions: payload.instructions,
          notes: payload.notes,
          source_url: payload.source_url,
        })
      })
    })
  })
  const staged = (Array.isArray(upNext) ? upNext : []).map((recipe, index) => {
    const payload = recipePayload(recipe)
    return {
      id: payload.id || uniqueId('staged', index),
      recipeId: payload.id || undefined,
      title: payload.name,
      servings: payload.servings,
      ingredients: payload.ingredients,
      instructions: payload.instructions,
      notes: payload.notes,
      source_url: payload.source_url,
    }
  })
  return { entries, staged }
}

/**
 * Serialize the planner state into the canonical JSON interchange object.
 */
export function serializeSeasonedWeek({
  mealPlan = {},
  upNext = [],
  groceryList = [],
  weekStart = '',
  exportedAt = new Date().toISOString(),
} = {}) {
  const { entries, staged } = canonicalEntriesFromPlan(mealPlan, upNext)
  return {
    schema: PLAN_INTERCHANGE_SCHEMA,
    version: PLAN_INTERCHANGE_VERSION,
    exportedAt,
    weekStart: normalizeDate(weekStart) || undefined,
    source: { app: 'Seasoned', format: 'seasoned-week.json' },
    meals: entries,
    staged,
    grocery: { items: normalizeGroceryItems(groceryList) },
  }
}

export function serializeSeasonedWeekJson(state, space = 2) {
  return JSON.stringify(serializeSeasonedWeek(state), null, space)
}

function quoteCsv(value) {
  const text = value == null ? '' : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function csvRow(values) {
  return values.map(quoteCsv).join(',')
}

/** Serialize the documented portable CSV template. */
export function serializeSeasonedWeekCsv(state = {}) {
  const canonical = serializeSeasonedWeek(state)
  const rows = [csvRow(PLAN_CSV_HEADERS)]
  canonical.meals.forEach((meal) => rows.push(csvRow([
    meal.date,
    meal.slot,
    meal.title,
    meal.servings ?? '',
    meal.ingredients.map(ingredientToText).join('; '),
    meal.notes,
    meal.recipeId || meal.id,
  ])))
  canonical.staged.forEach((meal) => rows.push(csvRow([
    '',
    'up_next',
    meal.title,
    meal.servings ?? '',
    meal.ingredients.map(ingredientToText).join('; '),
    meal.notes,
    meal.recipeId || meal.id,
  ])))
  return `${rows.join('\n')}\n`
}

export function serializeSchemaOrgWeek(state = {}) {
  const canonical = serializeSeasonedWeek(state)
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Seasoned meal week',
    dateCreated: canonical.exportedAt,
    itemListElement: canonical.meals.map((meal, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'Recipe',
        '@id': meal.recipeId || meal.id,
        name: meal.title,
        recipeIngredient: meal.ingredients.map(ingredientToText),
        recipeYield: meal.servings == null ? undefined : String(meal.servings),
        description: meal.notes || undefined,
        date: meal.date,
        mealType: meal.slot,
        url: meal.source_url || undefined,
      },
    })),
  }
}

export function serializeSchemaOrgWeekJson(state, space = 2) {
  return JSON.stringify(serializeSchemaOrgWeek(state), null, space)
}

/**
 * A small, documented Cooklang-compatible bundle. Metadata directives are
 * deliberately namespaced and ignored by Cooklang readers that do not know
 * about week scheduling.
 */
export function serializeCooklangWeek(state = {}) {
  const canonical = serializeSeasonedWeek(state)
  const blocks = canonical.meals.map((meal) => [
    `>> date: ${meal.date}`,
    `>> slot: ${meal.slot}`,
    `>> servings: ${meal.servings ?? ''}`,
    `# ${meal.title}`,
    ...meal.ingredients.map((ingredient) => `- ${ingredientToText(ingredient)}`),
    meal.notes ? `> ${meal.notes}` : '',
  ].filter(Boolean).join('\n'))
  return `# Seasoned week export v${PLAN_INTERCHANGE_VERSION}\n\n${blocks.join('\n\n---\n\n')}\n`
}

function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"'
        index += 1
      } else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"') quoted = true
    else if (char === ',') {
      row.push(cell)
      cell = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      row.push(cell)
      if (row.some((part) => part.trim())) rows.push(row)
      row = []
      cell = ''
    } else cell += char
  }
  if (cell || row.length) {
    row.push(cell)
    if (row.some((part) => part.trim())) rows.push(row)
  }
  return rows
}

function normalizeHeader(value) {
  return asText(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function parseCsvPlan(text, reportState) {
  const rows = parseCsv(text)
  if (rows.length < 2) throw new PlanInterchangeError('CSV needs a header row and at least one meal row', 'EMPTY_CSV')
  const headers = rows[0].map(normalizeHeader)
  const known = new Set(['date', 'day', 'slot', 'meal_type', 'meal', 'title', 'name', 'recipe', 'servings', 'ingredients', 'ingredient', 'notes', 'recipe_id', 'id'])
  headers.forEach((header) => {
    if (header && !known.has(header)) reportState.warnings.push(`Ignored CSV column: ${header}`)
  })
  return rows.slice(1).map((values, index) => {
    const row = Object.fromEntries(headers.map((header, column) => [header, values[column] || '']))
    const staged = normalizeSlot(row.slot || row.meal_type || row.meal) === '' && asText(row.slot).toLowerCase() === 'up_next'
    return {
      ...row,
      date: staged ? '' : row.date || row.day,
      slot: staged ? '' : row.slot || row.meal_type || row.meal,
      name: row.title || row.name || row.recipe,
      id: row.recipe_id || row.id,
      ingredients: row.ingredients || row.ingredient,
      _staged: staged,
      _index: index,
    }
  })
}

function parseCooklangPlan(text, reportState) {
  const blocks = text
    .replace(/^# Seasoned week export[^\n]*\n?/i, '')
    .split(/\n\s*---\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
  return blocks.map((block, index) => {
    const lines = block.split(/\r?\n/)
    const metadata = {}
    const ingredients = []
    let title = ''
    let notes = ''
    lines.forEach((line) => {
      const directive = line.match(/^>>\s*([^:]+):\s*(.*)$/)
      if (directive) metadata[normalizeHeader(directive[1])] = directive[2].trim()
      else if (line.startsWith('# ')) title = line.slice(2).trim()
      else if (line.startsWith('- ')) ingredients.push(line.slice(2).trim())
      else if (line.startsWith('> ')) notes = line.slice(2).trim()
    })
    return {
      date: metadata.date,
      slot: metadata.slot,
      name: title,
      servings: metadata.servings,
      ingredients,
      notes,
      _index: index,
    }
  })
}

function parseSchemaOrgPlan(input, reportState) {
  const elements = Array.isArray(input?.itemListElement) ? input.itemListElement : []
  return elements.map((element, index) => {
    const item = isObject(element?.item) ? element.item : isObject(element) ? element : {}
    const properties = Array.isArray(item.additionalProperty) ? item.additionalProperty : []
    const extra = Object.fromEntries(properties.map((property) => [
      asText(property.name), asText(property.value),
    ]))
    return {
      ...item,
      date: item.date || item.mealDate || extra.date,
      slot: item.mealType || item.slot || extra.slot,
      name: item.name || item.headline,
      ingredients: item.recipeIngredient || item.ingredients,
      servings: item.recipeYield,
      id: item['@id'] || item.identifier,
      _index: index,
    }
  })
}

function detectFormat(value) {
  if (isObject(value)) {
    if (value['@type'] === 'ItemList' || Array.isArray(value.itemListElement)) return 'schemaorg'
    return 'json'
  }
  const text = asText(value)
  if (!text) throw new PlanInterchangeError('Choose a file or paste a week export first', 'EMPTY_INPUT')
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text)
      if (isObject(parsed) && (parsed['@type'] === 'ItemList' || Array.isArray(parsed.itemListElement))) return 'schemaorg'
    } catch {
      // Keep malformed JSON classified as JSON so the parser can explain it.
    }
    return 'json'
  }
  if (/^#\s*Seasoned week export/im.test(text) || /^(?:>>\s*date:|>>\s*slot:)/im.test(text)) return 'cooklang'
  return 'csv'
}

function parseJsonPlan(input, reportState) {
  let value = input
  if (typeof input === 'string') {
    try {
      value = JSON.parse(input)
    } catch {
      throw new PlanInterchangeError('The JSON file could not be parsed', 'INVALID_JSON')
    }
  }
  if (Array.isArray(value)) return value
  if (!isObject(value)) throw new PlanInterchangeError('Expected a seasoned week JSON object', 'INVALID_JSON_SHAPE')
  if (value.version != null && Number(value.version) > PLAN_INTERCHANGE_VERSION) {
    throw new PlanInterchangeError(`This export uses version ${value.version}; this app supports version ${PLAN_INTERCHANGE_VERSION}`, 'UNSUPPORTED_VERSION')
  }
  if (value.schema && value.schema !== PLAN_INTERCHANGE_SCHEMA) reportState.warnings.push(`Unrecognized schema: ${value.schema}`)
  const meals = Array.isArray(value.meals)
    ? value.meals
    : Array.isArray(value.entries) ? value.entries
      : Array.isArray(value.week?.meals) ? value.week.meals : []
  return meals.map((entry, index) => ({ ...entry, _index: index }))
}

function collectStaged(input, format) {
  if (format !== 'json' || !isObject(input)) return []
  return Array.isArray(input.staged) ? input.staged : Array.isArray(input.upNext) ? input.upNext : []
}

/**
 * Parse JSON, CSV, schema.org Recipe ItemList, or the documented Cooklang
 * bundle. The result is safe to preview: callers must check report.canCommit
 * before replacing a user's existing plan.
 */
export function parsePlanInterchange(input, { format = 'auto', hardAllergens = [] } = {}) {
  const reportState = report()
  const detected = format === 'auto' ? detectFormat(input) : format
  if (!FORMAT_NAMES[detected]) throw new PlanInterchangeError(`Unsupported plan format: ${detected}`, 'UNSUPPORTED_FORMAT')
  reportState.format = detected

  let parsedInput = input
  let entries
  if (detected === 'json') {
    entries = parseJsonPlan(input, reportState)
    if (typeof input === 'string') {
      try {
        parsedInput = JSON.parse(input)
      } catch {
        // parseJsonPlan already raised the user-facing error.
      }
    }
  }
  else if (detected === 'csv') entries = parseCsvPlan(asText(input), reportState)
  else if (detected === 'cooklang') entries = parseCooklangPlan(asText(input), reportState)
  else entries = parseSchemaOrgPlan(isObject(input) ? input : JSON.parse(asText(input)), reportState)

  const mealPlan = emptyMealPlan()
  const upNext = []
  entries.forEach((entry, index) => {
    const sourceIndex = Number.isInteger(entry?._index) ? entry._index : index
    if (entry?._staged || asText(entry?.slot).toLowerCase() === 'up_next') {
      const stagedEntry = normalizeEntry({ ...entry, date: '2000-01-01' }, sourceIndex, reportState, 'staged')
      // Staged rows have no date in the output. They still use the same recipe
      // normalizer so title/ingredient safety checks remain consistent.
      if (stagedEntry) upNext.push(stagedEntry.recipe)
      const mapped = reportState.mapped.at(-1) || reportState.partial.at(-1)
      if (mapped) {
        const list = reportState.mapped.includes(mapped) ? reportState.mapped : reportState.partial
        const position = list.indexOf(mapped)
        if (position >= 0) list[position] = { ...mapped, staged: true }
      }
      return
    }
    addToMealPlan(mealPlan, normalizeEntry(entry, sourceIndex, reportState))
  })

  // Keep a JSON export's staged recipes even though they are not date slots.
  collectStaged(parsedInput, detected).forEach((entry, index) => {
    const stagedEntry = normalizeEntry({ ...entry, date: '2000-01-01' }, index, reportState, 'staged')
    if (stagedEntry) upNext.push(stagedEntry.recipe)
  })

  const grocerySidecarPresent = detected === 'json' && isObject(parsedInput)
    && ('grocery' in parsedInput || 'groceryList' in parsedInput)
  const grocery = grocerySidecarPresent
    ? parsedInput.grocery?.items || parsedInput.groceryList || []
    : []
  const groceryList = normalizeGroceryItems(grocery)
  const normalizedHardAllergens = normalizeAllergenList(hardAllergens)
  const blocked = []
  const needsReview = []
  const allRecipes = [
    ...Object.entries(mealPlan).flatMap(([date, day]) => PLAN_SLOTS.flatMap((slot) =>
      (day[slot] || []).map((recipe) => ({ date, slot, recipe })))),
    ...upNext.map((recipe) => ({ date: null, slot: 'up_next', recipe })),
  ]
  allRecipes.forEach(({ date, slot, recipe }) => {
    if (normalizedHardAllergens.length === 0) return
    const analysis = analyzeRecipeAllergens(recipe, normalizedHardAllergens)
    if (analysis.needs_review) needsReview.push({ date, slot, title: recipe.name, reasons: analysis.review_reasons })
    if (!analysis.safe) blocked.push({ date, slot, title: recipe.name, allergens: analysis.blocked, reasons: analysis.review_reasons })
  })
  reportState.blocked = blocked
  reportState.constraintValidation = {
    hardAllergens: normalizedHardAllergens,
    canCommit: blocked.length === 0,
    blocked,
    needsReview,
  }
  if (blocked.length) reportState.warnings.push('Hard-allergen conflicts must be resolved before this week can be imported.')
  if (needsReview.length) reportState.warnings.push('Some imported ingredient lines need allergen review before cooking.')
  reportState.canCommit = blocked.length === 0
  reportState.totalRows = entries.length
  reportState.mappedCount = reportState.mapped.length
  reportState.partialCount = reportState.partial.length
  reportState.skippedCount = reportState.skipped.length

  return { mealPlan, upNext, groceryList, groceryImported: grocerySidecarPresent, report: reportState }
}

export function formatPlanInterchangeReport(reportState = {}) {
  const reportValue = reportState
  return [
    `${FORMAT_NAMES[reportValue.format] || 'week file'}: ${reportValue.mappedCount || 0} mapped, ${reportValue.partialCount || 0} partial, ${reportValue.skippedCount || 0} skipped`,
    reportValue.blocked?.length ? `${reportValue.blocked.length} hard-allergen conflict${reportValue.blocked.length === 1 ? '' : 's'} — import blocked` : '',
    reportValue.constraintValidation?.needsReview?.length ? `${reportValue.constraintValidation.needsReview.length} row${reportValue.constraintValidation.needsReview.length === 1 ? '' : 's'} need ingredient review` : '',
  ].filter(Boolean).join(' · ')
}
