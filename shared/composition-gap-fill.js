/**
 * Composition gap-fill V1 (#635).
 *
 * This module has no network or storage side effects on import. Callers inject
 * independent field sampling, cache, logging, and review-queue ports. Model
 * estimates are explicitly distinct from authoritative food-database matches.
 */

export const COMPOSITION_GAP_FILL_MODEL_ID = 'composition-gap-fill-v1';
export const COMPOSITION_GAP_FILL_FLAG = 'composition_gap_fill_v1';
export const COMPOSITION_GAP_FILL_SOURCE = 'llm_estimate';
export const COMPOSITION_GAP_FILL_METHOD = 'median_mad_invariant_v1';
export const COMPOSITION_GAP_FILL_FIELDS = Object.freeze([
  'calories',
  'proteinContent',
  'carbohydrateContent',
  'fatContent',
  'saturatedFatContent',
  'sugarContent',
  'sodiumContent',
  'fiberContent'
]);
export const COMPOSITION_GAP_FILL_DEFAULT_SAMPLES = 5;
export const COMPOSITION_GAP_FILL_MAX_SAMPLES = 7;
export const COMPOSITION_GAP_FILL_MAX_ATTEMPTS_PER_RECIPE = 8;
export const COMPOSITION_GAP_FILL_ADMITTED_TTL_SECONDS = 90 * 24 * 60 * 60;
export const COMPOSITION_GAP_FILL_ABSTAINED_TTL_SECONDS = 7 * 24 * 60 * 60;

const FILLABLE_MISS_REASONS = new Set(['unmatched', 'low_confidence', 'provider_error']);
const CACHE_PREFIX = 'composition-gap-fill:v1:';
const QUANTITY_WORDS = new Set([
  'a', 'an', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'dozen', 'pinch', 'dash', 'splash', 'handful'
]);
const MEASURE_WORDS = new Set([
  'tsp', 'tsps', 'teaspoon', 'teaspoons', 'tbsp', 'tbsps', 'tablespoon', 'tablespoons',
  'cup', 'cups', 'ounce', 'ounces', 'oz', 'pound', 'pounds', 'lb', 'lbs', 'gram', 'grams', 'g',
  'kilogram', 'kilograms', 'kg', 'milliliter', 'milliliters', 'ml', 'liter', 'liters', 'l'
]);
const SEMANTIC_ZERO_PATTERNS = [
  /\bwater\b/i,
  /\bice\b/i,
  /\bsalt\b/i,
  /\bbaking\s+powder\b/i,
  /\bbaking\s+soda\b/i
];
export const SEMANTIC_ZERO_TRACE_LIMITS = Object.freeze({ calories: 1, proteinContent: 0.1 });

function finiteNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function medianAbsoluteDeviation(values, center = median(values)) {
  return median(values.map((value) => Math.abs(value - center)));
}

