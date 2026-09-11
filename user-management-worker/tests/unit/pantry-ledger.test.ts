import { SignJWT } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import app from '../../src/index';
import type { PantryItem } from '../../src/types/database';
import {
  PantryLedgerConflictError,
  PantryLedgerService,
  validatePantryLedgerEventInput,
} from '../../src/services/pantry-ledger';

const pantryRow = {
  id: 7,
  user_id: 'user-a',
  name: 'Milk',
  quantity: 2,
  unit: 'l',
  location: 'fridge',
  expires_on: null,
  tags: '[]',
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};

function fakeDb({ currentRow = pantryRow, existingEvent = null as Record<string, unknown> | null } = {}) {
  const statements: string[] = [];
  const prepare = vi.fn((sql: string) => {
    statements.push(sql);
    const bind = vi.fn().mockReturnValue({
      first: vi.fn().mockImplementation(async () => {
        if (sql.includes('pantry_ledger_events')) return existingEvent;
        if (sql.includes('pantry_items')) return currentRow;
        return null;
      }),
      all: vi.fn().mockResolvedValue({ results: sql.includes('pantry_items') ? [currentRow] : [] }),
    });
    return { bind } as never;
  });
  const batch = vi.fn().mockResolvedValue([{}, {
    results: [{
      id: 3,
      user_id: 'user-a',
      type: 'debit_cook',
      recipe_id: 'recipe-1',
      cook_session_id: 'cook-1',
      lines: JSON.stringify([{
        pantryItemId: 7,
        nameNorm: 'milk',
        qty: 1,
        unit: 'l',
        confidence: 1,
        action: 'update',
        remainingQuantity: 1,
        expectedQuantity: 2,
      }]),
      source: 'navigator',
      created_at: '2026-01-02',
    }],
  }]);
  return { db: { prepare, batch } as never, prepare, batch, statements };
}

describe('pantry ledger validation', () => {
  it('requires bounded, unique, user-owned line references', () => {
    expect(validatePantryLedgerEventInput({
      type: 'debit_cook',
      lines: [
        { pantryItemId: 7, nameNorm: 'milk', action: 'update', qty: 1, remainingQuantity: 1 },
        { pantryItemId: 7, nameNorm: 'milk', action: 'remove', qty: 1 },
      ],
    })).toContain('lines[1].pantryItemId must be unique');
  });

  it('rejects an update without a remaining quantity', () => {
    expect(validatePantryLedgerEventInput({
      type: 'debit_cook',
      lines: [{ pantryItemId: 7, nameNorm: 'milk', action: 'update', qty: 1 }],
    })).toContain('lines[0].remainingQuantity is required for update operations');
  });
});

async function routeTokenFor(userId: string) {
  return new SignJWT({ email: `${userId}@example.com` })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuer('auth-worker.nolanfoster.workers.dev')
    .setAudience('seasoned-app')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode('test-secret-that-is-long-enough-for-hs256'));
}

describe('pantry ledger routes', () => {
  it('keeps proposal and confirmation scoped to the verified user', async () => {
    const { db } = fakeDb();
    const response = await app.fetch(new Request('https://example.test/me/pantry-ledger/propose', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${await routeTokenFor('user-a')}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        type: 'debit_cook',
        recipeId: 'recipe-1',
        cookSessionId: 'route-cook',
        lines: [{ pantryItemId: 7, nameNorm: 'milk', qty: 1, action: 'remove' }],
      }),
    }), {
      ENVIRONMENT: 'preview',
      JWT_SECRET: 'test-secret-that-is-long-enough-for-hs256',
      PANTRY_ENABLED: 'true',
      USER_DB: db,
    });
    expect(response.status).toBe(200);
    const rawBody = await response.json();
    const body = (typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody) as { success: boolean; data: { items: PantryItem[] } };
    expect(body.success).toBe(true);
    expect(body.data.items[0]).toMatchObject({ user_id: 'user-a' });
  });
});

