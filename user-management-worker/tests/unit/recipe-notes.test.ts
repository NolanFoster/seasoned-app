import { SignJWT } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import app from '../../src/index';
import { RecipeNotesService, normalizeRecipeNoteInput, validateRecipeNoteInput } from '../../src/services/recipe-notes';
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
    RECIPE_NOTES_ENABLED: 'true',
    USER_DB: { prepare: vi.fn() } as never,
    ...overrides,
  };
}

async function parse(response: Response) {
  const raw = await response.json();
  return (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, unknown>;
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 5,
    user_id: 'user-a',
    recipe_id: 'recipe-1',
    recipe_title: 'Miso Soup',
    body: 'Halve the salt next time.',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...overrides,
  };
}

describe('recipe note validation and normalization', () => {
  it('trims the note and keeps the recipe it belongs to', () => {
    expect(normalizeRecipeNoteInput({ recipeId: '  recipe-1  ', recipeTitle: '  Miso Soup  ', body: '  Less salt.  ' })).toEqual({
      recipe_id: 'recipe-1',
      recipe_title: 'Miso Soup',
      body: 'Less salt.',
    });
  });

  it('stores a blank title as null rather than an empty string', () => {
    expect(normalizeRecipeNoteInput({ recipe_id: 'r1', recipe_title: '   ', body: 'note' })).toMatchObject({ recipe_title: null });
    expect(normalizeRecipeNoteInput({ recipe_id: 'r1', body: 'note' })).toMatchObject({ recipe_title: null });
  });

  it('caps an over-long body instead of storing it whole', () => {
    const normalized = normalizeRecipeNoteInput({ recipe_id: 'r1', body: 'x'.repeat(5000) });
    expect(String(normalized.body)).toHaveLength(4000);
  });

  it('rejects a missing recipe id and an empty body', () => {
    expect(validateRecipeNoteInput({ body: '   ' })).toEqual([
      'recipe_id must be a non-empty string of at most 200 characters',
      'body must be a non-empty string of at most 4000 characters',
    ]);
  });

  it('rejects a body past the limit and a non-string title', () => {
    expect(validateRecipeNoteInput({ recipe_id: 'r1', body: 'x'.repeat(4001), recipe_title: 12 })).toEqual([
      'body must be a non-empty string of at most 4000 characters',
      'recipe_title must be a string',
    ]);
  });

  it('rejects a non-object payload', () => {
    expect(validateRecipeNoteInput('note')).toEqual(['Recipe note must be a JSON object']);
    expect(validateRecipeNoteInput(null)).toEqual(['Recipe note must be a JSON object']);
  });

  it('allows a partial update that changes only the body', () => {
    expect(validateRecipeNoteInput({ body: 'Updated' }, { partial: true })).toEqual([]);
    expect(validateRecipeNoteInput({}, { partial: true })).toEqual([]);
    expect(validateRecipeNoteInput({ body: '' }, { partial: true })).toEqual([
      'body must be a non-empty string of at most 4000 characters',
    ]);
  });
});