function normalizePart(value) {
  const words = String(value ?? '')
    .toLowerCase()
    .replace(/^\s*(?:\d+(?:\.\d+)?(?:\/\d+)?|half|quarter|third)\s+/i, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((word) => word && !QUANTITY_WORDS.has(word) && !MEASURE_WORDS.has(word));
  return words.join(' ');
}

/**
 * Normalize ingredient and form for stable cache keys. Quantities embedded in
 * a pasted ingredient name, punctuation, and common count words are ignored.
 */
export function normalizeCompositionGapFillCacheKey(name, form = '') {
  const normalizedName = normalizePart(name);
  const normalizedForm = normalizePart(form);
  const key = normalizedForm ? `${normalizedName}:${normalizedForm}` : normalizedName;
  return key.slice(0, 200);
}

/** Return off, shadow, or on. Unrecognized values always fail closed to off. */
export function getCompositionGapFillMode(envOrValue) {
  const rawValue = envOrValue && typeof envOrValue === 'object'
    ? envOrValue.COMPOSITION_GAP_FILL_V1 ?? envOrValue[COMPOSITION_GAP_FILL_FLAG]
    : envOrValue;
  const value = String(rawValue ?? '').trim().toLowerCase();
  if (value === 'shadow') return 'shadow';
  if (['1', 'true', 'on', 'enabled'].includes(value)) return 'on';
  return 'off';
}

export function isCompositionGapFillEnabled(envOrValue) {
  return getCompositionGapFillMode(envOrValue) !== 'off';
}

function nutrientRecordIsFinite(nutrients) {
  return COMPOSITION_GAP_FILL_FIELDS.every((field) => {
    const value = finiteNumber(nutrients?.[field]);
    return value !== null && value >= 0;
  });
}

function evaluateNutrientRecord(foodName, nutrients) {
  if (!nutrientRecordIsFinite(nutrients)) {
    return { status: 'abstained', reason: 'invalid_nutrients', energy: 'not_checked', atwater: 'not_checked' };
  }

  const protein = nutrients.proteinContent;
  const carbohydrate = nutrients.carbohydrateContent;
  const fat = nutrients.fatContent;
  const calories = nutrients.calories;
  const macroTotal = protein + carbohydrate + fat;

  if (
    protein > 100 || carbohydrate > 100 || fat > 100
    || protein < 0 || carbohydrate < 0 || fat < 0 || macroTotal > 100
  ) {
    return { status: 'abstained', reason: 'atwater_bounds', energy: 'not_checked', atwater: 'failed' };
  }
  if (calories > 900) {
    return { status: 'abstained', reason: 'calories_bounds', energy: 'not_checked', atwater: 'failed' };
  }

  const isSemanticZero = SEMANTIC_ZERO_PATTERNS.some((pattern) => pattern.test(foodName));
  if (
    isSemanticZero
    && (calories > SEMANTIC_ZERO_TRACE_LIMITS.calories
      || protein > SEMANTIC_ZERO_TRACE_LIMITS.proteinContent)
  ) {
    return { status: 'abstained', reason: 'semantic_zero_violation', energy: 'not_checked', atwater: 'failed' };
  }

  const expectedEnergy = 4 * protein + 4 * carbohydrate + 9 * fat;
  const deviation = expectedEnergy === 0
    ? (calories === 0 ? 0 : Number.POSITIVE_INFINITY)
    : Math.abs(calories - expectedEnergy) / expectedEnergy;

  if (deviation > 0.3) {
    return { status: 'abstained', reason: 'energy_identity_major', energy: 'failed_major', atwater: 'passed' };
  }
  if (isSemanticZero && deviation > 0.05) {
    return { status: 'abstained', reason: 'semantic_zero_reconcile_forbidden', energy: 'failed_minor', atwater: 'passed' };
  }

  if (deviation > 0.05) {
    // The minimum-change repair is to update the calorie total only; the three
    // independently elicited macros, sodium, and fiber remain untouched.
    const reconciled = { ...nutrients, calories: round(expectedEnergy, 2) };
    if (reconciled.calories > 900) {
      return { status: 'abstained', reason: 'energy_reconcile_bounds', energy: 'failed', atwater: 'failed' };
    }
    return {
      status: 'admitted',
      nutrientsPer100g: reconciled,
      invariants: { energy: 'reconciled_minor', atwater: 'passed', semanticZeros: 'preserved' }
    };
  }

  return {
    status: 'admitted',
    nutrientsPer100g: { ...nutrients },
    invariants: { energy: 'passed', atwater: 'passed', semanticZeros: 'preserved' }
  };
}

function asSamples(value) {
  const candidates = Array.isArray(value)
    ? value
    : Array.isArray(value?.samples)
      ? value.samples
      : [];
  return candidates.map(finiteNumber).filter((sample) => sample !== null && sample >= 0);
}

function currentIso(now) {
  const value = typeof now === 'function' ? now() : now;
  const date = value instanceof Date ? value : new Date(value ?? Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

async function readCache(cache, key) {
  if (!cache) return null;
  try {
    if (cache instanceof Map) return cache.get(key) || null;
    if (typeof cache.get !== 'function') return null;
    const value = await cache.get(key, 'json');
    if (!value) return null;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
    return value;
  } catch {
    return null;
  }
}

async function writeCache(cache, key, record, ttlSeconds) {
  if (!cache) return;
  try {
    if (cache instanceof Map) {
      cache.set(key, record);
      return;
    }
    if (typeof cache.put === 'function') {
      await cache.put(key, JSON.stringify(record), { expirationTtl: ttlSeconds });
    }
  } catch {
    // Cache outages must not turn an otherwise useful estimate into a failure.
  }
}

async function emitLog(logEvent, event) {
  if (typeof logEvent !== 'function') return;
  try {
    await logEvent(event);
  } catch {
    // Telemetry is best-effort and must not change nutrition output.
  }
}

async function enqueueReview(reviewQueue, payload) {
  if (!reviewQueue) return;
  try {
    if (typeof reviewQueue === 'function') {
      await reviewQueue(payload);
    } else if (typeof reviewQueue.enqueue === 'function') {
      await reviewQueue.enqueue(payload);
    }
  } catch {
    // Queue outages are observable by the caller's worker logs; fail closed.
  }
}

function isQueueableReviewReason(reason) {
  return ['energy_identity_major', 'atwater_bounds', 'calories_bounds', 'energy_reconcile_bounds'].includes(reason);
}

function buildDispersion(fieldSamples, estimates) {
  const madByField = Object.fromEntries(
    COMPOSITION_GAP_FILL_FIELDS.map((field) => [field, round(medianAbsoluteDeviation(fieldSamples[field], estimates[field]), 4)])
  );
  const relativeMads = COMPOSITION_GAP_FILL_FIELDS
    .map((field) => madByField[field] / Math.max(Math.abs(estimates[field]), 1))
    .filter(Number.isFinite);
  const agreement = relativeMads.length
    ? round(Math.max(0, Math.min(1, 1 - relativeMads.reduce((sum, value) => sum + value, 0) / relativeMads.length)), 4)
    : 0;

  return {
    caloriesMad: madByField.calories,
    madByField,
    sampleCount: Math.min(...COMPOSITION_GAP_FILL_FIELDS.map((field) => fieldSamples[field].length)),
    agreement
  };
}

function cacheResult(record) {
  return { ...record, cacheHit: true, attempted: false };
}

/**
 * Estimate and validate one grounding miss. The sampler must independently
 * sample a single nutrient field and return numeric replies for that field.
 */
export async function fillCompositionGap(input, {
  sampleField,
  cache,
  now = () => new Date(),
  logEvent,
  reviewQueue,
  sampleCount = COMPOSITION_GAP_FILL_DEFAULT_SAMPLES,
  allowSampling = true
} = {}) {
  const name = String(input?.name ?? '').trim().slice(0, 200);
  const form = String(input?.form ?? '').trim().slice(0, 120) || 'as listed';
  const missReason = String(input?.missReason ?? '');
  const base = {
    modelId: COMPOSITION_GAP_FILL_MODEL_ID,
    status: 'abstained',
    foodName: name,
    form,
    nutrientsPer100g: null,
    cacheHit: false,
    attempted: false
  };

  if (!name || !FILLABLE_MISS_REASONS.has(missReason)) {
    const result = { ...base, reason: missReason === 'ambiguous_quantity' ? 'ambiguous_quantity' : 'not_fillable_miss' };
    await emitLog(logEvent, { status: result.status, missReason, sampleCount: 0, invariant: result.reason, cacheHit: false });
    return result;
  }

  const normalizedKey = normalizeCompositionGapFillCacheKey(name, form);
  if (!normalizedKey) {
    const result = { ...base, reason: 'invalid_cache_key' };
    await emitLog(logEvent, { status: result.status, missReason, sampleCount: 0, invariant: result.reason, cacheHit: false });
    return result;
  }
  const key = `${CACHE_PREFIX}${normalizedKey}`;
  const cached = await readCache(cache, key);
  if (cached && ['admitted', 'abstained'].includes(cached.status)) {
    const result = cacheResult(cached);
    await emitLog(logEvent, {
      status: result.status,
      missReason,
      sampleCount: result.dispersion?.sampleCount ?? 0,
      invariant: result.invariants?.energy ?? result.reason ?? 'not_checked',
      cacheHit: true
    });
    return result;
  }

  if (!allowSampling) {
    const result = { ...base, reason: 'recipe_attempt_limit' };
    await emitLog(logEvent, { status: result.status, missReason, sampleCount: 0, invariant: result.reason, cacheHit: false });
    return result;
  }
  if (typeof sampleField !== 'function') {
    const result = { ...base, reason: 'sampler_unavailable' };
    await emitLog(logEvent, { status: result.status, missReason, sampleCount: 0, invariant: result.reason, cacheHit: false });
    return result;
  }

  const requestedSamples = Math.max(3, Math.min(COMPOSITION_GAP_FILL_MAX_SAMPLES, Math.floor(finiteNumber(sampleCount) ?? COMPOSITION_GAP_FILL_DEFAULT_SAMPLES)));
  const fieldSamples = {};
  const estimates = {};
  let insufficientField = null;

  for (const field of COMPOSITION_GAP_FILL_FIELDS) {
    let response;
    try {
      response = await sampleField(name, form, field, {
        sampleCount: requestedSamples,
        temperature: 0.7
      });
    } catch {
      response = [];
    }
    fieldSamples[field] = asSamples(response).slice(0, requestedSamples);
    if (fieldSamples[field].length < 3) {
      insufficientField = field;
      break;
    }
    estimates[field] = median(fieldSamples[field]);
  }

  const dispersion = insufficientField ? null : buildDispersion(fieldSamples, estimates);
  const evaluation = insufficientField
    ? { status: 'abstained', reason: 'insufficient_samples', energy: 'not_checked', atwater: 'not_checked' }
    : evaluateNutrientRecord(name, estimates);
  const filledAt = currentIso(now);
  const record = {
    ...base,
    ...(evaluation.status === 'admitted' ? { nutrientsPer100g: evaluation.nutrientsPer100g } : {}),
    status: evaluation.status,
    reason: evaluation.reason,
    dispersion,
    invariants: evaluation.invariants,
    provenance: {
      method: COMPOSITION_GAP_FILL_METHOD,
      source: COMPOSITION_GAP_FILL_SOURCE,
      evidenceUrls: [],
      reviewed: false,
      filledAt
    },
    ...(evaluation.status === 'abstained' ? {
      reviewRecord: {
        candidateNutrientsPer100g: estimates,
        dispersion,
        invariants: { energy: evaluation.energy, atwater: evaluation.atwater, semanticZeros: 'checked' }
      }
    } : {})
  };
  record.attempted = true;

  const ttlSeconds = record.status === 'admitted'
    ? COMPOSITION_GAP_FILL_ADMITTED_TTL_SECONDS
    : COMPOSITION_GAP_FILL_ABSTAINED_TTL_SECONDS;
  await writeCache(cache, key, record, ttlSeconds);

  if (record.status === 'abstained' && isQueueableReviewReason(record.reason)) {
    await enqueueReview(reviewQueue, {
      input: { name, form, missReason },
      modelId: COMPOSITION_GAP_FILL_MODEL_ID,
      reason: record.reason,
      record: record.reviewRecord,
      provenance: record.provenance
    });
  }

  await emitLog(logEvent, {
    status: record.status,
    missReason,
    sampleCount: dispersion?.sampleCount ?? fieldSamples[insufficientField]?.length ?? 0,
    invariant: record.invariants?.energy ?? record.reason ?? 'not_checked',
    cacheHit: false
  });
  return record;
}

/**
 * Admit a manually reviewed record only after re-running the same invariant
 * guard. Evidence is metadata only; URLs never cause automatic web retrieval.
 */
export function reviewCompositionGapFill(record, nutrientsPer100g, evidenceUrls = [], { now = () => new Date() } = {}) {
  const safeEvidenceUrls = Array.isArray(evidenceUrls)
    ? evidenceUrls.filter((url) => typeof url === 'string' && /^https:\/\//i.test(url)).slice(0, 2)
    : [];
  const evaluation = evaluateNutrientRecord(record?.foodName, nutrientsPer100g);
  const provenance = {
    ...(record?.provenance || {}),
    method: COMPOSITION_GAP_FILL_METHOD,
    source: COMPOSITION_GAP_FILL_SOURCE,
    evidenceUrls: safeEvidenceUrls,
    reviewed: true,
    filledAt: currentIso(now)
  };

  if (evaluation.status !== 'admitted') {
    return {
      modelId: COMPOSITION_GAP_FILL_MODEL_ID,
      status: 'abstained',
      foodName: record?.foodName ?? '',
      form: record?.form ?? '',
      nutrientsPer100g: null,
      reason: evaluation.reason,
      dispersion: record?.dispersion ?? null,
      invariants: { energy: evaluation.energy, atwater: evaluation.atwater, semanticZeros: 'checked' },
      provenance
    };
  }

  return {
    modelId: COMPOSITION_GAP_FILL_MODEL_ID,
    status: 'admitted',
    foodName: record?.foodName ?? '',
    form: record?.form ?? '',
    nutrientsPer100g: evaluation.nutrientsPer100g,
    dispersion: record?.dispersion ?? null,
    invariants: evaluation.invariants,
    provenance
  };
}
