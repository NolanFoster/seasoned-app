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

/**
 * Builds the system + user prompt for the grocery-list LLM call.
 * Keeping the prompt in one place makes it easy to iterate on.
 *
 * @param {string[]} ingredients - Raw ingredient strings from all recipes
 * @returns {string} Full user-role message text
 */
function buildPrompt(ingredients) {
  const ingredientList = ingredients.join('\n');
  return `You are a grocery list aggregator. Given the raw ingredient lines below, you must:
1. Normalize ingredient names (e.g. "all-purpose flour" and "flour" are the same thing).
2. Deduplicate: merge identical or near-identical ingredients into one entry.
3. Sum quantities where units match (e.g. "1 cup flour" + "2 cups flour" = "3 cups flour"). When units differ or cannot be summed, list the combined amounts (e.g. "1 can + 2 cups").
4. Assign each ingredient to exactly one logical grocery category. Use: Produce, Dairy, Meat & Seafood, Bakery, Pantry Staples, Frozen, Beverages, Other.
5. Mark each item isStaple: true if it is a common pantry staple that many households already own (salt, pepper, oils, vinegar, flour, sugar, baking powder/soda, soy sauce, common dried spices/herbs, garlic, onion, eggs, butter).
6. Return ONLY valid JSON — no markdown fences, no explanation text before or after.

Ingredient lines:
${ingredientList}

Output ONLY this JSON structure:
[
  {
    "category": "string",
    "items": [
      { "name": "string", "quantity": "string", "isStaple": false }
    ]
  }
]`;
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

  // ── LLM call ───────────────────────────────────────────────────────────────

  const prompt = buildPrompt(ingredientStrings);
  const llmStart = Date.now();
  let rawText;

  try {
    const response = await env.AI.run('@cf/meta/llama-3.2-3b-instruct', {
      messages: [{ role: 'user', content: prompt }],
      // Workers AI defaults max_tokens to ~256 for many LLMs; grocery JSON needs more headroom.
      max_tokens: 4096,
      temperature: 0.3
    });
    rawText = response?.response ?? '';
    console.log(`[grocery-list] LLM responded in ${Date.now() - llmStart}ms`);
  } catch (err) {
    console.error('[grocery-list] LLM call failed:', err?.message ?? err);
    return json(
      { success: false, error: 'AI inference failed', code: 'LLM_ERROR' },
      502
    );
  }

  // ── Parse & validate LLM output ────────────────────────────────────────────

  let categories;
  try {
    const parsed = extractJsonArray(rawText);
    categories = validateCategories(parsed);
  } catch (err) {
    console.error('[grocery-list] Failed to parse LLM output:', err?.message);
    console.error('[grocery-list] Raw LLM output:', rawText);
    return json(
      { success: false, error: 'Failed to parse AI response', code: 'PARSE_ERROR' },
      500
    );
  }

  console.log(`[grocery-list] Returning ${categories.length} categorie(s)`);
  return json({ success: true, categories });
}
