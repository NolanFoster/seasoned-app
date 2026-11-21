import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the opik module to prevent real network calls during tests
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

// Mock shared/kv-storage so generate-handler can import
vi.mock('../../../shared/kv-storage.js', () => ({
  getRecipeFromKV: vi.fn().mockResolvedValue({
    success: true,
    recipe: {
      data: {
        name: 'Mock Recipe',
        description: 'A test recipe',
        ingredients: ['1 lb mock ingredient'],
        instructions: ['Mock instruction'],
        prepTime: '10 minutes',
        cookTime: '20 minutes',
        recipeYield: '4'
      }
    }
  })
}));

import { handleMealPlanFill, parseSlot } from '../../src/handlers/meal-plan-fill-handler.js';
import { mockEnv, createPostRequest } from '../setup.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

const mockAI = {
  run: vi.fn()
};

const mockVectors = {
  query: vi.fn()
};

const enhancedMockEnv = {
  ...mockEnv,
  AI: mockAI,
  RECIPE_VECTORS: mockVectors
};

beforeEach(() => {
  vi.clearAllMocks();

  mockAI.run.mockImplementation((model) => {
    if (model === '@cf/baai/bge-small-en-v1.5') {
      return Promise.resolve({ data: [[0.1, 0.2, 0.3, 0.4, 0.5]] });
    }
    return Promise.resolve({
      response: {
        name: 'Generated Dish',
        description: 'A tasty AI recipe',
        ingredients: ['2 cups flour', '1 tsp salt'],
        instructions: ['Mix ingredients', 'Cook until done'],
        prepTime: '15 minutes',
        cookTime: '20 minutes',
        totalTime: '35 minutes',
        servings: '4 servings',
        difficulty: 'Easy',
        cuisine: 'Italian',
        dietary: []
      }
    });
  });

  mockVectors.query.mockResolvedValue({ matches: [] });
});

// ── slot parsing ──────────────────────────────────────────────────────────

describe('parseSlot', () => {
  it('parses a valid slot', () => {
    expect(parseSlot('2026-08-17::dinner')).toEqual({ date: '2026-08-17', mealType: 'dinner' });
  });

  it('parses breakfast, lunch, snack', () => {
    expect(parseSlot('2026-08-17::breakfast')).toEqual({ date: '2026-08-17', mealType: 'breakfast' });
    expect(parseSlot('2026-08-17::lunch')).toEqual({ date: '2026-08-17', mealType: 'lunch' });
    expect(parseSlot('2026-08-17::snack')).toEqual({ date: '2026-08-17', mealType: 'snack' });
  });

  it('returns null for non-strings', () => {
    expect(parseSlot(null)).toBeNull();
    expect(parseSlot(undefined)).toBeNull();
    expect(parseSlot(123)).toBeNull();
  });

  it('returns null for malformed slots', () => {
    expect(parseSlot('2026-08-17:lunch')).toBeNull();
    expect(parseSlot('2026-08-17::')).toBeNull();
    expect(parseSlot('::dinner')).toBeNull();
    expect(parseSlot('not-a-date::dinner')).toBeNull();
    expect(parseSlot('2026-08-17::desert')).toBeNull();
    expect(parseSlot('2026-08-17::Dinner')).toBeNull();
  });

  it('rejects impossible calendar dates', () => {
    expect(parseSlot('2026-99-99::dinner')).toBeNull();
    expect(parseSlot('2026-02-30::dinner')).toBeNull();
  });
});

// ── input validation ──────────────────────────────────────────────────────

describe('handleMealPlanFill — input validation', () => {
  it('returns 400 for non-JSON body', async () => {
    const req = new Request('https://test.com/meal-plan-fill', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'not json'
    });
    const res = await handleMealPlanFill(req, enhancedMockEnv, corsHeaders);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.code).toBe('INVALID_JSON');
  });

  it('returns 400 for missing slots array', async () => {
    const req = createPostRequest('/meal-plan-fill', {});
    const res = await handleMealPlanFill(req, enhancedMockEnv, corsHeaders);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe('INVALID_INPUT');
  });

  it('returns 400 for empty slots array', async () => {
    const req = createPostRequest('/meal-plan-fill', { slots: [] });
    const res = await handleMealPlanFill(req, enhancedMockEnv, corsHeaders);
    expect(res.status).toBe(400);
  });

  it('returns 400 for more than 28 slots', async () => {
    const slots = Array.from({ length: 30 }, (_, i) => `2026-08-${(i % 28 + 1).toString().padStart(2, '0')}::dinner`);
    const req = createPostRequest('/meal-plan-fill', { slots });
    const res = await handleMealPlanFill(req, enhancedMockEnv, corsHeaders);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe('INVALID_INPUT');
  });

  it('validates slots and returns warnings for invalid and duplicate ones', async () => {
    const req = createPostRequest('/meal-plan-fill', {
      slots: ['2026-08-17::dinner', 'bad-slot', '2026-08-17::Dinner', '2026-08-17::dinner']
    });
    const res = await handleMealPlanFill(req, enhancedMockEnv, corsHeaders);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.warnings.some((w) => w.code === 'INVALID_SLOT')).toBe(true);
    expect(data.warnings.some((w) => w.code === 'DUPLICATE_SLOT')).toBe(true);
    // only one valid slot should have been filled
    expect(data.meals.length).toBe(1);
  });
});

