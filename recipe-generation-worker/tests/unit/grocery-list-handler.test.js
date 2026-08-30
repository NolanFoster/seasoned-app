import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('opik', () => ({
  Opik: vi.fn().mockImplementation(() => ({
    flush: vi.fn().mockResolvedValue(undefined),
    trace: vi.fn().mockReturnValue({
      id: 'mock-trace-id',
      span: vi.fn().mockReturnValue({ id: 'mock-span-id', end: vi.fn(), error: vi.fn() }),
      end: vi.fn(),
      error: vi.fn()
    }),
    span: vi.fn().mockReturnValue({ id: 'mock-span-id', end: vi.fn(), error: vi.fn() })
  }))
}));

import { handleGroceryList } from '../../src/handlers/grocery-list-handler.js';
import { mockEnvWithOpik, createPostRequest } from '../setup.js';

describe('Grocery List Handler', () => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  const validLlmJson = '[{"category":"Produce","items":[{"name":"lime","quantity":"1","isStaple":false}]}]';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('classifies grocery items against pantry quantities on the server', async () => {
    const mockAI = {
      run: vi.fn().mockResolvedValue({
        response: JSON.stringify([{
          category: 'Produce',
          items: [
            { name: 'green onion', quantity: '2', unit: 'piece', isStaple: false },
            { name: 'lemons', quantity: '3', unit: 'piece', isStaple: false }
          ]
        }])
      })
    };
    const env = { ...mockEnvWithOpik, AI: mockAI };
    const request = createPostRequest('/grocery-list', {
      ingredients: ['2 green onions', '3 lemons'],
      pantryItems: [
        { id: 'pantry-1', name: 'scallions', quantity: 2, unit: 'piece' },
        { id: 'pantry-2', name: 'lemon', quantity: 1, unit: 'piece' }
      ]
    });
    const res = await handleGroceryList(request, env, corsHeaders);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.pantryMatched).toBe(true);
    expect(data.categories[0].items[0]).toEqual(expect.objectContaining({
      name: 'green onion',
      inventoryStatus: 'owned',
      pantryItemIds: ['pantry-1']
    }));
    expect(data.categories[0].items[1]).toEqual(expect.objectContaining({
      name: 'lemons',
      inventoryStatus: 'buy',
      pantryQuantity: '1 piece',
      missingQuantity: '2 piece',
      quantity: '2 piece'
    }));
  });

  it('does not add pantry metadata when the optional pantry field is omitted', async () => {
    const mockAI = { run: vi.fn().mockResolvedValue({ response: validLlmJson }) };
    const env = { ...mockEnvWithOpik, AI: mockAI };
    const request = createPostRequest('/grocery-list', { ingredients: ['1 lime'] });
    const res = await handleGroceryList(request, env, corsHeaders);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.pantryMatched).toBeUndefined();
    expect(data.categories[0].items[0].inventoryStatus).toBeUndefined();
  });

  it('returns categorized list when LLM returns valid JSON', async () => {
    const mockAI = {
      run: vi.fn().mockResolvedValue({ response: validLlmJson })
    };
    const env = { ...mockEnvWithOpik, AI: mockAI };
    const request = createPostRequest('/grocery-list', { ingredients: ['1 lime'] });
    const res = await handleGroceryList(request, env, corsHeaders);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.categories).toHaveLength(1);
    expect(data.categories[0].items[0].name).toBe('lime');
    expect(mockAI.run).toHaveBeenCalled();
  });

  it('returns 502 when LLM throws', async () => {
    const mockAI = { run: vi.fn().mockRejectedValue(new Error('boom')) };
    const env = { ...mockEnvWithOpik, AI: mockAI };
    const request = createPostRequest('/grocery-list', { ingredients: ['a'] });
    const res = await handleGroceryList(request, env, corsHeaders);
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.code).toBe('LLM_ERROR');
  });

  it('returns 500 when LLM returns unparseable output twice', async () => {
    const mockAI = { run: vi.fn().mockResolvedValue({ response: 'not json' }) };
    const env = { ...mockEnvWithOpik, AI: mockAI };
    const request = createPostRequest('/grocery-list', { ingredients: ['a'] });
    const res = await handleGroceryList(request, env, corsHeaders);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.code).toBe('PARSE_ERROR');
    expect(mockAI.run).toHaveBeenCalledTimes(2);
  });

  // ── Regression: malformed-but-recoverable LLM output used to 500 ───────────

  const recoverable = {
    'prose after the array containing a bracket':
      `${validLlmJson}\n\nNote: quantities are approximate [see recipes].`,
    'prose before the array containing a bracket':
      `Here is the list [organized by aisle]:\n${validLlmJson}`,
    'markdown fences with a preamble':
      `Here is your grocery list:\n\`\`\`json\n${validLlmJson}\n\`\`\``,
    'trailing comma before a closing bracket':
      '[{"category":"Produce","items":[{"name":"lime","quantity":"1","isStaple":false},]}]',
    'python-style boolean literal':
      '[{"category":"Produce","items":[{"name":"lime","quantity":"1","isStaple":False}]}]',
    'the array emitted twice':
      `${validLlmJson}\n${validLlmJson}`
  };

  for (const [label, response] of Object.entries(recoverable)) {
    it(`recovers from ${label} without a retry`, async () => {
      const mockAI = { run: vi.fn().mockResolvedValue({ response }) };
      const env = { ...mockEnvWithOpik, AI: mockAI };
      const request = createPostRequest('/grocery-list', { ingredients: ['1 lime'] });
      const res = await handleGroceryList(request, env, corsHeaders);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.categories).toHaveLength(1);
      expect(data.categories[0].items[0].name).toBe('lime');
      expect(mockAI.run).toHaveBeenCalledTimes(1);
    });
  }

  it('finds the category array when the model wraps it in an unknown key', async () => {
    const wrapped = `{"grocery_list": ${validLlmJson}}`;
    const mockAI = { run: vi.fn().mockResolvedValue({ response: wrapped }) };
    const env = { ...mockEnvWithOpik, AI: mockAI };
    const request = createPostRequest('/grocery-list', { ingredients: ['1 lime'] });
    const res = await handleGroceryList(request, env, corsHeaders);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.categories[0].items[0].name).toBe('lime');
    expect(mockAI.run).toHaveBeenCalledTimes(1);
  });

  it('salvages the complete prefix when output is truncated at max_tokens', async () => {
    const items = Array.from(
      { length: 5 },
      (_, i) => `{"name":"item${i}","quantity":"1","isStaple":false}`
    ).join(',');
    const truncated = `[{"category":"Produce","items":[${items},{"name":"half-writ`;
    const mockAI = { run: vi.fn().mockResolvedValue({ response: truncated }) };
    const env = { ...mockEnvWithOpik, AI: mockAI };
    const request = createPostRequest('/grocery-list', { ingredients: ['a'] });
    const res = await handleGroceryList(request, env, corsHeaders);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.categories[0].items).toHaveLength(5);
    expect(mockAI.run).toHaveBeenCalledTimes(1);
  });

  it('retries once and succeeds when the first response is unrecoverable', async () => {
    const mockAI = {
      run: vi
        .fn()
        .mockResolvedValueOnce({ response: '[{"category":"Produce","items":[{"name":"1/2" onion"}]}]' })
        .mockResolvedValueOnce({ response: validLlmJson })
    };
    const env = { ...mockEnvWithOpik, AI: mockAI };
    const request = createPostRequest('/grocery-list', { ingredients: ['1 lime'] });
    const res = await handleGroceryList(request, env, corsHeaders);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.categories[0].items[0].name).toBe('lime');
    expect(mockAI.run).toHaveBeenCalledTimes(2);
    // The retry appends a strictness reminder to the base prompt.
    expect(mockAI.run.mock.calls[1][1].messages[0].content).toContain('CRITICAL');
    expect(mockAI.run.mock.calls[1][1].temperature).toBe(0);
  });

  it('retries once when the LLM returns an empty completion', async () => {
    const mockAI = {
      run: vi
        .fn()
        .mockResolvedValueOnce({ response: '' })
        .mockResolvedValueOnce({ response: validLlmJson })
    };
    const env = { ...mockEnvWithOpik, AI: mockAI };
    const request = createPostRequest('/grocery-list', { ingredients: ['1 lime'] });
    const res = await handleGroceryList(request, env, corsHeaders);
    expect(res.status).toBe(200);
    expect(mockAI.run).toHaveBeenCalledTimes(2);
  });

  it('succeeds without OPIK_API_KEY (tracing skipped)', async () => {
    const mockAI = { run: vi.fn().mockResolvedValue({ response: validLlmJson }) };
    const env = { ENVIRONMENT: 'test', AI: mockAI };
    const request = createPostRequest('/grocery-list', { ingredients: ['1 lime'] });
    const res = await handleGroceryList(request, env, corsHeaders);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it('accepts parsed object LLM response', async () => {
    const parsed = [{ category: 'Produce', items: [{ name: 'lime', quantity: '1', isStaple: false }] }];
    const mockAI = { run: vi.fn().mockResolvedValue({ response: parsed }) };
    const env = { ...mockEnvWithOpik, AI: mockAI };
    const request = createPostRequest('/grocery-list', { ingredients: ['1 lime'] });
    const res = await handleGroceryList(request, env, corsHeaders);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.categories).toHaveLength(1);
  });

  it('merges duplicate category labels into one block with combined items', async () => {
    const dupJson = JSON.stringify([
      { category: 'Produce', items: [{ name: 'lime', quantity: '1', isStaple: false }] },
      { category: 'Produce', items: [{ name: 'cilantro', quantity: '1 bunch', isStaple: false }] }
    ]);
    const mockAI = { run: vi.fn().mockResolvedValue({ response: dupJson }) };
    const env = { ...mockEnvWithOpik, AI: mockAI };
    const request = createPostRequest('/grocery-list', { ingredients: ['1 lime', '1 bunch cilantro'] });
    const res = await handleGroceryList(request, env, corsHeaders);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.categories).toHaveLength(1);
    expect(data.categories[0].category).toBe('Produce');
    const names = data.categories[0].items.map((i) => i.name).sort();
    expect(names).toEqual(['cilantro', 'lime']);
  });

  it('merges duplicate categories that differ only by letter case', async () => {
    const dupJson = JSON.stringify([
      { category: 'produce', items: [{ name: 'lime', quantity: '1', isStaple: false }] },
      { category: 'Produce', items: [{ name: 'cilantro', quantity: '1', isStaple: false }] }
    ]);
    const mockAI = { run: vi.fn().mockResolvedValue({ response: dupJson }) };
    const env = { ...mockEnvWithOpik, AI: mockAI };
    const request = createPostRequest('/grocery-list', { ingredients: ['a', 'b'] });
    const res = await handleGroceryList(request, env, corsHeaders);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.categories).toHaveLength(1);
    expect(data.categories[0].items).toHaveLength(2);
  });

  it('merges an item the model repeated within a category, summing amounts', async () => {
    const dupJson = JSON.stringify([{
      category: 'Dairy',
      items: [
        { name: 'unsalted butter', quantity: '3 tablespoons', isStaple: false },
        { name: 'unsalted butter', quantity: '4 tablespoons', isStaple: false }
      ]
    }]);
    const mockAI = { run: vi.fn().mockResolvedValue({ response: dupJson }) };
    const env = { ...mockEnvWithOpik, AI: mockAI };
    const request = createPostRequest('/grocery-list', {
      ingredients: ['3 tablespoons unsalted butter', '4 tablespoons unsalted butter']
    });
    const res = await handleGroceryList(request, env, corsHeaders);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.categories).toHaveLength(1);
    expect(data.categories[0].items).toEqual([
      expect.objectContaining({ name: 'unsalted butter', quantity: '7 tbsp' })
    ]);
  });

  it('drops lines the model mirrored into a second category instead of summing them', async () => {
    // The 3B aggregator repeats a whole block under a second aisle, which
    // reached shoppers as the same butter listed four times.
    const mirroredJson = JSON.stringify([
      {
        category: 'Dairy',
        items: [
          { name: 'unsalted butter', quantity: '3 tablespoons', isStaple: false },
          { name: 'Parmesan cheese', quantity: '2 tablespoons', isStaple: false }
        ]
      },
      {
        category: 'Pantry Staples',
        items: [
          { name: 'Parmesan cheese', quantity: '2 tablespoons', isStaple: true },
          { name: 'unsalted butter', quantity: '3 tbsp', isStaple: true }
        ]
      }
    ]);
    const mockAI = { run: vi.fn().mockResolvedValue({ response: mirroredJson }) };
    const env = { ...mockEnvWithOpik, AI: mockAI };
    const request = createPostRequest('/grocery-list', {
      ingredients: ['3 tablespoons unsalted butter', '2 tablespoons Parmesan cheese']
    });
    const res = await handleGroceryList(request, env, corsHeaders);
    const data = await res.json();

    expect(res.status).toBe(200);
    // Every line came from Dairy first, so Pantry Staples empties out entirely.
    expect(data.categories).toHaveLength(1);
    expect(data.categories[0].category).toBe('Dairy');
    expect(data.categories[0].items.map((i) => [i.name, i.quantity])).toEqual([
      ['unsalted butter', '3 tablespoons'],
      ['Parmesan cheese', '2 tablespoons']
    ]);
  });

  it('drops items the model added that no ingredient line mentions', async () => {
    // The aggregator prompt has to describe foods to explain aisles, and a 3B
    // model re-emits those examples as real lines. "taco seasoning" is the one
    // users reported; nothing downstream can tell it from a genuine item.
    const withHallucination = JSON.stringify([
      {
        category: 'Produce',
        items: [{ name: 'lime', quantity: '1', isStaple: false }]
      },
      {
        category: 'Pantry Staples',
        items: [
          { name: 'taco seasoning', quantity: '1 packet', isStaple: true },
          { name: 'mayonnaise', quantity: '1 cup', isStaple: true }
        ]
      }
    ]);
    const mockAI = { run: vi.fn().mockResolvedValue({ response: withHallucination }) };
    const env = { ...mockEnvWithOpik, AI: mockAI };
    const request = createPostRequest('/grocery-list', { ingredients: ['1 lime', '2 limes'] });
    const res = await handleGroceryList(request, env, corsHeaders);
    const data = await res.json();

    expect(res.status).toBe(200);
    // The Pantry Staples block held only invented items, so it disappears too.
    expect(data.categories).toHaveLength(1);
    expect(data.categories[0].category).toBe('Produce');
    expect(data.categories[0].items.map((i) => i.name)).toEqual(['lime']);
  });

  it('keeps normalized names that do not literally match their ingredient line', async () => {
    const normalizedJson = JSON.stringify([{
      category: 'Pantry Staples',
      items: [
        { name: 'flour', quantity: '1 cup', isStaple: true },
        { name: 'chicken breast', quantity: '1 lb', isStaple: false },
        { name: 'diced tomatoes', quantity: '2 cans', isStaple: false },
        { name: 'taco seasoning', quantity: '1 packet', isStaple: true }
      ]
    }]);
    const mockAI = { run: vi.fn().mockResolvedValue({ response: normalizedJson }) };
    const env = { ...mockEnvWithOpik, AI: mockAI };
    const request = createPostRequest('/grocery-list', {
      ingredients: [
        '1 cup all-purpose flour',
        '1 lb chicken breast, diced',
        '2 (14 oz) cans diced tomatoes'
      ]
    });
    const res = await handleGroceryList(request, env, corsHeaders);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.categories[0].items.map((i) => i.name)).toEqual([
      'flour',
      'chicken breast',
      'diced tomatoes'
    ]);
  });

  it('keeps the unfiltered list when no item matches any ingredient line', async () => {
    // Nothing matching implicates the matcher rather than the model, and an
    // empty grocery list is a worse answer than an over-full one.
    const mockAI = { run: vi.fn().mockResolvedValue({ response: validLlmJson }) };
    const env = { ...mockEnvWithOpik, AI: mockAI };
    const request = createPostRequest('/grocery-list', { ingredients: ['3 ripe plantains'] });
    const res = await handleGroceryList(request, env, corsHeaders);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.categories[0].items.map((i) => i.name)).toEqual(['lime']);
  });
});
