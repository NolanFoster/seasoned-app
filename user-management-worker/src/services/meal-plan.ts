import type { D1Database } from '@cloudflare/workers-types';

/**
 * Server-side storage for the meal planner and its grocery list.
 *
 * Both documents used to live only in the browser's localStorage, so a plan
 * never followed the person who made it: a second device, a reinstalled PWA, a
 * cleared cache or a sign-in on someone else's phone all started from an empty
 * week. Each document is now one row per user, keyed by the verified JWT
 * subject, with the client's own change timestamp stored beside it so two
 * devices editing the same plan resolve to the newer edit instead of silently
 * overwriting each other.
 */

/** Meal type keys a day can hold; anything else is rejected. */
export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 400;
const MAX_MEALS_PER_SLOT = 50;
const MAX_UP_NEXT = 200;
const MAX_GROCERY_ITEMS = 500;
const MAX_PLAN_BYTES = 512_000;
const MAX_GROCERY_BYTES = 256_000;

export interface MealPlanDocument {
  mealPlan: Record<string, Record<string, unknown[]>>;
  upNext: unknown[];
  clientUpdatedAt: number;
  updatedAt: string | null;
}

export interface GroceryListDocument {
  items: unknown[];
  lastGeneratedAt: number | null;
  clientUpdatedAt: number;
  updatedAt: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function valueFor(input: Record<string, unknown>, snake: string, camel: string): unknown {
  return input[snake] !== undefined ? input[snake] : input[camel];
}

/** Serialized size is the real storage cost, so it is what the limit checks. */
function jsonSize(value: unknown): number {
  try {
    return JSON.stringify(value ?? null).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function parseClientUpdatedAt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return Math.floor(value);
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return Math.floor(parsed);
  }
  return null;
}

export function validateMealPlanInput(input: unknown): string[] {
  if (!isRecord(input)) return ['Meal plan must be a JSON object'];
  const errors: string[] = [];

  const plan = valueFor(input, 'meal_plan', 'mealPlan');
  if (!isRecord(plan)) {
    errors.push('mealPlan must be an object keyed by date');
  } else {
    const dates = Object.keys(plan);
    if (dates.length > MAX_DAYS) errors.push(`mealPlan may hold at most ${MAX_DAYS} days`);
    for (const date of dates.slice(0, MAX_DAYS)) {
      if (!DATE_KEY_PATTERN.test(date)) {
        errors.push('mealPlan keys must be YYYY-MM-DD dates');
        break;
      }
      const day = plan[date];
      if (!isRecord(day)) {
        errors.push('each mealPlan day must be an object of meal type arrays');
        break;
      }
      const badSlot = Object.keys(day).find((mealType) => !(MEAL_TYPES as readonly string[]).includes(mealType));
      if (badSlot) {
        errors.push(`unknown meal type "${badSlot}"; allowed: ${MEAL_TYPES.join(', ')}`);
        break;
      }
      const oversized = Object.values(day).some((meals) => !Array.isArray(meals) || meals.length > MAX_MEALS_PER_SLOT);
      if (oversized) {
        errors.push(`each meal type must be an array of at most ${MAX_MEALS_PER_SLOT} recipes`);
        break;
      }
    }
  }

  const upNext = valueFor(input, 'up_next', 'upNext');
  if (upNext !== undefined && upNext !== null) {
    if (!Array.isArray(upNext)) errors.push('upNext must be an array');
    else if (upNext.length > MAX_UP_NEXT) errors.push(`upNext may hold at most ${MAX_UP_NEXT} recipes`);
  }

  const clientUpdatedAt = valueFor(input, 'client_updated_at', 'clientUpdatedAt');
  if (clientUpdatedAt !== undefined && clientUpdatedAt !== null && parseClientUpdatedAt(clientUpdatedAt) === null) {
    errors.push('clientUpdatedAt must be a non-negative epoch milliseconds value');
  }

  if (errors.length === 0 && jsonSize({ plan, upNext }) > MAX_PLAN_BYTES) {
    errors.push(`meal plan must serialize to at most ${MAX_PLAN_BYTES} characters`);
  }

  return errors;
}

export function validateGroceryListInput(input: unknown): string[] {
  if (!isRecord(input)) return ['Grocery list must be a JSON object'];
  const errors: string[] = [];

  const items = valueFor(input, 'items', 'items');
  if (!Array.isArray(items)) {
    errors.push('items must be an array');
  } else {
    if (items.length > MAX_GROCERY_ITEMS) errors.push(`items may hold at most ${MAX_GROCERY_ITEMS} entries`);
    if (items.some((item) => !isRecord(item))) errors.push('each grocery item must be an object');
  }

  const lastGeneratedAt = valueFor(input, 'last_generated_at', 'lastGeneratedAt');
  if (lastGeneratedAt !== undefined && lastGeneratedAt !== null && parseClientUpdatedAt(lastGeneratedAt) === null) {
    errors.push('lastGeneratedAt must be a non-negative epoch milliseconds value');
  }

  const clientUpdatedAt = valueFor(input, 'client_updated_at', 'clientUpdatedAt');
  if (clientUpdatedAt !== undefined && clientUpdatedAt !== null && parseClientUpdatedAt(clientUpdatedAt) === null) {
    errors.push('clientUpdatedAt must be a non-negative epoch milliseconds value');
  }

  if (errors.length === 0 && jsonSize(items) > MAX_GROCERY_BYTES) {
    errors.push(`grocery list must serialize to at most ${MAX_GROCERY_BYTES} characters`);
  }

  return errors;
}

/** Drops meal types the client did not send so every stored day has all four slots. */
function normalizeDay(day: Record<string, unknown>): Record<string, unknown[]> {
  const normalized: Record<string, unknown[]> = {};
  for (const mealType of MEAL_TYPES) {
    const meals = day[mealType];
    normalized[mealType] = Array.isArray(meals) ? meals : [];
  }
  return normalized;
}

export function normalizeMealPlanInput(input: Record<string, unknown>): {
  mealPlan: Record<string, Record<string, unknown[]>>;
  upNext: unknown[];
  clientUpdatedAt: number;
} {
  const source = isRecord(input) ? input : {};
  const plan = valueFor(source, 'meal_plan', 'mealPlan');
  const upNext = valueFor(source, 'up_next', 'upNext');
  const normalizedPlan: Record<string, Record<string, unknown[]>> = {};
  if (isRecord(plan)) {
    for (const [date, day] of Object.entries(plan)) {
      if (!isRecord(day)) continue;
      normalizedPlan[date] = normalizeDay(day);
    }
  }
  return {
    mealPlan: normalizedPlan,
    upNext: Array.isArray(upNext) ? upNext : [],
    clientUpdatedAt: parseClientUpdatedAt(valueFor(source, 'client_updated_at', 'clientUpdatedAt')) ?? Date.now(),
  };
}

export function normalizeGroceryListInput(input: Record<string, unknown>): {
  items: unknown[];
  lastGeneratedAt: number | null;
  clientUpdatedAt: number;
} {
  const source = isRecord(input) ? input : {};
  const items = valueFor(source, 'items', 'items');
  return {
    items: Array.isArray(items) ? items : [],
    lastGeneratedAt: parseClientUpdatedAt(valueFor(source, 'last_generated_at', 'lastGeneratedAt')),
    clientUpdatedAt: parseClientUpdatedAt(valueFor(source, 'client_updated_at', 'clientUpdatedAt')) ?? Date.now(),
  };
}

/** A row that fails to parse is treated as empty rather than failing the read. */
function parseJsonColumn<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed === null || parsed === undefined ? fallback : (parsed as T);
  } catch {
    return fallback;
  }
}

