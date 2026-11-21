import categoryRows from './fixtures/ingredient-categories.json' assert { type: 'json' };
import {
  getSupportedUnits
} from './nutrition-calculator.js';
import {
  normalizeGroundingIngredient,
  parseIngredientString
} from './nutrition-grounding.js';

export const INGREDIENT_ENTITY_MODEL_ID = 'ingredient-entity-v1';
export const INGREDIENT_ENTITY_FLAG = 'ingredient_entity_v1';
export const INGREDIENT_ENTITY_CATEGORIES = Object.freeze([
  'vegetable',
  'fruit',
  'grain',
  'legume',
  'dairy',
  'egg',
  'meat',
  'poultry',
  'fish',
  'shellfish',
  'sweetener',
  'fat',
  'seasoning',
  'other',
  'unknown'
]);
export const INGREDIENT_ENTITY_STATES = Object.freeze([
  'diced',
  'minced',
  'sliced',
  'chopped',
  'crushed',
  'grated',
  'ground',
  'whole',
  'melted',
  'softened',
  'beaten',
  'julienned',
  'shredded'
]);

const SIZES = Object.freeze(['extra-large', 'small', 'medium', 'large']);
const TEMPERATURES = Object.freeze(['room temperature', 'room', 'cold', 'chilled', 'frozen', 'hot', 'warm']);
const DRY_FRESH = Object.freeze(['dry', 'fresh']);
const DIETARY_STYLES = Object.freeze(['vegan', 'vegetarian', 'pescatarian', 'non_vegetarian']);
const ANIMAL_CATEGORIES = new Set(['meat', 'poultry', 'fish', 'shellfish']);
const VEGAN_BLOCKED_CATEGORIES = new Set(['dairy', 'egg', 'meat', 'poultry', 'fish', 'shellfish']);
const VEGETARIAN_BLOCKED_CATEGORIES = new Set(['meat', 'poultry', 'fish', 'shellfish']);
const PESCATARIAN_BLOCKED_CATEGORIES = new Set(['meat', 'poultry']);
const ALLOWED_GEO_SOURCES = new Set(['request_brief', 'clip_host_map', 'user_set', 'absent']);
const AUTHENTICITY_TERMS = /\b(?:authentic|traditional|real|original|certified)\b/i;
const UNPARSED_BOUNDARY_PHRASES = Object.freeze([
  'as needed',
  'to taste',
  'for garnish',
  'for serving',
  'plus extra',
  'plus more',
  'divided',
  'finely',
  'roughly',
  'coarsely',
  'thinly',
  'thickly',
  'peeled',
  'seeded',
  'pitted',
  'cored',
  'zested',
  'toasted',
  'cooked',
  'roasted',
  'boiled',
  'drained',
  'rinsed',
  'thawed',
  'crumbled',
  'smashed',
  'mashed',
  'dried',
  'dehydrated',
  'powdered',
  'canned'
]);
const DEGREE_PATTERN = /\b\d+(?:\.\d+)?\s*°\s*[fc]\b/gi;
const AMBIGUOUS_MEASURE_PATTERN = /^(?:(?:\d+(?:\.\d+)?|\d+\/\d+|\d+\s+\d+\/\d+)\s*)?(?:a\s+)?(?:dash|pinch|splash)\s+of\s+(.+)$/i;
const SUPPORTED_UNITS = new Set(Object.values(getSupportedUnits()).flat().map((unit) => unit.toLocaleLowerCase('en-US')));

function cleanText(value, maximumLength = 200) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maximumLength) : '';
}

/** Normalize an ingredient name only for exact lexicon lookup. */
export function normalizeIngredientName(value) {
  return cleanText(value)
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function buildCategoryIndex(rows) {
  const index = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const name = normalizeIngredientName(row?.name);
    if (!name || !INGREDIENT_ENTITY_CATEGORIES.includes(row.category) || row.reviewed !== true) continue;
    index.set(name, Object.freeze({
      id: row.category,
      source: 'lexicon',
      reviewed: true,
      ...(Array.isArray(row.dietBlocks)
        ? { dietBlocks: Object.freeze([...new Set(row.dietBlocks.filter((style) => DIETARY_STYLES.includes(style)))]) }
        : {})
    }));
  }
  return index;
}

