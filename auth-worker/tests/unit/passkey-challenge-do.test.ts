import { describe, expect, it } from 'vitest';
import { PasskeyChallengeObject } from '@/passkey-challenge-do';

function createObject() {
  const values = new Map<string, unknown>();
  const state = {
    storage: {
      put: async (key: string, value: unknown) => { values.set(key, value); },
      get: async <T>(key: string) => values.get(key) as T | undefined,
      delete: async (key: string) => values.delete(key),
    },
  } as unknown as DurableObjectState;
  return new PasskeyChallengeObject(state);
}

const challenge = {
  challenge: 'Y2hhbGxlbmdl',
  flow: 'authentication',
  userId: 'user-id',
  expiresAt: Date.now() + 60_000,
};

describe('PasskeyChallengeObject', () => {
  it('stores and atomically claims a challenge once', async () => {
    const object = createObject();
    const store = await object.fetch(new Request('https://challenge/store', {
      method: 'POST', body: JSON.stringify(challenge),
    }));
    expect(store.status).toBe(200);

    const [first, second] = await Promise.all([
      object.fetch(new Request('https://challenge/claim', { method: 'POST' })),
      object.fetch(new Request('https://challenge/claim', { method: 'POST' })),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 404]);
  });

  it('rejects malformed and expired challenge records', async () => {
    const object = createObject();
    const malformed = await object.fetch(new Request('https://challenge/store', {
      method: 'POST', body: JSON.stringify({ flow: 'authentication' }),
    }));
    expect(malformed.status).toBe(400);

    const expired = await object.fetch(new Request('https://challenge/store', {
      method: 'POST', body: JSON.stringify({ ...challenge, expiresAt: Date.now() - 1 }),
    }));
    expect(expired.status).toBe(200);
    const claim = await object.fetch(new Request('https://challenge/claim', { method: 'POST' }));
    expect(claim.status).toBe(404);
  });

  it('returns not found for unsupported operations', async () => {
    const object = createObject();
    const response = await object.fetch(new Request('https://challenge/nope'));
    expect(response.status).toBe(404);
  });
});
