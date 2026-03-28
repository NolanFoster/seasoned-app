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

  it('returns 500 when LLM returns unparseable output', async () => {
    const mockAI = { run: vi.fn().mockResolvedValue({ response: 'not json' }) };
    const env = { ...mockEnvWithOpik, AI: mockAI };
    const request = createPostRequest('/grocery-list', { ingredients: ['a'] });
    const res = await handleGroceryList(request, env, corsHeaders);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.code).toBe('PARSE_ERROR');
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
});