describe('RecipeNotesService', () => {
  it('narrows the listing to one recipe when a recipe id is given', async () => {
    const all = vi.fn().mockResolvedValue({ results: [row()] });
    const bind = vi.fn().mockReturnValue({ all });
    const prepare = vi.fn().mockReturnValue({ bind });
    const notes = await new RecipeNotesService({ prepare } as never).listNotes('user-a', ' recipe-1 ');
    expect(notes[0]).toMatchObject({ id: 5, recipe_id: 'recipe-1', recipe_title: 'Miso Soup' });
    expect(prepare.mock.calls[0][0]).toContain('WHERE user_id = ? AND recipe_id = ?');
    expect(bind).toHaveBeenCalledWith('user-a', 'recipe-1');
  });

  it('returns the whole notebook when no recipe id is given', async () => {
    const all = vi.fn().mockResolvedValue({ results: [] });
    const bind = vi.fn().mockReturnValue({ all });
    const prepare = vi.fn().mockReturnValue({ bind });
    await new RecipeNotesService({ prepare } as never).listNotes('user-a', '   ');
    expect(prepare.mock.calls[0][0]).not.toContain('recipe_id = ?');
    expect(bind).toHaveBeenCalledWith('user-a');
  });

  it('reads a null title back as null', async () => {
    const all = vi.fn().mockResolvedValue({ results: [row({ recipe_title: null })] });
    const prepare = vi.fn().mockReturnValue({ bind: vi.fn().mockReturnValue({ all }) });
    const notes = await new RecipeNotesService({ prepare } as never).listNotes('user-a');
    expect(notes[0].recipe_title).toBeNull();
  });

  it('creates a note under the authenticated user', async () => {
    const bind = vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(row()) });
    const prepare = vi.fn().mockReturnValue({ bind });
    const note = await new RecipeNotesService({ prepare } as never)
      .createNote('user-a', { recipe_id: 'recipe-1', recipe_title: 'Miso Soup', body: 'Halve the salt next time.' });
    expect(note).toMatchObject({ id: 5, user_id: 'user-a' });
    expect(bind).toHaveBeenCalledWith('user-a', 'recipe-1', 'Miso Soup', 'Halve the salt next time.');
  });

  it('returns null when the insert produces no row', async () => {
    const prepare = vi.fn().mockReturnValue({ bind: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(null) }) });
    const note = await new RecipeNotesService({ prepare } as never)
      .createNote('user-a', { recipe_id: 'recipe-1', body: 'note' });
    expect(note).toBeNull();
  });

  it('scopes an update to both the user and the note id', async () => {
    const bind = vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(row({ body: 'Updated' })) });
    const prepare = vi.fn().mockReturnValue({ bind });
    const note = await new RecipeNotesService({ prepare } as never).updateNote('user-a', 5, { body: 'Updated' });
    expect(note?.body).toBe('Updated');
    expect(bind).toHaveBeenCalledWith('Updated', 'user-a', 5);
    expect(prepare.mock.calls[0][0]).toContain('WHERE user_id = ? AND id = ?');
  });

  it('does not issue an update when no writable field was sent', async () => {
    const prepare = vi.fn();
    const note = await new RecipeNotesService({ prepare } as never).updateNote('user-a', 5, {});
    expect(note).toBeNull();
    expect(prepare).not.toHaveBeenCalled();
  });

  it('reports how many rows a delete removed', async () => {
    const run = vi.fn().mockResolvedValue({ meta: { changes: 1 } });
    const bind = vi.fn().mockReturnValue({ run });
    const prepare = vi.fn().mockReturnValue({ bind });
    const service = new RecipeNotesService({ prepare } as never);
    expect(await service.deleteNote('user-a', 5)).toBe(1);
    expect(bind).toHaveBeenCalledWith('user-a', 5);

    run.mockResolvedValue({});
    expect(await service.deleteNote('user-a', 5)).toBe(0);
  });
});

