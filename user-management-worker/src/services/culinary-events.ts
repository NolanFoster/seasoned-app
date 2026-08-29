import type { D1Database } from '@cloudflare/workers-types';
import type {
  CreateCulinaryEventInput,
  CulinaryEvent,
  CulinaryEventType,
  InferredPreferences,
} from '../types/database';

const VALID_EVENT_TYPES: Set<CulinaryEventType> = new Set([
  'recipe_saved',
  'recipe_cooked_started',
  'recipe_cooked_completed',
  'recipe_elevated',
  'recipe_adapted',
  'planner_added',
  'feedback_rating',
  'feedback_tag',
  'generate_accepted',
  'generate_discarded',
]);

const EVENT_WEIGHTS: Record<CulinaryEventType, number> = {
  recipe_saved: 2.0,
  recipe_cooked_started: 1.5,
  recipe_cooked_completed: 3.0,
  recipe_elevated: 2.5,
  recipe_adapted: 2.5,
  planner_added: 1.5,
  feedback_rating: 3.0,
  feedback_tag: 2.0,
  generate_accepted: 1.0,
  generate_discarded: -1.5,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function validateCulinaryEventInput(input: unknown): string[] {
  if (!isRecord(input)) return ['Culinary event must be a JSON object'];
  const errors: string[] = [];

  const eventType = input.event_type || input.eventType;
  if (typeof eventType !== 'string' || !VALID_EVENT_TYPES.has(eventType as CulinaryEventType)) {
    errors.push(`event_type must be one of: ${Array.from(VALID_EVENT_TYPES).join(', ')}`);
  }

  const features = input.features;
  if (features !== undefined && !isRecord(features)) {
    errors.push('features must be an object');
  }

  return errors;
}

export function normalizeCulinaryEventRow(row: Record<string, unknown>): CulinaryEvent {
  let features = {};
  if (typeof row.features === 'string') {
    try {
      features = JSON.parse(row.features);
    } catch {
      features = {};
    }
  } else if (isRecord(row.features)) {
    features = row.features;
  }

  return {
    id: Number(row.id),
    user_id: String(row.user_id),
    event_type: String(row.event_type) as CulinaryEventType,
    recipe_id: row.recipe_id ? String(row.recipe_id) : null,
    recipe_name: row.recipe_name ? String(row.recipe_name) : null,
    features,
    created_at: String(row.created_at),
  };
}

export class CulinaryEventsService {
  constructor(private readonly db: D1Database) {}

  async recordEvent(userId: string, input: CreateCulinaryEventInput): Promise<CulinaryEvent | null> {
    const eventType = input.event_type;
    const recipeId = input.recipe_id ? String(input.recipe_id).trim().slice(0, 200) : null;
    const recipeName = input.recipe_name ? String(input.recipe_name).trim().slice(0, 300) : null;
    const features = input.features && isRecord(input.features) ? input.features : {};

    const result = await this.db.prepare(`
      INSERT INTO user_culinary_events (user_id, event_type, recipe_id, recipe_name, features)
      VALUES (?, ?, ?, ?, ?)
      RETURNING *
    `).bind(
      userId,
      eventType,
      recipeId,
      recipeName,
      JSON.stringify(features),
    ).first<Record<string, unknown>>();

    return result ? normalizeCulinaryEventRow(result) : null;
  }

  async listEvents(userId: string, limit = 100): Promise<CulinaryEvent[]> {
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const { results } = await this.db.prepare(`
      SELECT * FROM user_culinary_events
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).bind(userId, safeLimit).all<Record<string, unknown>>();

    return (results || []).map(normalizeCulinaryEventRow);
  }

  async deleteEvents(userId: string): Promise<number> {
    const result = await this.db.prepare(`
      DELETE FROM user_culinary_events WHERE user_id = ?
    `).bind(userId).run();
    return result.meta?.changes ?? 0;
  }

  async computeInferredPreferences(userId: string): Promise<InferredPreferences> {
    const events = await this.listEvents(userId, 150);
    const now = Date.now();

    const cuisineScores: Record<string, { score: number; count: number }> = {};
    const ingredientScores: Record<string, { score: number; count: number }> = {};
    const methodScores: Record<string, { score: number; count: number }> = {};
    const prepTimes: number[] = [];
    const cookTimes: number[] = [];
    const ratings: number[] = [];
    const tagsCount: Record<string, number> = {};

    for (const event of events) {
      const eventTime = new Date(event.created_at).getTime();
      const ageDays = Math.max(0, (now - eventTime) / (1000 * 60 * 60 * 24));
      // Exponential decay: half-life of 30 days
      const decay = Math.exp(-ageDays / 30);
      const baseWeight = EVENT_WEIGHTS[event.event_type] ?? 1.0;
      const weight = baseWeight * decay;

      const f = event.features || {};

      // Cuisines
      if (Array.isArray(f.cuisines)) {
        for (const c of f.cuisines) {
          if (typeof c === 'string' && c.trim()) {
            const key = c.trim().toLowerCase();
            cuisineScores[key] = cuisineScores[key] || { score: 0, count: 0 };
            cuisineScores[key].score += weight;
            cuisineScores[key].count += 1;
          }
        }
      }

      // Ingredients
      if (Array.isArray(f.key_ingredients)) {
        for (const ing of f.key_ingredients) {
          if (typeof ing === 'string' && ing.trim()) {
            const key = ing.trim().toLowerCase();
            ingredientScores[key] = ingredientScores[key] || { score: 0, count: 0 };
            ingredientScores[key].score += weight;
            ingredientScores[key].count += 1;
          }
        }
      }

      // Cooking methods
      if (Array.isArray(f.cooking_methods)) {
        for (const m of f.cooking_methods) {
          if (typeof m === 'string' && m.trim()) {
            const key = m.trim().toLowerCase();
            methodScores[key] = methodScores[key] || { score: 0, count: 0 };
            methodScores[key].score += weight;
            methodScores[key].count += 1;
          }
        }
      }

      // Timings
      if (typeof f.prep_time_min === 'number' && f.prep_time_min > 0) prepTimes.push(f.prep_time_min);
      if (typeof f.cook_time_min === 'number' && f.cook_time_min > 0) cookTimes.push(f.cook_time_min);

      // Feedback
      if (typeof f.rating === 'number' && f.rating >= 1 && f.rating <= 5) ratings.push(f.rating);
      if (Array.isArray(f.tags)) {
        for (const tag of f.tags) {
          if (typeof tag === 'string' && tag.trim()) {
            const t = tag.trim().toLowerCase();
            tagsCount[t] = (tagsCount[t] || 0) + 1;
          }
        }
      }
    }

    const sortTop = (record: Record<string, { score: number; count: number }>) =>
      Object.entries(record)
        .filter(([, v]) => v.score > 0)
        .map(([name, v]) => ({ name, score: Math.round(v.score * 10) / 10, count: v.count }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 8);

    const average = (arr: number[]) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);

    return {
      top_cuisines: sortTop(cuisineScores),
      top_ingredients: sortTop(ingredientScores),
      top_cooking_methods: sortTop(methodScores),
      avg_prep_time_min: average(prepTimes),
      avg_cook_time_min: average(cookTimes),
      feedback_summary: {
        average_rating: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
        tags_count: tagsCount,
      },
      total_events: events.length,
      recent_events_count: events.filter((e) => (now - new Date(e.created_at).getTime()) < 14 * 24 * 60 * 60 * 1000).length,
    };
  }
}
