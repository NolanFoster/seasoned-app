import { describe, it, expect, vi } from 'vitest';
import {
  PAIRINGS_MODEL,
  cacheKey,
  collectHardAllergens,
  handlePairings,
  parseModelSides
} from '../../src/handlers/pairings-handler.js';
import { createPostRequest } from '../setup.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

const heroRecipe = {
  id: 'recipe-ribeye',
  name: 'Grilled Ribeye Steak',
  ingredients: ['2 ribeye steaks', '1 tsp kosher salt', '1/2 tsp black pepper'],
  instructions: ['Season the steaks.', 'Grill over high heat to 130°F.']
};

const generatedSides = [
  {
    name: 'Blistered Shishito Peppers',
    type: 'side_veg',
    description: 'Smoky charred peppers with flaky salt and lime.',
    prepMinutes: 5,
    cookMinutes: 8,
    ingredients: ['8 oz shishito peppers', '1 tbsp neutral oil', '1/2 tsp flaky salt', '1/2 lime'],
    instructions: ['Heat a skillet over high heat.', 'Blister the peppers for 6 to 8 minutes.', 'Finish with salt and lime.']
  },
  {
    name: 'Crispy Smashed Potatoes',
    type: 'starch',
    description: 'Boiled baby potatoes smashed flat and roasted until crackling.',
    prepMinutes: 10,
    cookMinutes: 40,
    ingredients: ['1 1/2 lb baby potatoes', '3 tbsp olive oil', '1 tsp kosher salt', '2 sprigs thyme'],
    instructions: ['Boil the potatoes until tender, about 15 minutes.', 'Smash each potato flat.', 'Roast at 450°F for 25 minutes until crisp.']
  },
  {
    name: 'Chimichurri',
    type: 'sauce',
    description: 'A sharp parsley, oregano, and red wine vinegar sauce to cut the richness of the steak.',
    prepMinutes: 10,
    cookMinutes: 0,
    ingredients: ['1 cup parsley', '2 tbsp fresh oregano', '3 cloves garlic', '1/4 cup red wine vinegar', '1/2 cup olive oil'],
    instructions: ['Finely chop the herbs and garlic.', 'Stir in the vinegar and oil.', 'Rest for 15 minutes before serving.']
  }
];

function aiEnv(response, extra = {}) {
  return {
    ENVIRONMENT: 'test',
    AI: { run: vi.fn().mockResolvedValue({ response }) },
    ...extra
  };
}

function kvMock(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    get: vi.fn(async (key, type) => {
      const value = store.get(key);
      if (value === undefined) return null;
      return type === 'json' ? JSON.parse(value) : value;
    }),
    put: vi.fn(async (key, value) => {
      store.set(key, value);
    })
  };
}

async function callPairings(body, env) {
  const response = await handlePairings(createPostRequest('/pairings', body), env, corsHeaders);
  return { response, data: await response.json() };
}

