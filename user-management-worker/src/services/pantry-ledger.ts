import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import type {
  PantryItem,
  PantryLedgerEvent,
  PantryLedgerEventInput,
  PantryLedgerEventType,
  PantryLedgerLine,
  PantryLedgerLineAction,
  PantryLedgerSource,
} from '../types/database';
import { PantryService } from './pantry';

const EVENT_TYPES: PantryLedgerEventType[] = ['debit_cook', 'debit_waste', 'adjust'];
const SOURCES: PantryLedgerSource[] = ['navigator', 'workflow', 'meal_log', 'pantry'];
const ACTIONS: PantryLedgerLineAction[] = ['update', 'remove'];
const MAX_LINES = 100;
const MAX_ID_LENGTH = 120;
const MAX_NAME_LENGTH = 200;
const MAX_UNIT_LENGTH = 40;
const UNIT_ALIASES: Record<string, string> = {
  bag: 'bag', bags: 'bag', bottle: 'bottle', bottles: 'bottle', box: 'box', boxes: 'box',
  can: 'can', cans: 'can', cup: 'cup', cups: 'cup', c: 'cup',
  gram: 'g', grams: 'g', g: 'g', kilogram: 'kg', kilograms: 'kg', kg: 'kg',
  pound: 'lb', pounds: 'lb', lb: 'lb', lbs: 'lb', ounce: 'oz', ounces: 'oz', oz: 'oz',
  tablespoon: 'tbsp', tablespoons: 'tbsp', tbsp: 'tbsp', teaspoon: 'tsp', teaspoons: 'tsp', tsp: 'tsp',
  milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml', ml: 'ml',
  liter: 'l', liters: 'l', litre: 'l', litres: 'l', l: 'l',
  pinch: 'pinch', pinches: 'pinch', bunch: 'bunch', bunches: 'bunch',
  clove: 'clove', cloves: 'clove', slice: 'slice', slices: 'slice',
  piece: 'piece', pieces: 'piece', sprig: 'sprig', sprigs: 'sprig',
};

type PantryRow = Omit<PantryItem, 'tags'> & { tags: string | null };

type NormalizedInput = {
  type: PantryLedgerEventType;
  recipeId: string | null;
  cookSessionId: string | null;
  source: PantryLedgerSource;
  lines: PantryLedgerLine[];
};

