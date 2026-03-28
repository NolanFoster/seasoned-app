/**
 * Grocery List Handler
 *
 * Accepts a POST request with { ingredients: string[] }, sends them to the
 * Llama 3.2 3B Instruct LLM, and returns a deduplicated, categorized grocery list.
 *
 * Response shape:
 *   {
 *     success: true,
 *     categories: [
 *       { category: string, items: [{ name: string, quantity: string, isStaple: boolean }] }
 *     ]
 *   }
 */

import { OpikClient } from '../opik-client.js';

/** Workers AI model id for grocery aggregation (keep in sync with env.AI.run below). */
const GROCERY_LLM_MODEL = '@cf/meta/llama-3.2-3b-instruct';

/**
 * User message body for grocery aggregation. Must match `scripts/grocery_opik_helpers.py` BASELINE_PROMPT;
 * `{{ingredient_lines}}` is substituted with joined request ingredients at runtime.
 */
const GROCERY_AGGREGATOR_USER_PROMPT = `You are a grocery list aggregator. Given the raw ingredient lines below, you must:
1. Normalize ingredient names (e.g. "all-purpose flour" and "flour" are the same thing).
2. Deduplicate: merge identical or near-identical ingredients into ONE line per name (never list the same ingredient twice in the same category).
3. Sum quantities where units match: two "1 cup mayonnaise" lines must become one entry with "2 cups mayonnaise" — never output chained sums like "1 cup + 1 cup" when the unit is the same. When units differ or cannot be summed, use one clear phrase (e.g. "1 can + 2 cups").
4. Quantities must come from the ingredient lines. Do not use "not specified" or similar placeholders — if a line has no amount, use wording from that line (e.g. "as needed", "to taste") or a reasonable default from context.
5. Use each category name at most once: exactly one JSON object per category, with every item for that aisle in its "items" array (e.g. never two separate "Pantry Staples" objects).
6. Assign each ingredient to exactly one category. Allowed categories: Produce, Dairy, Meat & Seafood, Bakery, Pantry Staples, Frozen, Beverages, Other.
   - Jarred/canned condiments (salsa, mayo, ketchup, pickles, taco seasoning) → Pantry Staples unless the line explicitly says frozen.
   - Lemon juice, lime juice, vinegar, oils for cooking → Pantry Staples. Beverages is for drink products (juice cartons, soda, wine). Frozen is only for frozen goods or when the recipe clearly means the frozen product.
   - Fresh produce and fresh herbs → Produce; keep the word "fresh" in the name when the source does (e.g. "fresh cilantro").
7. Mark isStaple: true only for common household staples (salt, pepper, basic spices many homes keep, flour, sugar, baking powder/soda, soy sauce, garlic, onion, eggs, butter, common oils/vinegar).
8. Return ONLY valid JSON — no markdown fences, no explanation text before or after.

Ingredient lines:
{{ingredient_lines}}

Output ONLY this JSON structure:
[
  {
    "category": "string",
    "items": [
      { "name": "string", "quantity": "string", "isStaple": false }
    ]
  }
]`;

/** @param {unknown} raw */
function serializeLlmOutputForOpik(raw) {
  if (raw == null) {
    return '';
  }
  if (typeof raw === 'string') {
    return raw;
  }
  try {
    return JSON.stringify(raw);
  } catch {
    return String(raw);
  }
}

/**
 * @param {unknown} text
 * @param {number} [maxLen]
 */
function truncateForOpik(text, maxLen = 32000) {
  const s = typeof text === 'string' ? text : serializeLlmOutputForOpik(text);
  if (s.length <= maxLen) {
    return s;
  }
  return `${s.slice(0, maxLen)}…[truncated]`;
}

/**
 * Builds the user prompt for the grocery-list LLM call (template from GROCERY_AGGREGATOR_USER_PROMPT).
 *
 * @param {string[]} ingredients - Raw ingredient strings from all recipes
 * @returns {string} Full user-role message text
 */
function buildPrompt(ingredients) {
  const ingredientList = ingredients.join('\n');
  return GROCERY_AGGREGATOR_USER_PROMPT.replace('{{ingredient_lines}}', ingredientList);
}

/**
 * @param {unknown} v
 * @returns {boolean}
 */
function isCategoryBlock(v) {
  return v != null && typeof v === 'object' && v.category != null && Array.isArray(v.items);
}

/**
 * Workers AI sometimes returns already-parsed JSON (object or array-like object).
 *
 * @param {unknown} parsed
 * @returns {Array|null} Category array, or null if shape is not recognized
 */
function arrayFromParsedCategories(parsed) {
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (isCategoryBlock(parsed)) {
    return [parsed];
  }
  if (parsed && typeof parsed === 'object') {
    const vals = Object.values(parsed).filter(isCategoryBlock);
    if (vals.length > 0) {
      return vals;
    }
  }
  return null;
}

