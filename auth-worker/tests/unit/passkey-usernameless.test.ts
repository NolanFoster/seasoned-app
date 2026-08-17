import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '@/index';
import { decryptEmail, encryptEmail } from '@/utils/crypto';
import type { Env } from '@/types/env';

const { generateRegistrationOptions, generateAuthenticationOptions, verifyRegistrationResponse, verifyAuthenticationResponse } = vi.hoisted(() => ({
  generateRegistrationOptions: vi.fn(),
  generateAuthenticationOptions: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
}));

vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions,
  generateAuthenticationOptions,
  verifyRegistrationResponse,
  verifyAuthenticationResponse,
}));

const email = 'user@example.com';
const userId = 'b4c9a289323b21a01c3e940f150eb9b8c542587f1abfd8f0e1cc1ffc5e475514';
const encryptionKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));

function base64url(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** An assertion from a discoverable credential, which names its owner by user handle. */
function discoverableAssertion(handle: string | null = base64url(userId)) {
  return {
    id: 'AQI',
    rawId: 'AQI',
    type: 'public-key',
    response: {
      clientDataJSON: 'Y2xpZW50',
      authenticatorData: 'YXV0aA',
      signature: 'c2ln',
      ...(handle === null ? {} : { userHandle: handle }),
    },
  };
}

describe('Usernameless passkey sign-in', () => {
  let mockEnv: Env;
  let kv: Map<string, string>;
  let fetchMock: ReturnType<typeof vi.fn>;
  let storedEmail: string | null;

  beforeAll(async () => {
    // @ts-expect-error Node.js crypto is only used by the Vitest environment.
    const { webcrypto } = await import('node:crypto');
    if (!(globalThis as any).crypto) (globalThis as any).crypto = webcrypto;
  });

  beforeEach(async () => {
    kv = new Map();
    storedEmail = await encryptEmail(email, encryptionKey);
    mockEnv = {
      OTP_KV: {
        put: vi.fn(async (key: string, value: string) => { kv.set(key, value); }),
        get: vi.fn(async (key: string) => kv.get(key) ?? null),
        delete: vi.fn(async (key: string) => { kv.delete(key); }),
        list: vi.fn(),
        getWithMetadata: vi.fn(),
      } as unknown as KVNamespace,
      USER_MANAGEMENT_WORKER_URL: 'https://users.example.com',
      ENVIRONMENT: 'development',
      JWT_SECRET: 'DUMMY_JWT_SECRET_FOR_TESTS_ONLY_32',
      EMAIL_ENCRYPTION_KEY: encryptionKey,
      send_email: { send: vi.fn() },
      WEBAUTHN_RP_ID: 'localhost',
      WEBAUTHN_RP_NAME: 'Seasoned',
      WEBAUTHN_ORIGIN: 'http://localhost:5173',
    };

    generateAuthenticationOptions.mockResolvedValue({
      challenge: 'Y2hhbGxlbmdl',
      rpId: 'localhost',
      userVerification: 'required',
    });
    verifyAuthenticationResponse.mockReset();

    const credential = {
      credential_id: 'AQI', user_id: userId, public_key: 'AwQ', counter: 0,
      device_type: 'singleDevice', backed_up: 0, transports: '["internal"]',
    };
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith(`/passkey-credentials/user/${userId}`)) return jsonResponse({ success: true, data: [credential] });
      if (url.endsWith('/passkey-credentials/AQI')) return jsonResponse({ success: true, data: credential });
      if (url.endsWith('/counter')) return jsonResponse({ success: true, data: { ...credential, counter: 1 } });
      if (url.endsWith(`/users/${userId}`)) {
        return jsonResponse({ success: true, data: { status: 'ACTIVE', email_encrypted: storedEmail } });
      }
      if (url.endsWith('/login-history')) return jsonResponse({ success: true }, 201);
      return jsonResponse({ success: false }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  async function beginWithoutEmail(env: Env = mockEnv) {
    return app.fetch(new Request('http://localhost/passkeys/authenticate/begin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
    }), env);
  }

  it('signs in with no email by resolving the account from the user handle', async () => {
    const begin = await beginWithoutEmail();
    const { state } = await begin.json() as { state: string };
    expect(begin.status).toBe(200);
    // No account is known yet, so the options must not narrow the credential list.
    expect(generateAuthenticationOptions).toHaveBeenCalledWith(
      expect.not.objectContaining({ allowCredentials: expect.anything() }),
    );

    verifyAuthenticationResponse.mockResolvedValueOnce({ verified: true, authenticationInfo: { newCounter: 1 } });
    const response = await app.fetch(new Request('http://localhost/passkeys/authenticate/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, response: discoverableAssertion() }),
    }), mockEnv);
    const body = await response.json() as any;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.token).toBeTruthy();
    // The address comes back from storage, so the session is indistinguishable
    // from one created through the email-first flow.
    expect(body.user).toEqual({ id: userId, email });
  });

  it('rejects an assertion whose user handle is missing or not an account id', async () => {
    for (const handle of [null, base64url('not-a-user-id'), 'AQI']) {
      const { state } = await (await beginWithoutEmail()).json() as { state: string };
      verifyAuthenticationResponse.mockResolvedValueOnce({ verified: true, authenticationInfo: { newCounter: 1 } });
      const response = await app.fetch(new Request('http://localhost/passkeys/authenticate/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state, response: discoverableAssertion(handle) }),
      }), mockEnv);
      expect(response.status).toBe(400);
      expect((await response.json() as any).success).toBe(false);
    }
  });

  it('keeps the two flows from completing each other', async () => {
    // A challenge issued for a named account must not accept a bare assertion.
    const emailBegin = await app.fetch(new Request('http://localhost/passkeys/authenticate/begin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
    }), mockEnv);
    const emailState = (await emailBegin.json() as { state: string }).state;
    verifyAuthenticationResponse.mockResolvedValueOnce({ verified: true, authenticationInfo: { newCounter: 1 } });
    const withoutEmail = await app.fetch(new Request('http://localhost/passkeys/authenticate/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: emailState, response: discoverableAssertion() }),
    }), mockEnv);
    expect(withoutEmail.status).toBe(400);

    // And an unbound challenge must not be completed by naming an account.
    const openState = (await (await beginWithoutEmail()).json() as { state: string }).state;
    verifyAuthenticationResponse.mockResolvedValueOnce({ verified: true, authenticationInfo: { newCounter: 1 } });
    const withEmail = await app.fetch(new Request('http://localhost/passkeys/authenticate/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, state: openState, response: discoverableAssertion() }),
    }), mockEnv);
    expect(withEmail.status).toBe(400);
  });

  it('asks for the email when the account has no stored address', async () => {
    storedEmail = null;
    const { state } = await (await beginWithoutEmail()).json() as { state: string };
    verifyAuthenticationResponse.mockResolvedValueOnce({ verified: true, authenticationInfo: { newCounter: 1 } });

    const response = await app.fetch(new Request('http://localhost/passkeys/authenticate/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, response: discoverableAssertion() }),
    }), mockEnv);

    expect(response.status).toBe(400);
    expect((await response.json() as any).message).toMatch(/email address/i);
    // The counter must survive so the email-first retry still verifies.
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/counter'), expect.anything());
  });

  it('reports an unconfigured deployment instead of prompting for a passkey', async () => {
    const response = await beginWithoutEmail({ ...mockEnv, EMAIL_ENCRYPTION_KEY: undefined });
    expect(response.status).toBe(503);
    expect((await response.json() as any).message).toMatch(/not configured/i);
  });

  it('still accepts an email for credentials registered before discoverability', async () => {
    const begin = await app.fetch(new Request('http://localhost/passkeys/authenticate/begin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
    }), mockEnv);
    const { state } = await begin.json() as { state: string };
    verifyAuthenticationResponse.mockResolvedValueOnce({ verified: true, authenticationInfo: { newCounter: 1 } });

    const response = await app.fetch(new Request('http://localhost/passkeys/authenticate/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, state, response: discoverableAssertion(null) }),
    }), mockEnv);

    expect(response.status).toBe(200);
    expect((await response.json() as any).user).toEqual({ id: userId, email });
  });

  it('backfills the address during an email-first sign-in so the next one needs no email', async () => {
    storedEmail = null;
    const begin = await app.fetch(new Request('http://localhost/passkeys/authenticate/begin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
    }), mockEnv);
    const { state } = await begin.json() as { state: string };
    verifyAuthenticationResponse.mockResolvedValueOnce({ verified: true, authenticationInfo: { newCounter: 1 } });

    const response = await app.fetch(new Request('http://localhost/passkeys/authenticate/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, state, response: discoverableAssertion(null) }),
    }), mockEnv);
    expect(response.status).toBe(200);

    const stored = fetchMock.mock.calls.find(
      (call: any[]) => String(call[0]).endsWith(`/users/${userId}`) && call[1]?.method === 'PUT',
    );
    expect(stored).toBeTruthy();
    const written = JSON.parse(String(stored![1].body)).email_encrypted;
    expect(await decryptEmail(written, encryptionKey)).toBe(email);
  });

  it('rejects a malformed email rather than treating it as usernameless', async () => {
    const response = await app.fetch(new Request('http://localhost/passkeys/authenticate/begin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'not-an-email' }),
    }), mockEnv);
    expect(response.status).toBe(400);
  });
});