// ── successful fill ───────────────────────────────────────────────────────

describe('handleMealPlanFill — successful fill', () => {
  it('rejects requests that span more than seven calendar days', async () => {
    const req = createPostRequest('/meal-plan-fill', {
      slots: ['2026-08-17::dinner', '2026-08-24::dinner'],
      generateImage: false
    });
    const res = await handleMealPlanFill(req, enhancedMockEnv, corsHeaders);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.code).toBe('INVALID_INPUT');
    expect(mockAI.run).not.toHaveBeenCalled();
  });

  it('rejects more than seven distinct plan dates even when slot count is small', async () => {
    const slots = Array.from({ length: 8 }, (_, index) =>
      `2026-08-${String(17 + index).padStart(2, '0')}::dinner`
    );
    const req = createPostRequest('/meal-plan-fill', { slots, generateImage: false });
    const res = await handleMealPlanFill(req, enhancedMockEnv, corsHeaders);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.code).toBe('INVALID_INPUT');
    expect(mockAI.run).not.toHaveBeenCalled();
  });

  it('fills a single slot and returns one meal', async () => {
    const req = createPostRequest('/meal-plan-fill', {
      slots: ['2026-08-17::dinner'],
      generateImage: false
    });
    const res = await handleMealPlanFill(req, enhancedMockEnv, corsHeaders);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.meals).toHaveLength(1);
    expect(data.meals[0].slot).toBe('2026-08-17::dinner');
    expect(data.meals[0].date).toBe('2026-08-17');
    expect(data.meals[0].mealType).toBe('dinner');
    expect(data.meals[0].recipe).toBeDefined();
    expect(data.meals[0].recipe.name).toBeTruthy();
    expect(data.filledCount).toBe(1);
  });

  it('deduplicates identical slots', async () => {
    const req = createPostRequest('/meal-plan-fill', {
      slots: ['2026-08-17::dinner', '2026-08-17::dinner', '2026-08-18::lunch'],
      generateImage: false
    });
    const res = await handleMealPlanFill(req, enhancedMockEnv, corsHeaders);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.meals.length).toBe(2);
  });

  it('fills multiple slots with different meal types', async () => {
    const req = createPostRequest('/meal-plan-fill', {
      slots: [
        '2026-08-17::breakfast',
        '2026-08-17::lunch',
        '2026-08-17::dinner',
        '2026-08-17::snack'
      ],
      generateImage: false
    });
    const res = await handleMealPlanFill(req, enhancedMockEnv, corsHeaders);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.meals.length).toBe(4);
    expect(data.meals.map((m) => m.mealType).sort()).toEqual(['breakfast', 'dinner', 'lunch', 'snack']);
  });

  it('never lets an empty override clear profile hard allergens', async () => {
    const req = createPostRequest('/meal-plan-fill', {
      slots: ['2026-08-17::dinner'],
      generateImage: false,
      culinaryProfile: { hard_allergens: ['peanuts'] },
      overrides: { hardAllergens: [] }
    });
    const res = await handleMealPlanFill(req, enhancedMockEnv, corsHeaders);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.meals[0].recipe.appliedConstraints.hardAllergens).toContain('peanuts');
  });

  it('propagates override constraints to the generate pipeline', async () => {
    const req = createPostRequest('/meal-plan-fill', {
      slots: ['2026-08-17::dinner'],
      generateImage: false,
      overrides: {
        dietary: ['vegetarian'],
        cuisine: 'Thai',
        servings: 2,
        maxCookTime: 30
      }
    });
    const res = await handleMealPlanFill(req, enhancedMockEnv, corsHeaders);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    // The generated recipe must carry the normalized constraints.
    const recipe = data.meals[0].recipe;
    expect(recipe.appliedConstraints).toBeDefined();
    expect(recipe.appliedConstraints.dietary).toContain('vegetarian');
    expect(recipe.appliedConstraints.servings).toBe(2);
    expect(recipe.appliedConstraints.maxCookTime).toBe(30);
  });
});

// ── edge cases ────────────────────────────────────────────────────────────

describe('handleMealPlanFill — edge cases', () => {
  it('returns CORS headers on responses', async () => {
    const req = createPostRequest('/meal-plan-fill', {
      slots: ['2026-08-17::dinner'],
      generateImage: false
    });
    const res = await handleMealPlanFill(req, enhancedMockEnv, corsHeaders);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('does not generate images by default (matching /generate)', async () => {
    const req = createPostRequest('/meal-plan-fill', {
      slots: ['2026-08-17::dinner']
      // generateImage omitted → defaults to false
    });
    const res = await handleMealPlanFill(req, enhancedMockEnv, corsHeaders);
    expect(res.status).toBe(200);
  });

  it('returns 502 when generation fails for every slot', async () => {
    mockAI.run.mockImplementation((model) => {
      if (model === '@cf/baai/bge-small-en-v1.5') {
        return Promise.resolve({ data: [[0.1, 0.2]] });
      }
      throw new Error('AI inference failed');
    });

    const req = createPostRequest('/meal-plan-fill', {
      slots: ['2026-08-17::dinner'],
      generateImage: false
    });
    const res = await handleMealPlanFill(req, enhancedMockEnv, corsHeaders);
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.code).toBe('FILL_FAILED');
    expect(data.warnings.length).toBeGreaterThan(0);
  });
});
