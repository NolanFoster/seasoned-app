import {
  applyGraphMove,
  collectViolations,
  decideStatus,
  getRecipeRemediationMode,
  MAX_RECIPE_REMEDIATION_ATTEMPTS,
  RECIPE_REMEDIATION_MODEL_ID,
  proposeLegalMoves
} from '../../shared/recipe-remediation.js';
import { enforceRecipeSafety } from './process-safety.js';
import { isProcessSafetyEnabled } from '../../shared/food-process-safety.js';
import { assertRecipeQuality, RecipeQualityError } from './quality-bar.js';

const REMEDIATION_MODEL = '@cf/meta/llama-4-scout-17b-16e-instruct';
const INSTRUCTION_FIELDS = new Set(['instructions', 'steps', 'directions', 'recipeInstructions']);
const ARRAY_FIELDS = new Set([
  'ingredients', 'sourceIngredients', 'recipeIngredient',
  ...INSTRUCTION_FIELDS
]);

export class RecipeRemediationAbstainError extends Error {
  constructor({ attempts, violations }) {
    super('Recipe remediation abstained because deterministic gates did not clear.');
    this.name = 'RecipeRemediationAbstainError';
    this.code = 'RECIPE_REMEDIATION_ABSTAIN';
    this.status = 422;
    this.attempts = attempts;
    this.violations = violations;
  }
}

function errorQualityIssues(error) {
  return error instanceof RecipeQualityError ? error.result : null;
}

function collectForError(recipe, constraints, error, env) {
  return collectViolations(recipe, constraints, {
    qualityIssues: errorQualityIssues(error),
    processSafetyEnabled: isProcessSafetyEnabled(env)
  });
}

function gateCandidate(recipe, constraints, env, context) {
  const hardAllergens = constraints.hardAllergens || [];
  const safetyChecked = enforceRecipeSafety(recipe, hardAllergens, env, context);
  assertRecipeQuality(safetyChecked, { hardAllergens });
  return safetyChecked;
}

