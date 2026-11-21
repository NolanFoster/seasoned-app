import {
  COMPOSITION_GAP_FILL_FIELDS,
  COMPOSITION_GAP_FILL_METHOD,
  COMPOSITION_GAP_FILL_SOURCE,
  fillCompositionGap,
  getCompositionGapFillMode,
  isCompositionGapFillEnabled,
  normalizeCompositionGapFillCacheKey,
  reviewCompositionGapFill
} from '../composition-gap-fill.js';
import { groundRecipeNutrition } from '../nutrition-grounding.js';

function sampleValues(overrides = {}) {
  return {
    calories: 210,
    proteinContent: 10,
    carbohydrateContent: 20,
    fatContent: 10,
    saturatedFatContent: 2,
    sugarContent: 5,
    sodiumContent: 100,
    fiberContent: 3,
    ...overrides
  };
}

function deterministicSampler(values = sampleValues()) {
  return vi.fn(async (_name, _form, field, options) => {
    expect(options.temperature).toBeGreaterThan(0);
    return Array.from({ length: options.sampleCount }, (_, index) => values[field] + (index % 2));
  });
}

function providerFor(candidatesByName = {}) {
  return {
    resolveIngredient: vi.fn(async ({ name }) => candidatesByName[name] || [])
  };
}

describe('composition gap-fill flags and cache keys', () => {
  test('is disabled by default and supports an explicit shadow mode', () => {
    expect(getCompositionGapFillMode()).toBe('off');
    expect(getCompositionGapFillMode({})).toBe('off');
    expect(getCompositionGapFillMode({ COMPOSITION_GAP_FILL_V1: 'shadow' })).toBe('shadow');
    expect(getCompositionGapFillMode('enabled')).toBe('on');
    expect(isCompositionGapFillEnabled()).toBe(false);
    expect(isCompositionGapFillEnabled('true')).toBe(true);
    expect(getCompositionGapFillMode('unexpected')).toBe('off');
  });

  test('normalizes punctuation and leading quantity words', () => {
    expect(normalizeCompositionGapFillCacheKey('2 tbsp Berbere!!', 'Ground spice blend'))
      .toBe('berbere:ground spice blend');
    expect(normalizeCompositionGapFillCacheKey('half-and-half')).toBe('half and half');
  });
});

