/**
 * Multi-day Living Cook Projects V1 (#537)
 *
 * Implements data structures, stage graph management, durable multi-day timers,
 * and check-in schedules for ferments, sourdough, cures, and brines.
 */

export const LIVING_PROJECT_TYPES = {
  SOURDOUGH: 'sourdough',
  FERMENT: 'ferment',
  BRINE: 'brine',
  CURE: 'cure',
  STARTER: 'starter',
  CUSTOM: 'custom',
}

export const STAGE_TYPES = {
  MIX: 'mix',
  AUTOLYSE: 'autolyse',
  BULK: 'bulk',
  FOLD: 'fold',
  SHAPE: 'shape',
  PROOF: 'proof',
  RETARD: 'retard',
  BAKE: 'bake',
  INCUBATE: 'incubate',
  FEED: 'feed',
  BURP: 'burp',
  BRINE: 'brine',
  CURE: 'cure',
  REST: 'rest',
  CUSTOM: 'custom',
}

/**
 * Normalizes a LivingProjectV1 entity.
 * @param {object} raw
 * @returns {object}
 */
export function normalizeLivingProject(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      id: `proj-${Date.now()}`,
      type: LIVING_PROJECT_TYPES.CUSTOM,
      recipeId: null,
      title: 'Untitled Project',
      stageGraph: [],
      activeStageIndex: 0,
      status: 'active', // 'active' | 'paused' | 'completed' | 'abandoned'
      startedAt: new Date().toISOString(),
      nextCheckInAt: null,
      notes: '',
      safetyFlags: [],
    }
  }

  const stages = Array.isArray(raw.stageGraph) ? raw.stageGraph : []
  const activeStageIndex = typeof raw.activeStageIndex === 'number' ? Math.max(0, raw.activeStageIndex) : 0

  return {
    id: String(raw.id || `proj-${Date.now()}`),
    type: Object.values(LIVING_PROJECT_TYPES).includes(raw.type) ? raw.type : LIVING_PROJECT_TYPES.CUSTOM,
    recipeId: raw.recipeId ? String(raw.recipeId) : null,
    title: String(raw.title || 'Untitled Project').trim(),
    stageGraph: stages.map((s, idx) => ({
      id: s.id || `stage-${idx}`,
      name: String(s.name || `Stage ${idx + 1}`),
      type: s.type || STAGE_TYPES.CUSTOM,
      durationHours: Number(s.durationHours || s.durationHint || 0),
      conditionHints: Array.isArray(s.conditionHints) ? s.conditionHints : [],
      instructions: Array.isArray(s.instructions) ? s.instructions : [String(s.instructions || '')],
      completedAt: s.completedAt || null,
    })),
    activeStageIndex,
    status: ['active', 'paused', 'completed', 'abandoned'].includes(raw.status) ? raw.status : 'active',
    startedAt: raw.startedAt || new Date().toISOString(),
    nextCheckInAt: raw.nextCheckInAt || null,
    notes: String(raw.notes || ''),
    safetyFlags: Array.isArray(raw.safetyFlags) ? raw.safetyFlags : [],
  }
}

/**
 * Creates standard sourdough template project with multi-stage timeline.
 * @param {object} [options]
 * @returns {object}
 */
export function createSourdoughProjectTemplate(options = {}) {
  return normalizeLivingProject({
    id: `sourdough-${Date.now()}`,
    type: LIVING_PROJECT_TYPES.SOURDOUGH,
    title: options.title || 'Artisan Sourdough Loaf',
    recipeId: options.recipeId || null,
    stageGraph: [
      {
        id: 'autolyse',
        name: 'Autolyse Flour & Water',
        type: STAGE_TYPES.AUTOLYSE,
        durationHours: 1,
        conditionHints: ['Flour fully hydrated', 'Shaggy dough relaxed'],
        instructions: ['Mix flour and water gently; let rest covered for 1 hour.'],
      },
      {
        id: 'bulk_ferment',
        name: 'Bulk Fermentation & Folds',
        type: STAGE_TYPES.BULK,
        durationHours: 4,
        conditionHints: ['Dough expanded by 30-50%', 'Aerated domed top', 'Jiggly structure'],
        instructions: ['Perform 4 stretch-and-folds spaced 30 mins apart during first 2 hours.'],
      },
      {
        id: 'cold_retard',
        name: 'Overnight Cold Retard',
        type: STAGE_TYPES.RETARD,
        durationHours: 14,
        conditionHints: ['Dough holds poke test', 'Chilled firm shape'],
        instructions: ['Transfer shaped banneton into refrigerator (38°F) for 12-16 hours.'],
      },
      {
        id: 'bake',
        name: 'Preheat Dutch Oven & Bake',
        type: STAGE_TYPES.BAKE,
        durationHours: 1,
        conditionHints: ['Deep golden crust', 'Hollow sound when tapped'],
        instructions: ['Score cold loaf; bake at 450°F in covered Dutch oven for 20 mins, then 20 mins uncovered.'],
      },
    ],
    nextCheckInAt: new Date(Date.now() + 1 * 3600 * 1000).toISOString(),
  })
}

/**
 * Advances a project to its next stage.
 * @param {object} project
 * @returns {object}
 */
export function advanceLivingProjectStage(project) {
  const norm = normalizeLivingProject(project)
  const nextIndex = norm.activeStageIndex + 1
  const updatedStages = [...norm.stageGraph]

  if (updatedStages[norm.activeStageIndex]) {
    updatedStages[norm.activeStageIndex] = {
      ...updatedStages[norm.activeStageIndex],
      completedAt: new Date().toISOString(),
    }
  }

  const isCompleted = nextIndex >= updatedStages.length
  const nextStage = updatedStages[nextIndex]
  const nextCheckIn = nextStage && nextStage.durationHours > 0
    ? new Date(Date.now() + nextStage.durationHours * 3600 * 1000).toISOString()
    : null

  return {
    ...norm,
    stageGraph: updatedStages,
    activeStageIndex: nextIndex,
    status: isCompleted ? 'completed' : 'active',
    nextCheckInAt: nextCheckIn,
  }
}
