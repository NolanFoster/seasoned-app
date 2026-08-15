import type { D1Database } from '@cloudflare/workers-types';
import type { PantryItem, PantryItemInput, PantryLocation } from '../types/database';

export const PANTRY_LOCATIONS = ['fridge', 'freezer', 'pantry', 'other'] as const;

const MAX_NAME_LENGTH = 200;
const MAX_UNIT_LENGTH = 40;
const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 40;

type PantryRow = Omit<PantryItem, 'tags'> & { tags: string | null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const tags: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const tag = item.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, MAX_TAG_LENGTH);
    if (tag && !tags.includes(tag)) tags.push(tag);
  }
  return tags.slice(0, MAX_TAGS);
}

function normalizeDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? null : value;
}

function valueFor(input: Record<string, unknown>, snake: string, camel: string): unknown {
  return input[snake] !== undefined ? input[snake] : input[camel];
}

export function validatePantryItemInput(input: unknown, { partial = false } = {}): string[] {
  if (!isRecord(input)) return ['Pantry item must be a JSON object'];
  const errors: string[] = [];
  const name = valueFor(input, 'name', 'name');
  if (!partial || name !== undefined) {
    if (typeof name !== 'string' || name.trim().length === 0 || name.trim().length > MAX_NAME_LENGTH) {
      errors.push(`name must be a non-empty string of at most ${MAX_NAME_LENGTH} characters`);
    }
  }

  const quantity = valueFor(input, 'quantity', 'quantity');
  if (quantity !== undefined && quantity !== null && quantity !== '' &&
      (!Number.isFinite(Number(quantity)) || Number(quantity) < 0)) {
    errors.push('quantity must be a non-negative number');
  }

  const unit = valueFor(input, 'unit', 'unit');
  if (unit !== undefined && unit !== null && unit !== '' &&
      (typeof unit !== 'string' || unit.trim().length > MAX_UNIT_LENGTH)) {
    errors.push(`unit must be at most ${MAX_UNIT_LENGTH} characters`);
  }

  const location = valueFor(input, 'location', 'location');
  if (location !== undefined && !PANTRY_LOCATIONS.includes(location as PantryLocation)) {
    errors.push(`location must be one of ${PANTRY_LOCATIONS.join(', ')}`);
  }

  const expiresOn = valueFor(input, 'expires_on', 'expiresOn');
  if (expiresOn !== undefined && expiresOn !== null && expiresOn !== '' && normalizeDate(expiresOn) === null) {
    errors.push('expires_on must be a valid date in YYYY-MM-DD format');
  }

  const tags = valueFor(input, 'tags', 'tags');
  if (tags !== undefined && (!Array.isArray(tags) || tags.some((tag) => typeof tag !== 'string'))) {
    errors.push('tags must be an array of strings');
  }
  return errors;
}

export function normalizePantryItemInput(input: PantryItemInput | Record<string, unknown>, { partial = false } = {}): Record<string, unknown> {
  const source = isRecord(input) ? input : {};
  const normalized: Record<string, unknown> = {};
  const name = valueFor(source, 'name', 'name');
  const quantity = valueFor(source, 'quantity', 'quantity');
  const unit = valueFor(source, 'unit', 'unit');
  const location = valueFor(source, 'location', 'location');
  const expiresOn = valueFor(source, 'expires_on', 'expiresOn');
  const tags = valueFor(source, 'tags', 'tags');

  if (!partial || name !== undefined) normalized.name = typeof name === 'string' ? name.trim().slice(0, MAX_NAME_LENGTH) : '';
  if (!partial || quantity !== undefined) normalized.quantity = quantity === null || quantity === '' || quantity === undefined ? null : Number(quantity);
  if (!partial || unit !== undefined) normalized.unit = typeof unit === 'string' && unit.trim() ? unit.trim().slice(0, MAX_UNIT_LENGTH) : null;
  if (!partial || location !== undefined) normalized.location = PANTRY_LOCATIONS.includes(location as PantryLocation) ? location : 'pantry';
  if (!partial || expiresOn !== undefined) normalized.expires_on = normalizeDate(expiresOn);
  if (!partial || tags !== undefined) normalized.tags = normalizeTags(tags);
  return normalized;
}

function parseTags(value: unknown): string[] {
  if (Array.isArray(value)) return normalizeTags(value);
  if (typeof value !== 'string') return [];
  try { return normalizeTags(JSON.parse(value)); } catch { return []; }
}

function itemFromRow(row: PantryRow): PantryItem {
  return {
    id: Number(row.id),
    user_id: String(row.user_id),
    name: String(row.name),
    quantity: row.quantity === null || row.quantity === undefined ? null : Number(row.quantity),
    unit: row.unit ? String(row.unit) : null,
    location: PANTRY_LOCATIONS.includes(row.location as PantryLocation) ? row.location as PantryLocation : 'other',
    expires_on: row.expires_on ? String(row.expires_on) : null,
    tags: parseTags(row.tags),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export class PantryService {
  constructor(private db: D1Database) {}

  async listItems(userId: string): Promise<PantryItem[]> {
    const result = await this.db.prepare(`
      SELECT * FROM pantry_items
      WHERE user_id = ?
      ORDER BY CASE WHEN expires_on IS NULL THEN 1 ELSE 0 END, expires_on ASC, created_at DESC
    `).bind(userId).all<PantryRow>();
    return (result.results || []).map(itemFromRow);
  }

  async createItem(userId: string, input: PantryItemInput): Promise<PantryItem | null> {
    const values = normalizePantryItemInput(input);
    const row = await this.db.prepare(`
      INSERT INTO pantry_items (user_id, name, quantity, unit, location, expires_on, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `).bind(
      userId,
      values.name,
      values.quantity,
      values.unit,
      values.location,
      values.expires_on,
      JSON.stringify(values.tags),
    ).first<PantryRow>();
    return row ? itemFromRow(row) : null;
  }

  async updateItem(userId: string, itemId: number, input: PantryItemInput): Promise<PantryItem | null> {
    const values = normalizePantryItemInput(input, { partial: true });
    const fields: string[] = [];
    const bindings: unknown[] = [];
    const columns: Record<string, string> = {
      name: 'name', quantity: 'quantity', unit: 'unit', location: 'location', expires_on: 'expires_on', tags: 'tags',
    };
    for (const [key, column] of Object.entries(columns)) {
      if (!(key in values)) continue;
      fields.push(`${column} = ?`);
      bindings.push(key === 'tags' ? JSON.stringify(values[key]) : values[key]);
    }
    if (fields.length === 0) return null;
    bindings.push(userId, itemId);
    const row = await this.db.prepare(`
      UPDATE pantry_items SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND id = ?
      RETURNING *
    `).bind(...bindings).first<PantryRow>();
    return row ? itemFromRow(row) : null;
  }

  async deleteItem(userId: string, itemId: number): Promise<number> {
    const result = await this.db.prepare(`
      DELETE FROM pantry_items WHERE user_id = ? AND id = ?
    `).bind(userId, itemId).run();
    return result.meta?.changes || 0;
  }
}