describe('fillCompositionGap', () => {
  test('uses independent field medians, reports MAD, and admits a balanced estimate', async () => {
    const sampleField = deterministicSampler();
    const result = await fillCompositionGap({
      name: 'berbere',
      form: 'ground spice blend',
      missReason: 'unmatched'
    }, { sampleField, now: () => new Date('2026-09-27T00:00:00Z') });

    expect(sampleField).toHaveBeenCalledTimes(COMPOSITION_GAP_FILL_FIELDS.length);
    expect(sampleField).toHaveBeenCalledWith('berbere', 'ground spice blend', 'calories', expect.objectContaining({ temperature: 0.7 }));
    expect(result).toMatchObject({
      modelId: 'composition-gap-fill-v1',
      status: 'admitted',
      foodName: 'berbere',
      form: 'ground spice blend',
      nutrientsPer100g: { calories: 210, proteinContent: 10, carbohydrateContent: 20, fatContent: 10 },
      dispersion: { sampleCount: 5, caloriesMad: 0 },
      invariants: { energy: 'passed', atwater: 'passed', semanticZeros: 'preserved' },
      provenance: {
        method: COMPOSITION_GAP_FILL_METHOD,
        source: COMPOSITION_GAP_FILL_SOURCE,
        evidenceUrls: [],
        reviewed: false,
        filledAt: '2026-09-27T00:00:00.000Z'
      },
      attempted: true,
      cacheHit: false
    });
    expect(result.dispersion.agreement).toBeGreaterThan(0.9);
  });

  test('abstains if any nutrient field has fewer than three numeric samples', async () => {
    const sampleField = vi.fn(async (_name, _form, field) => field === 'calories' ? [210, 'not a number', 211] : [10, 11]);
    const result = await fillCompositionGap({ name: 'berbere', missReason: 'unmatched' }, { sampleField });

    expect(result).toMatchObject({ status: 'abstained', reason: 'insufficient_samples', nutrientsPer100g: null });
    expect(result.dispersion).toBeNull();
  });

  test('rejects major energy violations and queues the median record without admitting numbers', async () => {
    const queueReview = vi.fn();
    const sampleField = deterministicSampler(sampleValues({ calories: 900, proteinContent: 0 }));
    const result = await fillCompositionGap({ name: 'olive oil', missReason: 'unmatched' }, {
      sampleField,
      reviewQueue: queueReview
    });

    expect(result).toMatchObject({ status: 'abstained', reason: 'energy_identity_major', nutrientsPer100g: null });
    expect(result.reviewRecord.candidateNutrientsPer100g).toMatchObject({ calories: 900, proteinContent: 0 });
    expect(queueReview).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.objectContaining({ name: 'olive oil', missReason: 'unmatched' }),
      reason: 'energy_identity_major',
      record: expect.objectContaining({ candidateNutrientsPer100g: expect.any(Object) })
    }));
  });

  test('abstains on semantic-zero and Atwater bound violations', async () => {
    const water = await fillCompositionGap({ name: 'water', missReason: 'unmatched' }, {
      sampleField: deterministicSampler(sampleValues({ calories: 40, carbohydrateContent: 10 }))
    });
    const impossible = await fillCompositionGap({ name: 'protein powder', missReason: 'unmatched' }, {
      sampleField: deterministicSampler(sampleValues({ proteinContent: 101, carbohydrateContent: 0, fatContent: 0, calories: 404 }))
    });
    const noWaterReconcile = await fillCompositionGap({ name: 'water', missReason: 'unmatched' }, {
      sampleField: deterministicSampler(sampleValues({ calories: 0.5, proteinContent: 0.1, carbohydrateContent: 0, fatContent: 0 }))
    });

    expect(water).toMatchObject({ status: 'abstained', reason: 'semantic_zero_violation', nutrientsPer100g: null });
    expect(impossible).toMatchObject({ status: 'abstained', reason: 'atwater_bounds', nutrientsPer100g: null });
    expect(noWaterReconcile).toMatchObject({ status: 'abstained', reason: 'semantic_zero_reconcile_forbidden', nutrientsPer100g: null });
  });

  test('reconciles minor energy drift by changing only calories', async () => {
    const result = await fillCompositionGap({ name: 'olive oil', missReason: 'low_confidence' }, {
      sampleField: deterministicSampler(sampleValues({ calories: 235 }))
    });

    expect(result.status).toBe('admitted');
    expect(result.nutrientsPer100g).toMatchObject({ calories: 210, proteinContent: 10, carbohydrateContent: 20, fatContent: 10 });
    expect(result.invariants.energy).toBe('reconciled_minor');
  });

  test('caches admitted and abstained results with different TTLs and never resamples a cache hit', async () => {
    const cache = new Map();
    const put = vi.fn(async (key, value, options) => cache.set(key, JSON.parse(value)));
    const kvCache = { get: async (key) => cache.get(key), put };
    const sampleField = deterministicSampler();
    const input = { name: 'berbere', form: 'ground spice blend', missReason: 'unmatched' };
    const first = await fillCompositionGap(input, { sampleField, cache: kvCache });
    const second = await fillCompositionGap(input, { sampleField, cache: kvCache });

    expect(first.status).toBe('admitted');
    expect(second).toMatchObject({ status: 'admitted', cacheHit: true, attempted: false });
    expect(sampleField).toHaveBeenCalledTimes(COMPOSITION_GAP_FILL_FIELDS.length);
    expect(put).toHaveBeenCalledWith(expect.stringMatching(/^composition-gap-fill:v1:/), expect.any(String), {
      expirationTtl: 90 * 24 * 60 * 60
    });
  });

  test('caches abstentions for seven days and returns the same safe abstention', async () => {
    const stored = new Map()
    const cache = {
      get: async (key) => stored.get(key) || null,
      put: async (key, value, options) => {
        stored.set(key, JSON.parse(value))
        expect(options.expirationTtl).toBe(7 * 24 * 60 * 60)
      }
    }
    const sampleField = deterministicSampler(sampleValues({ calories: 900, proteinContent: 0 }))
    const input = { name: 'impossible sauce', missReason: 'unmatched' }
    const first = await fillCompositionGap(input, { sampleField, cache })
    const second = await fillCompositionGap(input, { sampleField, cache })

    expect(first).toMatchObject({ status: 'abstained', reason: 'energy_identity_major', nutrientsPer100g: null })
    expect(second).toMatchObject({ status: 'abstained', reason: 'energy_identity_major', cacheHit: true, attempted: false })
    expect(sampleField).toHaveBeenCalledTimes(COMPOSITION_GAP_FILL_FIELDS.length)
  })

  test('does not call the sampler for ambiguous or unsupported misses', async () => {
    const sampleField = vi.fn();
    const ambiguous = await fillCompositionGap({ name: 'some butter', missReason: 'ambiguous_quantity' }, { sampleField });
    const unsupported = await fillCompositionGap({ name: 'butter', missReason: 'invalid_ingredient_quantity' }, { sampleField });

    expect(ambiguous.reason).toBe('ambiguous_quantity');
    expect(unsupported.reason).toBe('not_fillable_miss');
    expect(sampleField).not.toHaveBeenCalled();
  });

  test('reviewed edits are admitted only after invariant checks and retain at most two HTTPS evidence URLs', () => {
    const candidate = {
      foodName: 'berbere',
      form: 'ground spice blend',
      dispersion: { sampleCount: 5 }
    };
    const admitted = reviewCompositionGapFill(candidate, sampleValues(), [
      'https://example.test/source-a',
      'http://example.test/nope',
      'https://example.test/source-b',
      'https://example.test/source-c'
    ], { now: () => new Date('2026-09-27T00:00:00Z') });
    const rejected = reviewCompositionGapFill(candidate, sampleValues({ calories: 900 }), []);

    expect(admitted).toMatchObject({
      status: 'admitted',
      provenance: { reviewed: true, evidenceUrls: ['https://example.test/source-a', 'https://example.test/source-b'] }
    });
    expect(rejected).toMatchObject({ status: 'abstained', reason: 'energy_identity_major', nutrientsPer100g: null });
  });
});

