/**
 * Grocery List Handler
 *
 * Accepts a POST request with { ingredients: string[], pantryItems?: PantryItem[] },
 * sends ingredients to the Llama 3.2 3B Instruct LLM, and returns a
 * deduplicated, categorized grocery list. When pantryItems is present, each
 * item is also classified as buy, owned, or optional_staple by the
 * deterministic gap-fill pass (the LLM never decides inventory state).
 *
 * Response shape:
 *   {
 *     success: true,
 *     categories: [
 *       { category: string, items: [{ name: string, quantity: string, unit?: string, isStaple: boolean, inventoryStatus?: string }] }
 *     ]
 *   }
 */

import { OpikClient } from '../opik-client.js';
import {
  classifyGroceryItems,
  mergeDuplicateGroceryItems,
  pantryNamesMatch
} from '../../../shared/pantry-planning.js';

/** Workers AI model id for grocery aggregation (keep in sync with env.AI.run below). */
const GROCERY_LLM_MODEL = '@cf/meta/llama-3.2-3b-instruct';

/**
 * User message body for grocery aggregation. Must match `scripts/grocery_opik_helpers.py` BASELINE_PROMPT;
 * `{{ingredient_lines}}` is substituted with joined request ingredients at runtime.
 */
const GROCERY_AGGREGATOR_USER_PROMPT = `You are a grocery list aggregator. Given the raw ingredient lines below, you must:
1. Output only ingredients that appear in the ingredient lines. Never add an item the lines do not mention — including any food named in these instructions, which describe wording and aisles rather than things to buy.
2. Normalize ingredient names: a line naming a variety of an ingredient and a line naming the plain ingredient are the same thing.
3. Deduplicate: merge identical or near-identical ingredients into ONE line per name (never list the same ingredient twice in the same category).
4. Sum quantities where units match: two "1 cup <ingredient>" lines must become one entry with "2 cups <ingredient>" — never output chained sums like "1 cup + 1 cup" when the unit is the same. When units differ or cannot be summed, use one clear phrase (e.g. "1 can + 2 cups").
5. Quantities must come from the ingredient lines. Do not use "not specified" or similar placeholders — if a line has no amount, use wording from that line (e.g. "as needed", "to taste") or a reasonable default from context.
6. Use each category name at most once: exactly one JSON object per category, with every item for that aisle in its "items" array (e.g. never two separate "Pantry Staples" objects).
7. Assign each ingredient to exactly one category. Allowed categories: Produce, Dairy, Meat & Seafood, Bakery, Pantry Staples, Frozen, Beverages, Other.
   - Jarred, canned, bottled or pickled condiments and dry seasoning mixes → Pantry Staples unless the line explicitly says frozen.
   - Bottled citrus juices, vinegars and cooking oils → Pantry Staples. Beverages is only for products bought to drink. Frozen is only for frozen goods or when the recipe clearly means the frozen product.
   - Fresh produce and fresh herbs → Produce; keep the word "fresh" in the name when the source line does.
8. Mark isStaple: true only for common household staples: basic seasonings and spices, baking basics, common cooking oils and vinegars, and the everyday refrigerator basics most homes keep on hand.
9. Return ONLY valid JSON — no markdown fences, no explanation text before or after.

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

/**
 * Appended to the base prompt on the one retry after a parse failure. Kept
 * separate from GROCERY_AGGREGATOR_USER_PROMPT so the Opik-synced baseline
 * prompt in `scripts/grocery_opik_helpers.py` stays byte-identical.
 */
const STRICT_JSON_REMINDER =
  'CRITICAL: your previous answer was not valid JSON. Reply with the JSON array ONLY. ' +
  'Start with "[" and end with "]". No prose before or after, no markdown fences, ' +
  'no trailing commas, and escape any double quote that appears inside a value.';

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
 * Repairs JSON dialect slips small instruct models commonly emit.
 * Only applied as a fallback, after a strict parse has already failed, so
 * well-formed output is never rewritten.
 *
 * @param {string} s
 * @returns {string}
 */
function repairJsonDialect(s) {
  return s
    // Python literals: `"isStaple": False` → `"isStaple": false`
    .replace(/:(\s*)True\b/g, ':$1true')
    .replace(/:(\s*)False\b/g, ':$1false')
    .replace(/:(\s*)None\b/g, ':$1null')
    // Trailing commas before a closing bracket
    .replace(/,(\s*[}\]])/g, '$1');
}

/**
 * Walks `text` from `start`, tracking bracket depth while ignoring brackets that
 * appear inside JSON strings, and returns the balanced region beginning there.
 *
 * Also reports the longest prefix that ends on a complete element plus the
 * containers still open at that point, which lets a truncated response be
 * salvaged instead of discarded.
 *
 * @param {string} text
 * @param {number} start - Index of the opening `[` or `{`
 * @returns {{ text: string, complete: boolean, salvaged: string|null }}
 */
function scanBalanced(text, start) {
  const closerFor = { '[': ']', '{': '}' };
  const stack = [];
  let inString = false;
  let escaped = false;
  let lastElementEnd = -1;
  let stackAtLastElementEnd = null;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '[' || ch === '{') {
      stack.push(closerFor[ch]);
      continue;
    }

    if (ch === ']' || ch === '}') {
      stack.pop();
      if (stack.length === 0) {
        return { text: text.slice(start, i + 1), complete: true, salvaged: null };
      }
      // A complete element closed while containers remain open: a safe cut point.
      lastElementEnd = i;
      stackAtLastElementEnd = [...stack];
    }
  }

  // Ran off the end: the model stopped mid-output (usually max_tokens).
  const salvaged =
    lastElementEnd === -1
      ? null
      : text.slice(start, lastElementEnd + 1) + [...stackAtLastElementEnd].reverse().join('');

  return { text: text.slice(start), complete: false, salvaged };
}

/**
 * Parses `candidate` as a category array, retrying once with dialect repairs.
 *
 * Rejects an array that parses but holds no category block (e.g. a bare item
 * list lifted out of an `"items": [...]` key) so the caller keeps scanning for
 * the real array instead of returning an empty grocery list.
 *
 * @param {string} candidate
 * @returns {Array|null} Category array, or null if it does not parse
 */
function parseCategoryCandidate(candidate) {
  for (const text of [candidate, repairJsonDialect(candidate)]) {
    try {
      const result = arrayFromParsedCategories(JSON.parse(text));
      if (result && (result.length === 0 || result.some(isCategoryBlock))) {
        return result;
      }
    } catch {
      // Try the next variant
    }
  }
  return null;
}

/**
 * Attempts to extract and parse a JSON array from raw LLM output.
 *
 * Handles markdown fences, prose before or after the JSON (including prose that
 * itself contains brackets), duplicated arrays, common JSON dialect slips, and
 * non-string bindings (already-parsed object).
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

  if (raw.trim() === '') {
    throw new Error('LLM returned an empty response');
  }

  const wholeDocument = parseCategoryCandidate(raw);
  if (wholeDocument) {
    return wholeDocument;
  }

  const fenceStripped = raw.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/g, '');

  // The first `[` may belong to prose ("Here is the list [by aisle]:"), so try
  // every bracket in turn and keep the first that yields a real category array.
  let sawTruncation = false;
  const salvageCandidates = [];

  for (let i = 0; i < fenceStripped.length; i++) {
    const ch = fenceStripped[i];
    if (ch !== '[' && ch !== '{') {
      continue;
    }

    const region = scanBalanced(fenceStripped, i);
    if (region.complete) {
      const parsed = parseCategoryCandidate(region.text);
      if (parsed) {
        return parsed;
      }
      continue;
    }

    sawTruncation = true;
    if (region.salvaged) {
      salvageCandidates.push(region.salvaged);
    }
    // An unbalanced region runs to end of input; later brackets are inside it.
    break;
  }

  // Truncated output: return the complete prefix rather than failing outright.
  for (const candidate of salvageCandidates) {
    const parsed = parseCategoryCandidate(candidate);
    if (parsed) {
      console.warn('[grocery-list] LLM output was truncated; salvaged the complete prefix');
      return parsed;
    }
  }

  if (sawTruncation) {
    throw new Error(
      'LLM response looks truncated (unbalanced brackets); output may have hit max_tokens'
    );
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
          unit: item.unit != null ? String(item.unit) : '',
          isStaple: Boolean(item.isStaple)
        }))
    }))
    .filter((cat) => cat.items.length > 0);
}

/**
 * Merges duplicate category labels (e.g. two "Pantry Staples" blocks) into one.
 * Duplicate item names are collapsed separately, by mergeDuplicateItems below.
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
 * Collapses lines that name the same ingredient into one, across the whole
 * list rather than per category.
 *
 * The prompt asks for one line per ingredient, but the 3B aggregator regularly
 * repeats an item inside a category and mirrors whole blocks into a second
 * aisle, which reaches the shopper as "unsalted butter" listed four times.
 * The merge itself lives in shared/pantry-planning.js so the browser applies
 * the same rules to a response from an older worker.
 *
 * @param {{ category: string, items: Array<{ name: string, quantity: string }> }[]} categories
 * @returns {typeof categories}
 */
function mergeDuplicateItems(categories) {
  const merged = mergeDuplicateGroceryItems(
    categories.flatMap((cat) => cat.items.map((item) => ({ ...item, category: cat.category })))
  );

  const itemsByCategory = new Map(categories.map((cat) => [cat.category, []]));
  for (const { category, ...item } of merged) {
    itemsByCategory.get(category)?.push(item);
  }
  return categories
    .map((cat) => ({ category: cat.category, items: itemsByCategory.get(cat.category) ?? [] }))
    .filter((cat) => cat.items.length > 0);
}

/**
 * Pantry input is supplied by the signed-in app so the worker can return a
 * portable, already gap-filled list. It is still untrusted request data: keep
 * the payload bounded and discard fields the classifier does not need.
 *
 * `null` means the caller did not ask for pantry matching. An empty array is a
 * meaningful request (it lets the UI show staple lines while explaining that
 * the pantry is empty), so callers should preserve that distinction.
 */
function sanitizePantryItems(value) {
  if (!Array.isArray(value)) return null;
  return value
    .filter((item) => item && typeof item === 'object' && typeof item.name === 'string')
    .map((item, index) => {
      const name = item.name.trim().replace(/\s+/g, ' ').slice(0, 200);
      const rawQuantity = item.quantity;
      const quantity = typeof rawQuantity === 'number'
        ? rawQuantity
        : typeof rawQuantity === 'string' && rawQuantity.trim() !== ''
          ? rawQuantity.trim().slice(0, 40)
          : null;
      const rawExpiry = item.expiresOn ?? item.expires_on;
      const parsedExpiry = typeof rawExpiry === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(rawExpiry)
        ? new Date(`${rawExpiry}T00:00:00.000Z`)
        : null;
      const expiresOn = parsedExpiry && !Number.isNaN(parsedExpiry.getTime()) &&
        parsedExpiry.toISOString().slice(0, 10) === rawExpiry
        ? rawExpiry
        : null;
      return {
        id: item.id == null ? `request-pantry-${index}` : String(item.id).slice(0, 100),
        name,
        quantity,
        unit: typeof item.unit === 'string' ? item.unit.trim().slice(0, 40) : null,
        expiresOn
      };
    })
    .filter((item) => item.name)
    .slice(0, 100);
}

/**
 * Drops items no request ingredient line supports.
 *
 * The aggregator prompt has to talk about foods to explain aisles and staples,
 * and a 3B instruct model does not reliably separate those instruction
 * examples from the data it was handed: they come back as real grocery lines
 * ("taco seasoning" being the one users hit most). Nothing downstream can tell
 * an invented item from a real one, so ground the list here, where the
 * request's own ingredient lines are still in scope.
 *
 * Matching reuses the pantry matcher, which is deliberately lenient: a name
 * matches when its meaningful tokens are contained in a line's, so normalized
 * names still pass ("flour" matches "1 cup all-purpose flour", "chicken
 * breast" matches "1 lb chicken breast, diced").
 *
 * @param {{ category: string, items: Array<{ name: string }> }[]} categories
 * @param {string[]} ingredientLines - Raw ingredient strings from the request
 * @returns {typeof categories}
 */
function filterUngroundedItems(categories, ingredientLines) {
  const dropped = [];
  const grounded = categories
    .map((category) => ({
      ...category,
      items: category.items.filter((item) => {
        if (ingredientLines.some((line) => pantryNamesMatch(item.name, line))) {
          return true;
        }
        dropped.push(item.name);
        return false;
      })
    }))
    .filter((category) => category.items.length > 0);

  if (dropped.length === 0) {
    return categories;
  }

  // Every single item failing to match implicates the matcher, not the model.
  // An empty list is a worse answer than an over-full one, so keep what the
  // model returned and make the anomaly visible instead.
  if (grounded.length === 0) {
    console.warn(
      `[grocery-list] Grounding matched none of ${dropped.length} item(s); keeping the unfiltered list`
    );
    return categories;
  }

  console.warn(`[grocery-list] Dropped ${dropped.length} ungrounded item(s): ${dropped.join(', ')}`);
  return grounded;
}

/**
 * Apply deterministic pantry gap filling after the LLM has normalized aisle
 * categories. Keeping this pass outside the prompt means an LLM cannot
 * accidentally claim an on-hand item is still needed (or hide a missing
 * quantity). The response remains backward compatible when pantryItems is not
 * supplied: no inventory metadata is added in that mode.
 */
function classifyCategories(categories, pantryItems) {
  if (pantryItems === null) return categories;
  return categories.map((category) => ({
    ...category,
    items: classifyGroceryItems(
      category.items.map((item) => ({
        ...item,
        category: category.category,
        optionalStaple: item.optionalStaple || item.isStaple
      })),
      pantryItems
    )
  }));
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
  // Keep `undefined` distinct from `[]`: only the former means legacy
  // grocery-list behavior without pantry classification.
  const pantryItems = sanitizePantryItems(body?.pantryItems);

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
    const categories = [{
      category: 'Pantry Staples',
      items: ingredientStrings.map((i) => ({ name: i, quantity: '', isStaple: false }))
    }];
    return json({
      success: true,
      categories: classifyCategories(categories, pantryItems),
      ...(pantryItems === null ? {} : { pantryMatched: true })
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

  /**
   * One Workers AI call. `content` is passed verbatim so the retry can append a
   * strictness reminder without mutating the Opik-synced base prompt.
   *
   * @param {string} content
   * @param {number} temperature
   */
  const runLlm = async (content, temperature) => {
    const response = await env.AI.run(GROCERY_LLM_MODEL, {
      messages: [{ role: 'user', content }],
      // Workers AI defaults max_tokens to ~256 for many LLMs; grocery JSON needs more headroom.
      max_tokens: 4096,
      temperature
    });
    return response?.response ?? '';
  };

  try {
    llmStartIso = new Date().toISOString();
    const llmWallStart = Date.now();
    rawText = await runLlm(prompt, 0.3);
    llmEndIso = new Date().toISOString();
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
  } catch (firstErr) {
    // A 3B model occasionally emits JSON no amount of repair can recover
    // (an unescaped quote inside a name, an empty completion). One stricter,
    // deterministic retry costs a round trip and rescues most of those.
    console.warn(`[grocery-list] First parse failed (${firstErr?.message}); retrying once`);
    try {
      llmStartIso = new Date().toISOString();
      rawText = await runLlm(`${prompt}\n\n${STRICT_JSON_REMINDER}`, 0);
      llmEndIso = new Date().toISOString();
      categories = mergeDuplicateCategories(validateCategories(extractJsonArray(rawText)));
      console.log('[grocery-list] Retry produced parseable JSON');
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
  }

  categories = filterUngroundedItems(mergeDuplicateItems(categories), ingredientStrings);

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

  categories = classifyCategories(categories, pantryItems);

  console.log(`[grocery-list] Returning ${categories.length} categorie(s)`);
  return json({
    success: true,
    categories,
    ...(pantryItems === null ? {} : { pantryMatched: true })
  });
}
