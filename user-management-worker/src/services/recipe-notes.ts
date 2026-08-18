import type { D1Database } from '@cloudflare/workers-types';
import type { RecipeNote, RecipeNoteInput } from '../types/database';

const MAX_RECIPE_ID_LENGTH = 200;
const MAX_TITLE_LENGTH = 300;
const MAX_BODY_LENGTH = 4000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function valueFor(input: Record<string, unknown>, snake: string, camel: string): unknown {
  return input[snake] !== undefined ? input[snake] : input[camel];
}

/**
 * Validate a note payload. `partial` relaxes the required fields for PATCH,
 * where a caller may send only the field it is changing.
 */
export function validateRecipeNoteInput(input: unknown, { partial = false } = {}): string[] {
  if (!isRecord(input)) return ['Recipe note must be a JSON object'];
  const errors: string[] = [];

  const recipeId = valueFor(input, 'recipe_id', 'recipeId');
  // The recipe a note hangs off cannot be reassigned, so PATCH never carries one.
  if (!partial) {
    if (typeof recipeId !== 'string' || recipeId.trim().length === 0 || recipeId.trim().length > MAX_RECIPE_ID_LENGTH) {
      errors.push(`recipe_id must be a non-empty string of at most ${MAX_RECIPE_ID_LENGTH} characters`);
    }
  }

  const body = valueFor(input, 'body', 'body');
  if (!partial || body !== undefined) {
    if (typeof body !== 'string' || body.trim().length === 0 || body.trim().length > MAX_BODY_LENGTH) {
      errors.push(`body must be a non-empty string of at most ${MAX_BODY_LENGTH} characters`);
    }
  }

  const title = valueFor(input, 'recipe_title', 'recipeTitle');
  if (title !== undefined && title !== null && typeof title !== 'string') {
    errors.push('recipe_title must be a string');
  }

  return errors;
}

export function normalizeRecipeNoteInput(
  input: RecipeNoteInput | Record<string, unknown>,
  { partial = false } = {},
): Record<string, unknown> {
  const source = isRecord(input) ? input : {};
  const normalized: Record<string, unknown> = {};
  const recipeId = valueFor(source, 'recipe_id', 'recipeId');
  const title = valueFor(source, 'recipe_title', 'recipeTitle');
  const body = valueFor(source, 'body', 'body');

  if (!partial) {
    normalized.recipe_id = typeof recipeId === 'string' ? recipeId.trim().slice(0, MAX_RECIPE_ID_LENGTH) : '';
  }
  if (!partial || title !== undefined) {
    normalized.recipe_title = typeof title === 'string' && title.trim()
      ? title.trim().slice(0, MAX_TITLE_LENGTH)
      : null;
  }
  if (!partial || body !== undefined) {
    normalized.body = typeof body === 'string' ? body.trim().slice(0, MAX_BODY_LENGTH) : '';
  }
  return normalized;
}

function noteFromRow(row: Record<string, unknown>): RecipeNote {
  return {
    id: Number(row.id),
    user_id: String(row.user_id),
    recipe_id: String(row.recipe_id),
    recipe_title: row.recipe_title ? String(row.recipe_title) : null,
    body: String(row.body),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export class RecipeNotesService {
  constructor(private db: D1Database) {}

  /**
   * List a user's notes, newest first. Passing a recipeId narrows to one
   * recipe; omitting it returns the whole personal notebook.
   */
  async listNotes(userId: string, recipeId?: string | null): Promise<RecipeNote[]> {
    const trimmedRecipeId = typeof recipeId === 'string' ? recipeId.trim() : '';
    const statement = trimmedRecipeId
      ? this.db.prepare(`
          SELECT * FROM recipe_notes
          WHERE user_id = ? AND recipe_id = ?
          ORDER BY created_at DESC, id DESC
        `).bind(userId, trimmedRecipeId)
      : this.db.prepare(`
          SELECT * FROM recipe_notes
          WHERE user_id = ?
          ORDER BY created_at DESC, id DESC
        `).bind(userId);
    const result = await statement.all<Record<string, unknown>>();
    return (result.results || []).map(noteFromRow);
  }

  async createNote(userId: string, input: RecipeNoteInput): Promise<RecipeNote | null> {
    const values = normalizeRecipeNoteInput(input);
    const row = await this.db.prepare(`
      INSERT INTO recipe_notes (user_id, recipe_id, recipe_title, body)
      VALUES (?, ?, ?, ?)
      RETURNING *
    `).bind(userId, values.recipe_id, values.recipe_title, values.body).first<Record<string, unknown>>();
    return row ? noteFromRow(row) : null;
  }

  async updateNote(userId: string, noteId: number, input: RecipeNoteInput | Record<string, unknown>): Promise<RecipeNote | null> {
    const values = normalizeRecipeNoteInput(input, { partial: true });
    const fields: string[] = [];
    const bindings: unknown[] = [];
    for (const column of ['recipe_title', 'body']) {
      if (!(column in values)) continue;
      fields.push(`${column} = ?`);
      bindings.push(values[column]);
    }
    if (fields.length === 0) return null;
    bindings.push(userId, noteId);
    const row = await this.db.prepare(`
      UPDATE recipe_notes SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND id = ?
      RETURNING *
    `).bind(...bindings).first<Record<string, unknown>>();
    return row ? noteFromRow(row) : null;
  }

  async deleteNote(userId: string, noteId: number): Promise<number> {
    const result = await this.db.prepare(`
      DELETE FROM recipe_notes WHERE user_id = ? AND id = ?
    `).bind(userId, noteId).run();
    return result.meta?.changes || 0;
  }
}