function mealPlanFromRow(row: Record<string, unknown>): MealPlanDocument {
  return {
    mealPlan: parseJsonColumn<Record<string, Record<string, unknown[]>>>(row.plan, {}),
    upNext: parseJsonColumn<unknown[]>(row.up_next, []),
    clientUpdatedAt: Number(row.client_updated_at || 0),
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  };
}

function groceryListFromRow(row: Record<string, unknown>): GroceryListDocument {
  return {
    items: parseJsonColumn<unknown[]>(row.items, []),
    lastGeneratedAt: row.last_generated_at === null || row.last_generated_at === undefined
      ? null
      : Number(row.last_generated_at),
    clientUpdatedAt: Number(row.client_updated_at || 0),
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  };
}

export const EMPTY_MEAL_PLAN: MealPlanDocument = { mealPlan: {}, upNext: [], clientUpdatedAt: 0, updatedAt: null };
export const EMPTY_GROCERY_LIST: GroceryListDocument = { items: [], lastGeneratedAt: null, clientUpdatedAt: 0, updatedAt: null };

/** A save older than what the server already holds; the caller adopts `current`. */
export interface StaleWrite<T> {
  stale: true;
  current: T;
}

export function isStaleWrite<T>(result: T | StaleWrite<T>): result is StaleWrite<T> {
  return Boolean(result) && (result as StaleWrite<T>).stale === true;
}