const CATEGORY_INDEX = buildCategoryIndex(categoryRows);

function lookupCategory(name) {
  const category = CATEGORY_INDEX.get(normalizeIngredientName(name));
  return category || { id: 'unknown', source: 'miss', reviewed: false };
}

function lineText(ingredient) {
  if (typeof ingredient === 'string') return ingredient;
  if (!ingredient || typeof ingredient !== 'object' || Array.isArray(ingredient)) return '';
  const raw = cleanText(ingredient.raw);
  if (raw) return raw;
  const name = cleanText(ingredient.name || ingredient.ingredient || ingredient.item);
  const quantity = ingredient.quantity ?? ingredient.amount ?? ingredient.value;
  const unit = cleanText(ingredient.unit || ingredient.measure);
  if (quantity !== undefined && quantity !== null && String(quantity).trim() !== '') {
    return `${quantity}${unit ? ` ${unit}` : ''}${name ? ` ${name}` : ''}`.trim();
  }
  return name;
}

function normalizeInput(ingredient, index) {
  if (typeof ingredient === 'string') return normalizeGroundingIngredient(ingredient, index);
  if (!ingredient || typeof ingredient !== 'object' || Array.isArray(ingredient)) {
    return normalizeGroundingIngredient('', index);
  }

  const quantityInput = ingredient.quantity ?? ingredient.amount ?? ingredient.value;
  const hasQuantity = quantityInput !== undefined && quantityInput !== null && String(quantityInput).trim() !== '';
  if (hasQuantity) {
    const normalized = normalizeGroundingIngredient(ingredient, index);
    if (normalized.valid) {
      const unit = cleanText(normalized.unit).toLocaleLowerCase('en-US');
      if (unit !== 'unit' && !SUPPORTED_UNITS.has(unit)) {
        return { ...normalized, quantity: null, unit: null, valid: false, quantityEstimated: true };
      }
      return normalized;
    }
  }

  const phrase = lineText(ingredient);
  const parsedPhrase = phrase ? parseIngredientString(phrase) : null;
  if (parsedPhrase) return { ...parsedPhrase, index, valid: true };
  return normalizeGroundingIngredient('', index);
}

function findBoundaryMatch(text, values) {
  const alternatives = values
    .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  if (!alternatives) return null;
  const leading = text.match(new RegExp(`^(${alternatives})(?=$|\\s|[,;])`, 'i'));
  const trailing = text.match(new RegExp(`(?:^|\\s)(${alternatives})$`, 'i'));
  if (leading && (!trailing || leading.index <= trailing.index)) {
    return { value: leading[1], start: 0, end: leading[0].length };
  }
  if (trailing) {
    return { value: trailing[1], start: trailing.index, end: trailing.index + trailing[0].length };
  }
  return null;
}

function removeBoundaryMatch(text, match) {
  const span = text.slice(match.start, match.end).trim().replace(/^[,;\s]+|[,;\s]+$/g, '');
  const remaining = `${text.slice(0, match.start)} ${text.slice(match.end)}`
    .replace(/\s+/g, ' ')
    .replace(/^[,;\s]+|[,;\s]+$/g, '')
    .trim();
  return { remaining, span };
}

