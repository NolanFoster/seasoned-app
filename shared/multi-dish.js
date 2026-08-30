/**
 * Multi-dish cooking orchestration helpers for Cooking Navigator.
 * Generates unified timelines, interleaves steps, and flags shared equipment conflicts.
 */

export const EXCLUSIVE_EQUIPMENT_KEYWORDS = {
  OVEN: ['oven', 'bake', 'roast', 'broil', '350', '375', '400', '425', '450'],
  MICROWAVE: ['microwave'],
  BLENDER: ['blender', 'food processor'],
  AIR_FRYER: ['air fryer'],
}

/**
 * Detects exclusive appliance usage in a step text.
 * @param {string} stepText
 * @returns {string[]} List of appliance keys
 */
export function detectStepAppliance(stepText) {
  if (!stepText || typeof stepText !== 'string') return []
  const lower = stepText.toLowerCase()
  const detected = []

  for (const [key, keywords] of Object.entries(EXCLUSIVE_EQUIPMENT_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      detected.push(key)
    }
  }

  return detected
}

/**
 * Detects equipment conflicts between active steps across multiple dishes.
 * @param {Array<{recipeName: string, stepIndex: number, stepText: string}>} activeSteps
 * @returns {Array<{appliance: string, recipes: string[], message: string}>}
 */
export function detectEquipmentConflicts(activeSteps) {
  if (!Array.isArray(activeSteps) || activeSteps.length < 2) return []

  const applianceUsage = {} // { APPLIANCE: [recipeName] }

  for (const step of activeSteps) {
    const appliances = detectStepAppliance(step.stepText)
    for (const app of appliances) {
      if (!applianceUsage[app]) applianceUsage[app] = []
      if (!applianceUsage[app].includes(step.recipeName)) {
        applianceUsage[app].push(step.recipeName)
      }
    }
  }

  const conflicts = []
  for (const [appliance, recipes] of Object.entries(applianceUsage)) {
    if (recipes.length > 1) {
      conflicts.push({
        appliance,
        recipes,
        message: `Both "${recipes[0]}" and "${recipes[1]}" need the ${appliance.toLowerCase()} simultaneously.`,
      })
    }
  }

  return conflicts
}

/**
 * Normalizes an array of recipes for multi-dish session state.
 * @param {Array<object>} recipes
 * @returns {Array<object>}
 */
export function normalizeMultiDishSession(recipes) {
  if (!Array.isArray(recipes)) return []
  return recipes.map((recipe, idx) => ({
    id: recipe.id || `dish-${idx}`,
    name: recipe.name || `Dish ${idx + 1}`,
    ingredients: recipe.ingredients || [],
    instructions: recipe.instructions || [],
    allergenSummary: recipe.allergenSummary || null,
    processSafetySummary: recipe.processSafetySummary || null,
  }))
}