describe('Email encryption', () => {
  beforeAll(async () => {
    // @ts-expect-error Node.js crypto is only used by the Vitest environment.
    const { webcrypto } = await import('node:crypto');
    if (!(globalThis as any).crypto) (globalThis as any).crypto = webcrypto;
  });

  it('round-trips an address and normalises it', async () => {
    const encrypted = await encryptEmail('  User@Example.COM ', encryptionKey);
    expect(encrypted).not.toContain('user@example.com');
    expect(await decryptEmail(encrypted, encryptionKey)).toBe('user@example.com');
  });

  it('produces a different ciphertext each time', async () => {
    const first = await encryptEmail(email, encryptionKey);
    const second = await encryptEmail(email, encryptionKey);
    expect(first).not.toBe(second);
    expect(await decryptEmail(second, encryptionKey)).toBe(email);
  });

  it('returns null for a tampered value, a wrong key, or a short payload', async () => {
    const encrypted = await encryptEmail(email, encryptionKey);
    const tampered = btoa(atob(encrypted).slice(0, -1) + ' ');
    const otherKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(9)));

    expect(await decryptEmail(tampered, encryptionKey)).toBeNull();
    expect(await decryptEmail(encrypted, otherKey)).toBeNull();
    expect(await decryptEmail(btoa('short'), encryptionKey)).toBeNull();
    expect(await decryptEmail('not base64!', encryptionKey)).toBeNull();
  });

  it('rejects a key that is not 32 bytes', async () => {
    await expect(encryptEmail(email, btoa('too-short'))).rejects.toThrow(/32 bytes/);
  });
});