function parseAttributes(phrase) {
  let working = cleanText(phrase).replace(/^[,;\s]+|[,;\s]+$/g, '');
  const attributes = {
    name: '',
    state: null,
    quantity: null,
    unit: null,
    size: null,
    temperature: null,
    dryFresh: null
  };
  const unparsedSpans = [];

  working = working.replace(DEGREE_PATTERN, (match) => {
    unparsedSpans.push(`temperature_deferred_to_step: ${match}`);
    return ' ';
  });
  working = working.replace(/\b(?:at|to)\s*$/i, '').replace(/\s+/g, ' ').trim();

  // Repeatedly remove only complete leading/trailing tokens. Substrings inside
  // an ingredient name are never treated as culinary attributes.
  for (;;) {
    const matches = [
      ...INGREDIENT_ENTITY_STATES.map((value) => ({ kind: 'state', value })),
      ...SIZES.map((value) => ({ kind: 'size', value })),
      ...TEMPERATURES.map((value) => ({ kind: 'temperature', value })),
      ...DRY_FRESH.map((value) => ({ kind: 'dryFresh', value })),
      ...UNPARSED_BOUNDARY_PHRASES.map((value) => ({ kind: 'unparsed', value }))
    ].map((candidate) => ({
      ...candidate,
      match: findBoundaryMatch(working, [candidate.value])
    })).filter((candidate) => candidate.match);

    if (!matches.length) break;
    matches.sort((left, right) => left.match.start - right.match.start);
    const candidate = matches[0];
    const removed = removeBoundaryMatch(working, candidate.match);
    working = removed.remaining;
    if (candidate.kind === 'state') {
      if (attributes.state === null) attributes.state = candidate.value;
      else unparsedSpans.push(removed.span);
    }
    if (candidate.kind === 'size') {
      if (attributes.size === null) attributes.size = candidate.value;
      else unparsedSpans.push(removed.span);
    }
    if (candidate.kind === 'temperature') {
      if (attributes.temperature === null) {
        attributes.temperature = candidate.value === 'room temperature' ? 'room' : candidate.value;
      } else {
        unparsedSpans.push(removed.span);
      }
    }
    if (candidate.kind === 'dryFresh') {
      if (attributes.dryFresh === null) attributes.dryFresh = candidate.value;
      else unparsedSpans.push(removed.span);
    }
    if (candidate.kind === 'unparsed') unparsedSpans.push(removed.span);
  }

  // Record known but unmodeled preparation/packaging words wherever they occur;
  // they are not silently folded into a name or promoted to a typed attribute.
  for (const phrase of [...UNPARSED_BOUNDARY_PHRASES].sort((left, right) => right.length - left.length)) {
    const pattern = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    working = working.replace(pattern, (match) => {
      unparsedSpans.push(match);
      return ' ';
    });
  }
  working = working.replace(/\s+/g, ' ').replace(/^[,;\s]+|[,;\s]+$/g, '').trim();
  attributes.name = normalizeIngredientName(working);
  return { attributes, unparsedSpans };
}

function createAbstainedEntity(raw, index) {
  return {
    modelId: INGREDIENT_ENTITY_MODEL_ID,
    index,
    raw,
    attributes: null,
    category: { id: 'unknown', source: 'abstain' },
    parseStatus: 'abstained',
    reason: 'no_name',
    unparsedSpans: []
  };
}

/**
 * Parse each ingredient line into conservative typed attributes. Quantity and
 * unit parsing is delegated to the same implementation used by nutrition
 * grounding; an estimated one-unit fallback is converted to nulls here.
 */
export function parseIngredientEntities(lines, { groundedIngredients = [] } = {}) {
  if (!Array.isArray(lines)) return [];
  const groundedByIndex = new Map(
    (Array.isArray(groundedIngredients) ? groundedIngredients : [])
      .filter((hit) => Number.isInteger(hit?.index))
      .map((hit) => [hit.index, hit])
  );

  return lines.map((ingredient, index) => {
    const raw = lineText(ingredient);
    const inputText = typeof ingredient === 'string' ? ingredient : typeof ingredient?.raw === 'string' ? ingredient.raw : '';
    const unsupportedMeasure = inputText.match(AMBIGUOUS_MEASURE_PATTERN);
    const leadingDegree = inputText.match(/^\s*\d+(?:\.\d+)?\s*°\s*[fc]\b/i);
    const normalized = unsupportedMeasure
      ? { name: unsupportedMeasure[1], quantity: null, unit: null, quantityEstimated: true, valid: false }
      : leadingDegree
        ? { name: inputText, quantity: null, unit: null, quantityEstimated: true, valid: false }
        : normalizeInput(ingredient, index);
    const phrase = cleanText(normalized?.name || raw);
    const { attributes, unparsedSpans } = parseAttributes(phrase);

    if (!attributes.name) return createAbstainedEntity(raw, index);

    const hasExplicitQuantity = normalized?.valid
      && !normalized.quantityEstimated
      && Number.isFinite(normalized.quantity)
      && normalized.quantity > 0
      && typeof normalized.unit === 'string'
      && normalized.unit.trim();
    attributes.quantity = hasExplicitQuantity ? normalized.quantity : null;
    attributes.unit = hasExplicitQuantity ? normalized.unit.trim() : null;
    if (attributes.size === null && hasExplicitQuantity && SIZES.includes(normalized.unit.toLocaleLowerCase('en-US'))) {
      attributes.size = normalized.unit.toLocaleLowerCase('en-US');
    }

    const partial = !hasExplicitQuantity || unparsedSpans.some((span) => !span.startsWith('temperature_deferred_to_step:'));
    const category = lookupCategory(attributes.name);
    const entity = {
      modelId: INGREDIENT_ENTITY_MODEL_ID,
      index,
      raw,
      attributes,
      category,
      parseStatus: partial ? 'partial' : 'parsed',
      unparsedSpans
    };
    if (groundedByIndex.has(index)) entity.groundingIndex = groundedByIndex.get(index).index;
    return entity;
  });
}

