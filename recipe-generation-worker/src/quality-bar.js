import { analyzeRecipeAllergens } from '../../shared/allergen-graph.js';
import { calculateProcessGraphCoverage } from '../../shared/recipe-process-graph.js';

const DEFAULT_MODEL = '@cf/meta/llama-4-scout-17b-16e-instruct';
const STOP_WORDS = new Set([
  'and', 'with', 'from', 'into', 'your', 'this', 'that', 'for', 'the', 'use',
  'cup', 'cups', 'tsp', 'tbsp', 'tablespoon', 'tablespoons', 'teaspoon',
  'teaspoons', 'ounce', 'ounces', 'oz', 'pound', 'pounds', 'lb', 'lbs',
  'gram', 'grams', 'g', 'kg', 'piece', 'pieces', 'small', 'medium', 'large',
  'fresh', 'optional', 'divided', 'plus', 'more', 'taste'
]);

function asLines(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (!item || typeof item !== 'object' || Array.isArray(item)) return '';
      return [item.name, item.text, item.ingredient, item.original]
        .find((candidate) => typeof candidate === 'string' && candidate.trim())?.trim() || '';
    })
    .filter(Boolean);
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function meaningfulTokens(line) {
  return normalizeText(line)
    .split(' ')
    .filter((token) => token.length >= 4 && !STOP_WORDS.has(token) && !/^\d+$/.test(token));
}