function normalizeModelResponse(response) {
  let value = response?.response ?? response;
  if (value && typeof value === 'object' && !Array.isArray(value) && value.recipe) {
    value = value.recipe;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try {
      value = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function allowedInstructionUpdates(violations) {
  const allowed = new Set();
  for (const violation of violations) {
    if (violation.field !== 'instruction'
      || !Array.isArray(violation.sourcePath)
      || !Number.isInteger(violation.lineIndex)) continue;
    allowed.add(`${violation.sourcePath.join('.')}:${violation.lineIndex}`);
  }
  return allowed;
}

function applyCitedUpdates(recipe, updates, violations) {
  if (!Array.isArray(updates)) return null;
  const allowed = allowedInstructionUpdates(violations);
  if (updates.length === 0 || updates.length > 20) return null;
  let next = recipe;
  const seen = new Set();
  for (const update of updates) {
    const field = typeof update?.field === 'string' ? update.field : '';
    const path = field.split('.').filter(Boolean);
    const index = update?.index;
    const text = typeof update?.text === 'string' ? update.text.trim() : '';
    const key = `${field}:${index}`;
    if (!path.length || !ARRAY_FIELDS.has(path[path.length - 1])
      || !Number.isInteger(index) || index < 0 || !text || seen.has(key)) return null;
    // Allergen repair may rewrite cited instruction lines only. Ingredient
    // changes are deterministic graph moves, never model-authored swaps.
    if (!INSTRUCTION_FIELDS.has(path[path.length - 1]) || !allowed.has(key)) return null;
    const parentPath = path.slice(0, -1);
    let parent = next;
    for (const part of parentPath) parent = parent?.[part];
    const sourceArray = parent?.[path[path.length - 1]];
    if (!Array.isArray(sourceArray) || index >= sourceArray.length) return null;
    const item = sourceArray[index];
    const textField = item && typeof item === 'object' && !Array.isArray(item)
      ? ['text', 'name', 'step', 'ingredient', 'original'].find((candidate) => typeof item[candidate] === 'string')
      : null;
    const replacement = textField ? { ...item, [textField]: text } : text;
    const copy = { ...next };
    let source = next;
    let target = copy;
    for (const part of parentPath) {
      const sourceChild = source?.[part];
      const targetChild = sourceChild && typeof sourceChild === 'object' && !Array.isArray(sourceChild)
        ? { ...sourceChild }
        : sourceChild;
      target[part] = targetChild;
      source = sourceChild;
      target = targetChild;
    }
    const fieldName = path[path.length - 1];
    target[fieldName] = [...source[fieldName]];
    target[fieldName][index] = replacement;
    next = copy;
    seen.add(key);
  }
  return next;
}

async function reviseCitedLines(recipe, violations, env) {
  if (!env?.AI || typeof env.AI.run !== 'function') return null;
  const allowedLines = violations
    .filter((violation) => violation.field === 'instruction' && Number.isInteger(violation.lineIndex))
    .map((violation) => ({
      field: violation.sourcePath?.join('.') || 'instructions',
      index: violation.lineIndex,
      line: violation.line,
      gate: violation.gate,
      code: violation.code,
      allergen: violation.allergen,
      matchedTerm: violation.matchedTerm,
      tag: violation.tag
    }));
  if (allowedLines.length === 0) return null;

  const response = await env.AI.run(REMEDIATION_MODEL, {
    messages: [
      {
        role: 'system',
        content: 'Revise only the cited instruction lines in this recipe. The deterministic safety gate is the approver; do not claim a recipe is safe. Do not add ingredients, change servings, times, or the dish name. Return JSON only as {"updates":[{"field":"instructions","index":0,"text":"..."}]}. Only return updates for the cited field/index pairs. Do not return the recipe or any unchanged lines.'
      },
      {
        role: 'user',
        content: JSON.stringify({ recipe, violations: allowedLines })
      }
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'recipe_remediation_updates',
        schema: {
          type: 'object',
          properties: {
            updates: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string' },
                  index: { type: 'integer' },
                  text: { type: 'string' }
                },
                required: ['field', 'index', 'text']
              }
            }
          },
          required: ['updates']
        }
      }
    },
    max_tokens: 1536,
    temperature: 0.1
  });
  const parsed = normalizeModelResponse(response);
  const revisedRecipe = applyCitedUpdates(recipe, parsed?.updates, violations);
  return revisedRecipe ? { recipe: revisedRecipe, updates: parsed.updates } : null;
}

function shadowTelemetry(status, attempts, violations, repairs) {
  const gateCodes = [...new Set(violations.map((violation) => violation.code))].sort();
  const gates = [...new Set(violations.map((violation) => violation.gate))].sort();
  return {
    modelId: RECIPE_REMEDIATION_MODEL_ID,
    status,
    attempts,
    violationCount: violations.length,
    repairCount: repairs.length,
    gates,
    gateCodes
  };
}

function logShadowResult(status, attempts, violations, repairs) {
  // Counts and codes only: never include recipe, ingredient, profile, or prompt text.
  // eslint-disable-next-line no-console -- Shadow telemetry is intentionally count/code-only.
  console.info('Recipe remediation shadow telemetry', JSON.stringify(
    shadowTelemetry(status, attempts, violations, repairs)
  ));
}

/**
 * Apply the existing deterministic gates first. On gate failure, use a bounded
 * graph-first repair loop; every candidate must clear those same gates and the
 * quality bar before it can be returned. `off` preserves the old throw path.
 */