function isUnresolvedEntity(entity) {
  const categoryId = entity?.category?.id;
  return entity?.parseStatus !== 'parsed'
    || !categoryId
    || categoryId === 'unknown'
    || !INGREDIENT_ENTITY_CATEGORIES.includes(categoryId)
    || (categoryId === 'other' && !Array.isArray(entity.category.dietBlocks));
}

/** Derive all culinary styles that meet the fail-closed category rules. */
export function deriveDietaryStyles(entities) {
  if (!Array.isArray(entities) || entities.length === 0 || entities.some(isUnresolvedEntity)) {
    return ['undetermined'];
  }

  const categories = entities.map((entity) => entity.category.id);
  const dietaryBlocks = entities.flatMap((entity) => entity.category.dietBlocks || []);
  const styles = [];
  if (!categories.some((category) => VEGAN_BLOCKED_CATEGORIES.has(category)) && !dietaryBlocks.includes('vegan')) {
    styles.push('vegan');
  }
  if (!categories.some((category) => VEGETARIAN_BLOCKED_CATEGORIES.has(category)) && !dietaryBlocks.includes('vegetarian')) {
    styles.push('vegetarian');
  }
  if (!categories.some((category) => PESCATARIAN_BLOCKED_CATEGORIES.has(category)) && !dietaryBlocks.includes('pescatarian')) {
    styles.push('pescatarian');
  }
  if (categories.some((category) => ANIMAL_CATEGORIES.has(category)) && !dietaryBlocks.includes('non_vegetarian')) {
    styles.push('non_vegetarian');
  }
  return styles.length ? styles : ['undetermined'];
}

function requestedStyles(value) {
  const values = Array.isArray(value) ? value : value == null || value === '' ? [] : [value];
  return [...new Set(values
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim().toLocaleLowerCase('en-US').replace(/[ -]+/g, '_'))
    .filter(Boolean))];
}

function blockerReason(entity, style) {
  if (entity?.parseStatus === 'abstained') return 'unparsed';
  if (entity?.parseStatus !== 'parsed') return 'partial';
  if (!entity?.category || entity.category.id === 'unknown') return 'unknown_category';
  if (entity.category.id === 'other' && !Array.isArray(entity.category.dietBlocks)) return 'diet_category_unreviewed';
  if (entity.category.dietBlocks?.includes(style)) return `diet_block:${style}`;

  const blockedCategories = style === 'vegan'
    ? VEGAN_BLOCKED_CATEGORIES
    : style === 'vegetarian'
      ? VEGETARIAN_BLOCKED_CATEGORIES
      : style === 'pescatarian'
        ? PESCATARIAN_BLOCKED_CATEGORIES
        : null;
  return blockedCategories?.has(entity.category.id) ? `category_block:${style}` : null;
}