export class MealPlanService {
  constructor(private db: D1Database) {}

  async getMealPlan(userId: string): Promise<MealPlanDocument | null> {
    const row = await this.db
      .prepare('SELECT * FROM meal_plans WHERE user_id = ?')
      .bind(userId)
      .first<Record<string, unknown>>();
    return row ? mealPlanFromRow(row) : null;
  }

  /**
   * Replaces the stored plan. A write whose client timestamp predates the
   * stored one is refused: an offline tab reconnecting hours later must not
   * roll back a plan the same person edited on their phone in the meantime.
   */
  async saveMealPlan(userId: string, input: Record<string, unknown>): Promise<MealPlanDocument | StaleWrite<MealPlanDocument>> {
    const values = normalizeMealPlanInput(input);
    const existing = await this.getMealPlan(userId);
    if (existing && existing.clientUpdatedAt > values.clientUpdatedAt) {
      return { stale: true, current: existing };
    }

    const row = await this.db.prepare(`
      INSERT INTO meal_plans (user_id, plan, up_next, client_updated_at, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        plan = excluded.plan,
        up_next = excluded.up_next,
        client_updated_at = excluded.client_updated_at,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `).bind(
      userId,
      JSON.stringify(values.mealPlan),
      JSON.stringify(values.upNext),
      values.clientUpdatedAt,
    ).first<Record<string, unknown>>();
    return row ? mealPlanFromRow(row) : { ...EMPTY_MEAL_PLAN, ...values };
  }

  async getGroceryList(userId: string): Promise<GroceryListDocument | null> {
    const row = await this.db
      .prepare('SELECT * FROM grocery_lists WHERE user_id = ?')
      .bind(userId)
      .first<Record<string, unknown>>();
    return row ? groceryListFromRow(row) : null;
  }

  async saveGroceryList(userId: string, input: Record<string, unknown>): Promise<GroceryListDocument | StaleWrite<GroceryListDocument>> {
    const values = normalizeGroceryListInput(input);
    const existing = await this.getGroceryList(userId);
    if (existing && existing.clientUpdatedAt > values.clientUpdatedAt) {
      return { stale: true, current: existing };
    }

    const row = await this.db.prepare(`
      INSERT INTO grocery_lists (user_id, items, last_generated_at, client_updated_at, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        items = excluded.items,
        last_generated_at = excluded.last_generated_at,
        client_updated_at = excluded.client_updated_at,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `).bind(
      userId,
      JSON.stringify(values.items),
      values.lastGeneratedAt,
      values.clientUpdatedAt,
    ).first<Record<string, unknown>>();
    return row ? groceryListFromRow(row) : { ...EMPTY_GROCERY_LIST, ...values };
  }
}
