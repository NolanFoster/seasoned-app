/**
 * Meal-plan auto-fill handler.
 *
 * Fills empty meal-plan slots (e.g. "2026-08-17::dinner") with complete
 * recipes so the app can offer a one-tap "Auto-fill my week" experience.
 *
 * The generation worker already has AI, vector, KV, and image-generation
 * bindings plus the safety/quality gates; the recommendation worker owns
 * search + dish suggestion. To avoid duplicating (and drifting from) the
 * recommendation worker, this handler generates a full recipe per slot through
 * the existing `handleGenerate` pipeline. Existing, verified recipes can be
 * reused later (issue #457 part 2) once a shared recipe pool is wired here.
 *
 * Request:
 *   {
 *     slots: ["2026-08-17::dinner", "2026-08-18::lunch"],
 *     culinaryProfile: { ... } | profile: { ... },
 *     overrides: { ... },          // same constraints accepted by /generate
 *     usePantry: true,
 *     pantryIngredients: [{ name, quantity, unit, expiresOn }],
 *     prioritizeExpiring: false,
 *     generateImage: false
 *   }
 *
 * Response:
 *   {
 *     success: true,
 *     meals: [
 *       { slot: "2026-08-17::dinner", date: "2026-08-17", mealType: "dinner", recipe: { ... } }
 *     ],
 *     warnings: [{ slot, code, message }],
 *     filledCount: 1
 *   }
 */

import { handleGenerate } from './generate-handler.js';
import { buildGenerationConstraints } from '../../../shared/culinary-profile.js';

const MEAL_TYPES = new Set(['breakfast', 'lunch', 'dinner', 'snack']);
const MAX_SLOTS = 28;
const MAX_PLAN_DAYS = 7;
const CONCURRENCY = 4;
const DAY_MS = 24 * 60 * 60 * 1000;
const SAFETY_ERROR_CODES = new Set([
  'ALLERGEN_SAFETY_BLOCK',
  'PROCESS_SAFETY_BLOCK',
  'RECIPE_QUALITY_BLOCK'
]);

// Constraint fields that a caller may override per fill. These are the exact
// top-level keys that handleGenerate/buildGenerationConstraints read. Everything
// else (elevate, ingredients, generateImage, recipeName, culinaryProfile,
// usePantry, pantryIngredients, prioritizeExpiring) is handler-controlled and
// must not be injectable through `overrides`.
const OVERRIDE_FIELDS = [
  'dietary',
  'diet_tags',
  'hardAllergens',
  'hard_allergens',
  'softAvoids',
  'soft_avoids',
  'cuisine',
  'equipment',
  'servings',
  'maxCookTime',
  'max_cook_time_min',
  'spiceLevel',
  'spice_level',
  'skillLevel',
  'skill_level',
  'excludeIngredients',
  'exclude_ingredients',
  'nutritionGoals',
  'nutrition_goals',
  'units',
  'units_pref',
  'mealType'
];

