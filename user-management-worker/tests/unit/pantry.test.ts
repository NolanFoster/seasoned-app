import { SignJWT } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import app from '../../src/index';
import { PantryService, normalizePantryItemInput, validatePantryItemInput } from '../../src/services/pantry';
import { detectPantryItems, parsePantryScanResponse, validatePantryPhoto } from '../../src/services/pantry-scan';
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
    PANTRY_ENABLED: 'true',
    USER_DB: { prepare: vi.fn() } as never,
    ...overrides,
  };
}

describe('pantry validation and normalization', () => {
  it('normalizes tags, location, and optional values', () => {
    expect(normalizePantryItemInput({ name: '  Chickpeas  ', quantity: '2', unit: ' cans ', tags: ['Staple', 'staple'] })).toEqual({
      name: 'Chickpeas', quantity: 2, unit: 'cans', location: 'pantry', expires_on: null, tags: ['staple'],
    });
  });

  it('rejects invalid names, locations, quantities, and dates', () => {
    expect(validatePantryItemInput({ name: '', location: 'counter', quantity: -1, expiresOn: 'tomorrow' })).toEqual([
      'name must be a non-empty string of at most 200 characters',
      'quantity must be a non-negative number',
      'location must be one of fridge, freezer, pantry, other',
      'expires_on must be a valid date in YYYY-MM-DD format',
    ]);
  });

  it('allows partial updates without silently requiring a name', () => {
    expect(validatePantryItemInput({ location: 'freezer' }, { partial: true })).toEqual([]);
    expect(validatePantryItemInput({}, { partial: true })).toEqual([]);
  });
});

describe('PantryService', () => {
  it('lists normalized rows for only the requested user', async () => {
    const prepare = vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({ results: [{
          id: 3, user_id: 'user-a', name: 'Tomatoes', quantity: 2, unit: 'cans', location: 'pantry',
          expires_on: null, tags: '["staple"]', created_at: '2026-01-01', updated_at: '2026-01-01',
        }] }),
      }),
    });
    const items = await new PantryService({ prepare } as never).listItems('user-a');
    expect(items[0]).toMatchObject({ id: 3, user_id: 'user-a', tags: ['staple'] });
    expect(prepare.mock.calls[0][0]).toContain('WHERE user_id = ?');
    expect(prepare.mock.results[0].value.bind).toHaveBeenCalledWith('user-a');
  });

  it('updates using both the authenticated user and item id', async () => {
    const bind = vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue({
      id: 4, user_id: 'user-a', name: 'Rice', quantity: 1, unit: 'bag', location: 'freezer',
      expires_on: null, tags: '[]', created_at: '2026-01-01', updated_at: '2026-01-02',
    }) });
    const prepare = vi.fn().mockReturnValue({ bind });
    const item = await new PantryService({ prepare } as never).updateItem('user-a', 4, { location: 'freezer' });
    expect(item?.location).toBe('freezer');
    expect(bind).toHaveBeenCalledWith('freezer', 'user-a', 4);
    expect(prepare.mock.calls[0][0]).toContain('WHERE user_id = ? AND id = ?');
  });
});