describe('PantryLedgerService', () => {
  it('appends a cook event and batches the materialized quantity update', async () => {
    const { db, batch } = fakeDb();
    const result = await new PantryLedgerService(db).confirm('user-a', {
      type: 'debit_cook',
      recipeId: 'recipe-1',
      cookSessionId: 'cook-1',
      source: 'navigator',
      lines: [{
        pantryItemId: 7,
        nameNorm: 'milk',
        qty: 1,
        unit: 'liter',
        action: 'update',
        expectedQuantity: 2,
        remainingQuantity: 1,
      }],
    });

    expect(result.event).toMatchObject({ id: 3, type: 'debit_cook', cook_session_id: 'cook-1' });
    expect(result.items).toHaveLength(1);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0][0]).toHaveLength(2);
  });

  it('returns a read-only proposal for current pantry ownership', async () => {
    const { db } = fakeDb()
    const result = await new PantryLedgerService(db).propose('user-a', {
      type: 'debit_cook',
      recipeId: 'recipe-1',
      cookSessionId: 'cook-proposal',
      lines: [{ pantryItemId: 7, nameNorm: 'milk', qty: 1, action: 'remove' }],
    })
    expect(result.proposal.type).toBe('debit_cook')
    expect(result.items[0]).toMatchObject({ id: 7, name: 'Milk' })
  })

  it('records removal operations even when D1 does not return an insert row', async () => {
    const { db, batch } = fakeDb()
    batch.mockResolvedValue([{}, {}])
    const result = await new PantryLedgerService(db).confirm('user-a', {
      type: 'debit_waste',
      source: 'pantry',
      lines: [{ pantryItemId: 7, nameNorm: 'milk', qty: null, action: 'remove' }],
    })
    expect(result.event.id).toBe(0)
    expect(batch.mock.calls[0][0]).toHaveLength(2)
  })

  it('lists private audit events with bounded pagination', async () => {
    const eventRow = {
      id: 9,
      user_id: 'user-a',
      type: 'debit_waste',
      recipe_id: null,
      cook_session_id: null,
      lines: '[]',
      source: 'pantry',
      created_at: '2026-01-04',
    }
    const all = vi.fn().mockResolvedValue({ results: [eventRow] })
    const prepare = vi.fn().mockReturnValue({ bind: vi.fn().mockReturnValue({ all }) })
    const events = await new PantryLedgerService({ prepare } as never).listEvents('user-a', 999)
    expect(events).toEqual([expect.objectContaining({ id: 9, type: 'debit_waste' })])
    expect(all).toHaveBeenCalled()
  })

  it('rejects an unmeasured or incompatible update rather than inventing stock', async () => {
    const { db } = fakeDb({ currentRow: { ...pantryRow, quantity: null, unit: null } })
    await expect(new PantryLedgerService(db).confirm('user-a', {
      type: 'debit_cook',
      lines: [{ pantryItemId: 7, nameNorm: 'milk', qty: 1, action: 'update', remainingQuantity: 1 }],
    })).rejects.toThrow(/no measured quantity/)

    const incompatible = fakeDb({ currentRow: pantryRow })
    await expect(new PantryLedgerService(incompatible.db).confirm('user-a', {
      type: 'debit_cook',
      lines: [{ pantryItemId: 7, nameNorm: 'milk', qty: 1, unit: 'cup', action: 'update', expectedQuantity: 2, remainingQuantity: 1 }],
    })).rejects.toThrow(/unit changed/)
  })

  it('fails closed when the pantry changed after proposal', async () => {
    const { db } = fakeDb({ currentRow: { ...pantryRow, quantity: 3 } });
    await expect(new PantryLedgerService(db).confirm('user-a', {
      type: 'debit_cook',
      cookSessionId: 'cook-1',
      lines: [{ pantryItemId: 7, nameNorm: 'milk', qty: 1, action: 'update', expectedQuantity: 2, remainingQuantity: 1 }],
    })).rejects.toBeInstanceOf(PantryLedgerConflictError);
  });

  it('is idempotent for a retried cook session', async () => {
    const { db, batch } = fakeDb({ existingEvent: {
      id: 8,
      user_id: 'user-a',
      type: 'debit_cook',
      recipe_id: 'recipe-1',
      cook_session_id: 'cook-1',
      lines: '[]',
      source: 'navigator',
      created_at: '2026-01-03',
    } });
    const result = await new PantryLedgerService(db).confirm('user-a', {
      type: 'debit_cook',
      cookSessionId: 'cook-1',
      lines: [{ pantryItemId: 7, nameNorm: 'milk', qty: 1, action: 'remove' }],
    });
    expect(result.alreadyApplied).toBe(true);
    expect(result.event.id).toBe(8);
    expect(batch).not.toHaveBeenCalled();
  });
});
