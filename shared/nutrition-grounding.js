/**
 * Nutrition Grounding V1
 *
 * Resolves recipe ingredients against an authoritative food-composition provider
 * and recomputes nutrition from the selected records. The module is deliberately
 * provider-based so a future regional food database can be added without
 * changing the recipe contract.
 */

import {
  extractServingsFromYield,
  NutritionAggregator,
  UnitConverter,
  USDANutritionClient
} from './nutrition-calculator.js';

export const NUTRITION_GROUNDING_VERSION = 'NutritionGroundingV1';
export const NUTRITION_GROUNDING_FLAG = 'nutrition_db_grounding_v1';
export const DEFAULT_NUTRITION_COVERAGE_THRESHOLD = 80;
export const USDA_FDC_SOURCE = 'USDA FoodData Central';
export const USDA_FDC_LIVE_VERSION = 'live';

/**
 * Resolve the rollout flag without ever opting in by accident. Workers can
 * pass their env object; tests and callers may pass the raw flag value.
 */
export function isNutritionGroundingEnabled(envOrValue) {
  const value = envOrValue && typeof envOrValue === 'object'
    ? envOrValue.NUTRITION_DB_GROUNDING_V1 ?? envOrValue[NUTRITION_GROUNDING_FLAG]
    : envOrValue;
  return ['1', 'true', 'on', 'enabled'].includes(String(value ?? '').trim().toLowerCase());
}

const SUPPORTED_UNITS = new Set([
  ...Object.keys(UnitConverter.weightToGrams),
  ...Object.keys(UnitConverter.volumeToMl),
  ...Object.keys(UnitConverter.countToGrams)
].sort((left, right) => right.length - left.length));

const UNIT_PATTERN = [...SUPPORTED_UNITS]
  .map((unit) => unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|');

function finiteNumber(value) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundNumber(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizedName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function parseQuantity(value) {
  if (typeof value === 'number') return value;
  const text = normalizedName(value);
  if (!text) return null;
  if (/^\d+\s+\d+\/\d+$/.test(text)) {
    const [whole, fraction] = text.split(/\s+/);
    const [numerator, denominator] = fraction.split('/').map(Number);
    return denominator > 0 ? Number(whole) + numerator / denominator : null;
  }
  if (/^\d+\/\d+$/.test(text)) {
    const [numerator, denominator] = text.split('/').map(Number);
    return denominator > 0 ? numerator / denominator : null;
  }
  return finiteNumber(text);
}

function parseIngredientString(value) {
  const text = normalizedName(value).replace(/^[•*-]\s*/, '').replace(/^\d+[.)]\s*/, '');
  if (!text) return null;

  const quantityPattern = '(\\d+\\s+\\d+\\/\\d+|\\d+(?:\\.\\d+)?|\\d+\\/\\d+)';
  const unitPattern = UNIT_PATTERN ? `(?:(${UNIT_PATTERN})\\s+)?` : '';
  const quantityMatch = text.match(new RegExp(`^${quantityPattern}\\s*${unitPattern}(?:of\\s+)?(.+)$`, 'i'));
  if (quantityMatch) {
    const quantity = parseQuantity(quantityMatch[1]);
    const unit = quantityMatch[2] || 'unit';
    const name = normalizedName(quantityMatch[3]);
    if (quantity !== null && quantity > 0 && name) return { name, quantity, unit };
  }

  const measuredMatch = text.match(/^([a-z]+)\s+of\s+(.+)$/i);
  if (measuredMatch) {
    return { name: normalizedName(measuredMatch[2]), quantity: 1, unit: measuredMatch[1].toLowerCase() };
  }

  return { name: text, quantity: 1, unit: 'unit', quantityEstimated: true };
}

/**
 * Normalize the supported recipe ingredient shapes into the grounding input.
 * String ingredients are parsed conservatively; ambiguous quantities retain a
 * one-unit estimate and are visible in the ingredient-level result.
 */
export function normalizeGroundingIngredient(ingredient, index = 0) {
  let normalized;
  if (typeof ingredient === 'string') {
    normalized = parseIngredientString(ingredient);
  } else if (ingredient && typeof ingredient === 'object' && !Array.isArray(ingredient)) {
    const name = normalizedName(ingredient.name || ingredient.ingredient || ingredient.item);
    const quantity = parseQuantity(ingredient.quantity ?? ingredient.amount ?? ingredient.value);
    normalized = name && quantity !== null && quantity > 0
      ? {
          name,
          quantity,
          unit: normalizedName(ingredient.unit || ingredient.measure || 'unit') || 'unit'
        }
      : null;
  }

  if (!normalized?.name || !Number.isFinite(normalized.quantity) || normalized.quantity <= 0) {
    return {
      index,
      name: normalized?.name || (typeof ingredient === 'string' ? normalizedName(ingredient) : ''),
      quantity: null,
      unit: null,
      valid: false,
      reason: 'invalid_ingredient_quantity'
    };
  }

  return { ...normalized, index, valid: true };
}

function normalizeNutrients(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, nutrient]) => [key, finiteNumber(nutrient)])
      .filter(([, nutrient]) => nutrient !== null && nutrient >= 0)
  );
}