/** Compare a requested culinary style with derived ingredient evidence. */
export function compareRequestedDiet(entities, requestedDietary) {
  const derivedDietaryStyles = deriveDietaryStyles(entities);
  const requested = requestedStyles(requestedDietary);
  const supported = requested.filter((style) => DIETARY_STYLES.includes(style));
  const notEvaluated = requested.filter((style) => !DIETARY_STYLES.includes(style));

  if (requested.length === 0) {
    return {
      requestedDietary: requestedDietary ?? null,
      derivedDietaryStyles,
      status: 'not_requested',
      matches: null,
      blockingLines: [],
      notEvaluated: []
    };
  }
  if (supported.length === 0) {
    return {
      requestedDietary,
      derivedDietaryStyles,
      status: 'not_evaluated',
      matches: null,
      blockingLines: [],
      notEvaluated
    };
  }

  const matches = supported.every((style) => derivedDietaryStyles.includes(style));
  const blockers = new Map();
  if (!matches) {
    for (const style of supported) {
      if (derivedDietaryStyles.includes(style)) continue;
      for (const entity of Array.isArray(entities) ? entities : []) {
        const reason = blockerReason(entity, style);
        if (!reason) continue;
        const key = `${entity.index}:${reason}`;
        blockers.set(key, {
          index: entity.index,
          name: entity.attributes?.name || entity.raw || `ingredient_${entity.index + 1}`,
          reason
        });
      }
    }
  }

  return {
    requestedDietary,
    derivedDietaryStyles,
    status: matches ? 'verified' : 'not_verified',
    matches,
    blockingLines: [...blockers.values()],
    notEvaluated
  };
}

function normalizeHost(value) {
  const text = cleanText(value, 300);
  if (!text) return '';
  try {
    const url = new URL(text.includes('://') ? text : `https://${text}`);
    return url.hostname.toLocaleLowerCase('en-US').replace(/\.$/, '');
  } catch {
    return '';
  }
}

function safeGeoLabel(value) {
  const label = cleanText(value, 80);
  return label && !AUTHENTICITY_TERMS.test(label) ? label : null;
}

/**
 * Resolve descriptive geography only from explicit request/user data or a
 * reviewed host map supplied by the caller. No GeoIP or model inference occurs.
 */
export function resolveGeoCultural(input = {}, { hostMap = {} } = {}) {
  const context = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const cuisineString = cleanText(context.cuisineString || context.cuisine, 120) || null;
  const region = safeGeoLabel(context.region);
  const requestedCountry = safeGeoLabel(context.country);
  let source = ALLOWED_GEO_SOURCES.has(context.source) ? context.source : 'absent';
  if (source === 'absent' && (region || requestedCountry)) source = 'request_brief';

  let resolvedRegion = null;
  let country = null;
  let confidence = null;
  if (source === 'user_set' && (region || requestedCountry)) {
    resolvedRegion = region;
    country = requestedCountry;
    confidence = 1;
  } else if (source === 'request_brief' && (region || requestedCountry)) {
    resolvedRegion = region;
    country = requestedCountry;
    const suppliedConfidence = Number(context.confidence);
    confidence = Number.isFinite(suppliedConfidence)
      ? Math.max(0, Math.min(0.6, suppliedConfidence))
      : 0.6;
  } else if (source === 'clip_host_map') {
    const host = normalizeHost(context.host || context.url);
    const mappedCountry = requestedCountry || safeGeoLabel(hostMap?.[host]);
    if (mappedCountry) {
      country = mappedCountry;
      confidence = 0.4;
    }
  }

  if (confidence === null) source = 'absent';
  return {
    region: resolvedRegion,
    country,
    confidence,
    source,
    cuisineString
  };
}