describe('Pairings handler', () => {
  it('rejects a request without a usable hero recipe', async () => {
    const { response, data } = await callPairings({ heroRecipe: { name: 'Steak' } }, { ENVIRONMENT: 'test' });
    expect(response.status).toBe(400);
    expect(data.error).toMatch(/heroRecipe/);
  });

  it('rejects non-JSON content types', async () => {
    const request = new Request('https://test.com/pairings', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'steak'
    });
    const response = await handlePairings(request, { ENVIRONMENT: 'test' }, corsHeaders);
    expect(response.status).toBe(400);
  });

  it('rejects malformed JSON bodies', async () => {
    const request = new Request('https://test.com/pairings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not json'
    });
    const response = await handlePairings(request, { ENVIRONMENT: 'test' }, corsHeaders);
    expect(response.status).toBe(400);
  });

  it('serves curated pairings when the AI binding is unavailable', async () => {
    const { response, data } = await callPairings({ heroRecipe }, { ENVIRONMENT: 'test' });
    expect(response.status).toBe(200);
    expect(data.method).toBe('curated');
    expect(data.model).toBeNull();
    expect(data.sides.map((side) => side.type)).toEqual(['side_veg', 'starch', 'sauce']);
    expect(data.sides[0].name).toBe('Crispy Roasted Asparagus');
  });

  it('returns pairings generated for the specific dish', async () => {
    const env = aiEnv({ sides: generatedSides });
    const { response, data } = await callPairings({ heroRecipe }, env);

    expect(response.status).toBe(200);
    expect(data.method).toBe('llama-ai-pairings');
    expect(data.model).toBe(PAIRINGS_MODEL);
    expect(data.sides.map((side) => side.name)).toEqual([
      'Blistered Shishito Peppers',
      'Crispy Smashed Potatoes',
      'Chimichurri'
    ]);
    expect(data.sides.every((side) => side.generated)).toBe(true);

    const [model, options] = env.AI.run.mock.calls[0];
    expect(model).toBe(PAIRINGS_MODEL);
    expect(options.messages[1].content).toContain('Grilled Ribeye Steak');
    expect(options.response_format.type).toBe('json_schema');
  });

  it('accepts a JSON string response from the model', async () => {
    const { data } = await callPairings({ heroRecipe }, aiEnv(JSON.stringify({ sides: generatedSides })));
    expect(data.method).toBe('llama-ai-pairings');
    expect(data.sides).toHaveLength(3);
  });

  it('replaces a generated side that contains a hard allergen with the curated one', async () => {
    const withPeanutSauce = generatedSides.map((side) => side.type === 'sauce'
      ? { ...side, name: 'Peanut Sauce', ingredients: ['1/2 cup peanut butter', '2 tbsp lime juice', '1 tbsp honey'] }
      : side);
    const env = aiEnv({ sides: withPeanutSauce });
    const { data } = await callPairings({ heroRecipe, hardAllergens: ['peanuts'] }, env);

    expect(data.method).toBe('llama-ai-pairings');
    expect(env.AI.run.mock.calls[0][1].messages[1].content).toContain('peanuts');
    const sauce = data.sides.find((side) => side.type === 'sauce');
    expect(sauce.name).toBe('Creamy Peppercorn Pan Sauce');
    expect(sauce.generated).toBeUndefined();
  });

  it('honours hard allergens saved on the hero recipe and culinary profile', async () => {
    const { data } = await callPairings({
      heroRecipe: { ...heroRecipe, appliedConstraints: { hardAllergens: ['dairy'] } },
      culinaryProfile: { hard_allergens: ['eggs'] }
    }, { ENVIRONMENT: 'test' });

    expect(data.hardAllergens).toEqual(expect.arrayContaining(['milk', 'eggs']));
    expect(data.sides.map((side) => side.name)).toEqual(['Crispy Roasted Asparagus']);
  });

  it('drops incomplete generated sides and fills their slots', async () => {
    const incomplete = generatedSides.map((side) => side.type === 'starch'
      ? { ...side, ingredients: ['potatoes'], instructions: ['Cook.'] }
      : side);
    const { data } = await callPairings({ heroRecipe }, aiEnv({ sides: incomplete }));
    expect(data.sides.find((side) => side.type === 'starch').name).toBe('Garlic Mashed Potatoes');
  });

  it('drops a generated side the food-process gates block', async () => {
    const canned = generatedSides.map((side) => side.type === 'side_veg'
      ? {
        ...side,
        name: 'Pantry Green Beans',
        ingredients: ['3 lbs green beans, trimmed', '1 tbsp canning salt', '4 cups water'],
        instructions: ['Pack the beans into jars.', 'Can these for the pantry so they stay shelf-stable all winter.']
      }
      : side);
    const { data } = await callPairings({ heroRecipe }, aiEnv({ sides: canned }));
    expect(data.sides.find((side) => side.type === 'side_veg').name).toBe('Crispy Roasted Asparagus');
  });

  it('falls back to curated pairings when generation fails', async () => {
    const env = {
      ENVIRONMENT: 'test',
      AI: { run: vi.fn().mockRejectedValue(new Error('model overloaded')) }
    };
    const { response, data } = await callPairings({ heroRecipe }, env);
    expect(response.status).toBe(200);
    expect(data.method).toBe('curated');
    expect(data.fallbackReason).toBe('generation_failed');
    expect(data.sides).toHaveLength(3);
  });

  it('falls back when the model returns unusable output', async () => {
    const { data } = await callPairings({ heroRecipe }, aiEnv('not json'));
    expect(data.method).toBe('curated');
    const { data: empty } = await callPairings({ heroRecipe }, aiEnv({ sides: [] }));
    expect(empty.method).toBe('curated');
  });

  it('caches a full generated set and serves it without calling the model again', async () => {
    const kv = kvMock();
    const env = aiEnv({ sides: generatedSides }, { RECIPE_STORAGE: kv });

    const first = await callPairings({ heroRecipe }, env);
    expect(first.data.cached).toBe(false);
    expect(kv.put).toHaveBeenCalledTimes(1);
    expect(kv.put.mock.calls[0][2]).toEqual({ expirationTtl: 60 * 60 * 24 * 30 });

    const second = await callPairings({ heroRecipe }, env);
    expect(second.data.cached).toBe(true);
    expect(second.data.sides).toEqual(first.data.sides);
    expect(env.AI.run).toHaveBeenCalledTimes(1);
  });

  it('does not cache curated fallbacks', async () => {
    const kv = kvMock();
    await callPairings({ heroRecipe }, { ENVIRONMENT: 'test', RECIPE_STORAGE: kv });
    expect(kv.put).not.toHaveBeenCalled();
  });

  it('keeps serving when the cache is unavailable', async () => {
    const kv = {
      get: vi.fn().mockRejectedValue(new Error('kv down')),
      put: vi.fn().mockRejectedValue(new Error('kv down'))
    };
    const { response, data } = await callPairings({ heroRecipe }, aiEnv({ sides: generatedSides }, { RECIPE_STORAGE: kv }));
    expect(response.status).toBe(200);
    expect(data.method).toBe('llama-ai-pairings');
  });
});

describe('Pairings helpers', () => {
  it('keys the cache on the dish and allergens, not on unrelated fields', async () => {
    const hero = { name: 'Steak', ingredients: ['1 steak'] };
    const base = await cacheKey(hero, ['milk']);
    expect(await cacheKey({ ...hero, name: 'STEAK' }, ['milk'])).toBe(base);
    expect(await cacheKey(hero, ['eggs'])).not.toBe(base);
    expect(base).toMatch(/^pairings:v1:[0-9a-f]{64}$/);
  });

  it('collects and normalizes allergens from every source', () => {
    expect(collectHardAllergens(
      { hardAllergens: ['gluten'] },
      { appliedConstraints: { hard_allergens: ['dairy'] } }
    )).toEqual(expect.arrayContaining(['wheat', 'milk']));
  });

  it('parses the sides array from supported response shapes', () => {
    expect(parseModelSides([{ name: 'a' }])).toEqual([{ name: 'a' }]);
    expect(parseModelSides({ sides: [{ name: 'b' }] })).toEqual([{ name: 'b' }]);
    expect(() => parseModelSides({})).toThrow(/no pairings/);
  });
});