/**
 * Normalize a provider candidate into the shared grounding candidate shape.
 * Providers may return either `nutrientsPer100g` or the calculator's nutrient
 * field names directly in `nutrition`.
 */
export function normalizeGroundingCandidate(candidate, fallbackSource = 'unknown') {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  const nutrientsPer100g = normalizeNutrients(
    candidate.nutrientsPer100g || candidate.nutrition || candidate.nutrients
  );
  const foodCode = candidate.foodCode ?? candidate.code ?? candidate.fdcId ?? candidate.id;
  const foodName = normalizedName(candidate.foodName || candidate.name);
  const confidence = finiteNumber(candidate.confidence);

  if ((typeof foodCode !== 'string' && typeof foodCode !== 'number') || !foodName || Object.keys(nutrientsPer100g).length === 0) {
    return null;
  }

  return {
    foodCode: String(foodCode),
    foodName,
    nutrientsPer100g,
    confidence: confidence === null ? 0 : Math.max(0, Math.min(1, confidence)),
    source: normalizedName(candidate.source) || fallbackSource,
    dbVersion: normalizedName(candidate.dbVersion || candidate.db_version) || 'unknown'
  };
}

/**
 * Provider contract guard. Providers must resolve an ingredient to one or more
 * candidates and must not expose credentials in candidate data.
 */
export function assertNutritionGroundingProvider(provider) {
  if (!provider || typeof provider.resolveIngredient !== 'function') {
    throw new TypeError('Nutrition grounding provider must implement resolveIngredient(ingredient)');
  }
  return provider;
}

/**
 * USDA FoodData Central implementation of the provider contract.
 */
export class USDAFoodDataCentralProvider {
  constructor(apiKey, {
    client = null,
    fetchImpl = globalThis.fetch,
    baseUrl,
    pageSize = 5,
    dbVersion = USDA_FDC_LIVE_VERSION
  } = {}) {
    if (!client && !apiKey) throw new Error('USDA FoodData Central API key is required');
    this.client = client || new USDANutritionClient(apiKey, { fetchImpl, baseUrl });
    this.aggregator = new NutritionAggregator();
    this.pageSize = Math.max(1, Math.min(25, Number(pageSize) || 5));
    this.dbVersion = normalizedName(dbVersion) || USDA_FDC_LIVE_VERSION;
  }

  async resolveIngredient(ingredient) {
    const name = normalizedName(ingredient?.name);
    if (!name) return [];
    const searchResults = await this.client.searchFood(name, this.pageSize);
    const foods = Array.isArray(searchResults?.foods) ? searchResults.foods : [];

    return foods
      .map((food, index) => {
        if (!food || typeof food !== 'object' || Array.isArray(food)) return null;
        const nutrients = this.aggregator.extractNutrition(food, 100);
        return normalizeGroundingCandidate({
          foodCode: food.fdcId,
          foodName: food.description || food.lowercaseDescription || name,
          nutrientsPer100g: nutrients,
          confidence: finiteNumber(food.score) !== null && Number(food.score) >= 0 && Number(food.score) <= 1
            ? Number(food.score)
            : Math.max(0.5, 0.9 - index * 0.1),
          source: USDA_FDC_SOURCE,
          dbVersion: this.dbVersion
        }, USDA_FDC_SOURCE);
      })
      .filter(Boolean);
  }
}

export function createUSDAFoodDataCentralProvider(apiKey, options = {}) {
  return new USDAFoodDataCentralProvider(apiKey, options);
}

function scaleNutrients(nutrientsPer100g, weightGrams) {
  const multiplier = weightGrams / 100;
  return Object.fromEntries(
    Object.entries(nutrientsPer100g).map(([key, value]) => [key, value * multiplier])
  );
}

function selectCandidate(candidates, minimumConfidence) {
  return candidates
    .map((candidate) => normalizeGroundingCandidate(candidate))
    .filter(Boolean)
    .sort((left, right) => right.confidence - left.confidence)
    .find((candidate) => candidate.confidence >= minimumConfidence) || null;
}

function coveragePercent(groundedCount, totalCount) {
  return totalCount === 0 ? 0 : roundNumber((groundedCount / totalCount) * 100, 1);
}