describe('composition gap-fill integration with authoritative grounding', () => {
  const appleCandidate = {
    foodCode: '9001',
    foodName: 'Apple, raw',
    confidence: 0.95,
    source: 'USDA FoodData Central',
    dbVersion: 'test',
    nutrientsPer100g: { calories: 52, proteinContent: 0.26, carbohydrateContent: 13.81, fatContent: 0.17 }
  };

  test('keeps authoritative hits byte-equivalent and never samples a database hit', async () => {
    const ingredients = [{ name: 'apple', quantity: 100, unit: 'g' }];
    const baseline = await groundRecipeNutrition(ingredients, { provider: providerFor({ apple: [appleCandidate] }) });
    const sampleField = vi.fn();
    const result = await groundRecipeNutrition(ingredients, {
      provider: providerFor({ apple: [appleCandidate] }),
      compositionGapFillFlag: 'on',
      compositionGapFill: { mode: 'on', sampleField }
    });

    expect(result).toEqual(baseline);
    expect(result.nutritionProvenance.coverage_pct).toBe(100);
    expect(result.nutritionProvenance).not.toHaveProperty('filled_ingredients');
    expect(sampleField).not.toHaveBeenCalled();
  });

  test('adds model estimates separately and leaves authoritative coverage unchanged', async () => {
    const provider = providerFor({ apple: [appleCandidate], berbere: [] });
    const sampleField = deterministicSampler();
    const result = await groundRecipeNutrition([
      { name: 'apple', quantity: 100, unit: 'g' },
      { name: 'berbere', quantity: 100, unit: 'g', form: 'ground spice blend' }
    ], {
      provider,
      servings: 2,
      compositionGapFillFlag: 'on',
      compositionGapFill: { mode: 'on', sampleField, cache: new Map() }
    });

    expect(result.success).toBe(true);
    expect(result.nutrition.calories).toBe('131');
    expect(result.nutritionProvenance).toMatchObject({
      coverage_pct: 50,
      display_coverage_pct: 100,
      estimated: true,
      filled_count: 1,
      abstained_count: 0,
      fill_method: COMPOSITION_GAP_FILL_METHOD
    });
    expect(result.nutritionProvenance.grounded_ingredients).toHaveLength(1);
    expect(result.nutritionProvenance.filled_ingredients).toHaveLength(1);
    expect(result.nutritionProvenance.filled_ingredients[0]).toMatchObject({
      name: 'berbere',
      source: COMPOSITION_GAP_FILL_SOURCE,
      dispersion: { sampleCount: 5 }
    });
    expect(result.nutritionProvenance.uncertain_ingredients).toEqual([]);
  });

  test('shadow mode evaluates misses without changing the client result', async () => {
    const provider = providerFor({});
    const baseline = await groundRecipeNutrition([{ name: 'unknown spice', quantity: 1, unit: 'g' }], { provider });
    const sampleField = deterministicSampler();
    const shadow = await groundRecipeNutrition([{ name: 'unknown spice', quantity: 1, unit: 'g' }], {
      provider,
      compositionGapFillFlag: 'shadow',
      compositionGapFill: { mode: 'shadow', sampleField, cache: new Map() }
    });

    expect(sampleField).toHaveBeenCalledTimes(COMPOSITION_GAP_FILL_FIELDS.length);
    expect(shadow).toEqual(baseline);
  });

  test('does not sample ambiguous quantities and enforces the eight-ingredient attempt cap', async () => {
    const provider = providerFor({});
    const sampleField = deterministicSampler();
    const ingredients = [
      'pepper to taste',
      ...Array.from({ length: 9 }, (_, index) => ({ name: `spice ${index}`, quantity: 1, unit: 'g' }))
    ];
    const result = await groundRecipeNutrition(ingredients, {
      provider,
      compositionGapFillFlag: 'on',
      compositionGapFill: { mode: 'on', sampleField, cache: new Map() }
    });

    expect(sampleField).toHaveBeenCalledTimes(8 * COMPOSITION_GAP_FILL_FIELDS.length);
    expect(result.nutritionProvenance.filled_count).toBe(8);
    expect(result.nutritionProvenance.uncertain_ingredients).toHaveLength(2);
    expect(result.nutritionProvenance.uncertain_ingredients[0].reason).toBe('ambiguous_quantity');
  });
});