/**
 * Attempts to extract and parse a JSON array from raw LLM output.
 * Handles markdown fences, preamble text, and non-string bindings (parsed object).
 *
 * @param {unknown} raw - String or parsed object from env.AI.run().response
 * @returns {Array} Parsed category array
 * @throws {Error} If no valid JSON array can be found
 */
function extractJsonArray(raw) {
  if (typeof raw === 'object' && raw !== null) {
    const direct = arrayFromParsedCategories(raw);
    if (direct) {
      return direct;
    }
    raw = JSON.stringify(raw);
  }
  if (typeof raw !== 'string') {
    raw = String(raw ?? '');
  }

  try {
    const parsed = JSON.parse(raw);
    const fromJson = arrayFromParsedCategories(parsed);
    if (fromJson) {
      return fromJson;
    }
  } catch {
    // Fall through to bracket extraction
  }

  const fenceStripped = raw.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/g, '');

  const start = fenceStripped.indexOf('[');
  const end = fenceStripped.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) {
    if (start !== -1 && end === -1) {
      throw new Error(
        'LLM response looks truncated (opened [ but no ]); output may have hit max_tokens'
      );
    }
    throw new Error('No JSON array found in LLM response');
  }

  const candidate = fenceStripped.slice(start, end + 1);
  const parsed = JSON.parse(candidate);
  const fromBracket = arrayFromParsedCategories(parsed);
  if (fromBracket) {
    return fromBracket;
  }
  throw new Error('No JSON array found in LLM response');
}

/**
 * Validates that the parsed LLM output matches the expected shape.
 * Coerces bad values rather than throwing where possible.
 *
 * @param {any} parsed - Output from extractJsonArray
 * @returns {{ category: string, items: Array }[]}
 */
function validateCategories(parsed) {
  if (!Array.isArray(parsed)) {
    throw new Error('LLM output is not a JSON array');
  }
  return parsed
    .filter((cat) => cat && typeof cat === 'object' && cat.category && Array.isArray(cat.items))
    .map((cat) => ({
      category: String(cat.category),
      items: cat.items
        .filter((item) => item && typeof item === 'object' && item.name)
        .map((item) => ({
          name: String(item.name),
          quantity: item.quantity != null ? String(item.quantity) : '',
          isStaple: Boolean(item.isStaple)
        }))
    }))
    .filter((cat) => cat.items.length > 0);
}

/**
 * Merges duplicate category labels (e.g. two "Pantry Staples" blocks) into one.
 * Does not merge duplicate item names: identical quantities would need numeric
 * parsing to combine safely, so the prompt handles per-ingredient deduplication.
 *
 * @param {{ category: string, items: Array<{ name: string, quantity: string, isStaple: boolean }> }[]} categories
 * @returns {typeof categories}
 */
function mergeDuplicateCategories(categories) {
  const byCat = new Map();
  for (const cat of categories) {
    const label = String(cat.category);
    const key = label.trim().toLowerCase();
    if (!byCat.has(key)) {
      byCat.set(key, { category: label, items: [...cat.items] });
    } else {
      byCat.get(key).items.push(...cat.items);
    }
  }
  return [...byCat.values()].filter((c) => c.items.length > 0);
}

/**
 * POST /grocery-list handler
 *
 * @param {Request} request
 * @param {object} env - Cloudflare Worker environment bindings (env.AI required)
 * @param {object} corsHeaders - Pre-built CORS headers from index.js
 * @returns {Response}
 */
