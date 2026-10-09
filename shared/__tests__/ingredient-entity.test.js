import categoryRows from '../fixtures/ingredient-categories.json' assert { type: 'json' };
import { isRecipeSafe } from '../allergen-graph.js';
import {
  buildIngredientEntityMetadata,
  compareRequestedDiet,
  deriveDietaryStyles,
  getIngredientEntityMode,
  INGREDIENT_ENTITY_CATEGORIES,
  normalizeIngredientName,
  parseIngredientEntities,
  prepareGroundingIngredients,
  resolveGeoCultural,
  withIngredientEntityFeature
} from '../ingredient-entity.js';
import { normalizeGroundingIngredient } from '../nutrition-grounding.js';

function parseOne(line) {
  return parseIngredientEntities([line])[0];
}

describe('computable ingredient entities', () => {
  it('parses the seven attributes deterministically and preserves the raw line', () => {
    const entity = parseOne('2 cups fresh diced Roma tomatoes');

    expect(entity).toMatchObject({
      modelId: 'ingredient-entity-v1',
      index: 0,
      raw: '2 cups fresh diced Roma tomatoes',
      attributes: {
        name: 'roma tomatoes',
        state: 'diced',
        quantity: 2,
        unit: 'cups',
        size: null,
        temperature: null,
        dryFresh: 'fresh'
      },
      category: { id: 'vegetable', source: 'lexicon', reviewed: true },
      parseStatus: 'parsed',
      unparsedSpans: []
    });
  });

  it('recognizes closed-list boundary tokens but not substrings in ingredient names', () => {
    expect(parseOne('3 large eggs').attributes).toMatchObject({ name: 'eggs', size: 'large', quantity: 3, unit: 'large' });
    expect(parseOne('1 cup chilled butter').attributes).toMatchObject({ name: 'butter', temperature: 'chilled' });
    expect(parseOne('1 tbsp dry pasta').attributes).toMatchObject({ name: 'pasta', dryFresh: 'dry' });
    expect(parseOne('1 cup whole-grain flour').attributes).toMatchObject({ name: 'whole grain flour', state: null });
    expect(parseOne('2 eggs, peeled, chopped')).toMatchObject({
      attributes: { name: 'eggs', state: 'chopped' },
      parseStatus: 'partial',
      unparsedSpans: ['peeled']
    });
  });

  it('abstains from unsupported measurements and never promotes estimated quantities', () => {
    const estimated = parseOne('salt to taste');
    const dash = parseOne('1 dash of something');

    expect(estimated).toMatchObject({
      attributes: { name: 'salt', quantity: null, unit: null },
      category: { id: 'seasoning' },
      parseStatus: 'partial',
      unparsedSpans: ['to taste']
    });
    expect(dash).toMatchObject({
      attributes: { name: 'something', quantity: null, unit: null },
      category: { id: 'unknown' },
      parseStatus: 'partial'
    });
    expect(parseOne('to taste')).toMatchObject({
      parseStatus: 'abstained',
      reason: 'no_name',
      attributes: null
    });
    expect(parseOne({}).parseStatus).toBe('abstained');
  });

  it('defers degree expressions to cooking steps instead of ingredient temperature', () => {
    expect(parseOne('1 cup flour at 350°F')).toMatchObject({
      attributes: { name: 'flour', quantity: 1, unit: 'cup', temperature: null },
      category: { id: 'grain' },
      parseStatus: 'parsed',
      unparsedSpans: ['temperature_deferred_to_step: 350°F']
    });
    expect(parseOne('350°F flour')).toMatchObject({
      attributes: { name: 'flour', quantity: null, unit: null, temperature: null },
      parseStatus: 'partial',
      unparsedSpans: ['temperature_deferred_to_step: 350°F']
    });
  });

  it('uses exact normalized-name category lookup and a closed category vocabulary', () => {
    expect(normalizeIngredientName('  Roma-tomatoes! ')).toBe('roma tomatoes');
    expect(INGREDIENT_ENTITY_CATEGORIES).toContain('unknown');
    expect(categoryRows.every((row) => row.reviewed === true)).toBe(true);
    expect(categoryRows.every((row) => INGREDIENT_ENTITY_CATEGORIES.includes(row.category))).toBe(true);
    expect(parseOne('1 cup roma tomatoes').category.id).toBe('vegetable');
    expect(parseOne('1 cup romas tomatoes').category).toEqual({
      id: 'unknown', source: 'miss', reviewed: false
    });
  });

  it('derives culinary styles conservatively from every categorized line', () => {
    const plantBased = parseIngredientEntities(['1 cup rice', '1 tbsp olive oil', '1 tsp salt']);
    const dairy = parseIngredientEntities(['1 cup rice', '1 tbsp butter']);
    const animal = parseIngredientEntities(['1 lb beef', '1 tsp salt']);
    const seafood = parseIngredientEntities(['1 lb salmon', '1 tsp salt']);
    const fishSauce = parseIngredientEntities(['1 cup rice', '1 tbsp fish sauce']);
    const honey = parseIngredientEntities(['1 cup rice', '1 tsp honey']);

    expect(deriveDietaryStyles(plantBased)).toEqual(['vegan', 'vegetarian', 'pescatarian']);
    expect(deriveDietaryStyles(dairy)).toEqual(['vegetarian', 'pescatarian']);
    expect(deriveDietaryStyles(animal)).toEqual(['non_vegetarian']);
    expect(deriveDietaryStyles(seafood)).toEqual(['pescatarian', 'non_vegetarian']);
    expect(deriveDietaryStyles(fishSauce)).toEqual(['pescatarian']);
    expect(deriveDietaryStyles(honey)).toEqual(['vegetarian', 'pescatarian']);
    expect(deriveDietaryStyles([...plantBased, parseOne('1 dash of something')])).toEqual(['undetermined']);
    expect(deriveDietaryStyles([])).toEqual(['undetermined']);
  });

  it('fails closed for an other category without explicit dietary review', () => {
    expect(deriveDietaryStyles([{
      parseStatus: 'parsed',
      category: { id: 'other', source: 'lexicon', reviewed: true }
    }])).toEqual(['undetermined']);
  });

  it('compares requested diet separately and explains blocking ingredient lines', () => {
    const entities = parseIngredientEntities(['1 cup rice', '1 tbsp fish sauce']);
    const comparison = compareRequestedDiet(entities, ['vegan']);

    expect(comparison).toMatchObject({
      requestedDietary: ['vegan'],
      derivedDietaryStyles: ['pescatarian'],
      status: 'not_verified',
      matches: false,
      blockingLines: [{ index: 1, name: 'fish sauce', reason: 'diet_block:vegan' }]
    });
    expect(compareRequestedDiet(entities, null).status).toBe('not_requested');
    expect(compareRequestedDiet(entities, ['gluten_free']).status).toBe('not_evaluated');
    expect(deriveDietaryStyles(entities)).not.toContain('vegan');
  });

  it('resolves provenance only from explicit context or a supplied host map with capped confidence', () => {
    expect(resolveGeoCultural({
      source: 'user_set', region: 'South Asia', country: 'India', confidence: 0.2, cuisineString: 'Tamil dinner'
    })).toEqual({
      region: 'South Asia', country: 'India', confidence: 1, source: 'user_set', cuisineString: 'Tamil dinner'
    });
    expect(resolveGeoCultural({
      source: 'request_brief', region: 'South Asia', country: 'India', confidence: 0.95
    })).toMatchObject({ region: 'South Asia', country: 'India', confidence: 0.6, source: 'request_brief' });
    expect(resolveGeoCultural({
      source: 'clip_host_map', host: 'recipes.example', cuisineString: 'Japanese'
    }, { hostMap: { 'recipes.example': 'Japan' } })).toEqual({
      region: null, country: 'Japan', confidence: 0.4, source: 'clip_host_map', cuisineString: 'Japanese'
    });
    expect(resolveGeoCultural({ source: 'clip_host_map', host: 'unmapped.example' })).toMatchObject({
      region: null, country: null, confidence: null, source: 'absent'
    });
    expect(resolveGeoCultural({ source: 'request_brief', country: 'Authentic Thailand', cuisineString: 'Authentic Thai' })).toMatchObject({
      country: null, source: 'absent', cuisineString: 'Authentic Thai'
    });
  });

  it('keeps the rollout flag off by default and hides shadow annotations while counting only', () => {
    const recipe = {
      ingredients: ['1 cup rice', '1 tbsp fish sauce'],
      cuisine: 'Tamil dinner',
      dietary: ['vegan'],
      ingredientEntities: ['stale']
    };

    expect(getIngredientEntityMode()).toBe('off');
    expect(getIngredientEntityMode({ INGREDIENT_ENTITY_V1: 'shadow' })).toBe('shadow');
    expect(getIngredientEntityMode({ ingredient_entity_v1: 'on' })).toBe('on');
    expect(getIngredientEntityMode('true')).toBe('on');
    expect(getIngredientEntityMode('anything-else')).toBe('off');

    const off = withIngredientEntityFeature(recipe, 'off');
    expect(off.recipe).not.toHaveProperty('ingredientEntities');
    expect(off.telemetry).toBeNull();

    const shadow = withIngredientEntityFeature(recipe, 'shadow', { requestedDietary: ['vegan'] });
    expect(shadow.recipe).not.toHaveProperty('ingredientEntities');
    expect(shadow.telemetry).toMatchObject({
      total: 2, parsed: 2, parse_rate: 1, undetermined_rate: 0, requested_mismatch: true
    });
    expect(JSON.stringify(shadow.telemetry)).not.toContain('fish sauce');

    const enabled = withIngredientEntityFeature(recipe, 'on', { requestedDietary: ['vegan'] });
    expect(enabled.recipe).toHaveProperty('ingredientEntities');
    expect(enabled.recipe.derivedDietaryStyles).toEqual(['pescatarian']);
    expect(enabled.recipe.dietaryComparison.status).toBe('not_verified');
    expect(enabled.recipe.geoCultural).toMatchObject({ source: 'absent', cuisineString: 'Tamil dinner' });
  });

  it('links existing grounding hits and reuses entity quantities without changing ambiguous inputs', () => {
    const lines = [
      { name: 'Roma tomatoes', quantity: 2, unit: 'cups', form: 'fresh diced' },
      'salt to taste'
    ];
    const entities = parseIngredientEntities(lines, { groundedIngredients: [{ index: 0, foodCode: 'fdc-1' }] });
    const groundingInputs = prepareGroundingIngredients(lines, entities);

    expect(entities[0].groundingIndex).toBe(0);
    expect(groundingInputs[0]).toEqual({
      name: 'roma tomatoes', quantity: 2, unit: 'cups', form: 'fresh diced'
    });
    expect(groundingInputs[1]).toBe('salt to taste');
    expect(normalizeGroundingIngredient(groundingInputs[1])).toMatchObject({
      quantityEstimated: true, valid: true
    });
  });

  it('does not let category classification bypass the allergen graph', () => {
    const peanutButter = parseOne('1 tbsp peanut butter');
    expect(peanutButter.category.id).toBe('legume');
    expect(isRecipeSafe({ ingredients: ['1 tbsp peanut butter'] }, ['peanuts'])).toBe(false);
  });

  it('builds a complete metadata bundle without copying requested tags into derived styles', () => {
    const metadata = buildIngredientEntityMetadata({
      ingredients: ['1 cup rice'],
      requestedDietary: ['vegan'],
      cuisine: 'Tamil dinner'
    });
    expect(metadata).toMatchObject({
      derivedDietaryStyles: ['vegan', 'vegetarian', 'pescatarian'],
      dietaryComparison: { requestedDietary: ['vegan'], status: 'verified' },
      geoCultural: { source: 'absent', cuisineString: 'Tamil dinner' }
    });
  });
});