describe('authenticated recipe note routes', () => {
  it('rejects an unauthenticated read before touching D1', async () => {
    const prepare = vi.fn();
    const response = await app.fetch(
      new Request('https://example.test/me/recipe-notes'),
      env({ USER_DB: { prepare } as never }),
    );
    expect(response.status).toBe(401);
    expect(prepare).not.toHaveBeenCalled();
  });

  it('hides the routes entirely when the kill switch is off', async () => {
    const prepare = vi.fn();
    const response = await app.fetch(new Request('https://example.test/me/recipe-notes', {
      headers: { authorization: `Bearer ${await tokenFor('user-a')}` },
    }), env({ RECIPE_NOTES_ENABLED: 'false', USER_DB: { prepare } as never }));
    expect(response.status).toBe(404);
    expect(prepare).not.toHaveBeenCalled();
  });

  it('reports an unconfigured deployment separately from a rejected token', async () => {
    const prepare = vi.fn();
    const response = await app.fetch(new Request('https://example.test/me/recipe-notes', {
      headers: { authorization: `Bearer ${await tokenFor('user-a')}` },
    }), env({ JWT_SECRET: undefined, USER_DB: { prepare } as never }));
    expect(response.status).toBe(503);
    expect(prepare).not.toHaveBeenCalled();
  });

  it('lists the verified subject notes, ignoring a caller-supplied user id', async () => {
    const all = vi.fn().mockResolvedValue({ results: [row()] });
    const bind = vi.fn().mockReturnValue({ all });
    const prepare = vi.fn().mockReturnValue({ bind });
    const response = await app.fetch(new Request('https://example.test/me/recipe-notes?recipeId=recipe-1&user_id=other', {
      headers: { authorization: `Bearer ${await tokenFor('user-a')}` },
    }), env({ USER_DB: { prepare } as never }));
    expect(response.status).toBe(200);
    expect(await parse(response)).toMatchObject({ success: true, data: [{ id: 5, recipe_id: 'recipe-1' }] });
    expect(bind).toHaveBeenCalledWith('user-a', 'recipe-1');
  });

  it('accepts the snake_case query alias', async () => {
    const all = vi.fn().mockResolvedValue({ results: [] });
    const bind = vi.fn().mockReturnValue({ all });
    const prepare = vi.fn().mockReturnValue({ bind });
    await app.fetch(new Request('https://example.test/me/recipe-notes?recipe_id=recipe-9', {
      headers: { authorization: `Bearer ${await tokenFor('user-a')}` },
    }), env({ USER_DB: { prepare } as never }));
    expect(bind).toHaveBeenCalledWith('user-a', 'recipe-9');
  });

  it('creates a note under the verified subject and accepts a wrapped payload', async () => {
    const bind = vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(row()) });
    const prepare = vi.fn().mockReturnValue({ bind });
    const response = await app.fetch(new Request('https://example.test/me/recipe-notes', {
      method: 'POST',
      headers: { authorization: `Bearer ${await tokenFor('user-a')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ note: { recipeId: 'recipe-1', recipeTitle: 'Miso Soup', body: 'Halve the salt next time.' } }),
    }), env({ USER_DB: { prepare } as never }));
    expect(response.status).toBe(201);
    expect(await parse(response)).toMatchObject({ success: true, data: { user_id: 'user-a' } });
    expect(bind).toHaveBeenCalledWith('user-a', 'recipe-1', 'Miso Soup', 'Halve the salt next time.');
  });

  it('rejects an invalid create with the field errors', async () => {
    const prepare = vi.fn();
    const response = await app.fetch(new Request('https://example.test/me/recipe-notes', {
      method: 'POST',
      headers: { authorization: `Bearer ${await tokenFor('user-a')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ body: '' }),
    }), env({ USER_DB: { prepare } as never }));
    expect(response.status).toBe(400);
    expect(await parse(response)).toMatchObject({ success: false, message: 'Invalid recipe note' });
    expect(prepare).not.toHaveBeenCalled();
  });

  it('updates a note the user owns', async () => {
    const bind = vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(row({ body: 'Updated' })) });
    const prepare = vi.fn().mockReturnValue({ bind });
    const response = await app.fetch(new Request('https://example.test/me/recipe-notes/5', {
      method: 'PATCH',
      headers: { authorization: `Bearer ${await tokenFor('user-a')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ body: 'Updated' }),
    }), env({ USER_DB: { prepare } as never }));
    expect(response.status).toBe(200);
    expect(await parse(response)).toMatchObject({ data: { body: 'Updated' } });
    expect(bind).toHaveBeenCalledWith('Updated', 'user-a', 5);
  });

  it('404s an update that matched no row belonging to the user', async () => {
    const prepare = vi.fn().mockReturnValue({ bind: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(null) }) });
    const response = await app.fetch(new Request('https://example.test/me/recipe-notes/5', {
      method: 'PATCH',
      headers: { authorization: `Bearer ${await tokenFor('user-a')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ body: 'Updated' }),
    }), env({ USER_DB: { prepare } as never }));
    expect(response.status).toBe(404);
  });

  it('rejects a non-numeric note id before querying', async () => {
    const prepare = vi.fn();
    for (const method of ['PATCH', 'DELETE']) {
      const response = await app.fetch(new Request('https://example.test/me/recipe-notes/abc', {
        method,
        headers: { authorization: `Bearer ${await tokenFor('user-a')}`, 'content-type': 'application/json' },
        body: method === 'PATCH' ? JSON.stringify({ body: 'x' }) : undefined,
      }), env({ USER_DB: { prepare } as never }));
      expect(response.status).toBe(400);
    }
    expect(prepare).not.toHaveBeenCalled();
  });

  it('deletes a note the user owns and 404s one they do not', async () => {
    const run = vi.fn().mockResolvedValue({ meta: { changes: 1 } });
    const bind = vi.fn().mockReturnValue({ run });
    const prepare = vi.fn().mockReturnValue({ bind });
    const request = async () => app.fetch(new Request('https://example.test/me/recipe-notes/5', {
      method: 'DELETE',
      headers: { authorization: `Bearer ${await tokenFor('user-a')}` },
    }), env({ USER_DB: { prepare } as never }));

    expect((await request()).status).toBe(200);
    expect(bind).toHaveBeenCalledWith('user-a', 5);

    run.mockResolvedValue({ meta: { changes: 0 } });
    expect((await request()).status).toBe(404);
  });

  it('returns 500 rather than leaking a D1 failure', async () => {
    const prepare = vi.fn().mockImplementation(() => { throw new Error('D1 is down'); });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await app.fetch(new Request('https://example.test/me/recipe-notes', {
      headers: { authorization: `Bearer ${await tokenFor('user-a')}` },
    }), env({ USER_DB: { prepare } as never }));
    expect(response.status).toBe(500);
    expect(await parse(response)).toMatchObject({ success: false, message: 'Internal server error' });
    vi.restoreAllMocks();
  });
});