export async function handleGroceryList(request, env, corsHeaders) {
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  // ── Input validation ────────────────────────────────────────────────────────

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'Request body must be valid JSON', code: 'INVALID_JSON' }, 400);
  }

  const { ingredients } = body ?? {};

  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    return json(
      { success: false, error: '`ingredients` must be a non-empty array of strings', code: 'INVALID_INPUT' },
      400
    );
  }

  const ingredientStrings = ingredients.filter((i) => typeof i === 'string' && i.trim().length > 0);
  if (ingredientStrings.length === 0) {
    return json(
      { success: false, error: '`ingredients` array contains no valid strings', code: 'INVALID_INPUT' },
      400
    );
  }

  console.log(`[grocery-list] Processing ${ingredientStrings.length} ingredient(s)`);

  // ── Local dev fallback (no AI binding) ─────────────────────────────────────

  if (!env.AI) {
    console.warn('[grocery-list] env.AI not available — returning mock response');
    return json({
      success: true,
      categories: [
        {
          category: 'Pantry Staples',
          items: ingredientStrings.map((i) => ({ name: i, quantity: '', isStaple: false }))
        }
      ]
    });
  }

  // ── LLM call + Opik tracing ─────────────────────────────────────────────────

  const traceWallStart = Date.now();
  const traceStartIso = new Date().toISOString();
  const opikClient = new OpikClient(env.OPIK_API_KEY, 'recipe-generation');
  const tracingEnabled = Boolean(env.OPIK_API_KEY) && opikClient.isHealthy();

  const flushOpikSafe = async () => {
    if (!tracingEnabled) {
      return;
    }
    try {
      await opikClient.flush();
    } catch (flushErr) {
      console.warn('[grocery-list] Opik flush failed:', flushErr?.message ?? flushErr);
    }
  };

  const prompt = buildPrompt(ingredientStrings);
  let rawText;
  let llmStartIso;
  let llmEndIso;

  try {
    llmStartIso = new Date().toISOString();
    const llmWallStart = Date.now();
    const response = await env.AI.run(GROCERY_LLM_MODEL, {
      messages: [{ role: 'user', content: prompt }],
      // Workers AI defaults max_tokens to ~256 for many LLMs; grocery JSON needs more headroom.
      max_tokens: 4096,
      temperature: 0.3
    });
    llmEndIso = new Date().toISOString();
    rawText = response?.response ?? '';
    console.log(`[grocery-list] LLM responded in ${Date.now() - llmWallStart}ms`);
  } catch (err) {
    console.error('[grocery-list] LLM call failed:', err?.message ?? err);
    if (tracingEnabled) {
      const errTrace = opikClient.createTrace(
        'Grocery List Error',
        { ingredientCount: ingredientStrings.length, ingredients: ingredientStrings },
        { error: err?.message ?? String(err), code: 'LLM_ERROR' },
        { phase: 'llm', model: GROCERY_LLM_MODEL },
        traceStartIso,
        new Date().toISOString()
      );
      if (errTrace) {
        opikClient.endTrace(errTrace, err instanceof Error ? err : new Error(String(err)));
        await flushOpikSafe();
      }
    }
    return json(
      { success: false, error: 'AI inference failed', code: 'LLM_ERROR' },
      502
    );
  }

  // ── Parse & validate LLM output ────────────────────────────────────────────

  let categories;
  try {
    const parsed = extractJsonArray(rawText);
    categories = mergeDuplicateCategories(validateCategories(parsed));
  } catch (err) {
    console.error('[grocery-list] Failed to parse LLM output:', err?.message);
    console.error('[grocery-list] Raw LLM output:', rawText);
    if (tracingEnabled) {
      const rawStr = serializeLlmOutputForOpik(rawText);
      const errTrace = opikClient.createTrace(
        'Grocery List Error',
        { ingredientCount: ingredientStrings.length, ingredients: ingredientStrings },
        {
          error: err?.message ?? String(err),
          code: 'PARSE_ERROR',
          rawPreview: truncateForOpik(rawStr, 16000)
        },
        { phase: 'parse', model: GROCERY_LLM_MODEL, rawLength: rawStr.length },
        traceStartIso,
        new Date().toISOString()
      );
      if (errTrace) {
        opikClient.endTrace(errTrace, err instanceof Error ? err : new Error(String(err)));
        await flushOpikSafe();
      }
    }
    return json(
      { success: false, error: 'Failed to parse AI response', code: 'PARSE_ERROR' },
      500
    );
  }

  const durationMs = Date.now() - traceWallStart;
  if (tracingEnabled) {
    const traceEndIso = new Date().toISOString();
    const totalItems = categories.reduce((n, c) => n + c.items.length, 0);
    const trace = opikClient.createTrace(
      'Grocery List Generation',
      { ingredientCount: ingredientStrings.length, ingredients: ingredientStrings },
      {
        success: true,
        categoryCount: categories.length,
        totalItems,
        categories
      },
      {
        model: GROCERY_LLM_MODEL,
        provider: 'cloudflare',
        durationMs
      },
      traceStartIso,
      traceEndIso
    );

    if (trace) {
      const respStr = serializeLlmOutputForOpik(rawText);
      const llmDurationMs = new Date(llmEndIso) - new Date(llmStartIso);
      const llmSpan = opikClient.createSpan(
        trace,
        'Grocery List LLM',
        'llm',
        { prompt: truncateForOpik(prompt) },
        { response: truncateForOpik(respStr) },
        {
          model: GROCERY_LLM_MODEL,
          provider: 'cloudflare',
          metadata: {
            promptLength: prompt.length,
            responseLength: respStr.length,
            durationMs: llmDurationMs
          }
        },
        llmStartIso,
        llmEndIso
      );
      if (llmSpan) {
        opikClient.endSpan(llmSpan);
      }

      const parseStartIso = llmEndIso;
      const parseEndIso = new Date().toISOString();
      const parseSpan = opikClient.createSpan(
        trace,
        'Parse & validate grocery JSON',
        'tool',
        {},
        { categoryCount: categories.length, totalItems },
        {
          metadata: {
            durationMs: new Date(parseEndIso) - new Date(parseStartIso)
          }
        },
        parseStartIso,
        parseEndIso
      );
      if (parseSpan) {
        opikClient.endSpan(parseSpan);
      }

      opikClient.endTrace(trace);
      await flushOpikSafe();
    }
  }

  console.log(`[grocery-list] Returning ${categories.length} categorie(s)`);
  return json({ success: true, categories });
}