export async function enforceRecipeSafetyWithRemediation(recipe, {
  constraints = {},
  env = {},
  context = {},
  initialError = null
} = {}) {
  const mode = getRecipeRemediationMode(env);
  if (mode === 'off') {
    if (initialError) throw initialError;
    return { recipe: enforceRecipeSafety(recipe, constraints.hardAllergens || [], env, context), remediation: null };
  }

  let originalError = initialError;
  if (!originalError) {
    try {
      return {
        recipe: enforceRecipeSafety(recipe, constraints.hardAllergens || [], env, context),
        remediation: null
      };
    } catch (error) {
      originalError = error;
    }
  }

  const initialViolations = collectForError(recipe, constraints, originalError, env);
  if (initialViolations.length === 0) throw originalError;

  let current = recipe;
  let currentError = originalError;
  let violations = initialViolations;
  let attempts = 0;
  let characterChange = false;
  const repairs = [];
  const attempted = new Set();

  while (attempts < MAX_RECIPE_REMEDIATION_ATTEMPTS) {
    const moves = proposeLegalMoves(violations, {
      recipe: current,
      hardAllergens: constraints.hardAllergens || []
    }).filter((move) => {
      const key = `${move.move}:${move.allergen || ''}:${move.matchedTerm || ''}:${move.lineIndex ?? ''}`;
      if (attempted.has(key)) return false;
      attempted.add(key);
      return true;
    });
    if (moves.length === 0) break;

    attempts += 1;
    let candidate = current;
    let changedThisAttempt = false;
    // If several lines need changes, remove descending indexes so array drops do
    // not invalidate the remaining cited positions.
    const orderedMoves = [...moves].sort((left, right) => {
      if (left.move !== 'drop' || right.move !== 'drop') return 0;
      return (right.locations?.[0]?.index ?? -1) - (left.locations?.[0]?.index ?? -1);
    });
    for (const move of orderedMoves) {
      const applied = applyGraphMove(candidate, move);
      if (!applied.repair) continue;
      candidate = applied.recipe;
      repairs.push(applied.repair);
      characterChange ||= applied.characterChange;
      changedThisAttempt = true;
    }

    if (moves.some((move) => move.requiresModelRevision)) {
      try {
        const revised = await reviseCitedLines(candidate, violations, env);
        if (revised) {
          candidate = revised.recipe;
          for (const update of revised.updates) {
            const source = violations.find((violation) =>
              violation.field === 'instruction' && violation.lineIndex === update.index
              && violation.sourcePath?.join('.') === update.field);
            repairs.push({
              lineIndex: update.index,
              move: 'revise_cited_lines',
              from: source?.line || null,
              to: update.text,
              graphChecked: false,
              characterChange: false
            });
          }
          changedThisAttempt = true;
        }
      } catch {
        // Model output is untrusted. A failed call is a failed revision and the
        // candidate will still be checked below; it can never bypass a gate.
      }
    }

    if (!changedThisAttempt) break;
    try {
      const safeRecipe = gateCandidate(candidate, constraints, env, context);
      const status = decideStatus(initialViolations, [], attempts);
      const remediation = {
        modelId: RECIPE_REMEDIATION_MODEL_ID,
        status: status.status,
        attempts,
        violations: initialViolations,
        repairs,
        abstained: false,
        ...(characterChange ? { reviewRequired: true } : {})
      };
      if (mode === 'shadow') {
        logShadowResult('repaired', attempts, initialViolations, repairs);
        throw originalError;
      }
      return {
        recipe: {
          ...safeRecipe,
          remediation,
          ...(characterChange ? { reviewRequired: true } : {})
        },
        remediation
      };
    } catch (error) {
      if (error === originalError) throw error;
      current = candidate;
      currentError = error;
      violations = collectForError(current, constraints, currentError, env);
      if (violations.length === 0) {
        // A non-gate error must not be mistaken for a successful repair.
        break;
      }
    }
  }

  if (mode === 'shadow') {
    logShadowResult('abstained', attempts, initialViolations, repairs);
    throw originalError;
  }
  throw new RecipeRemediationAbstainError({ attempts, violations: initialViolations });
}

export { reviseCitedLines };
