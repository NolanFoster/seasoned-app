import { normalizeCulinaryProfile } from '../../../shared/culinary-profile.js';
import { normalizeAllergenList } from '../../../shared/allergen-graph.js';
import {
  COMPONENT_SLOTS,
  completeWithCuratedSides,
  composeMealSides,
  inferHeroCuisine,
  normalizeGeneratedSides,
  pairSideToRecipeObject
} from '../../../shared/complete-meal.js';
import { applyProcessSafetyGates } from '../process-safety.js';

export const PAIRINGS_MODEL = '@cf/meta/llama-4-scout-17b-16e-instruct';
const CACHE_PREFIX = 'pairings:v1:';
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30;

function jsonResponse(body, status, corsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

function objectOrEmpty(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function recipeLines(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item : item?.text || item?.name || ''))
    .map((line) => String(line).trim())
    .filter(Boolean);
}

/** Only the fields that shape a pairing are sent to the model or hashed. */
function heroSummary(heroRecipe) {
  return {
    name: String(heroRecipe.name).trim(),
    description: typeof heroRecipe.description === 'string' ? heroRecipe.description.slice(0, 500) : '',
    cuisine: typeof heroRecipe.cuisine === 'string' ? heroRecipe.cuisine : '',
    ingredients: recipeLines(heroRecipe.ingredients).slice(0, 40),
    instructions: recipeLines(heroRecipe.instructions).slice(0, 20)
  };
}

function collectHardAllergens(requestBody, heroRecipe) {
  const profile = requestBody.culinaryProfile || requestBody.profile || {};
  const constraints = objectOrEmpty(heroRecipe.appliedConstraints);
  return normalizeAllergenList([
    ...normalizeCulinaryProfile(profile).hard_allergens,
    ...(Array.isArray(requestBody.hardAllergens) ? requestBody.hardAllergens : []),
    ...(Array.isArray(constraints.hardAllergens) ? constraints.hardAllergens : []),
    ...(Array.isArray(constraints.hard_allergens) ? constraints.hard_allergens : [])
  ]);
}

