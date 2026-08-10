import { SignJWT } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import app from '../../src/index';
import { UserDatabaseService } from '../../src/services/user-database';
import { DEFAULT_PROFILE, normalizeCulinaryProfile } from '../../src/services/culinary-profile';
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

describe('culinary profile foundation', () => {
  it('normalizes profile values and provides safe defaults', () => {
    expect(normalizeCulinaryProfile({ hard_allergens: ['Tree Nuts', 'tree_nuts'] })).toMatchObject({
      ...DEFAULT_PROFILE,
      hard_allergens: ['tree_nuts'],
    });
  });

  it('requires a verified Bearer JWT and never accepts a caller-supplied user id', async () => {
    const request = new Request('https://example.test/me/culinary-profile', {
      headers: { authorization: 'Bearer not-a-token' },
    });
    const response = await app.fetch(request, env());
    expect(response.status).toBe(401);
  });

  it('returns 404 when the feature kill switch is disabled', async () => {
    const request = new Request('https://example.test/me/culinary-profile');
    const response = await app.fetch(request, env({ CULINARY_PROFILE_ENABLED: 'false' }));
    expect(response.status).toBe(404);
  });

  it('upserts normalized profile values while preserving the authenticated id', async () => {
    const savedRow = {
      user_id: 'user-a',
      diet_tags: '[\"vegetarian\"]',
      hard_allergens: '[\"milk\"]',
      soft_avoids: '[]',
      cuisine_likes: '[\"thai\"]',
      cuisine_dislikes: '[]',
      spice_level: 3,
      skill_level: 'intermediate',
      default_servings: 2,
      max_cook_time_min: 30,
      equipment: '[\"stovetop\"]',
      nutrition_goals: '{\"focus\":null,\"targets\":{}}',
      units_pref: 'us',
      exclude_ingredients: '[]',
      notes_freeform: '',
      consent_flags: '{\"learn_from_activity\":false,\"share_anon_evals\":false}',
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    };
    const prepare = vi.fn()
      .mockReturnValueOnce({ bind: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(null) }) })
      .mockReturnValueOnce({ bind: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(savedRow) }) });
    const result = await new UserDatabaseService({ prepare } as never).upsertCulinaryProfile('user-a', {
      diet_tags: ['Vegetarian', 'vegetarian'],
      hard_allergens: ['Dairy'],
      default_servings: 2,
      max_cook_time_min: 30,
    });
    expect(result.success).toBe(true);
    expect(result.data?.diet_tags).toEqual(['vegetarian']);
    expect(result.data?.hard_allergens).toEqual(['milk']);
    expect(prepare.mock.calls[1][0]).toContain('ON CONFLICT(user_id)');
  });

  it('returns the authenticated user safe defaults before first save', async () => {
    const first = vi.fn().mockResolvedValue(null);
    const prepare = vi.fn().mockReturnValue({ bind: vi.fn().mockReturnValue({ first }) });
    const request = new Request('https://example.test/me/culinary-profile', {
      headers: { authorization: `Bearer ${await tokenFor('user-a')}` },
    });
    const response = await app.fetch(request, env({ USER_DB: { prepare } as never }));
    const body = JSON.parse(await response.json() as string) as { success: boolean; exists: boolean; data: { user_id: string; diet_tags: string[] } };
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, exists: false, data: { user_id: 'user-a', diet_tags: [] } });
  });
});