/** Convert common recipe duration formats into minutes for consistency checks. */
export function parseDurationMinutes(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const text = value.trim().toUpperCase();
  if (!text) return null;

  if (text.startsWith('P')) {
    const hours = Number(text.match(/(\d+(?:\.\d+)?)H/)?.[1] || 0);
    const minutes = Number(text.match(/(\d+(?:\.\d+)?)M/)?.[1] || 0);
    const seconds = Number(text.match(/(\d+(?:\.\d+)?)S/)?.[1] || 0);
    const total = (hours * 60) + minutes + (seconds / 60);
    return total > 0 ? total : null;
  }

  const hours = Number(text.match(/(\d+(?:\.\d+)?)\s*(?:HOUR|HR)/)?.[1] || 0);
  const minutes = Number(text.match(/(\d+(?:\.\d+)?)\s*(?:MINUTE|MIN)/)?.[1] || 0);
  if (hours || minutes) return (hours * 60) + minutes;

  const numeric = Number(text.replace(/[^0-9.]/g, ''));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function checkIngredientCoverage(ingredients, instructions) {
  if (ingredients.length === 0 || instructions.length === 0) {
    return { covered: 0, total: ingredients.length, ratio: 0, uncovered: ingredients };
  }

  const instructionText = normalizeText(instructions.join(' '));
  const uncovered = ingredients.filter((ingredient) => {
    const tokens = meaningfulTokens(ingredient);
    return tokens.length > 0 && !tokens.some((token) => instructionText.includes(token));
  });
  const covered = ingredients.length - uncovered.length;
  return {
    covered,
    total: ingredients.length,
    ratio: ingredients.length > 0 ? covered / ingredients.length : 0,
    uncovered
  };
}

function checkTiming(recipe) {
  const prep = parseDurationMinutes(recipe.prepTime ?? recipe.prep_time);
  const cook = parseDurationMinutes(recipe.cookTime ?? recipe.cook_time);
  const total = parseDurationMinutes(recipe.totalTime ?? recipe.total_time);

  if (prep === null || cook === null || total === null) {
    return { status: 'skipped', prep, cook, total, message: 'Timing fields are incomplete.' };
  }

  const expected = prep + cook;
  const tolerance = Math.max(5, expected * 0.25);
  const consistent = total >= expected - tolerance && total <= expected + tolerance;
  return {
    status: consistent ? 'passed' : 'warning',
    prep,
    cook,
    total,
    expected,
    message: consistent
      ? 'Prep, cook, and total times are consistent.'
      : 'Total time differs materially from prep plus cook time.'
  };
}

function allergenStatus(summary) {
  if (!summary) return 'not_checked';
  if ((summary.blocked || []).length > 0) return 'blocked';
  if (summary.needs_review || summary.safe === false) return 'needs_review';
  return 'passed';
}

/**
 * Run deterministic, model-independent checks on an AI recipe.
 *
 * The two empty-content checks are blocking: returning a recipe without
 * ingredients or instructions is never useful. Other checks are surfaced as
 * warnings so users and evaluators can see quality gaps without rejecting
 * otherwise usable recipes.
 */
export function evaluateRecipeQuality(recipe = {}, { hardAllergens = [] } = {}) {
  const ingredients = asLines(recipe.ingredients || recipe.recipeIngredient);
  const instructions = asLines(recipe.instructions || recipe.steps || recipe.directions);
  const coverage = checkIngredientCoverage(ingredients, instructions);
  const timing = checkTiming(recipe);
  const providedAllergenSummary = recipe.allergenSummary;
  const computedAllergenSummary = providedAllergenSummary || (hardAllergens.length > 0
    ? analyzeRecipeAllergens(recipe, hardAllergens)
    : null);
  const safety = allergenStatus(computedAllergenSummary);

  const checks = {
    hasIngredients: {
      status: ingredients.length > 0 ? 'passed' : 'failed',
      message: ingredients.length > 0 ? 'Ingredients are present.' : 'Recipe has no ingredients.'
    },
    hasInstructions: {
      status: instructions.length > 0 ? 'passed' : 'failed',
      message: instructions.length > 0 ? 'Instructions are present.' : 'Recipe has no instructions.'
    },
    ingredientCoverage: {
      status: coverage.ratio >= 0.75 ? 'passed' : coverage.ratio > 0 ? 'warning' : 'failed',
      ratio: coverage.ratio,
      covered: coverage.covered,
      total: coverage.total,
      uncovered: coverage.uncovered,
      message: coverage.uncovered.length > 0
        ? `${coverage.uncovered.length} ingredient(s) are not clearly referenced in the instructions.`
        : 'Ingredients are referenced in the instructions.'
    },
    timing: {
      ...timing
    },
    allergenSafety: {
      status: safety,
      summary: computedAllergenSummary || null,
      message: safety === 'blocked'
        ? 'Allergen validation blocked this recipe.'
        : safety === 'needs_review'
          ? 'Allergen validation needs ingredient-label review.'
          : safety === 'passed'
            ? 'Allergen validation passed.'
            : 'Allergen validation was not requested.'
    }
  };

  const blockingIssues = [];
  if (checks.hasIngredients.status === 'failed') blockingIssues.push('missing_ingredients');
  if (checks.hasInstructions.status === 'failed') blockingIssues.push('missing_instructions');
  if (checks.allergenSafety.status === 'blocked') blockingIssues.push('allergen_safety_block');

  const warnings = [];
  if (checks.ingredientCoverage.status !== 'passed') warnings.push('ingredient_step_coverage');
  if (checks.timing.status === 'warning') warnings.push('timing_consistency');
  if (checks.allergenSafety.status === 'needs_review') warnings.push('allergen_review');

  let score = 100;
  if (checks.hasIngredients.status === 'failed') score -= 40;
  if (checks.hasInstructions.status === 'failed') score -= 40;
  if (checks.ingredientCoverage.status === 'warning') score -= 10;
  if (checks.ingredientCoverage.status === 'failed') score -= 20;
  if (checks.timing.status === 'warning') score -= 5;
  if (checks.allergenSafety.status === 'needs_review') score -= 5;
  if (checks.allergenSafety.status === 'blocked') score -= 100;

  return {
    passed: blockingIssues.length === 0,
    score: Math.max(0, Math.min(100, score)),
    checks,
    blockingIssues,
    warnings,
    ingredientsChecked: ingredients.length,
    instructionsChecked: instructions.length
  };
}

export class RecipeQualityError extends Error {
  constructor(result) {
    super(`Recipe failed quality validation: ${result.blockingIssues.join(', ')}`);
    this.name = 'RecipeQualityError';
    this.code = 'RECIPE_QUALITY_BLOCK';
    this.status = 422;
    this.result = result;
  }
}

/** Throw only for catastrophic output failures; return the full evaluation otherwise. */
export function assertRecipeQuality(recipe, options = {}) {
  const result = evaluateRecipeQuality(recipe, options);
  if (!result.passed) throw new RecipeQualityError(result);
  return result;
}

export function buildQualityBar(recipe, {
  evaluation = null,
  generationMethod = recipe.generationMethod || 'unknown',
  hardAllergens = []
} = {}) {
  const result = evaluation || evaluateRecipeQuality(recipe, { hardAllergens });
  const status = result.blockingIssues.length > 0
    ? 'blocked'
    : result.warnings.length > 0
      ? 'needs_review'
      : 'passed';
  const graph = recipe.processGraph ? calculateProcessGraphCoverage(recipe.processGraph) : null;

  return {
    status,
    score: result.score,
    generationMethod,
    allergenCheck: result.checks.allergenSafety.status,
    ingredientStepCoverage: Math.round(result.checks.ingredientCoverage.ratio * 100),
    ...(graph ? {
      graphValid: graph.valid,
      graphCoverage: graph.percent,
      graph_valid: graph.valid,
      graph_coverage: graph.percent
    } : {}),
    similarRecipesFound: Number(recipe.similarRecipesFound) || 0,
    generationTimeMs: Number(recipe.generationTime) || null,
    warnings: result.warnings
  };
}

function nutritionCoverage(recipe) {
  const coverage = recipe.nutrition?.coverage
    ?? recipe.nutrition?.coveragePercent
    ?? recipe.nutritionCoverage;
  if (typeof coverage === 'number' && Number.isFinite(coverage)) return coverage;
  return null;
}

/** Build safe-to-display provenance metadata; similar recipe payloads are never copied. */
export function buildRecipeProvenance(recipe, {
  source = recipe.source || 'ai_generated',
  generationMethod = recipe.generationMethod || 'unknown',
  model = null,
  appliedConstraints = recipe.appliedConstraints || {},
  similarRecipeIds = recipe.similarRecipeIds || [],
  qualityBar = null
} = {}) {
  return {
    source,
    generationMethod,
    model: model || recipe.model || (generationMethod.startsWith('llama-') ? DEFAULT_MODEL : null),
    generatedAt: recipe.adaptedAt || recipe.generatedAt || new Date().toISOString(),
    appliedConstraints,
    similarRecipeIds: Array.isArray(similarRecipeIds)
      ? similarRecipeIds.filter((id) => typeof id === 'string').slice(0, 10)
      : [],
    nutritionCoverage: nutritionCoverage(recipe),
    qualityScore: qualityBar?.score ?? null
  };
}

/** Add the quality bar and provenance contract to a recipe returned to clients. */
export function withQualityMetadata(recipe, options = {}) {
  const evaluation = assertRecipeQuality(recipe, { hardAllergens: options.hardAllergens || [] });
  const qualityBar = buildQualityBar(recipe, { ...options, evaluation });
  const provenance = buildRecipeProvenance(recipe, { ...options, qualityBar });
  return {
    ...recipe,
    ...(options.source || recipe.source ? { source: options.source || recipe.source } : {}),
    ...(options.generationMethod || recipe.generationMethod
      ? { generationMethod: options.generationMethod || recipe.generationMethod }
      : {}),
    qualityBar,
    provenance
  };
}

export { checkIngredientCoverage };