/** Build the four response/persistence fields from a recipe without side effects. */
export function buildIngredientEntityMetadata(recipe, options = {}) {
  const sourceRecipe = recipe && typeof recipe === 'object' && !Array.isArray(recipe) ? recipe : {};
  const groundedIngredients = options.groundedIngredients
    ?? sourceRecipe.nutritionProvenance?.grounded_ingredients
    ?? [];
  const ingredientEntities = parseIngredientEntities(sourceRecipe.ingredients, { groundedIngredients });
  const derivedDietaryStyles = deriveDietaryStyles(ingredientEntities);
  const dietaryComparison = compareRequestedDiet(
    ingredientEntities,
    options.requestedDietary ?? sourceRecipe.requestedDietary ?? null
  );
  const geoInput = options.geoCultural
    ?? sourceRecipe.geoCultural
    ?? { source: 'absent', cuisineString: sourceRecipe.cuisine };
  const geoCultural = resolveGeoCultural(geoInput, { hostMap: options.hostMap });
  return { ingredientEntities, derivedDietaryStyles, dietaryComparison, geoCultural };
}

export function getIngredientEntityMode(envOrValue) {
  const value = envOrValue && typeof envOrValue === 'object'
    ? envOrValue.INGREDIENT_ENTITY_V1 ?? envOrValue[INGREDIENT_ENTITY_FLAG]
    : envOrValue;
  const normalized = String(value ?? '').trim().toLocaleLowerCase('en-US');
  if (normalized === 'shadow') return 'shadow';
  if (['1', 'true', 'on', 'enabled'].includes(normalized)) return 'on';
  return 'off';
}

function withoutIngredientEntityFields(recipe) {
  const fields = ['ingredientEntities', 'derivedDietaryStyles', 'dietaryComparison', 'geoCultural'];
  if (!fields.some((field) => Object.hasOwn(recipe, field))) return recipe;
  const {
    ingredientEntities,
    derivedDietaryStyles,
    dietaryComparison,
    geoCultural,
    ...rest
  } = recipe;
  return rest;
}

/** Apply flag semantics without logging; callers may emit only the returned counts. */
export function withIngredientEntityFeature(recipe, envOrValue, options = {}) {
  const mode = getIngredientEntityMode(envOrValue);
  const baseRecipe = recipe && typeof recipe === 'object' && !Array.isArray(recipe) ? recipe : {};
  if (mode === 'off') return { recipe: withoutIngredientEntityFields(baseRecipe), mode, telemetry: null };

  const metadata = buildIngredientEntityMetadata(baseRecipe, options);
  const parsedCount = metadata.ingredientEntities.filter((entity) => entity.parseStatus === 'parsed').length;
  const partialCount = metadata.ingredientEntities.filter((entity) => entity.parseStatus === 'partial').length;
  const total = metadata.ingredientEntities.length;
  const telemetry = {
    total,
    parsed: parsedCount,
    partial: partialCount,
    abstained: metadata.ingredientEntities.filter((entity) => entity.parseStatus === 'abstained').length,
    unknown_category: metadata.ingredientEntities.filter((entity) => entity.category.id === 'unknown').length,
    derived_style: metadata.derivedDietaryStyles.filter((style) => style !== 'undetermined').length,
    parse_rate: total ? (parsedCount + partialCount) / total : 0,
    undetermined_rate: metadata.derivedDietaryStyles.includes('undetermined') ? 1 : 0,
    requested_mismatch: metadata.dietaryComparison.status === 'not_verified'
  };
  return {
    recipe: mode === 'on'
      ? { ...withoutIngredientEntityFields(baseRecipe), ...metadata }
      : withoutIngredientEntityFields(baseRecipe),
    mode,
    telemetry
  };
}

/** Prefer parsed, explicit entity quantities for grounding; partial lines remain raw. */
export function prepareGroundingIngredients(ingredients, entities) {
  if (!Array.isArray(ingredients) || !Array.isArray(entities)) return ingredients;
  const byIndex = new Map(entities.map((entity) => [entity.index, entity]));
  return ingredients.map((ingredient, index) => {
    const attributes = byIndex.get(index)?.attributes;
    if (!attributes || attributes.quantity === null || !attributes.unit) return ingredient;
    const prepared = { name: attributes.name, quantity: attributes.quantity, unit: attributes.unit };
    if (typeof ingredient?.form === 'string') prepared.form = ingredient.form;
    if (typeof ingredient?.preparation === 'string') prepared.preparation = ingredient.preparation;
    return prepared;
  });
}