function uniqueValues(items) {
  return [...new Set(items.filter((item) => typeof item === 'string' && item))];
}

/**
 * Ground ingredients and recompute per-serving nutrition from provider data.
 * Unknown or low-confidence ingredients are never assigned invented nutrient
 * values; they are returned in the provenance contract instead.
 */
export async function groundRecipeNutrition(ingredients, {
  provider,
  servings = 1,
  coverageThreshold = DEFAULT_NUTRITION_COVERAGE_THRESHOLD,
  minimumConfidence = 0.8,
  aggregator = new NutritionAggregator()
} = {}) {
  assertNutritionGroundingProvider(provider);
  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    throw new Error('Ingredients array is required and must not be empty');
  }

  const normalizedServings = extractServingsFromYield(servings) || 1;
  const threshold = Math.max(0, Math.min(100, finiteNumber(coverageThreshold) ?? DEFAULT_NUTRITION_COVERAGE_THRESHOLD));
  const confidenceFloor = Math.max(0, Math.min(1, finiteNumber(minimumConfidence) ?? 0.8));
  const entries = ingredients.map(normalizeGroundingIngredient);
  const groundedNutrition = [];
  const groundedIngredients = [];
  const uncertainIngredients = [];

  for (const entry of entries) {
    if (!entry.valid) {
      uncertainIngredients.push({
        index: entry.index,
        name: entry.name || `ingredient_${entry.index + 1}`,
        reason: entry.reason
      });
      continue;
    }
    if (entry.quantityEstimated) {
      uncertainIngredients.push({ index: entry.index, name: entry.name, reason: 'ambiguous_quantity' });
      continue;
    }

    try {
      const candidates = await provider.resolveIngredient(entry);
      const candidate = selectCandidate(Array.isArray(candidates) ? candidates : [candidates], confidenceFloor);
      if (!candidate) {
        uncertainIngredients.push({ index: entry.index, name: entry.name, reason: 'no_confident_match' });
        continue;
      }

      const weightGrams = UnitConverter.convertToGrams(entry.quantity, entry.unit, entry.name);
      groundedNutrition.push(scaleNutrients(candidate.nutrientsPer100g, weightGrams));
      groundedIngredients.push({
        index: entry.index,
        name: entry.name,
        foodCode: candidate.foodCode,
        foodName: candidate.foodName,
        confidence: candidate.confidence,
        weightGrams: roundNumber(weightGrams, 2),
        source: candidate.source,
        dbVersion: candidate.dbVersion
      });
    } catch {
      uncertainIngredients.push({
        index: entry.index,
        name: entry.name,
        reason: 'provider_error'
      });
    }
  }

  const nutritionTotals = aggregator.aggregateNutrition(groundedNutrition);
  const nutrition = groundedNutrition.length > 0
    ? aggregator.formatForRecipeSchema(nutritionTotals, normalizedServings)
    : null;
  const coveragePct = coveragePercent(groundedIngredients.length, entries.length);
  const sources = uniqueValues(groundedIngredients.map((ingredient) => ingredient.source));
  const dbVersions = uniqueValues(groundedIngredients.map((ingredient) => ingredient.dbVersion));
  const provenance = {
    schemaVersion: NUTRITION_GROUNDING_VERSION,
    source: sources.length === 1 ? sources[0] : sources.length > 1 ? 'multiple' : null,
    db_version: dbVersions.length === 1 ? dbVersions[0] : dbVersions.length > 1 ? 'mixed' : null,
    method: 'ingredient_search_weighted_sum',
    coverage_pct: coveragePct,
    estimated: coveragePct < threshold,
    uncertain_ingredients: uncertainIngredients,
    grounded_ingredients: groundedIngredients.map(({ index, name, foodCode, foodName, confidence }) => ({
      index,
      name,
      foodCode,
      foodName,
      confidence
    }))
  };

  return {
    success: groundedIngredients.length > 0,
    nutrition,
    nutritionProvenance: provenance,
    processedIngredients: groundedIngredients.length,
    totalIngredients: entries.length,
    groundedIngredients,
    uncertainIngredients
  };
}

/**
 * Attach grounded nutrition to a recipe without mutating the input object.
 */
export async function attachNutritionProvenance(recipe, options = {}) {
  if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) {
    throw new TypeError('Recipe is required');
  }
  const servings = options.servings
    ?? recipe.servings
    ?? recipe.yield
    ?? recipe.recipeYield
    ?? 1;
  const result = await groundRecipeNutrition(recipe.ingredients, { ...options, servings: extractServingsFromYield(servings) });
  return {
    ...recipe,
    ...(result.nutrition ? { nutrition: result.nutrition } : {}),
    nutritionProvenance: result.nutritionProvenance
  };
}