type LedgerResult = {
  event: PantryLedgerEvent;
  items: PantryItem[];
  alreadyApplied?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function valueFor(input: Record<string, unknown>, camel: string, snake: string): unknown {
  return input[camel] !== undefined ? input[camel] : input[snake];
}

function stringValue(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const result = value.trim().slice(0, max);
  return result || null;
}

function normalizeName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const result = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[()[\]{},;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return result || null;
}

function normalizeUnit(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const unit = value.trim().toLowerCase();
  return UNIT_ALIASES[unit] || unit.slice(0, MAX_UNIT_LENGTH);
}

function numericValue(value: unknown, { allowNull = true } = {}): number | null | undefined {
  if (value === null || value === undefined || value === '') return allowNull ? null : undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function quantityEqual(left: number | null, right: number | null): boolean {
  if (left === null || right === null) return left === right;
  return Math.abs(left - right) <= 0.0001;
}

function rowToItem(row: PantryRow): PantryItem {
  let tags: string[] = [];
  if (typeof row.tags === 'string') {
    try {
      const parsed = JSON.parse(row.tags);
      if (Array.isArray(parsed)) tags = parsed.filter((tag): tag is string => typeof tag === 'string');
    } catch {
      tags = [];
    }
  }
  return {
    id: Number(row.id),
    user_id: String(row.user_id),
    name: String(row.name),
    quantity: row.quantity === null || row.quantity === undefined ? null : Number(row.quantity),
    unit: row.unit ? String(row.unit) : null,
    location: ['fridge', 'freezer', 'pantry', 'other'].includes(String(row.location))
      ? String(row.location) as PantryItem['location']
      : 'other',
    expires_on: row.expires_on ? String(row.expires_on) : null,
    tags,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function parseLines(input: unknown): { lines?: PantryLedgerLine[]; errors: string[] } {
  if (!Array.isArray(input)) return { errors: ['lines must be an array'] };
  if (input.length > MAX_LINES) return { errors: [`lines must contain at most ${MAX_LINES} items`] };
  const errors: string[] = [];
  const lines: PantryLedgerLine[] = [];
  const seenIds = new Set<number>();

  input.forEach((raw, index) => {
    if (!isRecord(raw)) {
      errors.push(`lines[${index}] must be an object`);
      return;
    }
    const rawItemId = valueFor(raw, 'pantryItemId', 'pantry_item_id');
    const pantryItemId = Number(rawItemId);
    if (!Number.isSafeInteger(pantryItemId) || pantryItemId < 1) {
      errors.push(`lines[${index}].pantryItemId must be a positive integer`);
      return;
    }
    if (seenIds.has(pantryItemId)) {
      errors.push(`lines[${index}].pantryItemId must be unique`);
      return;
    }
    seenIds.add(pantryItemId);

    const nameNorm = normalizeName(valueFor(raw, 'nameNorm', 'name_norm'));
    if (!nameNorm || nameNorm.length > MAX_NAME_LENGTH) {
      errors.push(`lines[${index}].nameNorm must be a non-empty string of at most ${MAX_NAME_LENGTH} characters`);
      return;
    }
    const rawAction = valueFor(raw, 'action', 'action');
    const action = rawAction === undefined || rawAction === null || rawAction === '' ? 'update' : rawAction;
    if (typeof action !== 'string' || !ACTIONS.includes(action as PantryLedgerLineAction)) {
      errors.push(`lines[${index}].action must be update or remove`);
      return;
    }
    const qty = numericValue(valueFor(raw, 'qty', 'qty'));
    const remainingQuantity = numericValue(valueFor(raw, 'remainingQuantity', 'remaining_quantity'));
    const expectedRaw = valueFor(raw, 'expectedQuantity', 'expected_quantity');
    const expectedQuantity = expectedRaw === undefined ? undefined : numericValue(expectedRaw);
    if (qty === undefined || remainingQuantity === undefined || (expectedRaw !== undefined && expectedQuantity === undefined)) {
      errors.push(`lines[${index}] quantities must be non-negative numbers or null`);
      return;
    }
    if (action === 'update' && remainingQuantity === null) {
      errors.push(`lines[${index}].remainingQuantity is required for update operations`);
      return;
    }
    const confidenceRaw = valueFor(raw, 'confidence', 'confidence');
    const confidence = confidenceRaw === undefined ? 1 : Number(confidenceRaw);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      errors.push(`lines[${index}].confidence must be between 0 and 1`);
      return;
    }

    lines.push({
      pantryItemId,
      nameNorm,
      qty: qty ?? null,
      unit: normalizeUnit(valueFor(raw, 'unit', 'unit')),
      confidence,
      action: action as PantryLedgerLineAction,
      remainingQuantity: action === 'remove' ? null : remainingQuantity,
      ...(expectedQuantity === undefined ? {} : { expectedQuantity }),
    });
  });

  return errors.length ? { errors } : { lines, errors: [] };
}

export function validatePantryLedgerEventInput(input: unknown, expectedType?: PantryLedgerEventType): string[] {
  if (!isRecord(input)) return ['Pantry ledger event must be a JSON object'];
  const type = valueFor(input, 'type', 'event_type');
  if (typeof type !== 'string' || !EVENT_TYPES.includes(type as PantryLedgerEventType)) {
    return [`type must be one of: ${EVENT_TYPES.join(', ')}`];
  }
  if (expectedType && type !== expectedType) return [`type must be ${expectedType}`];
  const source = valueFor(input, 'source', 'source');
  if (source !== undefined && (typeof source !== 'string' || !SOURCES.includes(source as PantryLedgerSource))) {
    return [`source must be one of: ${SOURCES.join(', ')}`];
  }
  const recipeId = valueFor(input, 'recipeId', 'recipe_id');
  if (recipeId !== undefined && recipeId !== null && (typeof recipeId !== 'string' || recipeId.trim().length > MAX_ID_LENGTH)) {
    return [`recipeId must be at most ${MAX_ID_LENGTH} characters`];
  }
  const cookSessionId = valueFor(input, 'cookSessionId', 'cook_session_id');
  if (cookSessionId !== undefined && cookSessionId !== null && (typeof cookSessionId !== 'string' || cookSessionId.trim().length > MAX_ID_LENGTH)) {
    return [`cookSessionId must be at most ${MAX_ID_LENGTH} characters`];
  }
  return parseLines(input.lines).errors;
}

function normalizeInput(input: PantryLedgerEventInput): NormalizedInput {
  const parsed = parseLines(input.lines);
  if (parsed.errors.length || !parsed.lines) throw new Error(parsed.errors.join('; '));
  const type = (input.type || 'debit_cook') as PantryLedgerEventType;
  const source = (input.source || (type === 'debit_waste' ? 'pantry' : 'navigator')) as PantryLedgerSource;
  return {
    type,
    recipeId: stringValue(input.recipeId ?? input.recipe_id, MAX_ID_LENGTH),
    cookSessionId: stringValue(input.cookSessionId ?? input.cook_session_id, MAX_ID_LENGTH),
    source,
    lines: parsed.lines,
  };
}

function eventFromRow(row: Record<string, unknown>): PantryLedgerEvent {
  let lines: PantryLedgerLine[] = [];
  if (typeof row.lines === 'string') {
    try {
      const parsed = JSON.parse(row.lines);
      if (Array.isArray(parsed)) lines = parsed as PantryLedgerLine[];
    } catch {
      lines = [];
    }
  }
  return {
    id: Number(row.id),
    user_id: String(row.user_id),
    type: String(row.type) as PantryLedgerEventType,
    recipe_id: row.recipe_id ? String(row.recipe_id) : null,
    cook_session_id: row.cook_session_id ? String(row.cook_session_id) : null,
    lines,
    source: String(row.source) as PantryLedgerSource,
    created_at: String(row.created_at),
  };
}

export class PantryLedgerConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PantryLedgerConflictError';
  }
}

export class PantryLedgerService {
  constructor(private readonly db: D1Database) {}

  private async findEvent(userId: string, cookSessionId: string): Promise<PantryLedgerEvent | null> {
    const row = await this.db.prepare(`
      SELECT * FROM pantry_ledger_events
      WHERE user_id = ? AND cook_session_id = ?
      LIMIT 1
    `).bind(userId, cookSessionId).first<Record<string, unknown>>();
    return row ? eventFromRow(row) : null;
  }

  private async getItem(userId: string, itemId: number): Promise<PantryItem | null> {
    const row = await this.db.prepare(`
      SELECT * FROM pantry_items WHERE user_id = ? AND id = ?
    `).bind(userId, itemId).first<PantryRow>();
    return row ? rowToItem(row) : null;
  }

  async propose(userId: string, input: PantryLedgerEventInput): Promise<{ proposal: NormalizedInput; items: PantryItem[]; alreadyApplied?: boolean }> {
    const normalized = normalizeInput(input);
    const existing = normalized.cookSessionId ? await this.findEvent(userId, normalized.cookSessionId) : null;
    if (existing) return { proposal: normalized, items: await new PantryService(this.db).listItems(userId), alreadyApplied: true };

    const items: PantryItem[] = [];
    for (const line of normalized.lines) {
      const item = await this.getItem(userId, line.pantryItemId);
      if (!item) throw new PantryLedgerConflictError(`Pantry item ${line.pantryItemId} is no longer available`);
      items.push(item);
    }
    return { proposal: normalized, items };
  }

  async confirm(userId: string, input: PantryLedgerEventInput): Promise<LedgerResult> {
    const normalized = normalizeInput(input);
    const existing = normalized.cookSessionId ? await this.findEvent(userId, normalized.cookSessionId) : null;
    if (existing) {
      return { event: existing, items: await new PantryService(this.db).listItems(userId), alreadyApplied: true };
    }

    for (const line of normalized.lines) {
      const item = await this.getItem(userId, line.pantryItemId);
      if (!item) throw new PantryLedgerConflictError(`Pantry item ${line.pantryItemId} is no longer available`);
      const currentQuantity = item.quantity === null ? null : Number(item.quantity);
      if (line.expectedQuantity !== undefined && !quantityEqual(currentQuantity, line.expectedQuantity)) {
        throw new PantryLedgerConflictError(`${item.name} changed while this cook was being reviewed; refresh and review it again`);
      }
      if (line.action === 'update' && line.remainingQuantity !== null) {
        if (currentQuantity === null) {
          throw new PantryLedgerConflictError(`${item.name} has no measured quantity; review it as remove or skip`);
        }
        if (line.remainingQuantity > currentQuantity + 0.0001) {
          throw new PantryLedgerConflictError(`Remaining ${item.name} quantity cannot exceed the current pantry quantity`);
        }
        const currentUnit = normalizeUnit(item.unit);
        if (line.unit && currentUnit && line.unit !== currentUnit) {
          throw new PantryLedgerConflictError(`${item.name} unit changed while this cook was being reviewed; refresh and review it again`);
        }
      }
    }

    const statements: D1PreparedStatement[] = [];
    for (const line of normalized.lines) {
      if (line.action === 'remove') {
        statements.push(this.db.prepare(`
          DELETE FROM pantry_items WHERE user_id = ? AND id = ?
        `).bind(userId, line.pantryItemId));
      } else {
        statements.push(this.db.prepare(`
          UPDATE pantry_items SET quantity = ?, updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ? AND id = ?
        `).bind(line.remainingQuantity, userId, line.pantryItemId));
      }
    }
    statements.push(this.db.prepare(`
      INSERT INTO pantry_ledger_events (user_id, type, recipe_id, cook_session_id, lines, source)
      VALUES (?, ?, ?, ?, ?, ?)
      RETURNING *
    `).bind(
      userId,
      normalized.type,
      normalized.recipeId,
      normalized.cookSessionId,
      JSON.stringify(normalized.lines),
      normalized.source,
    ));

    const batchResults = await this.db.batch(statements);
    const inserted = (batchResults?.[batchResults.length - 1] as { results?: unknown[] } | undefined)?.results?.[0];
    const event = inserted && isRecord(inserted)
      ? eventFromRow(inserted)
      : {
        id: 0,
        user_id: userId,
        type: normalized.type,
        recipe_id: normalized.recipeId,
        cook_session_id: normalized.cookSessionId,
        lines: normalized.lines,
        source: normalized.source,
        created_at: new Date().toISOString(),
      };
    return { event, items: await new PantryService(this.db).listItems(userId) };
  }

  async listEvents(userId: string, limit = 100): Promise<PantryLedgerEvent[]> {
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const result = await this.db.prepare(`
      SELECT * FROM pantry_ledger_events
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `).bind(userId, safeLimit).all<Record<string, unknown>>();
    return (result.results || []).map(eventFromRow);
  }
}
