/**
 * Canonical recipe process graph intermediate representation.
 *
 * A recipe process graph is the instance-level source of truth for cooking
 * procedure. It keeps the legacy ingredient/instruction arrays useful for
 * clients that have not migrated yet, while giving downstream consumers
 * explicit ingredients, tools, actions, intermediate states, and dependencies.
 *
 * The module is deliberately dependency-light and deterministic. It can be
 * used by Workers, the browser, and evaluation scripts without a graph or
 * schema package. Unknown node attributes are retained so sibling features can
 * add data without changing the v1 contract.
 */

import { buildAllergenGraph } from './allergen-graph.js'

export const RECIPE_PROCESS_GRAPH_SCHEMA_VERSION = '1.0'
export const RECIPE_PROCESS_GRAPH_FLAG = 'recipe_process_graph_v1'

export const PROCESS_GRAPH_NODE_TYPES = Object.freeze([
  'ingredient',
  'tool',
  'action',
  'intermediate',
  'timer',
])

export const PROCESS_GRAPH_EDGE_TYPES = Object.freeze([
  'uses',
  'produces',
  'before',
  'parallel_ok',
  'heats_in',
  'rests',
])

export const PROCESS_GRAPH_STATES = Object.freeze([
  'raw',
  'prepped',
  'chopped',
  'diced',
  'minced',
  'sliced',
  'peeled',
  'marinated',
  'mixed',
  'dissolved',
  'heated',
  'browned',
  'boiling',
  'simmered',
  'emulsified',
  'seasoned',
  'cooked',
  'chilled',
  'rested',
  'served',
  'plated',
  'finished',
])

const NODE_TYPE_SET = new Set(PROCESS_GRAPH_NODE_TYPES)
const EDGE_TYPE_SET = new Set(PROCESS_GRAPH_EDGE_TYPES)
const STATE_SET = new Set(PROCESS_GRAPH_STATES)

const EQUIPMENT_TERMS = Object.freeze([
  ['food_processor', /\bfood processor\b/i],
  ['stand_mixer', /\bstand mixer\b/i],
  ['hand_mixer', /\bhand mixer\b/i],
  ['dutch_oven', /\bdutch oven\b/i],
  ['sheet_pan', /\bsheet pan|baking sheet\b/i],
  ['baking_dish', /\bbaking dish|casserole dish\b/i],
  ['roasting_pan', /\broasting pan\b/i],
  ['air_fryer', /\bair fryer\b/i],
  ['pressure_cooker', /\bpressure cooker|instant pot\b/i],
  ['cutting_board', /\bcutting board|chopping board\b/i],
  ['wire_rack', /\bwire rack|cooling rack\b/i],
  ['thermometer', /\bthermometer\b/i],
  ['blender', /\bblender\b/i],
  ['colander', /\bcolander|strainer|sieve\b/i],
  ['saucepan', /\bsaucepan\b/i],
  ['skillet', /\bskillet|frying pan\b/i],
  ['pan', /\bpan\b/i],
  ['pot', /\bstockpot|\bpot\b/i],
  ['oven', /\boven\b/i],
  ['grill', /\bgrill\b/i],
  ['broiler', /\bbroiler\b/i],
  ['bowl', /\bbowl\b/i],
  ['whisk', /\bwhisk\b/i],
  ['spatula', /\bspatula\b/i],
  ['knife', /\bknife\b/i],
])

const UNIT_TOKENS = new Set([
  'cup', 'cups', 'tsp', 'teaspoon', 'teaspoons', 'tbsp', 'tablespoon',
  'tablespoons', 'oz', 'ounce', 'ounces', 'lb', 'lbs', 'pound', 'pounds',
  'g', 'gram', 'grams', 'kg', 'kilogram', 'kilograms', 'ml', 'milliliter',
  'milliliters', 'l', 'liter', 'liters', 'litre', 'litres', 'pinch',
  'dash', 'clove', 'cloves', 'can', 'cans', 'package', 'packages', 'bunch',
  'sprig', 'sprigs', 'slice', 'slices', 'piece', 'pieces', 'handful',
])

const STOP_WORDS = new Set([
  'and', 'with', 'from', 'into', 'your', 'this', 'that', 'then', 'the',
  'for', 'use', 'using', 'until', 'when', 'add', 'place', 'heat', 'cook',
  'some', 'more', 'taste', 'large', 'small', 'medium', 'fresh', 'divided',
  'optional', 'to', 'of', 'in', 'on', 'or', 'as', 'by', 'at', 'over',
])

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function textOf(value, fields = ['text', 'name', 'ingredient', 'step', 'original']) {
  if (typeof value === 'string') return value.trim()
  if (!isObject(value)) return ''
  for (const field of fields) {
    if (typeof value[field] === 'string' && value[field].trim()) return value[field].trim()
  }
  return ''
}

function arrayOf(value, fields) {
  if (!isObject(value)) return []
  for (const field of fields) {
    if (Array.isArray(value[field])) return value[field]
  }
  return []
}

