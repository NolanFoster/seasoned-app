import { SignJWT } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import app from '../../src/index';
import {
  MealPlanService,
  normalizeGroceryListInput,
  normalizeMealPlanInput,
  validateGroceryListInput,
  validateMealPlanInput,
} from '../../src/services/meal-plan';
import type { Bindings } from '../../src/types/env';

const SECRET = 'test-secret-that-is-long-enough-for-hs256';

async function tokenFor(userId: string) {
  return new SignJWT({ email: `${userId}@example.com` })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuer('auth-worker.nolanfoster.workers.dev')
    .setAudience('seasoned-app')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(SECRET));
}

function env(overrides: Partial<Bindings> = {}): Bindings {
  return {
    ENVIRONMENT: 'preview',
    JWT_SECRET: SECRET,
    MEAL_PLAN_SYNC_ENABLED: 'true',
    USER_DB: { prepare: vi.fn() } as never,
    ...overrides,
  };
}

async function parse(response: Response) {
  const raw = await response.json();
  return (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, unknown>;
}

function planRow(overrides: Record<string, unknown> = {}) {
  return {
    user_id: 'user-a',
    plan: JSON.stringify({ '2026-03-02': { breakfast: [], lunch: [], dinner: [{ id: 'r1', name: 'Miso Soup' }], snack: [] } }),
    up_next: JSON.stringify([{ id: 'r2', name: 'Ramen' }]),
    client_updated_at: 1000,
    created_at: '2026-03-01',
    updated_at: '2026-03-02',
    ...overrides,
  };
}

function groceryRow(overrides: Record<string, unknown> = {}) {
  return {
    user_id: 'user-a',
    items: JSON.stringify([{ id: 'g1', name: 'Miso paste' }]),
    last_generated_at: 900,
    client_updated_at: 1000,
    created_at: '2026-03-01',
    updated_at: '2026-03-02',
    ...overrides,
  };
}

/** Minimal D1 stub: one statement queue, in call order. */
function db(results: unknown[]) {
  const queue = [...results];
  const prepare = vi.fn().mockImplementation(() => ({
    bind: vi.fn().mockReturnValue({
      first: vi.fn().mockImplementation(async () => queue.shift() ?? null),
      all: vi.fn().mockImplementation(async () => ({ results: queue.shift() ?? [] })),
    }),
  }));
  return { prepare };
}

describe('meal plan validation', () => {
  it('accepts a plan keyed by date with the four meal slots', () => {
    expect(validateMealPlanInput({
      mealPlan: { '2026-03-02': { breakfast: [], lunch: [], dinner: [{ id: 'r1' }], snack: [] } },
      upNext: [{ id: 'r2' }],
      clientUpdatedAt: 12,
    })).toEqual([]);
  });

  it('rejects a payload that is not an object', () => {
    expect(validateMealPlanInput('plan')).toEqual(['Meal plan must be a JSON object']);
    expect(validateMealPlanInput(null)).toEqual(['Meal plan must be a JSON object']);
  });

  it('rejects keys that are not dates and slots that are not meal types', () => {
    expect(validateMealPlanInput({ mealPlan: { someday: {} } })).toEqual(['mealPlan keys must be YYYY-MM-DD dates']);
    expect(validateMealPlanInput({ mealPlan: { '2026-03-02': { brunch: [] } } })).toEqual([
      'unknown meal type "brunch"; allowed: breakfast, lunch, dinner, snack',
    ]);
  });

  it('rejects a day that is not an object of arrays', () => {
    expect(validateMealPlanInput({ mealPlan: { '2026-03-02': ['recipe'] } })).toEqual([
      'each mealPlan day must be an object of meal type arrays',
    ]);
    expect(validateMealPlanInput({ mealPlan: { '2026-03-02': { dinner: 'recipe' } } })).toEqual([
      'each meal type must be an array of at most 50 recipes',
    ]);
  });

  it('caps how much one account can store', () => {
    const manyDays: Record<string, unknown> = {};
    for (let index = 0; index < 401; index += 1) manyDays[`2026-03-${String(index).padStart(2, '0')}`] = { dinner: [] };
    expect(validateMealPlanInput({ mealPlan: manyDays })).toContain('mealPlan may hold at most 400 days');
    expect(validateMealPlanInput({ mealPlan: {}, upNext: new Array(201).fill({ id: 'r' }) }))
      .toEqual(['upNext may hold at most 200 recipes']);
    expect(validateMealPlanInput({
      mealPlan: { '2026-03-02': { dinner: [{ id: 'r', notes: 'x'.repeat(600_000) }] } },
    })).toEqual(['meal plan must serialize to at most 512000 characters']);
  });

  it('rejects a change timestamp that is not epoch milliseconds', () => {
    expect(validateMealPlanInput({ mealPlan: {}, clientUpdatedAt: 'yesterday' }))
      .toEqual(['clientUpdatedAt must be a non-negative epoch milliseconds value']);
  });

  it('fills in the meal slots a client left out and defaults the timestamp to now', () => {
    const normalized = normalizeMealPlanInput({ mealPlan: { '2026-03-02': { dinner: [{ id: 'r1' }] } } });
    expect(normalized.mealPlan['2026-03-02']).toEqual({ breakfast: [], lunch: [], dinner: [{ id: 'r1' }], snack: [] });
    expect(normalized.upNext).toEqual([]);
    expect(normalized.clientUpdatedAt).toBeGreaterThan(0);
  });

  it('accepts the snake_case aliases the worker uses elsewhere', () => {
    const normalized = normalizeMealPlanInput({ meal_plan: { '2026-03-02': { dinner: [] } }, up_next: [{ id: 'r' }], client_updated_at: 7 });
    expect(normalized.clientUpdatedAt).toBe(7);
    expect(normalized.upNext).toEqual([{ id: 'r' }]);
  });
});

describe('grocery list validation', () => {
  it('accepts a list of item objects', () => {
    expect(validateGroceryListInput({ items: [{ id: 'g1', name: 'Eggs' }], lastGeneratedAt: 12 })).toEqual([]);
  });

  it('rejects a non-array list and non-object items', () => {
    expect(validateGroceryListInput({ items: 'eggs' })).toEqual(['items must be an array']);
    expect(validateGroceryListInput({ items: ['eggs'] })).toEqual(['each grocery item must be an object']);
  });

  it('caps the number and size of items', () => {
    expect(validateGroceryListInput({ items: new Array(501).fill({ name: 'x' }) }))
      .toEqual(['items may hold at most 500 entries']);
    expect(validateGroceryListInput({ items: [{ name: 'x'.repeat(300_000) }] }))
      .toEqual(['grocery list must serialize to at most 256000 characters']);
  });

  it('keeps a null generation time as null rather than inventing one', () => {
    expect(normalizeGroceryListInput({ items: [] }).lastGeneratedAt).toBeNull();
    expect(normalizeGroceryListInput({ items: [], last_generated_at: 5 }).lastGeneratedAt).toBe(5);
  });
});

describe('MealPlanService', () => {
  it('reads a stored plan back as JSON scoped to the user', async () => {
    const database = db([planRow()]);
    const document = await new MealPlanService(database as never).getMealPlan('user-a');
    expect(document?.mealPlan['2026-03-02'].dinner).toEqual([{ id: 'r1', name: 'Miso Soup' }]);
    expect(document?.upNext).toEqual([{ id: 'r2', name: 'Ramen' }]);
    expect(database.prepare.mock.calls[0][0]).toContain('WHERE user_id = ?');
  });

  it('returns null when the account has never saved a plan', async () => {
    const document = await new MealPlanService(db([null]) as never).getMealPlan('user-a');
    expect(document).toBeNull();
  });

  it('treats an unreadable stored document as empty instead of failing the read', async () => {
    const document = await new MealPlanService(db([planRow({ plan: '{not json', up_next: 'oops' })]) as never).getMealPlan('user-a');
    expect(document).toMatchObject({ mealPlan: {}, upNext: [] });
  });

  it('refuses a save that is older than the stored one', async () => {
    const result = await new MealPlanService(db([planRow({ client_updated_at: 5000 })]) as never)
      .saveMealPlan('user-a', { mealPlan: {}, upNext: [], clientUpdatedAt: 1000 });
    expect(result).toMatchObject({ stale: true });
  });

  it('writes a save that is newer than the stored one', async () => {
    const database = db([planRow({ client_updated_at: 500 }), planRow({ client_updated_at: 5000 })]);
    const result = await new MealPlanService(database as never)
      .saveMealPlan('user-a', { mealPlan: { '2026-03-02': { dinner: [] } }, upNext: [], clientUpdatedAt: 5000 });
    expect(result).toMatchObject({ clientUpdatedAt: 5000 });
    expect(database.prepare.mock.calls[1][0]).toContain('ON CONFLICT(user_id) DO UPDATE');
  });

  it('stores the first grocery list for an account that has none', async () => {
    const database = db([null, groceryRow()]);
    const result = await new MealPlanService(database as never)
      .saveGroceryList('user-a', { items: [{ id: 'g1', name: 'Miso paste' }], lastGeneratedAt: 900, clientUpdatedAt: 1000 });
    expect(result).toMatchObject({ items: [{ id: 'g1', name: 'Miso paste' }], lastGeneratedAt: 900 });
  });

  it('refuses a grocery list save older than the stored one', async () => {
    const result = await new MealPlanService(db([groceryRow({ client_updated_at: 9000 })]) as never)
      .saveGroceryList('user-a', { items: [], clientUpdatedAt: 10 });
    expect(result).toMatchObject({ stale: true });
  });
});

describe('authenticated meal plan routes', () => {
  it('rejects an unauthenticated read before touching D1', async () => {
    const prepare = vi.fn();
    const response = await app.fetch(new Request('https://example.test/me/meal-plan'), env({ USER_DB: { prepare } as never }));
    expect(response.status).toBe(401);
    expect(prepare).not.toHaveBeenCalled();
  });

  it('hides the routes entirely when the kill switch is off', async () => {
    const prepare = vi.fn();
    const response = await app.fetch(new Request('https://example.test/me/meal-plan', {
      headers: { authorization: `Bearer ${await tokenFor('user-a')}` },
    }), env({ MEAL_PLAN_SYNC_ENABLED: 'false', USER_DB: { prepare } as never }));
    expect(response.status).toBe(404);
    expect(prepare).not.toHaveBeenCalled();
  });

  it('reports an unconfigured deployment separately from a rejected token', async () => {
    const response = await app.fetch(new Request('https://example.test/me/grocery-list', {
      headers: { authorization: `Bearer ${await tokenFor('user-a')}` },
    }), env({ JWT_SECRET: undefined }));
    expect(response.status).toBe(503);
  });

  it('returns an empty plan rather than 404 for an account that has never saved one', async () => {
    const response = await app.fetch(new Request('https://example.test/me/meal-plan', {
      headers: { authorization: `Bearer ${await tokenFor('user-a')}` },
    }), env({ USER_DB: db([null]) as never }));
    expect(response.status).toBe(200);
    expect(await parse(response)).toMatchObject({ success: true, exists: false, data: { mealPlan: {}, upNext: [] } });
  });

  it('reads the plan of the verified subject, ignoring a caller-supplied user id', async () => {
    const database = db([planRow()]);
    const response = await app.fetch(new Request('https://example.test/me/meal-plan?user_id=someone-else', {
      headers: { authorization: `Bearer ${await tokenFor('user-a')}` },
    }), env({ USER_DB: database as never }));
    expect(response.status).toBe(200);
    const body = await parse(response) as { data: { mealPlan: Record<string, Record<string, unknown[]>> } };
    expect(body.data.mealPlan['2026-03-02'].dinner).toEqual([{ id: 'r1', name: 'Miso Soup' }]);
  });

  it('saves a plan and accepts the wrapped payload shape', async () => {
    const database = db([null, planRow({ client_updated_at: 2000 })]);
    const response = await app.fetch(new Request('https://example.test/me/meal-plan', {
      method: 'PUT',
      headers: { authorization: `Bearer ${await tokenFor('user-a')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ plan: { mealPlan: { '2026-03-02': { dinner: [{ id: 'r1' }] } }, upNext: [], clientUpdatedAt: 2000 } }),
    }), env({ USER_DB: database as never }));
    expect(response.status).toBe(200);
    expect(await parse(response)).toMatchObject({ success: true });
  });

  it('rejects an invalid plan with the reasons, without writing', async () => {
    const database = db([]);
    const response = await app.fetch(new Request('https://example.test/me/meal-plan', {
      method: 'PUT',
      headers: { authorization: `Bearer ${await tokenFor('user-a')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ mealPlan: { someday: {} } }),
    }), env({ USER_DB: database as never }));
    expect(response.status).toBe(400);
    expect(await parse(response)).toMatchObject({ success: false, errors: ['mealPlan keys must be YYYY-MM-DD dates'] });
    expect(database.prepare).not.toHaveBeenCalled();
  });

  it('answers a stale save with 409 and the plan the server kept', async () => {
    const response = await app.fetch(new Request('https://example.test/me/meal-plan', {
      method: 'PUT',
      headers: { authorization: `Bearer ${await tokenFor('user-a')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ mealPlan: {}, upNext: [], clientUpdatedAt: 1 }),
    }), env({ USER_DB: db([planRow({ client_updated_at: 9000 })]) as never }));
    expect(response.status).toBe(409);
    const body = await parse(response) as { stale: boolean; data: { clientUpdatedAt: number } };
    expect(body.stale).toBe(true);
    expect(body.data.clientUpdatedAt).toBe(9000);
  });

  it('reads and writes the grocery list of the verified subject', async () => {
    const readResponse = await app.fetch(new Request('https://example.test/me/grocery-list', {
      headers: { authorization: `Bearer ${await tokenFor('user-a')}` },
    }), env({ USER_DB: db([groceryRow()]) as never }));
    expect(await parse(readResponse)).toMatchObject({ success: true, exists: true, data: { lastGeneratedAt: 900 } });

    const writeResponse = await app.fetch(new Request('https://example.test/me/grocery-list', {
      method: 'PUT',
      headers: { authorization: `Bearer ${await tokenFor('user-a')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ list: { items: [{ id: 'g1', name: 'Miso paste' }], lastGeneratedAt: 900, clientUpdatedAt: 1000 } }),
    }), env({ USER_DB: db([null, groceryRow()]) as never }));
    expect(writeResponse.status).toBe(200);
  });

  it('rejects a grocery list that is not a list of items', async () => {
    const response = await app.fetch(new Request('https://example.test/me/grocery-list', {
      method: 'PUT',
      headers: { authorization: `Bearer ${await tokenFor('user-a')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ items: 'eggs' }),
    }), env());
    expect(response.status).toBe(400);
    expect(await parse(response)).toMatchObject({ errors: ['items must be an array'] });
  });

  it('answers a database failure with a 500 rather than leaking the error', async () => {
    const prepare = vi.fn().mockImplementation(() => { throw new Error('D1 exploded'); });
    const response = await app.fetch(new Request('https://example.test/me/meal-plan', {
      headers: { authorization: `Bearer ${await tokenFor('user-a')}` },
    }), env({ USER_DB: { prepare } as never }));
    expect(response.status).toBe(500);
    expect(await parse(response)).toMatchObject({ success: false, message: 'Internal server error' });
  });
});