function json(body, status, corsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

/** Strict calendar-date validation (rejects 2026-99-99 and Feb 30). */
function isValidDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

/**
 * Keep the endpoint scoped to a single week. Counting distinct dates alone is
 * not enough: a request for Monday and the following Wednesday is two dates
 * but spans nine calendar days. Dates are parsed as UTC because these are
 * calendar labels, not instants in the caller's timezone.
 */
function isWithinPlanWindow(slots) {
  const dates = [...new Set(slots.map((slot) => slot.date))];
  if (dates.length > MAX_PLAN_DAYS) return false;
  const timestamps = dates.map((date) => Date.parse(`${date}T00:00:00.000Z`));
  const earliest = Math.min(...timestamps);
  const latest = Math.max(...timestamps);
  return latest - earliest <= (MAX_PLAN_DAYS - 1) * DAY_MS;
}

/**
 * A profile's hard allergen block is safety state, not a normal generation
 * preference. Explicit overrides may add an allergen, but must never clear a
 * profile allergen for one meal in an auto-filled week.
 */
function mergeHardAllergens(profile, overrides) {
  const profileConstraints = buildGenerationConstraints(profile, {});
  const overrideConstraints = buildGenerationConstraints({}, overrides);
  return [...new Set([
    ...(profileConstraints.hardAllergens || []),
    ...(overrideConstraints.hardAllergens || [])
  ])];
}

/**
 * Parses a slot string of the form "YYYY-MM-DD::mealType".
 * @param {string} slot
 * @returns {{ date: string, mealType: string } | null}
 */
export function parseSlot(slot) {
  if (typeof slot !== 'string') return null;
  const sep = slot.lastIndexOf('::');
  if (sep === -1) return null;
  const date = slot.slice(0, sep);
  const mealType = slot.slice(sep + 2);
  if (!isValidDateString(date)) return null;
  if (!MEAL_TYPES.has(mealType)) return null;
  return { date, mealType };
}

/** A display-friendly, LLM-guiding description of each meal type. */
function mealTypePrompt(mealType) {
  switch (mealType) {
  case 'breakfast':
    return 'a quick, satisfying breakfast';
  case 'lunch':
    return 'an easy make-ahead lunch';
  case 'snack':
    return 'a simple snack';
  case 'dinner':
  default:
    return 'a balanced weeknight dinner';
  }
}

/** Truncate free-form text used in the prompt to keep prompt length bounded. */
function cleanPromptText(value, maxLength) {
  const str = String(value ?? '').replace(/\s+/g, ' ').trim();
  return str.slice(0, maxLength);
}

/**
 * Builds a natural-language recipe name for the generate pipeline so the LLM
 * has a concrete goal for the slot (the pipeline uses `recipeName` as its
 * primary retrieval + prompt query).
 */
function slotDishName(mealType, constraints, index) {
  const diet = (constraints.dietary || [])
    .filter((tag) => typeof tag === 'string' && tag && tag !== 'flexitarian')
    .map((tag) => cleanPromptText(tag, 24))
    .slice(0, 2)
    .join(' and ');
  const cuisine = cleanPromptText(constraints.cuisine, 40);
  const cuisinePrefix = cuisine ? `${cuisine} ` : '';
  const variety = index > 0 ? ` (variation ${index + 1})` : '';
  return `${diet ? `${diet} ` : ''}${cuisinePrefix}${mealTypePrompt(mealType)}${variety}`.trim();
}

/**
 * Normalizes a generate-handler error response into a client-actionable
 * message and code. Never includes the raw recipe text (safety).
 */
async function readGenerateError(res) {
  let payload = null;
  try {
    payload = await res.json();
  } catch {
    // fall through
  }
  const code = payload?.code || (res.status === 502 ? 'LLM_ERROR' : 'GENERATE_ERROR');
  const message = payload?.error
    || (res.status === 502 ? 'AI inference failed' : `Recipe generation failed (${res.status})`);
  return { code, message };
}

/**
 * Fills a single slot through the generate pipeline.
 * Returns a meal entry, or { warning } on failure.
 */
async function fillOneSlot(slot, ctx, env, corsHeaders) {
  try {
    const requestBody = {};

    // Whitelist constraint overrides so they land at the top level where
    // handleGenerate reads them. Handler-controlled keys are set afterwards.
    const rawOverrides = ctx.overrides && typeof ctx.overrides === 'object' ? ctx.overrides : {};
    for (const field of OVERRIDE_FIELDS) {
      if (rawOverrides[field] !== undefined) requestBody[field] = rawOverrides[field];
    }

    // The merged list is assigned after copying overrides so an empty
    // `hardAllergens` override cannot weaken the profile's safety block.
    requestBody.hardAllergens = ctx.constraints.hardAllergens;
    requestBody.recipeName = slotDishName(slot.mealType, ctx.constraints, ctx.index);
    requestBody.culinaryProfile = ctx.profile;
    requestBody.usePantry = ctx.usePantry;
    requestBody.pantryIngredients = ctx.pantryIngredients;
    requestBody.prioritizeExpiring = ctx.prioritizeExpiring;
    requestBody.generateImage = ctx.generateImage;
    requestBody.mealType = slot.mealType;

    const generateRequest = new Request('https://internal/meal-plan-fill-slot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    const res = await handleGenerate(generateRequest, env, corsHeaders);
    if (!res.ok) {
      const err = await readGenerateError(res);
      return { warning: { slot: slot.slot, code: err.code, message: err.message, status: res.status } };
    }

    const data = await res.json();
    if (!data?.success || !data?.recipe) {
      return { warning: { slot: slot.slot, code: 'INVALID_RESPONSE', message: 'Generation returned no recipe', status: 500 } };
    }

    return { meal: { slot: slot.slot, date: slot.date, mealType: slot.mealType, recipe: data.recipe } };
  } catch (error) {
    const code = SAFETY_ERROR_CODES.has(error?.code) ? error.code : 'GENERATE_ERROR';
    return {
      warning: {
        slot: slot.slot,
        code,
        message: error?.message || 'Recipe generation failed',
        status: 502
      }
    };
  }
}

/**
 * POST /meal-plan-fill handler.
 *
 * @param {Request} request
 * @param {object} env - Cloudflare Worker environment bindings
 * @param {object} corsHeaders - pre-built CORS headers from index.js
 * @returns {Response}
 */
export async function handleMealPlanFill(request, env, corsHeaders) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'Request body must be valid JSON', code: 'INVALID_JSON' }, 400, corsHeaders);
  }

  const rawSlots = Array.isArray(body?.slots) ? body.slots : [];
  if (rawSlots.length === 0) {
    return json(
      { success: false, error: '`slots` must be a non-empty array of "YYYY-MM-DD::mealType" strings', code: 'INVALID_INPUT' },
      400,
      corsHeaders
    );
  }
  if (rawSlots.length > MAX_SLOTS) {
    return json(
      { success: false, error: `At most ${MAX_SLOTS} slots may be filled per request`, code: 'INVALID_INPUT' },
      400,
      corsHeaders
    );
  }

  const slots = [];
  const warnings = [];
  const seen = new Set();
  for (const raw of rawSlots) {
    const parsed = parseSlot(raw);
    if (!parsed) {
      warnings.push({ slot: String(raw), code: 'INVALID_SLOT', message: 'Slot must be "YYYY-MM-DD::mealType" (breakfast|lunch|dinner|snack)', status: 400 });
      continue;
    }
    const key = `${parsed.date}::${parsed.mealType}`;
    if (seen.has(key)) {
      warnings.push({ slot: key, code: 'DUPLICATE_SLOT', message: 'Duplicate slot ignored', status: 400 });
      continue;
    }
    seen.add(key);
    slots.push({ ...parsed, slot: key });
  }
  if (slots.length === 0) {
    return json({ success: false, error: 'No valid slots provided', code: 'INVALID_INPUT', warnings }, 400, corsHeaders);
  }
  if (!isWithinPlanWindow(slots)) {
    return json({
      success: false,
      error: `At most ${MAX_PLAN_DAYS} consecutive calendar days may be filled per request`,
      code: 'INVALID_INPUT',
      warnings
    }, 400, corsHeaders);
  }

  // Normalize constraints once so the per-slot generate requests are consistent.
  const profile = body?.culinaryProfile || body?.profile || {};
  const rawOverrides = body?.overrides && typeof body.overrides === 'object'
    ? body.overrides
    : {};
  const constraints = buildGenerationConstraints(profile, rawOverrides);
  constraints.hardAllergens = mergeHardAllergens(profile, rawOverrides);

  const ctx = {
    profile,
    constraints,
    overrides: rawOverrides,
    usePantry: body?.usePantry === true,
    pantryIngredients: Array.isArray(body?.pantryIngredients) ? body.pantryIngredients : [],
    prioritizeExpiring: body?.prioritizeExpiring === true && body?.usePantry === true,
    generateImage: body?.generateImage === true // images are opt-in, matching /generate
  };

  const meals = [];

  // Bounded concurrency: process slots in chunks to avoid serial 28-request
  // amplification while still capping parallel load.
  for (let i = 0; i < slots.length; i += CONCURRENCY) {
    const chunk = slots.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map((slot, offset) => fillOneSlot(slot, { ...ctx, index: i + offset }, env, corsHeaders))
    );
    for (const result of results) {
      if (result.meal) meals.push(result.meal);
      else if (result.warning) warnings.push(result.warning);
    }
  }

  if (meals.length === 0 && warnings.length > 0) {
    // Client-actionable safety/quality blocks map to 422; everything else is an
    // upstream/AI failure (502).
    const allClientBlocked = warnings.every((w) => SAFETY_ERROR_CODES.has(w.code));
    const status = allClientBlocked ? 422 : 502;
    return json(
      { success: false, error: 'Could not fill any requested slots', code: 'FILL_FAILED', warnings },
      status,
      corsHeaders
    );
  }

  return json({ success: true, meals, warnings, filledCount: meals.length }, 200, corsHeaders);
}