describe('authenticated pantry routes', () => {
  it('rejects missing authentication before touching D1', async () => {
    const prepare = vi.fn();
    const response = await app.fetch(new Request('https://example.test/me/pantry-items'), env({ USER_DB: { prepare } as never }));
    expect(response.status).toBe(401);
    expect(prepare).not.toHaveBeenCalled();
  });

  it('reports an unconfigured deployment separately from a rejected token', async () => {
    const prepare = vi.fn();
    const response = await app.fetch(new Request('https://example.test/me/pantry-items', {
      headers: { authorization: `Bearer ${await tokenFor('user-a')}` },
    }), env({ JWT_SECRET: undefined, USER_DB: { prepare } as never }));
    const rawBody = await response.json();
    const body = (typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody) as { success: boolean; message: string };
    expect(response.status).toBe(503);
    expect(body.message).toBe('Authentication is not configured on this deployment');
    expect(prepare).not.toHaveBeenCalled();
  });

  it('returns the authenticated user pantry rows and not a caller-supplied id', async () => {
    const all = vi.fn().mockResolvedValue({ results: [] });
    const bind = vi.fn().mockReturnValue({ all });
    const prepare = vi.fn().mockReturnValue({ bind });
    const response = await app.fetch(new Request('https://example.test/me/pantry-items?user_id=other', {
      headers: { authorization: `Bearer ${await tokenFor('user-a')}` },
    }), env({ USER_DB: { prepare } as never }));
    const rawBody = await response.json();
    const body = (typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody) as { success: boolean; data: unknown[] };
    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, data: [] });
    expect(bind).toHaveBeenCalledWith('user-a');
  });

  it('validates and creates an item under the verified subject', async () => {
    const bind = vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue({
      id: 8, user_id: 'user-a', name: 'Oats', quantity: 1, unit: 'bag', location: 'pantry',
      expires_on: '2026-12-01', tags: '["breakfast"]', created_at: '2026-01-01', updated_at: '2026-01-01',
    }) });
    const prepare = vi.fn().mockReturnValue({ bind });
    const response = await app.fetch(new Request('https://example.test/me/pantry-items', {
      method: 'POST',
      headers: { authorization: `Bearer ${await tokenFor('user-a')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Oats', quantity: 1, unit: 'bag', expiresOn: '2026-12-01', tags: ['breakfast'] }),
    }), env({ USER_DB: { prepare } as never }));
    expect(response.status).toBe(201);
    const rawBody = await response.json();
    const body = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
    expect(body).toMatchObject({ success: true, data: { user_id: 'user-a', name: 'Oats', tags: ['breakfast'] } });
    expect(bind).toHaveBeenCalledWith('user-a', 'Oats', 1, 'bag', 'pantry', '2026-12-01', '["breakfast"]');
  });
});


describe('pantry photo scanning', () => {
  it('validates supported image types and the 10 MB limit', () => {
    expect(validatePantryPhoto({ size: 0, type: 'image/jpeg', arrayBuffer: vi.fn() })).toEqual(['The pantry photo is empty']);
    expect(validatePantryPhoto({ size: 1, type: 'image/gif', arrayBuffer: vi.fn() })).toEqual(['Use a JPG, PNG, or WebP pantry photo']);
    expect(validatePantryPhoto({ size: 10 * 1024 * 1024 + 1, type: 'image/jpeg', arrayBuffer: vi.fn() })).toEqual(['Pantry photos must be 10 MB or smaller']);
    expect(validatePantryPhoto({ size: 4, type: 'image/jpeg', arrayBuffer: vi.fn() })).toEqual([]);
  });

  it('parses, normalizes, and deduplicates model candidates', () => {
    expect(parsePantryScanResponse('```json\n{"items":[{"name":"  Spinach ","quantity":"2","unit":"bags","location":"fridge","confidence":85},{"name":"spinach","location":"fridge","confidence":0.4},{"name":"unknown"}]}\n```')).toEqual([
      expect.objectContaining({ name: 'Spinach', quantity: 2, unit: 'bags', location: 'fridge', confidence: 0.85, needsReview: true }),
      expect.objectContaining({ name: 'unknown', location: 'other', confidence: 0.5 }),
    ]);
  });

  it('sends image bytes to Workers AI and returns only reviewable candidates', async () => {
    const run = vi.fn().mockResolvedValue({ description: '{"items":[{"name":"Tomatoes","quantity":3,"unit":"cans"}]}' });
    const file = { size: 3, type: 'image/png', arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer };
    const items = await detectPantryItems(file, { run });
    expect(run).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ image: [1, 2, 3] }));
    expect(items[0]).toMatchObject({ name: 'Tomatoes', quantity: 3, needsReview: true });
  });

  it('requires authentication before parsing a scan upload', async () => {
    const response = await app.fetch(new Request('https://example.test/me/pantry-scan', {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/form-data' },
    }), env({ AI: { run: vi.fn() } }));
    expect(response.status).toBe(401);
  });

  it('rejects non-multipart and oversized uploads before parsing the body', async () => {
    const token = await tokenFor('user-a');
    const ai = { run: vi.fn() };
    const invalidType = await app.fetch(new Request('https://example.test/me/pantry-scan', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    }), env({ AI: ai }));
    expect(invalidType.status).toBe(400);

    const oversized = await app.fetch(new Request('https://example.test/me/pantry-scan', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'multipart/form-data; boundary=test',
        'content-length': String(10 * 1024 * 1024 + 64 * 1024 + 1),
      },
    }), env({ AI: ai }));
    expect(oversized.status).toBe(413);
    expect(ai.run).not.toHaveBeenCalled();
  });

  it('can be disabled independently from the manual pantry API', async () => {
    const token = await tokenFor('user-a');
    const response = await app.fetch(new Request('https://example.test/me/pantry-scan', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'multipart/form-data' },
    }), env({ AI: { run: vi.fn() }, PANTRY_SCAN_ENABLED: 'false' }));
    expect(response.status).toBe(404);
  });

  it('returns a clear setup error when Workers AI is not bound', async () => {
    const token = await tokenFor('user-a');
    const response = await app.fetch(new Request('https://example.test/me/pantry-scan', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
    }), env());
    expect(response.status).toBe(503);
  });
});