function recipeDataOf(recipe) {
  if (isObject(recipe?.data)) return recipe.data
  return isObject(recipe) ? recipe : {}
}

function normalizeText(value) {
  return String(value || '')
    .toLocaleLowerCase()
    .replace(/[\u2019']/g, '')
    .replace(/[^a-z0-9\s/.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function meaningfulTokens(value) {
  return normalizeText(value)
    .split(' ')
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token) && !UNIT_TOKENS.has(token))
    .map((token) => token.replace(/^[./]+|[./]+$/g, ''))
    .filter((token) => token.length >= 3 && !/^\d/.test(token))
}

function fractionValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const text = value.trim()
  const unicode = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875 }
  if (unicode[text] !== undefined) return unicode[text]
  const mixed = text.match(/^(\d+)\s+(\d+)\/(\d+)$/)
  if (mixed) return Number(mixed[1]) + (Number(mixed[2]) / Number(mixed[3]))
  const fraction = text.match(/^(\d+)\/(\d+)$/)
  if (fraction && Number(fraction[2]) !== 0) return Number(fraction[1]) / Number(fraction[2])
  const number = Number(text)
  return Number.isFinite(number) ? number : null
}

function parseIngredient(value) {
  const rawLine = textOf(value, ['line', 'text', 'name', 'ingredient', 'original'])
  const explicitName = isObject(value) ? textOf(value, ['name', 'ingredient', 'text']) : ''
  const explicitQuantity = isObject(value) ? value.quantity ?? value.amount : null
  const explicitUnit = isObject(value) ? value.unit : null
  const line = isObject(value) && !value.line && !value.text && explicitName
    && ((explicitQuantity !== null && explicitQuantity !== undefined && explicitQuantity !== '') || explicitUnit)
    ? [explicitQuantity, explicitUnit, explicitName].filter((part) => part !== null && part !== undefined && part !== '').join(' ')
    : rawLine
  const leading = line.match(/^\s*([\d.]+\s+\d+\/\d+|\d+\/\d+|[\d.]+|[¼½¾⅓⅔⅛⅜⅝⅞])\s*/)
  const quantityText = explicitQuantity !== null && explicitQuantity !== undefined && explicitQuantity !== ''
    ? String(explicitQuantity)
    : leading?.[1] || null
  const quantity = fractionValue(quantityText)
  let remainder = leading ? line.slice(leading[0].length).trim() : line
  let unit = typeof explicitUnit === 'string' && explicitUnit.trim() ? explicitUnit.trim() : null
  if (!unit) {
    const unitMatch = remainder.match(/^([a-zA-Z-]+)\b\s*/)
    if (unitMatch && UNIT_TOKENS.has(unitMatch[1].toLocaleLowerCase())) {
      unit = unitMatch[1]
      remainder = remainder.slice(unitMatch[0].length).trim()
    }
  }
  remainder = remainder.replace(/^of\s+/i, '').trim()
  const name = explicitName || remainder || line
  return {
    line: line || name,
    name: name || 'Unnamed ingredient',
    quantity: quantity !== null && quantity >= 0 ? quantity : null,
    quantityText,
    unit,
  }
}

function parseDurationSeconds(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.round(value)
  if (typeof value !== 'string') return null
  const match = value.match(/(\d+(?:\.\d+)?)\s*(second|sec|minute|min|hour|hr)s?/i)
  if (!match) return null
  const amount = Number(match[1])
  const unit = match[2].toLocaleLowerCase()
  const multiplier = unit.startsWith('hour') || unit === 'hr'
    ? 3600
    : unit.startsWith('minute') || unit === 'min' ? 60 : 1
  return amount > 0 ? Math.round(amount * multiplier) : null
}

function inferState(text) {
  if (/\b(rest|resting|stand)\b/i.test(text)) return 'rested'
  if (/\b(chill|chilled|refrigerat|cool)\b/i.test(text)) return 'chilled'
  if (/\b(brown|browned|sear|saute|sauté)\b/i.test(text)) return 'browned'
  if (/\b(bake|boil|simmer|fry|roast|grill|cook|steam|poach|broil)\b/i.test(text)) return 'cooked'
  if (/\b(heat|warm|melt)\b/i.test(text)) return 'heated'
  if (/\b(mix|whisk|stir|combine|blend)\b/i.test(text)) return 'mixed'
  if (/\b(chop|dice|mince|slice|cut|peel|trim)\b/i.test(text)) return 'prepped'
  return 'raw'
}

function inferEquipment(text) {
  return EQUIPMENT_TERMS.filter(([, pattern]) => pattern.test(text)).map(([id]) => id)
}

function actionUsesIngredient(ingredient, instruction) {
  const tokens = meaningfulTokens(ingredient.name)
  const normalizedInstruction = normalizeText(instruction)
  return tokens.length > 0 && tokens.some((token) => {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(?:^|[^a-z])${escaped}(?:$|[^a-z])`, 'i').test(normalizedInstruction)
  })
}

function explicitParallel(text) {
  return /\b(meanwhile|in parallel|concurrently|at the same time|while you)\b/i.test(text)
}

function independentPastaPrep(previousText, currentText, previousIngredientIds, currentIngredientIds) {
  const disjoint = previousIngredientIds.length > 0
    && currentIngredientIds.length > 0
    && previousIngredientIds.every((id) => !currentIngredientIds.includes(id))
  return disjoint
    && /\b(?:boil|pasta|water)\b/i.test(previousText)
    && /\b(?:sauce|skillet|pan|heat|saute|sauté)\b/i.test(currentText)
}

function makeId(prefix, index) {
  return `${prefix}-${index + 1}`
}

function graphNodeById(graph) {
  return new Map((Array.isArray(graph?.nodes) ? graph.nodes : []).map((node) => [node.id, node]))
}

function actionNodes(graph) {
  return (Array.isArray(graph?.nodes) ? graph.nodes : [])
    .filter((node) => node.type === 'action')
    .slice()
    .sort((left, right) => {
      const leftIndex = Number.isFinite(left.stepIndex) ? left.stepIndex : Number.MAX_SAFE_INTEGER
      const rightIndex = Number.isFinite(right.stepIndex) ? right.stepIndex : Number.MAX_SAFE_INTEGER
      return leftIndex - rightIndex || String(left.id).localeCompare(String(right.id))
    })
}

/** Create a graph envelope without mutating caller-owned arrays or nodes. */
export function createRecipeProcessGraph({
  recipeId = null,
  nodes = [],
  edges = [],
  metadata = {},
  confidence = 'high',
  graphConfidence = confidence,
} = {}) {
  return {
    schemaVersion: RECIPE_PROCESS_GRAPH_SCHEMA_VERSION,
    graphType: 'recipe_process',
    recipeId: recipeId || null,
    nodes: (Array.isArray(nodes) ? nodes : []).map((node) => ({ ...node })),
    edges: (Array.isArray(edges) ? edges : []).map((edge) => ({ ...edge })),
    metadata: { ...metadata },
    confidence,
    graphConfidence,
  }
}

/**
 * Validate the graph contract. Validation is non-throwing so API callers can
 * return all actionable errors at once; use assertValidRecipeProcessGraph when
 * a boundary should reject invalid input.
 */
export function validateRecipeProcessGraph(graph, { requireActions = true } = {}) {
  const errors = []
  const warnings = []
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : []
  const edges = Array.isArray(graph?.edges) ? graph.edges : []
  const nodeIds = new Set()
  const nodeById = new Map()

  if (!isObject(graph)) {
    errors.push({ code: 'GRAPH_NOT_OBJECT', path: '', message: 'Process graph must be an object.' })
  }
  if (graph?.schemaVersion !== RECIPE_PROCESS_GRAPH_SCHEMA_VERSION) {
    errors.push({
      code: 'GRAPH_SCHEMA_VERSION',
      path: '/schemaVersion',
      message: `schemaVersion must be ${RECIPE_PROCESS_GRAPH_SCHEMA_VERSION}.`,
      expected: RECIPE_PROCESS_GRAPH_SCHEMA_VERSION,
      actual: graph?.schemaVersion ?? null,
    })
  }
  if (graph?.graphType !== 'recipe_process') {
    errors.push({
      code: 'GRAPH_TYPE_INVALID',
      path: '/graphType',
      message: 'graphType must be recipe_process.',
      expected: 'recipe_process',
      actual: graph?.graphType ?? null,
    })
  }
  for (const field of ['confidence', 'graphConfidence']) {
    if (graph?.[field] !== undefined && !['high', 'medium', 'low'].includes(graph[field])) {
      errors.push({
        code: 'GRAPH_CONFIDENCE_INVALID',
        path: `/${field}`,
        message: `${field} must be high, medium, or low.`,
        value: graph[field],
      })
    }
  }
  if (!Array.isArray(graph?.nodes)) {
    errors.push({ code: 'GRAPH_NODES_ARRAY', path: '/nodes', message: 'nodes must be an array.' })
  } else if (nodes.length === 0) {
    errors.push({ code: 'GRAPH_NO_NODES', path: '/nodes', message: 'Process graph must contain at least one node.' })
  }
  if (!Array.isArray(graph?.edges)) {
    errors.push({ code: 'GRAPH_EDGES_ARRAY', path: '/edges', message: 'edges must be an array.' })
  }

  nodes.forEach((node, index) => {
    const path = `/nodes/${index}`
    if (!isObject(node)) {
      errors.push({ code: 'NODE_NOT_OBJECT', path, message: 'Node must be an object.' })
      return
    }
    if (typeof node.id !== 'string' || !node.id.trim()) {
      errors.push({ code: 'NODE_ID_REQUIRED', path: `${path}/id`, message: 'Node id must be a non-empty string.' })
    } else if (nodeIds.has(node.id)) {
      errors.push({ code: 'NODE_ID_DUPLICATE', path: `${path}/id`, message: `Node id "${node.id}" is duplicated.`, nodeId: node.id })
    } else {
      nodeIds.add(node.id)
      nodeById.set(node.id, node)
    }
    if (!NODE_TYPE_SET.has(node.type)) {
      errors.push({
        code: 'NODE_TYPE_INVALID',
        path: `${path}/type`,
        message: `Node type must be one of: ${PROCESS_GRAPH_NODE_TYPES.join(', ')}.`,
        value: node.type ?? null,
      })
    }
    if (node.state !== undefined && !STATE_SET.has(node.state)) {
      errors.push({
        code: 'NODE_STATE_INVALID',
        path: `${path}/state`,
        message: `Node state must be one of: ${PROCESS_GRAPH_STATES.join(', ')}.`,
        value: node.state,
      })
    }
    if (node.type === 'action' && !textOf(node, ['text', 'instruction', 'name', 'description'])) {
      errors.push({ code: 'ACTION_TEXT_REQUIRED', path: `${path}/text`, message: 'Action nodes need text, instruction, name, or description.', nodeId: node.id })
    }
    if (node.type === 'timer') {
      const seconds = node.durationSeconds ?? node.duration
      if (!Number.isFinite(Number(seconds)) || Number(seconds) <= 0) {
        errors.push({ code: 'TIMER_DURATION_REQUIRED', path: `${path}/durationSeconds`, message: 'Timer nodes need a positive durationSeconds value.', nodeId: node.id })
      }
    }
  })

  const validEdges = []
  edges.forEach((edge, index) => {
    const path = `/edges/${index}`
    if (!isObject(edge)) {
      errors.push({ code: 'EDGE_NOT_OBJECT', path, message: 'Edge must be an object.' })
      return
    }
    const from = edge.from ?? edge.source
    const to = edge.to ?? edge.target
    if (typeof from !== 'string' || !from.trim()) {
      errors.push({ code: 'EDGE_FROM_REQUIRED', path: `${path}/from`, message: 'Edge from must be a node id.' })
    }
    if (typeof to !== 'string' || !to.trim()) {
      errors.push({ code: 'EDGE_TO_REQUIRED', path: `${path}/to`, message: 'Edge to must be a node id.' })
    }
    if (typeof from === 'string' && typeof to === 'string') {
      if (!nodeIds.has(from)) errors.push({ code: 'EDGE_FROM_UNKNOWN', path: `${path}/from`, message: `Unknown source node "${from}".`, nodeId: from })
      if (!nodeIds.has(to)) errors.push({ code: 'EDGE_TO_UNKNOWN', path: `${path}/to`, message: `Unknown target node "${to}".`, nodeId: to })
      if (from === to) errors.push({ code: 'EDGE_SELF_REFERENCE', path, message: 'An edge cannot point to the same node.', nodeId: from })
    }
    if (!EDGE_TYPE_SET.has(edge.type)) {
      errors.push({ code: 'EDGE_TYPE_INVALID', path: `${path}/type`, message: `Edge type must be one of: ${PROCESS_GRAPH_EDGE_TYPES.join(', ')}.`, value: edge.type ?? null })
    }
    if (typeof from === 'string' && typeof to === 'string' && nodeIds.has(from) && nodeIds.has(to) && EDGE_TYPE_SET.has(edge.type) && from !== to) {
      validEdges.push({ ...edge, from, to })
    }
  })

  const outgoing = new Map()
  const incoming = new Map()
  for (const edge of validEdges) {
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, [])
    if (!incoming.has(edge.to)) incoming.set(edge.to, [])
    outgoing.get(edge.from).push(edge)
    incoming.get(edge.to).push(edge)
  }

  const ingredients = nodes.filter((node) => node.type === 'ingredient')
  const actions = nodes.filter((node) => node.type === 'action')
  if (requireActions && actions.length === 0) {
    errors.push({ code: 'GRAPH_NO_ACTIONS', path: '/nodes', message: 'Process graph must contain at least one action node.' })
  }

  for (const ingredient of ingredients) {
    const used = (outgoing.get(ingredient.id) || []).some((edge) => edge.type === 'uses' || edge.type === 'produces')
    if (!used && !ingredient.plated && !ingredient.optional) {
      errors.push({ code: 'INGREDIENT_ORPHAN', path: `/nodes/${nodes.indexOf(ingredient)}`, message: `Ingredient "${ingredient.name || ingredient.id}" is not consumed or plated.`, nodeId: ingredient.id })
    }
  }

  for (const action of actions) {
    const produces = (outgoing.get(action.id) || []).some((edge) => edge.type === 'produces')
    if (!produces && action.terminal !== true) {
      errors.push({ code: 'ACTION_MISSING_PRODUCES', path: `/nodes/${nodes.indexOf(action)}`, message: `Action "${action.id}" must produce an intermediate or be marked terminal.`, nodeId: action.id })
    }
    const hasTool = Boolean(action.toolId || action.equipmentId || action.no_tool === true || action.noTool === true || action.no_tool === 'true' || action.noTool === 'true')
      || (outgoing.get(action.id) || []).some((edge) => edge.type === 'heats_in' || (edge.type === 'uses' && nodeById.get(edge.to)?.type === 'tool'))
      || (incoming.get(action.id) || []).some((edge) => edge.type === 'uses' && nodeById.get(edge.from)?.type === 'tool')
    if (!hasTool) {
      errors.push({ code: 'ACTION_TOOL_REQUIRED', path: `/nodes/${nodes.indexOf(action)}`, message: `Action "${action.id}" must reference a tool or set no_tool: true.`, nodeId: action.id })
    }
  }

  const dependencyEdges = validEdges.filter((edge) => edge.type !== 'parallel_ok')
  const adjacency = new Map()
  for (const edge of dependencyEdges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, [])
    adjacency.get(edge.from).push(edge.to)
  }
  const visiting = new Set()
  const visited = new Set()
  const cycleNodes = new Set()
  function visit(nodeId) {
    if (visiting.has(nodeId)) {
      cycleNodes.add(nodeId)
      return true
    }
    if (visited.has(nodeId)) return false
    visiting.add(nodeId)
    let found = false
    for (const next of adjacency.get(nodeId) || []) {
      if (visit(next)) {
        found = true
        cycleNodes.add(nodeId)
      }
    }
    visiting.delete(nodeId)
    visited.add(nodeId)
    return found
  }
  for (const nodeId of nodeIds) visit(nodeId)
  if (cycleNodes.size > 0) {
    errors.push({ code: 'GRAPH_CYCLE', path: '/edges', message: `Dependency cycle detected involving: ${[...cycleNodes].join(', ')}.`, nodeIds: [...cycleNodes] })
  }

  if (validEdges.some((edge) => edge.type === 'parallel_ok' && (nodeById.get(edge.from)?.type !== 'action' || nodeById.get(edge.to)?.type !== 'action'))) {
    warnings.push({ code: 'PARALLEL_EDGE_NON_ACTION', path: '/edges', message: 'parallel_ok is most useful between action nodes.' })
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      nodes: nodes.length,
      edges: edges.length,
      ingredients: ingredients.length,
      actions: actions.length,
      intermediates: nodes.filter((node) => node.type === 'intermediate').length,
      timers: nodes.filter((node) => node.type === 'timer').length,
      parallelEdges: validEdges.filter((edge) => edge.type === 'parallel_ok').length,
    },
  }
}

export function isValidRecipeProcessGraph(graph, options = {}) {
  return validateRecipeProcessGraph(graph, options).valid
}

export class RecipeProcessGraphValidationError extends Error {
  constructor(result) {
    super(`Recipe process graph validation failed: ${(result?.errors || []).map((error) => error.code).join(', ') || 'invalid graph'}`)
    this.name = 'RecipeProcessGraphValidationError'
    this.code = 'RECIPE_PROCESS_GRAPH_INVALID'
    this.status = 422
    this.errors = result?.errors || []
    this.warnings = result?.warnings || []
    this.result = result
  }
}

export function assertValidRecipeProcessGraph(graph, options = {}) {
  const result = validateRecipeProcessGraph(graph, options)
  if (!result.valid) throw new RecipeProcessGraphValidationError(result)
  return result
}

/**
 * Lift a legacy recipe into a graph. Text remains the fallback source of truth
 * when the model did not emit a graph. The operation never invents ingredient
 * text: an unmatched ingredient is conservatively associated with the first
 * action and recorded in warnings so it cannot become an orphan.
 */
export function liftRecipeToProcessGraph(recipe, { recipeId = null } = {}) {
  const data = recipeDataOf(recipe)
  const ingredientValues = arrayOf(data, ['ingredients', 'recipeIngredient', 'sourceIngredients'])
  const instructionValues = arrayOf(data, ['instructions', 'steps', 'directions', 'recipeInstructions'])
  const ingredients = ingredientValues.map(parseIngredient).filter((ingredient) => ingredient.line || ingredient.name)
  const instructions = instructionValues.map((instruction) => textOf(instruction, ['text', 'instruction', 'step', 'name'])).filter(Boolean)
  const nodes = []
  const edges = []
  const warnings = []
  const ingredientNodes = ingredients.map((ingredient, index) => {
    const allergenRefs = buildAllergenGraph([ingredient.line]).nodes.map((node) => node.id)
    const node = {
      id: makeId('ingredient', index),
      type: 'ingredient',
      sourceIndex: index,
      line: ingredient.line,
      name: ingredient.name,
      quantity: ingredient.quantity,
      quantityText: ingredient.quantityText,
      unit: ingredient.unit,
      state: 'raw',
      allergenRefs,
    }
    nodes.push(node)
    return node
  })

  let previousAction = null
  instructions.forEach((instruction, index) => {
    const actionId = makeId('action', index)
    const equipment = inferEquipment(instruction)
    const action = {
      id: actionId,
      type: 'action',
      stepIndex: index,
      name: `Step ${index + 1}`,
      text: instruction,
      state: inferState(instruction),
      ...(equipment.length > 0 ? { equipmentId: equipment[0], toolId: makeId('tool', nodes.filter((node) => node.type === 'tool').length) } : { no_tool: true }),
    }
    nodes.push(action)

    const localIngredients = ingredientNodes.filter((ingredient) => actionUsesIngredient(ingredient, instruction))
    if (localIngredients.length === 0 && ingredientNodes.length > 0) {
      warnings.push({ code: 'INGREDIENT_MATCH_FALLBACK', actionId, message: `No ingredient text matched step ${index + 1}; the step was linked to the nearest available ingredient.` })
      const fallback = index === 0 ? ingredientNodes[0] : ingredientNodes.find((ingredient) => !(edges.some((edge) => edge.from === ingredient.id && edge.type === 'uses')))
      if (fallback) localIngredients.push(fallback)
    }
    for (const ingredient of localIngredients) edges.push({ from: ingredient.id, to: actionId, type: 'uses' })

    for (const equipmentId of equipment) {
      const existingTool = nodes.find((node) => node.type === 'tool' && node.equipmentId === equipmentId)
      const tool = existingTool || {
        id: `tool-${equipmentId}`,
        type: 'tool',
        name: equipmentId.replace(/_/g, ' '),
        equipmentId,
      }
      if (!existingTool) nodes.push(tool)
      action.toolId = tool.id
      edges.push({ from: actionId, to: tool.id, type: /\b(heat|bake|boil|fry|roast|grill|broil|simmer)\b/i.test(instruction) ? 'heats_in' : 'uses' })
    }

    const intermediate = {
      id: makeId('intermediate', index),
      type: 'intermediate',
      stepIndex: index,
      name: `Step ${index + 1} result`,
      state: inferState(instruction),
      producedBy: actionId,
    }
    nodes.push(intermediate)
    edges.push({ from: actionId, to: intermediate.id, type: 'produces' })

    const durationSeconds = parseDurationSeconds(instruction)
    if (durationSeconds) {
      const timer = {
        id: makeId('timer', nodes.filter((node) => node.type === 'timer').length),
        type: 'timer',
        stepIndex: index,
        name: `Step ${index + 1} timer`,
        label: instruction.match(/\d+(?:\.\d+)?\s*(?:seconds?|secs?|minutes?|mins?|hours?|hrs?)/i)?.[0] || `${durationSeconds} seconds`,
        durationSeconds,
      }
      nodes.push(timer)
      edges.push({ from: actionId, to: timer.id, type: 'rests' })
    }

    if (previousAction) {
      const previousIngredientIds = edges
        .filter((edge) => edge.to === previousAction.id && edge.type === 'uses')
        .map((edge) => edge.from)
      const currentIngredientIds = localIngredients.map((ingredient) => ingredient.id)
      const mayRunInParallel = explicitParallel(instruction)
        || independentPastaPrep(previousAction.text, instruction, previousIngredientIds, currentIngredientIds)
      if (mayRunInParallel) edges.push({ from: previousAction.id, to: actionId, type: 'parallel_ok' })
      else edges.push({ from: previousAction.id, to: actionId, type: 'before' })
    }
    previousAction = action
  })

  // A legacy step can omit an ingredient that is used implicitly (for
  // example, "season to taste"). Keep the graph complete without inventing
  // a new ingredient or silently dropping the source line: associate each
  // remaining ingredient with the final action and record the low-confidence
  // lift in metadata.
  const fallbackAction = nodes.filter((node) => node.type === 'action').slice(-1)[0]
  if (fallbackAction) {
    for (const ingredient of ingredientNodes) {
      const alreadyUsed = edges.some((edge) => edge.from === ingredient.id && edge.type === 'uses')
      if (alreadyUsed) continue
      edges.push({ from: ingredient.id, to: fallbackAction.id, type: 'uses' })
      warnings.push({
        code: 'INGREDIENT_ORPHAN_FALLBACK',
        ingredientId: ingredient.id,
        actionId: fallbackAction.id,
        message: `Ingredient "${ingredient.name}" was not referenced by any step and was linked to the final action for review.`,
      })
    }
  }

  const graph = createRecipeProcessGraph({
    recipeId: recipeId || data.id || data.recipeId || data.url || null,
    nodes,
    edges,
    metadata: {
      source: 'legacy_lift',
      ingredientCount: ingredients.length,
      stepCount: instructions.length,
      warnings,
    },
    confidence: warnings.length === 0 ? 'high' : 'medium',
    graphConfidence: warnings.length === 0 ? 'high' : 'medium',
  })

  const validation = validateRecipeProcessGraph(graph)
  if (!validation.valid) {
    graph.confidence = 'low'
    graph.graphConfidence = 'low'
    graph.metadata = { ...graph.metadata, validationErrors: validation.errors }
  }
  return graph
}

// Names used in product specs and sibling implementations.
export const liftLegacyRecipeToGraph = liftRecipeToProcessGraph
export const liftRecipeToGraph = liftRecipeToProcessGraph
export const buildRecipeProcessGraph = liftRecipeToProcessGraph

/** Return canonical actions with dependency and step-local ingredient data. */
export function getNavigatorSteps(graph) {
  if (!isObject(graph)) return []
  const nodes = graphNodeById(graph)
  const edges = Array.isArray(graph.edges) ? graph.edges : []
  const actions = actionNodes(graph)
  return actions.map((action, index) => {
    const incoming = edges.filter((edge) => (edge.to ?? edge.target) === action.id)
    const ingredientRefs = incoming
      .filter((edge) => edge.type === 'uses' && nodes.get(edge.from ?? edge.source)?.type === 'ingredient')
      .map((edge) => edge.from ?? edge.source)
    const timerRefs = edges
      .filter((edge) => edge.type === 'rests' && (
        (edge.from === action.id && nodes.get(edge.to)?.type === 'timer')
        || (edge.to === action.id && nodes.get(edge.from)?.type === 'timer')
      ))
      .map((edge) => edge.from === action.id ? edge.to : edge.from)
    const timers = timerRefs.map((id) => nodes.get(id)).filter(Boolean)
    const dependencies = incoming
      .filter((edge) => edge.type === 'before')
      .map((edge) => edge.from ?? edge.source)
    return {
      id: action.id,
      stepIndex: Number.isFinite(action.stepIndex) ? action.stepIndex : index,
      text: textOf(action, ['text', 'instruction', 'description', 'name']),
      ingredientRefs,
      ingredients: ingredientRefs.map((id) => nodes.get(id)).filter(Boolean),
      timerRefs,
      timers,
      dependencies,
      parallel: incoming.some((edge) => edge.type === 'parallel_ok'),
      action,
    }
  })
}

export const renderNavigatorSteps = getNavigatorSteps

/** Return ingredient nodes linked to one action, never all recipe ingredients. */
export function getStepLocalIngredients(graph, step) {
  const steps = getNavigatorSteps(graph)
  const target = typeof step === 'number' ? steps[step] : steps.find((item) => item.id === step)
  return target?.ingredients || []
}

/**
 * Render the graph back into the legacy recipe shape. This makes graph-backed
 * and legacy clients interchangeable and intentionally preserves the graph.
 */
export function renderRecipeFromProcessGraph(graph, baseRecipe = {}) {
  const source = isObject(baseRecipe) ? baseRecipe : {}
  const ingredients = (Array.isArray(graph?.nodes) ? graph.nodes : [])
    .filter((node) => node.type === 'ingredient')
    .slice()
    .sort((left, right) => (left.sourceIndex ?? 0) - (right.sourceIndex ?? 0))
    .map((node) => node.line || [node.quantityText ?? node.quantity, node.unit, node.name].filter((value) => value !== null && value !== undefined && value !== '').join(' '))
  const instructions = getNavigatorSteps(graph).map((step) => step.text).filter(Boolean)
  return {
    ...source,
    ingredients,
    instructions,
    processGraph: graph,
  }
}

export const graphToRecipe = renderRecipeFromProcessGraph
export const renderGraphToLinearRecipe = renderRecipeFromProcessGraph
export const graphToLinear = (graph) => renderRecipeFromProcessGraph(graph).instructions

/**
 * Calculate a deterministic graph coverage score for quality bars and evals.
 * Ingredient/action linkage and action outputs are weighted equally.
 */
export function calculateProcessGraphCoverage(graph) {
  const validation = validateRecipeProcessGraph(graph)
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : []
  const edges = Array.isArray(graph?.edges) ? graph.edges : []
  const ingredients = nodes.filter((node) => node.type === 'ingredient')
  const actions = nodes.filter((node) => node.type === 'action')
  const ingredientCoverage = ingredients.length === 0
    ? 0
    : ingredients.filter((node) => edges.some((edge) => edge.from === node.id && edge.type === 'uses')).length / ingredients.length
  const actionCoverage = actions.length === 0
    ? 0
    : actions.filter((node) => edges.some((edge) => edge.from === node.id && edge.type === 'produces')).length / actions.length
  return {
    valid: validation.valid,
    ingredientCoverage,
    actionCoverage,
    ratio: (ingredientCoverage + actionCoverage) / 2,
    percent: Math.round(((ingredientCoverage + actionCoverage) / 2) * 100),
    validation,
  }
}

export const graphCoverage = calculateProcessGraphCoverage

/** Return a topological critical path using action/intermediate durations. */
export function getCriticalPath(graph) {
  const actions = actionNodes(graph)
  const nodes = graphNodeById(graph)
  const edges = Array.isArray(graph?.edges) ? graph.edges : []
  const distances = new Map()
  const previous = new Map()
  for (const action of actions) {
    const incoming = edges.filter((edge) => edge.to === action.id && edge.type === 'before')
    let bestDistance = 0
    let bestPrevious = null
    for (const edge of incoming) {
      const candidate = distances.get(edge.from) || 0
      if (candidate > bestDistance) {
        bestDistance = candidate
        bestPrevious = edge.from
      }
    }
    const timerIds = edges
      .filter((edge) => edge.type === 'rests' && (
        (edge.from === action.id && nodes.get(edge.to)?.type === 'timer')
        || (edge.to === action.id && nodes.get(edge.from)?.type === 'timer')
      ))
      .map((edge) => edge.from === action.id ? edge.to : edge.from)
    const duration = timerIds.reduce((sum, id) => sum + (Number(nodes.get(id)?.durationSeconds) || 0), 0)
    distances.set(action.id, bestDistance + duration)
    previous.set(action.id, bestPrevious)
  }
  const end = actions.reduce((best, action) => (distances.get(action.id) || 0) > (distances.get(best?.id) || 0) ? action : best, null)
  const path = []
  let cursor = end?.id || null
  while (cursor) {
    path.unshift(cursor)
    cursor = previous.get(cursor) || null
  }
  return { nodeIds: path, durationSeconds: end ? distances.get(end.id) || 0 : 0 }
}

/** Server-side feature gate. It is intentionally off unless an environment flag is explicit. */
export function isRecipeProcessGraphEnabled(env = {}) {
  return [
    env.RECIPE_PROCESS_GRAPH_V1,
    env.RECIPE_PROCESS_GRAPH_ENABLED,
    env.FEATURE_RECIPE_PROCESS_GRAPH_V1,
    env.recipe_process_graph_v1,
    env['recipe-process-graph-v1'],
  ].some((value) => value === true || String(value || '').toLocaleLowerCase() === 'true' || value === 1)
}

/** Attach a validated graph, or report low confidence for linear-only fallback. */
export function withRecipeProcessGraph(recipe, { enabled = true, recipeId = null } = {}) {
  if (!isObject(recipe)) return recipe
  if (!enabled) {
    if (!Object.prototype.hasOwnProperty.call(recipe, 'processGraph')) return recipe
    const { processGraph: _processGraph, graphConfidence: _graphConfidence, graphValidation: _graphValidation, ...linearRecipe } = recipe
    return linearRecipe
  }
  const candidate = recipe.processGraph
  const candidateResult = candidate ? validateRecipeProcessGraph(candidate) : null
  const graph = candidateResult?.valid ? candidate : liftRecipeToProcessGraph(recipe, { recipeId })
  const result = validateRecipeProcessGraph(graph)
  if (!result.valid) {
    return {
      ...recipe,
      processGraph: null,
      graphConfidence: 'low',
      graphValidation: result,
    }
  }
  const coverage = calculateProcessGraphCoverage(graph)
  return {
    ...recipe,
    processGraph: graph,
    graphConfidence: graph.graphConfidence || graph.confidence || 'medium',
    graphValidation: {
      valid: true,
      errors: [],
      warnings: graph.metadata?.warnings || [],
      coverage: coverage.percent,
    },
  }
}

export const attachRecipeProcessGraph = withRecipeProcessGraph
export const createProcessGraph = createRecipeProcessGraph
export const validateProcessGraph = validateRecipeProcessGraph
export const assertValidProcessGraph = assertValidRecipeProcessGraph
export const renderProcessGraph = renderRecipeFromProcessGraph
export const graphToLinearRecipe = renderRecipeFromProcessGraph

export function getRecipeProcessGraphSchema() {
  return RECIPE_PROCESS_GRAPH_SCHEMA
}

// Kept as a plain object so callers can use it for model/tool schemas without
// importing a JSON-schema package in a Worker.
export const RECIPE_PROCESS_GRAPH_SCHEMA = Object.freeze({
  type: 'object',
  required: ['schemaVersion', 'graphType', 'nodes', 'edges'],
  properties: {
    schemaVersion: { const: RECIPE_PROCESS_GRAPH_SCHEMA_VERSION },
    graphType: { const: 'recipe_process' },
    recipeId: { type: ['string', 'null'] },
    confidence: { enum: ['high', 'medium', 'low'] },
    graphConfidence: { enum: ['high', 'medium', 'low'] },
    nodes: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'type'],
        properties: {
          id: { type: 'string' },
          type: { enum: PROCESS_GRAPH_NODE_TYPES },
          state: { enum: PROCESS_GRAPH_STATES },
          quantity: { type: ['number', 'null'] },
          unit: { type: ['string', 'null'] },
          allergenRefs: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    edges: {
      type: 'array',
      items: {
        type: 'object',
        required: ['from', 'to', 'type'],
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          type: { enum: PROCESS_GRAPH_EDGE_TYPES },
        },
      },
    },
  },
})

export default {
  RECIPE_PROCESS_GRAPH_SCHEMA_VERSION,
  RECIPE_PROCESS_GRAPH_FLAG,
  PROCESS_GRAPH_NODE_TYPES,
  PROCESS_GRAPH_EDGE_TYPES,
  createRecipeProcessGraph,
  validateRecipeProcessGraph,
  isValidRecipeProcessGraph,
  assertValidRecipeProcessGraph,
  liftRecipeToProcessGraph,
  getNavigatorSteps,
  getStepLocalIngredients,
  renderRecipeFromProcessGraph,
  calculateProcessGraphCoverage,
  getCriticalPath,
  isRecipeProcessGraphEnabled,
  withRecipeProcessGraph,
}
