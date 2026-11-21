/**
 * IngredientStateV1 runtime model and pure transition functions.
 * Tracks ingredients, intermediates, and kitchen tools through cook-time state transitions.
 */

export const VALID_ENTITY_TYPES = ['ingredient', 'intermediate', 'tool']

export const VALID_STATE_ENUM = [
  // Preparation & Mise
  'raw',
  'frozen',
  'thawed',
  'prepped',
  'chopped',
  'diced',
  'minced',
  'sliced',
  'grated',
  'peeled',
  'seasoned',
  'marinated',
  // Active thermal & mechanical
  'sweating',
  'softened',
  'caramelized',
  'seared',
  'browned',
  'sautéed',
  'simmering',
  'boiling',
  'reduced',
  'baked',
  'roasted',
  'steamed',
  'fried',
  'deep-fried',
  'melted',
  'emulsified',
  'mixed',
  'whisked',
  'kneaded',
  // Post-heat & plating
  'rested',
  'resting',
  'warm',
  'cooled',
  'chilled',
  'held',
  'plated',
  'garnished',
  'discarded',
  // Equipment states
  'clean',
  'preheating',
  'hot',
  'in-use',
  'cooling',
  'dirty',
  'ready',
]

export const VALID_LOCATIONS = [
  'counter',
  'board',
  'bowl',
  'pan',
  'pot',
  'skillet',
  'baking-sheet',
  'oven',
  'fridge',
  'freezer',
  'grill',
  'plate',
  'sink',
  'blender',
]

export const VALID_SOURCES = ['step', 'user', 'vision', 'infer']

const COMMON_PREP_WORDS = /\b(diced|chopped|minced|sliced|grated|peeled|crushed|whole|fresh|large|medium|small|cloves?|halved|quartered)\b/gi

/**
 * Normalizes an entity name by stripping measurement numbers, units, common descriptors, and punctuation.
 * @param {string} rawName
 * @returns {string}
 */
