import { AllergenSafetyError, enforceAllergenSafety } from '../../shared/allergen-graph.js';
import {
  ProcessSafetyError,
  analyzeProcessSafety,
  describeProcessSafetyDecision,
  enforceProcessSafety,
  isProcessSafetyEnabled
} from '../../shared/food-process-safety.js';

/**
 * Emit an auditable record of every gate decision that found something. The
 * record carries tag names and policies only, never recipe text, so it is safe
 * to forward to Opik or worker logs.
 */
function logProcessSafetyDecision(summary, context) {
  if (!summary || summary.tags.length === 0) return;
  console.log(JSON.stringify(describeProcessSafetyDecision(summary, context)));
}

/**
 * Apply the food-process gates to a recipe after it has been normalized.
 *
 * Blocking hazards throw; template and rewrite policies are applied in place so
 * the returned recipe never carries improvised preservation instructions.
 */
export function applyProcessSafetyGates(recipe, env = {}, context = {}) {
  if (!isProcessSafetyEnabled(env)) {
    console.warn(JSON.stringify({
      'process_safety.checked': false,
      'process_safety.disabled_reason': String(env.PROCESS_SAFETY_BREAK_GLASS || '').toLowerCase() === 'true'
        ? 'break_glass'
        : 'flag_off_non_production',
      'process_safety.environment': env.ENVIRONMENT || 'unknown',
      ...context
    }));
    return recipe;
  }

  try {
    const annotated = enforceProcessSafety(recipe);
    logProcessSafetyDecision(annotated.processSafetySummary, context);
    return annotated;
  } catch (error) {
    if (error instanceof ProcessSafetyError) logProcessSafetyDecision(error.summary, context);
    throw error;
  }
}

/**
 * Run both safety checkers at a response boundary.
 *
 * Allergens stay primary: an allergen conflict is reported as an allergen
 * failure even when a process hazard is present. The process summary rides
 * along on the error so the client receives one combined payload.
 */
export function enforceRecipeSafety(recipe, hardAllergens = [], env = {}, context = {}) {
  try {
    return applyProcessSafetyGates(enforceAllergenSafety(recipe, hardAllergens), env, context);
  } catch (error) {
    if (error instanceof AllergenSafetyError && isProcessSafetyEnabled(env)) {
      const summary = analyzeProcessSafety(recipe);
      if (summary.tags.length > 0) {
        error.processSafetySummary = summary;
        logProcessSafetyDecision(summary, context);
      }
    }
    throw error;
  }
}

export { ProcessSafetyError };