async function cacheKey(hero, hardAllergens) {
  const payload = JSON.stringify({
    name: hero.name.toLowerCase(),
    ingredients: hero.ingredients.map((line) => line.toLowerCase()),
    hardAllergens: [...hardAllergens].sort()
  });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${CACHE_PREFIX}${hex}`;
}

function hasKv(env) {
  return env?.RECIPE_STORAGE
    && typeof env.RECIPE_STORAGE.get === 'function'
    && typeof env.RECIPE_STORAGE.put === 'function';
}

async function readCache(env, key) {
  if (!hasKv(env)) return null;
  try {
    const cached = await env.RECIPE_STORAGE.get(key, 'json');
    return Array.isArray(cached?.sides) && cached.sides.length > 0 ? cached : null;
  } catch {
    return null;
  }
}

async function writeCache(env, key, value) {
  if (!hasKv(env)) return;
  try {
    await env.RECIPE_STORAGE.put(key, JSON.stringify(value), { expirationTtl: CACHE_TTL_SECONDS });
  } catch (error) {
    // eslint-disable-next-line no-console -- Error message only; no recipe text is logged.
    console.warn('[pairings] cache write failed:', error.message);
  }
}

function parseModelSides(response) {
  let parsed = response;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      throw new Error('AI returned invalid JSON for meal pairings');
    }
  }
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.sides)) return parsed.sides;
  throw new Error('AI returned no pairings');
}

async function generateSidesWithAI(hero, hardAllergens, env) {
  const systemPrompt = `You are a chef composing a complete meal around a main dish. Create three companion recipes that suit this specific dish: one vegetable side (type "side_veg"), one starch (type "starch"), and one sauce or condiment (type "sauce").

Choose components that complement the main dish's cuisine, flavors, richness, and texture, and avoid repeating its main ingredients. Each recipe must be complete and cookable by a home cook: 5 to 12 ingredients with exact US measurements, 4 to 7 ordered steps with temperatures, times, and doneness cues, written for 4 servings. Hard allergens are absolute: never include them, even as optional garnishes. Avoid pre-made stocks, bouillon, and spice blends; list whole ingredients instead.

Return valid JSON only, with no commentary.`;
  const userPrompt = `Main dish:
${JSON.stringify(hero)}

Hard allergens to exclude: ${hardAllergens.join(', ') || 'none'}.
Return {"sides": [...]} with exactly three recipes, one of each type.`;

  const response = await env.AI.run(PAIRINGS_MODEL, {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'meal_pairings',
        schema: {
          type: 'object',
          properties: {
            sides: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  type: { type: 'string', enum: Object.values(COMPONENT_SLOTS) },
                  description: { type: 'string' },
                  prepMinutes: { type: 'integer' },
                  cookMinutes: { type: 'integer' },
                  ingredients: { type: 'array', items: { type: 'string' } },
                  instructions: { type: 'array', items: { type: 'string' } }
                },
                required: ['name', 'type', 'description', 'prepMinutes', 'cookMinutes', 'ingredients', 'instructions']
              }
            }
          },
          required: ['sides']
        }
      }
    },
    max_tokens: 3072,
    temperature: 0.5
  });

  if (!response || response.response === undefined) {
    throw new Error('Invalid response from LLaMA model for meal pairings');
  }
  return parseModelSides(response.response);
}

/**
 * Run the food-process gates on each generated side. A side the gates block is
 * dropped (its slot falls back to the curated pairing); rewritten steps are kept.
 */
function applySideProcessSafety(sides, env) {
  const safe = [];
  for (const side of sides) {
    try {
      const gated = applyProcessSafetyGates(pairSideToRecipeObject(side), env, {
        'process_safety.surface': 'pairings'
      });
      const cookGate = gated.processSafetySummary?.cook_gate || 'allow';
      if (cookGate === 'block' || cookGate === 'template') continue;
      safe.push({ ...side, instructions: recipeLines(gated.instructions) });
    } catch {
      // Blocked by a process hazard: leave the slot for the curated fallback.
    }
  }
  return safe;
}

/**
 * POST /pairings — generate a vegetable side, starch, and sauce tailored to a
 * specific dish. Falls back to the curated pairings when the model is
 * unavailable, and fills any slot the model failed to produce safely.
 */
export async function handlePairings(request, env, corsHeaders) {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return jsonResponse({ error: 'Content-Type must be application/json' }, 400, corsHeaders);
  }

  let requestBody;
  try {
    requestBody = objectOrEmpty(await request.json());
  } catch {
    return jsonResponse({ error: 'Request body must be valid JSON' }, 400, corsHeaders);
  }

  const heroRecipe = objectOrEmpty(requestBody.heroRecipe || requestBody.recipe);
  if (typeof heroRecipe.name !== 'string' || !heroRecipe.name.trim() || recipeLines(heroRecipe.ingredients).length === 0) {
    return jsonResponse({
      error: 'heroRecipe with a name and non-empty ingredients array is required'
    }, 400, corsHeaders);
  }

  const hero = heroSummary(heroRecipe);
  const hardAllergens = collectHardAllergens(requestBody, heroRecipe);
  const cuisine = inferHeroCuisine(hero);
  const key = await cacheKey(hero, hardAllergens);

  const cached = await readCache(env, key);
  if (cached) {
    return jsonResponse({ success: true, ...cached, cached: true, hardAllergens }, 200, corsHeaders);
  }

  let generated = [];
  let generationError = null;
  if (env.AI) {
    try {
      const rawSides = await generateSidesWithAI(hero, hardAllergens, env);
      generated = applySideProcessSafety(normalizeGeneratedSides(rawSides, hero, { hardAllergens }), env);
    } catch (error) {
      generationError = error.message;
      // eslint-disable-next-line no-console -- Error message only; no recipe text is logged.
      console.warn('[pairings] generation failed, using curated pairings:', error.message);
    }
  }

  const sides = generated.length > 0
    ? completeWithCuratedSides(generated, hero, { hardAllergens })
    : composeMealSides(hero, { hardAllergens });
  const method = generated.length > 0 ? 'llama-ai-pairings' : 'curated';
  const result = {
    sides,
    method,
    cuisine,
    model: method === 'curated' ? null : PAIRINGS_MODEL
  };

  // Only cache a full generated set; a fallback should be retried next time.
  if (method !== 'curated' && generated.length === Object.values(COMPONENT_SLOTS).length) {
    await writeCache(env, key, result);
  }

  return jsonResponse({
    success: true,
    ...result,
    cached: false,
    hardAllergens,
    ...(generationError ? { fallbackReason: 'generation_failed' } : {}),
    environment: env.ENVIRONMENT || 'development'
  }, 200, corsHeaders);
}

export { cacheKey, collectHardAllergens, parseModelSides };