export function normalizeEntityName(rawName) {
  if (!rawName || typeof rawName !== 'string') return ''
  return rawName
    .replace(/^[\d/\s.-]+(g|kg|oz|lb|cups?|tbsp|tsp|ml|l|pinch|handful|slices?|stalks?|pieces?|can|cans|pkg|package)\b\s*(of\s+)?/i, '')
    .replace(/^[\d/\s.-]+\s+/, '')
    .replace(COMMON_PREP_WORDS, '')
    .replace(/[(),]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * Initializes a new state tracker from recipe ingredients, steps, and equipment.
 * @param {Object} params
 * @param {Array<string|Object>} [params.ingredients]
 * @param {Array<string|Object>} [params.steps]
 * @param {Array<string>} [params.equipment]
 * @param {Object} [params.processGraph]
 * @param {Object} [params.recipe]
 * @returns {Object} IngredientStateV1 tracker object
 */
export function createIngredientStateTracker({
  ingredients = [],
  steps = [],
  equipment = [],
  processGraph = null,
  recipe = null,
} = {}) {
  const allIngredients = recipe?.ingredients || ingredients || []
  const allSteps = recipe?.instructions || steps || []
  const allEquipment = recipe?.equipment || equipment || []
  const now = Date.now()

  const entities = []
  const seenNames = new Set()

  // 1. Process Ingredients
  allIngredients.forEach((ing, index) => {
    const rawText = typeof ing === 'string' ? ing : (ing?.name || ing?.ingredient || ing?.text || '')
    const cleanName = normalizeEntityName(rawText) || `ingredient-${index + 1}`
    const isFrozen = /\bfrozen\b/i.test(rawText)
    const isChilled = /\b(chilled|cold|refrigerated)\b/i.test(rawText)

    if (!seenNames.has(cleanName)) {
      seenNames.add(cleanName)
      entities.push({
        id: `ing-${index}-${cleanName.replace(/\s+/g, '-').slice(0, 24)}`,
        name: cleanName,
        rawText,
        type: 'ingredient',
        state: isFrozen ? 'frozen' : 'raw',
        quantityRemaining: typeof ing === 'object' ? (ing?.quantity || ing?.amount || null) : null,
        location: isFrozen ? 'freezer' : isChilled ? 'fridge' : 'counter',
        source: 'infer',
        updatedAt: now,
      })
    }
  })

  // 2. Process Process Graph if available
  if (processGraph?.intermediates && Array.isArray(processGraph.intermediates)) {
    processGraph.intermediates.forEach((inter, idx) => {
      const name = inter.name ? inter.name.toLowerCase() : `intermediate-${idx + 1}`
      if (!seenNames.has(name)) {
        seenNames.add(name)
        entities.push({
          id: `inter-${idx}-${name.replace(/\s+/g, '-').slice(0, 24)}`,
          name,
          type: 'intermediate',
          state: inter.state || 'raw',
          location: inter.location || 'bowl',
          source: 'infer',
          updatedAt: now,
        })
      }
    })
  }

  // 3. Process Equipment / Tools
  const toolKeywords = ['pan', 'skillet', 'pot', 'oven', 'board', 'knife', 'whisk', 'blender', 'baking sheet', 'grill', 'air fryer']
  const detectedEquipment = new Set(allEquipment.map((e) => String(e).toLowerCase()))

  // Detect equipment mentioned in steps if none explicitly provided
  if (detectedEquipment.size === 0) {
    const stepConcat = allSteps.map((s) => (typeof s === 'string' ? s : s?.text || '')).join(' ').toLowerCase()
    toolKeywords.forEach((kw) => {
      if (stepConcat.includes(kw)) {
        detectedEquipment.add(kw)
      }
    })
  }

  Array.from(detectedEquipment).forEach((toolName, idx) => {
    const cleanTool = toolName.trim().toLowerCase()
    if (!seenNames.has(cleanTool)) {
      seenNames.add(cleanTool)
      entities.push({
        id: `tool-${idx}-${cleanTool.replace(/\s+/g, '-').slice(0, 24)}`,
        name: cleanTool,
        type: 'tool',
        state: 'clean',
        location: cleanTool.includes('oven') ? 'oven' : 'counter',
        source: 'infer',
        updatedAt: now,
      })
    }
  })

  return {
    version: 1,
    recipeId: recipe?.id || null,
    createdAt: now,
    updatedAt: now,
    entities,
    history: [],
  }
}

/**
 * Heuristically infers state transitions and intermediate creations from step instructions.
 * @param {string} stepText
 * @param {Array<Object>} currentEntities
 * @returns {{ stateUpdates: Array<{ id: string, state: string, location?: string }>, newIntermediates: Array<Object> }}
 */
function inferStepActions(stepText, currentEntities) {
  if (!stepText || typeof stepText !== 'string') {
    return { stateUpdates: [], newIntermediates: [] }
  }

  const text = stepText.toLowerCase()
  const stateUpdates = []
  const newIntermediates = []

  // Check state verbs
  currentEntities.forEach((entity) => {
    const entityTokens = (entity.name || '')
      .split(/\s+/)
      .filter((t) => t.length > 2 && !['and', 'the', 'for', 'with'].includes(t))
    const tokenMatch = entityTokens.some((token) => text.includes(token))
    const nameMatch = entity.name && text.includes(entity.name)
    const rawMatch = entity.rawText && text.includes(entity.rawText.toLowerCase())
    const isMatched = nameMatch || rawMatch || tokenMatch

    if (entity.type === 'ingredient' && isMatched) {
      let nextState = null
      let nextLocation = null

      if (/\b(dice|diced)\b/.test(text)) {
        nextState = 'diced'
        nextLocation = 'board'
      } else if (/\b(mince|minced)\b/.test(text)) {
        nextState = 'minced'
        nextLocation = 'board'
      } else if (/\b(chop|chopped)\b/.test(text)) {
        nextState = 'chopped'
        nextLocation = 'board'
      } else if (/\b(slice|sliced)\b/.test(text)) {
        nextState = 'sliced'
        nextLocation = 'board'
      } else if (/\b(carameliz|caramelis)/.test(text)) {
        nextState = 'caramelized'
        nextLocation = 'pan'
      } else if (/\b(sweat|soften)/.test(text)) {
        nextState = 'softened'
        nextLocation = 'pan'
      } else if (/\b(sear|seared|brown|browned)\b/.test(text)) {
        nextState = 'seared'
        nextLocation = 'pan'
      } else if (/\b(saut[eé]|sauteed)\b/.test(text)) {
        nextState = 'sautéed'
        nextLocation = 'pan'
      } else if (/\b(simmer|simmering)\b/.test(text)) {
        nextState = 'simmering'
        nextLocation = 'pot'
      } else if (/\b(boil|boiling)\b/.test(text)) {
        nextState = 'boiling'
        nextLocation = 'pot'
      } else if (/\b(reduce|reduced)\b/.test(text)) {
        nextState = 'reduced'
        nextLocation = 'pan'
      } else if (/\b(roast|roasted|bake|baked)\b/.test(text)) {
        nextState = 'roasted'
        nextLocation = 'oven'
      } else if (/\b(melt|melted)\b/.test(text)) {
        nextState = 'melted'
        nextLocation = 'pan'
      } else if (/\b(rest|resting|let rest)\b/.test(text)) {
        nextState = 'resting'
        nextLocation = 'board'
      } else if (/\b(plate|plated|serve|served)\b/.test(text)) {
        nextState = 'plated'
        nextLocation = 'plate'
      } else if (/\b(thaw|thawed|defrost)\b/.test(text)) {
        nextState = 'thawed'
        nextLocation = 'counter'
      }

      if (nextState && nextState !== entity.state) {
        // Prevent auto-transition of frozen entity to hot/cooked state without thawing
        if (entity.state === 'frozen' && nextState !== 'thawed' && ['seared', 'browned', 'sautéed', 'roasted', 'baked', 'fried'].includes(nextState)) {
          // Keep frozen to allow validateAction warning to flag it
          return
        }
        stateUpdates.push({
          id: entity.id,
          state: nextState,
          location: nextLocation || entity.location,
        })
      }
    } else if (entity.type === 'tool' && (nameMatch || text.includes(entity.name))) {
      if (/\b(heat|preheat|turn on)\b/.test(text)) {
        stateUpdates.push({ id: entity.id, state: 'preheating', location: entity.location })
      } else if (/\b(add to|place in|cook in|pour into)\b/.test(text)) {
        stateUpdates.push({ id: entity.id, state: 'in-use', location: entity.location })
      }
    }
  })

  // Detect newly formed intermediates
  const intermediateKeywords = [
    { regex: /\b(butter-sugar mixture|creamed butter)\b/, name: 'butter-sugar mixture', state: 'mixed', location: 'bowl' },
    { regex: /\b(egg mixture|whisked eggs|beaten eggs)\b/, name: 'egg mixture', state: 'whisked', location: 'bowl' },
    { regex: /\b(roux)\b/, name: 'roux', state: 'simmering', location: 'pan' },
    { regex: /\b(sauce|glaze|reduction)\b/, name: 'sauce', state: text.includes('reduce') ? 'reduced' : 'simmering', location: 'pan' },
    { regex: /\b(dressing|vinaigrette)\b/, name: 'vinaigrette', state: 'emulsified', location: 'bowl' },
    { regex: /\b(batter|dough)\b/, name: text.includes('dough') ? 'dough' : 'batter', state: 'mixed', location: 'bowl' },
    { regex: /\b(marinade)\b/, name: 'marinade', state: 'mixed', location: 'bowl' },
  ]

  intermediateKeywords.forEach(({ regex, name, state, location }) => {
    if (regex.test(text)) {
      const alreadyExists = currentEntities.some((e) => e.name.toLowerCase() === name.toLowerCase())
      if (!alreadyExists) {
        newIntermediates.push({
          name,
          type: 'intermediate',
          state,
          location,
          source: 'infer',
        })
      }
    }
  })

  return { stateUpdates, newIntermediates }
}

/**
 * Applies step completion transitions to the state board.
 * Supports explicit processGraph metadata or deterministic culinary heuristics.
 * @param {Object} tracker
 * @param {number} stepIndex
 * @param {string|Object} step
 * @param {Object} [options]
 * @returns {Object} Updated tracker
 */
export function applyStepTransition(tracker, stepIndex, step, options = {}) {
  if (!tracker || !Array.isArray(tracker.entities)) {
    return tracker
  }

  const stepText = typeof step === 'string' ? step : (step?.text || step?.name || '')
  const graphTransitions = step?.stateUpdates || step?.transitions || options.transitions || []
  const now = Date.now()

  // 1. Gather updates from graph metadata or inference
  const { stateUpdates: inferredUpdates, newIntermediates } = inferStepActions(stepText, tracker.entities)
  const allUpdates = [...graphTransitions, ...inferredUpdates]

  const changes = []
  const entityMap = new Map(tracker.entities.map((e) => [e.id, { ...e }]))

  // 2. Apply updates to existing entities
  allUpdates.forEach((update) => {
    const target = entityMap.get(update.id)
    if (target) {
      const previousState = target.state
      const previousLocation = target.location
      const nextState = update.state || previousState
      const nextLocation = update.location || previousLocation

      if (previousState !== nextState || previousLocation !== nextLocation) {
        target.state = nextState
        target.location = nextLocation
        target.source = update.source || 'step'
        target.updatedAt = now
        changes.push({
          entityId: target.id,
          name: target.name,
          type: target.type,
          previousState,
          nextState,
          previousLocation,
          nextLocation,
          source: target.source,
        })
      }
    }
  })

  // 3. Add newly formed intermediates
  const updatedEntities = Array.from(entityMap.values())
  newIntermediates.forEach((inter, idx) => {
    const newId = `inter-step${stepIndex}-${idx}-${inter.name.replace(/\s+/g, '-').slice(0, 24)}`
    const newEntity = {
      id: newId,
      name: inter.name,
      type: 'intermediate',
      state: inter.state || 'mixed',
      location: inter.location || 'bowl',
      source: 'infer',
      updatedAt: now,
    }
    updatedEntities.push(newEntity)
    changes.push({
      entityId: newId,
      name: newEntity.name,
      type: 'intermediate',
      previousState: null,
      nextState: newEntity.state,
      previousLocation: null,
      nextLocation: newEntity.location,
      source: 'infer',
    })
  })

  // 4. Record history diff entry
  const historyEntry = {
    stepIndex,
    stepText: stepText.slice(0, 100),
    timestamp: now,
    changes,
  }

  return {
    ...tracker,
    updatedAt: now,
    entities: updatedEntities,
    history: [...(tracker.history || []), historyEntry],
  }
}

/**
 * Manually patches an entity's state (e.g. from user chip tap).
 * @param {Object} tracker
 * @param {string} entityId
 * @param {Object} patch
 * @param {string} [source='user']
 * @returns {Object} Updated tracker
 */
export function patchEntityState(tracker, entityId, patch = {}, source = 'user') {
  if (!tracker || !Array.isArray(tracker.entities)) return tracker
  const now = Date.now()
  let diff = null

  const updatedEntities = tracker.entities.map((e) => {
    if (e.id === entityId) {
      const previousState = e.state
      const previousLocation = e.location
      const nextState = patch.state !== undefined ? patch.state : previousState
      const nextLocation = patch.location !== undefined ? patch.location : previousLocation
      const nextQty = patch.quantityRemaining !== undefined ? patch.quantityRemaining : e.quantityRemaining

      diff = {
        entityId: e.id,
        name: e.name,
        type: e.type,
        previousState,
        nextState,
        previousLocation,
        nextLocation,
        source,
      }

      return {
        ...e,
        state: nextState,
        location: nextLocation,
        quantityRemaining: nextQty,
        source,
        updatedAt: now,
      }
    }
    return e
  })

  const historyEntry = diff ? [{
    stepIndex: -1,
    stepText: 'manual_patch',
    timestamp: now,
    changes: [diff],
  }] : []

  return {
    ...tracker,
    updatedAt: now,
    entities: updatedEntities,
    history: [...(tracker.history || []), ...historyEntry],
  }
}

/**
 * Validates a cooking action against the current live state board.
 * Catches wrong-state operations (e.g., searing frozen meat, plating unreduced sauce, carving un-rested meat).
 * @param {Object} tracker
 * @param {Object} actionSpec
 * @param {string} actionSpec.action - 'sear' | 'cook' | 'plate' | 'slice' | 'carve' | etc.
 * @param {string} [actionSpec.entity] - entity name or ID
 * @returns {{ valid: boolean, warning?: string, severity?: 'critical' | 'soft_gate' | 'info', entityId?: string }}
 */
export function validateAction(tracker, { action = '', entity = '' } = {}) {
  if (!tracker || !Array.isArray(tracker.entities)) return { valid: true }

  const act = action.toLowerCase().trim()
  const targetName = entity.toLowerCase().trim()

  const target = tracker.entities.find(
    (e) => e.id === entity || e.name.toLowerCase() === targetName || targetName.includes(e.name.toLowerCase())
  )

  if (!target) {
    // If no specific entity given or found, scan for general critical violations
    if (['sear', 'fry', 'sauté', 'cook', 'bake', 'roast'].includes(act)) {
      const frozenEntity = tracker.entities.find((e) => e.state === 'frozen' && e.type === 'ingredient')
      if (frozenEntity) {
        return {
          valid: false,
          warning: `Food Safety Warning: "${frozenEntity.name}" is still marked as frozen. Thaw completely before ${act}ing.`,
          severity: 'critical',
          entityId: frozenEntity.id,
        }
      }
    }
    return { valid: true }
  }

  // Check 1: Searing/Cooking frozen protein or ingredient (Fail-closed critical food safety)
  if (['sear', 'cook', 'fry', 'sauté', 'bake', 'roast', 'grill'].includes(act) && target.state === 'frozen') {
    return {
      valid: false,
      warning: `Food Safety Warning: "${target.name}" is marked as frozen. Searing frozen proteins can lead to undercooked centers and flare-ups. Thaw thoroughly first.`,
      severity: 'critical',
      entityId: target.id,
    }
  }

  // Check 2: Plating unreduced or raw sauce / glaze (Soft-gate process check)
  if (['plate', 'serve', 'garnish'].includes(act) && target.name.includes('sauce') && ['raw', 'simmering', 'boiling'].includes(target.state)) {
    return {
      valid: false,
      warning: `Process Notice: "${target.name}" is currently ${target.state} and has not reached the reduced/ready state required for plating.`,
      severity: 'soft_gate',
      entityId: target.id,
    }
  }

  // Check 3: Slicing hot meat before resting (Quality info)
  if (['slice', 'carve', 'cut'].includes(act) && target.type === 'ingredient' && ['seared', 'roasted', 'baked', 'hot'].includes(target.state)) {
    return {
      valid: false,
      warning: `Culinary Tip: "${target.name}" is hot and hasn't rested yet. Resting allows juices to redistribute.`,
      severity: 'info',
      entityId: target.id,
    }
  }

  return { valid: true }
}

/**
 * Filters salvage / troubleshooting actions based on actual current entity states.
 * @param {Array<Object>} salvageOptions
 * @param {Object} tracker
 * @returns {Array<Object>} Filtered options
 */
export function filterSalvageOptions(salvageOptions = [], tracker) {
  if (!Array.isArray(salvageOptions) || !tracker || !Array.isArray(tracker.entities)) {
    return salvageOptions
  }

  const entities = tracker.entities
  const hasSauceOrEmulsion = entities.some(
    (e) => (e.type === 'intermediate' || e.name.includes('sauce') || e.name.includes('dressing')) &&
           ['mixed', 'emulsified', 'simmering', 'reduced', 'cooked', 'in-use', 'hot'].includes(e.state)
  )
  const hasCookedItems = entities.some(
    (e) => ['seared', 'sautéed', 'simmering', 'boiling', 'reduced', 'roasted', 'baked'].includes(e.state)
  )

  return salvageOptions.filter((option) => {
    const issueId = (option.id || option.type || option.title || '').toLowerCase()
    // "split sauce" or "broken emulsion" only applicable if sauce intermediate exists
    if (issueId.includes('split') || issueId.includes('emulsion') || issueId.includes('broken')) {
      return hasSauceOrEmulsion
    }
    // "too salty" / "too spicy" in active dishes
    if (issueId.includes('salty') || issueId.includes('spicy')) {
      return hasCookedItems || hasSauceOrEmulsion
    }
    return true
  })
}

/**
 * Exports serializable state snapshot for pause persistence / co-cook sync.
 * @param {Object} tracker
 * @returns {Object}
 */
export function exportStateSnapshot(tracker) {
  if (!tracker) return null
  return {
    version: tracker.version || 1,
    recipeId: tracker.recipeId || null,
    updatedAt: tracker.updatedAt || Date.now(),
    entities: tracker.entities.map((e) => ({ ...e })),
    history: tracker.history ? tracker.history.map((h) => ({ ...h })) : [],
  }
}

/**
 * Restores state tracker from a snapshot.
 * @param {Object} snapshot
 * @returns {Object}
 */
export function restoreStateSnapshot(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.entities)) {
    return createIngredientStateTracker()
  }
  return {
    version: snapshot.version || 1,
    recipeId: snapshot.recipeId || null,
    createdAt: snapshot.createdAt || Date.now(),
    updatedAt: snapshot.updatedAt || Date.now(),
    entities: snapshot.entities.map((e) => ({
      ...e,
      state: VALID_STATE_ENUM.includes(e.state) ? e.state : (e.state || 'raw'),
      location: VALID_LOCATIONS.includes(e.location) ? e.location : 'counter',
    })),
    history: Array.isArray(snapshot.history) ? snapshot.history : [],
  }
}
