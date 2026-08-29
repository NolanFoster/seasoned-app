import { SignJWT } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import app from '../../src/index';
import { CulinaryEventsService, validateCulinaryEventInput } from '../../src/services/culinary-events';
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
    CULINARY_PROFILE_ENABLED: 'true',
    USER_DB: { prepare: vi.fn() } as never,
    ...overrides,
  };
}

describe('CulinaryEventsService and preference learning', () => {
  it('validates event input', () => {
    expect(validateCulinaryEventInput(null)).toEqual(['Culinary event must be a JSON object']);
    expect(validateCulinaryEventInput({ event_type: 'invalid_event' })).toContain('event_type must be one of: recipe_saved, recipe_cooked_started, recipe_cooked_completed, recipe_elevated, recipe_adapted, planner_added, feedback_rating, feedback_tag, generate_accepted, generate_discarded');
    expect(validateCulinaryEventInput({ event_type: 'recipe_saved', features: 'not_an_object' })).toContain('features must be an object');
    expect(validateCulinaryEventInput({ event_type: 'recipe_saved', features: { cuisines: ['thai'] } })).toEqual([]);
  });

  it('computes inferred preferences with exponential decay weighting', async () => {
    const mockEvents = [
      {
        id: 1,
        user_id: 'user-1',
        event_type: 'recipe_cooked_completed',
        recipe_id: 'recipe-1',
        recipe_name: 'Pad Thai',
        features: JSON.stringify({
          cuisines: ['Thai', 'Asian'],
          key_ingredients: ['Rice Noodles', 'Tofu', 'Peanuts'],
          cooking_methods: ['stir_fry'],
          prep_time_min: 15,
          cook_time_min: 15,
        }),
        created_at: new Date().toISOString(),
      },
      {
        id: 2,
        user_id: 'user-1',
        event_type: 'feedback_rating',
        recipe_id: 'recipe-1',
        recipe_name: 'Pad Thai',
        features: JSON.stringify({
          rating: 5,
          tags: ['loved_flavor', 'quick'],
        }),
        created_at: new Date().toISOString(),
      },
      {
        id: 3,
        user_id: 'user-1',
        event_type: 'recipe_saved',
        recipe_id: 'recipe-2',
        recipe_name: 'Green Curry',
        features: JSON.stringify({
          cuisines: ['Thai'],
          key_ingredients: ['Coconut Milk', 'Tofu'],
          cooking_methods: ['simmer'],
          prep_time_min: 10,
          cook_time_min: 20,
        }),
        created_at: new Date().toISOString(),
      },
    ];

    const prepare = vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({ results: mockEvents }),
      }),
    });

    const service = new CulinaryEventsService({ prepare } as never);
    const prefs = await service.computeInferredPreferences('user-1');

    expect(prefs.total_events).toBe(3);
    expect(prefs.top_cuisines[0].name).toBe('thai');
    expect(prefs.top_cuisines[0].score).toBeGreaterThan(0);
    expect(prefs.top_ingredients.map((i) => i.name)).toContain('tofu');
    expect(prefs.feedback_summary.average_rating).toBe(5);
    expect(prefs.feedback_summary.tags_count['loved_flavor']).toBe(1);
  });

  it('endpoint ignores event recording when learn_from_activity is false in profile', async () => {
    const profileRow = {
      user_id: 'user-1',
      diet_tags: '[]',
      hard_allergens: '[]',
      soft_avoids: '[]',
      cuisine_likes: '[]',
      cuisine_dislikes: '[]',
      spice_level: 2,
      skill_level: 'intermediate',
      default_servings: 4,
      max_cook_time_min: 60,
      equipment: '[]',
      nutrition_goals: '{}',
      units_pref: 'us',
      exclude_ingredients: '[]',
      notes_freeform: '',
      consent_flags: JSON.stringify({ learn_from_activity: false, share_anon_evals: false }),
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    };

    const prepare = vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(profileRow),
      }),
    });

    const token = await tokenFor('user-1');
    const request = new Request('https://example.test/me/culinary-events', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        event_type: 'recipe_saved',
        recipe_id: 'rec-1',
        recipe_name: 'Soup',
      }),
    });

    const response = await app.fetch(request, env({ USER_DB: { prepare } as never }));
    expect(response.status).toBe(200);
    const rawBody = await response.json();
    const body = (typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody) as { success: boolean; recorded: boolean };
    expect(body.recorded).toBe(false);
  });
});
