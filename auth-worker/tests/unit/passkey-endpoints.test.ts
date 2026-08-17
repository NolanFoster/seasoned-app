import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '@/index';
import { PasskeyService } from '@/services/passkey-service';
import { JWTService } from '@/services/jwt-service';
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

function passkeyResponse(kind: 'create' | 'get' = 'get') {
  return kind === 'create'
    ? {
        id: 'AQI',
        rawId: 'AQI',
        type: 'public-key',
        response: { clientDataJSON: 'Y2xpZW50', attestationObject: 'YXR0ZXN0' },
      }
    : {
        id: 'AQI',
        rawId: 'AQI',
        type: 'public-key',
        response: { clientDataJSON: 'Y2xpZW50', authenticatorData: 'YXV0aA', signature: 'c2ln' },
      };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('Passkey endpoints', () => {
  let mockEnv: Env;
  let kv: Map<string, string>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    // @ts-expect-error Node.js crypto is only used by the Vitest environment.
    const { webcrypto } = await import('node:crypto');
    if (!(globalThis as any).crypto) (globalThis as any).crypto = webcrypto;
  });

  beforeEach(() => {
    kv = new Map();
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
      send_email: { send: vi.fn() },
      WEBAUTHN_RP_ID: 'localhost',
      WEBAUTHN_RP_NAME: 'Seasoned',
      WEBAUTHN_ORIGIN: 'http://localhost:5173',
    };

    generateRegistrationOptions.mockResolvedValue({
      challenge: 'Y2hhbGxlbmdl',
      rp: { id: 'localhost', name: 'Seasoned' },
      user: { id: 'dXNlcg', name: email, displayName: email },
      excludeCredentials: [],
    });
    generateAuthenticationOptions.mockResolvedValue({
      challenge: 'Y2hhbGxlbmdl',
      rpId: 'localhost',
      allowCredentials: [{ id: 'AQI', type: 'public-key' }],
      userVerification: 'required',
    });
    verifyRegistrationResponse.mockReset();
    verifyAuthenticationResponse.mockReset();

    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith(`/passkey-credentials/user/${userId}`)) return jsonResponse({ success: true, data: [] });
      if (url.endsWith('/passkey-credentials')) return jsonResponse({ success: true }, 201);
      return jsonResponse({ success: true, data: { status: 'ACTIVE' } });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  it('returns unauthorized when the registration user is no longer active', async () => {
    const token = await new JWTService(mockEnv).createToken(userId, email);
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: { status: 'SUSPENDED' } }));
    const response = await app.fetch(new Request('http://localhost/passkeys/register/begin', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.token}` },
    }), mockEnv);
    expect(response.status).toBe(401);
  });

  it('requires a JWT to begin registration', async () => {
    const response = await app.fetch(new Request('http://localhost/passkeys/register/begin', { method: 'POST' }), mockEnv);
    expect(response.status).toBe(401);
  });

  it('creates registration options and a one-time state', async () => {
    const token = await new JWTService(mockEnv).createToken(userId, email);
    const response = await app.fetch(new Request('http://localhost/passkeys/register/begin', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.token}` },
    }), mockEnv);
    const body = await response.json() as any;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.state).toMatch(/^[a-f0-9]{64}$/);
    expect(kv.size).toBe(1);
    expect(generateRegistrationOptions).toHaveBeenCalledWith(expect.objectContaining({
      rpID: 'localhost',
      userName: email,
      authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
    }));
  });

  it('returns an internal error for malformed registration JSON', async () => {
    const token = await new JWTService(mockEnv).createToken(userId, email);
    const response = await app.fetch(new Request('http://localhost/passkeys/register/complete', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.token}`, 'Content-Type': 'application/json' },
      body: '{',
    }), mockEnv);
    expect(response.status).toBe(500);
  });

  it('rejects malformed registration responses before consuming a challenge', async () => {
    const token = await new JWTService(mockEnv).createToken(userId, email);
    const response = await app.fetch(new Request('http://localhost/passkeys/register/complete', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'not-a-state', response: {} }),
    }), mockEnv);
    expect(response.status).toBe(400);
    expect(kv.size).toBe(0);
  });

  it('returns unauthorized when completing registration for a suspended user', async () => {
    const token = await new JWTService(mockEnv).createToken(userId, email);
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: { status: 'DELETED' } }));
    const response = await app.fetch(new Request('http://localhost/passkeys/register/complete', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'a'.repeat(64), response: passkeyResponse('create') }),
    }), mockEnv);
    expect(response.status).toBe(401);
  });

  it('verifies and stores a valid registration response', async () => {
    const token = await new JWTService(mockEnv).createToken(userId, email);
    const begin = await app.fetch(new Request('http://localhost/passkeys/register/begin', {
      method: 'POST', headers: { Authorization: `Bearer ${token.token}` },
    }), mockEnv);
    const { state } = await begin.json() as { state: string };
    verifyRegistrationResponse.mockResolvedValueOnce({
      verified: true,
      registrationInfo: {
        credentialID: Uint8Array.from([1, 2]),
        credentialPublicKey: Uint8Array.from([3, 4]),
        counter: 0,
        credentialDeviceType: 'singleDevice',
        credentialBackedUp: false,
      },
    });

    const response = await app.fetch(new Request('http://localhost/passkeys/register/complete', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, response: passkeyResponse('create') }),
    }), mockEnv);
    const body = await response.json() as any;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.credentialId).toBe('AQI');
    expect(kv.size).toBe(0);
    expect(fetchMock).toHaveBeenCalledWith('https://users.example.com/passkey-credentials', expect.objectContaining({ method: 'POST' }));
  });

  it('returns an internal error for malformed authentication JSON', async () => {
    const response = await app.fetch(new Request('http://localhost/passkeys/authenticate/begin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
    }), mockEnv);
    expect(response.status).toBe(500);
  });

  it('requires a valid email for authentication options', async () => {
    const response = await app.fetch(new Request('http://localhost/passkeys/authenticate/begin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'invalid' }),
    }), mockEnv);
    expect(response.status).toBe(400);
  });

  it('returns no-passkey when the email has no registered credential', async () => {
    const response = await app.fetch(new Request('http://localhost/passkeys/authenticate/begin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
    }), mockEnv);
    expect(response.status).toBe(404);
    expect((await response.json() as any).message).toMatch(/no passkey/i);
  });

  it('verifies authentication, advances the counter, and issues the existing JWT contract', async () => {
    const credentials = [{
      credential_id: 'AQI', user_id: userId, public_key: 'AwQ', counter: 0,
      device_type: 'singleDevice', backed_up: 0, transports: '["internal"]',
    }];
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith(`/passkey-credentials/user/${userId}`)) return jsonResponse({ success: true, data: credentials });
      if (url.endsWith('/passkey-credentials/AQI')) return jsonResponse({ success: true, data: credentials[0] });
      if (url.endsWith('/counter')) return jsonResponse({ success: true, data: { ...credentials[0], counter: 1 } });
      if (url.endsWith(`/users/${userId}`)) return jsonResponse({ success: true, data: { status: 'ACTIVE' } });
      if (url.endsWith('/login-history')) return jsonResponse({ success: true }, 201);
      return jsonResponse({ success: false }, 404);
    });
    const begin = await app.fetch(new Request('http://localhost/passkeys/authenticate/begin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
    }), mockEnv);
    const { state } = await begin.json() as { state: string };
    verifyAuthenticationResponse.mockResolvedValueOnce({ verified: true, authenticationInfo: { newCounter: 1 } });

    const response = await app.fetch(new Request('http://localhost/passkeys/authenticate/complete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, state, response: passkeyResponse() }),
    }), mockEnv);
    const body = await response.json() as any;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.token).toBeTruthy();
    expect(body.user).toEqual({ id: userId, email });
    expect(fetchMock).toHaveBeenCalledWith('https://users.example.com/passkey-credentials/AQI/counter', expect.objectContaining({ method: 'PATCH' }));
  });

  it('handles default configuration, transport parsing, and service authentication headers', async () => {
    const credentials = [
      { credential_id: 'AQI', user_id: userId, public_key: 'AwQ', counter: 0, device_type: 'singleDevice', backed_up: 0, transports: null },
      { credential_id: 'AQI', user_id: userId, public_key: 'AwQ', counter: 0, device_type: 'singleDevice', backed_up: 0, transports: 'not-json' },
      { credential_id: 'AQI', user_id: userId, public_key: 'AwQ', counter: 0, device_type: 'singleDevice', backed_up: 0, transports: '{}' },
      { credential_id: 'AQI', user_id: userId, public_key: 'AwQ', counter: 0, device_type: 'singleDevice', backed_up: 0, transports: '["internal"]' },
    ];
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: credentials }));
    const envWithDefaults = { ...mockEnv, WEBAUTHN_RP_ID: undefined, WEBAUTHN_RP_NAME: undefined, WEBAUTHN_ORIGIN: undefined, PASSKEY_SERVICE_TOKEN: 'DUMMY_TEST_SECRET_ONLY' };
    const result = await new PasskeyService(envWithDefaults).beginRegistration(userId, email);
    expect(result.success).toBe(true);
    expect(generateRegistrationOptions).toHaveBeenCalledWith(expect.objectContaining({ rpID: 'localhost', rpName: 'Seasoned' }));
    expect(fetchMock.mock.calls[0][1].headers.get('X-Internal-Auth')).toBe('DUMMY_TEST_SECRET_ONLY');
  });

  it('rejects missing, malformed, mismatched, and replayed challenge records', async () => {
    const service = new PasskeyService(mockEnv);
    const validState = 'a'.repeat(64);
    expect((await service.completeRegistration(userId, email, 'bad-state', passkeyResponse('create') as any)).success).toBe(false);
    expect((await service.completeRegistration(userId, email, validState, passkeyResponse('create') as any)).success).toBe(false);

    kv.set(`passkey:challenge:${validState}`, 'not-json');
    expect((await service.completeRegistration(userId, email, validState, passkeyResponse('create') as any)).success).toBe(false);

    kv.set(`passkey:challenge:${validState}`, JSON.stringify({ flow: 'authentication', challenge: 'c', userId }));
    expect((await service.completeRegistration(userId, email, validState, passkeyResponse('create') as any)).success).toBe(false);

    kv.set(`passkey:challenge:${validState}`, JSON.stringify({ flow: 'registration', challenge: 'c', userId: 'other-user' }));
    expect((await service.completeRegistration(userId, email, validState, passkeyResponse('create') as any)).success).toBe(false);
  });

  it('returns safe errors when registration verification or credential storage fails', async () => {
    const service = new PasskeyService(mockEnv);
    const state = 'b'.repeat(64);
    kv.set(`passkey:challenge:${state}`, JSON.stringify({ flow: 'registration', challenge: 'c', userId }));
    verifyRegistrationResponse.mockRejectedValueOnce(new Error('bad origin'));
    expect((await service.completeRegistration(userId, email, state, passkeyResponse('create') as any)).error).toMatch(/registration failed/i);

    kv.set(`passkey:challenge:${state}`, JSON.stringify({ flow: 'registration', challenge: 'c', userId }));
    verifyRegistrationResponse.mockResolvedValueOnce({ verified: false });
    expect((await service.completeRegistration(userId, email, state, passkeyResponse('create') as any)).success).toBe(false);

    kv.set(`passkey:challenge:${state}`, JSON.stringify({ flow: 'registration', challenge: 'c', userId }));
    verifyRegistrationResponse.mockResolvedValueOnce({ verified: true, registrationInfo: { credentialID: Uint8Array.from([1]), credentialPublicKey: Uint8Array.from([2]), counter: 0, credentialDeviceType: 'singleDevice', credentialBackedUp: false } });
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: false }, 409));
    expect((await service.completeRegistration(userId, email, state, passkeyResponse('create') as any)).error).toMatch(/save passkey/i);
  });

  it('rejects authentication when the credential, signature, counter, or account is invalid', async () => {
    const service = new PasskeyService(mockEnv);
    const state = 'c'.repeat(64);
    const baseCredential = { credential_id: 'AQI', user_id: userId, public_key: 'AwQ', counter: 2, device_type: 'singleDevice', backed_up: 0, transports: '[]' };
    const seed = () => kv.set(`passkey:challenge:${state}`, JSON.stringify({ flow: 'authentication', challenge: 'c', userId }));

    seed();
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: false }, 404));
    expect((await service.completeAuthentication(email, state, passkeyResponse() as any)).success).toBe(false);

    seed();
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: { ...baseCredential, user_id: 'other-user' } }));
    expect((await service.completeAuthentication(email, state, passkeyResponse() as any)).success).toBe(false);

    seed();
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: baseCredential }));
    verifyAuthenticationResponse.mockRejectedValueOnce(new Error('bad signature'));
    expect((await service.completeAuthentication(email, state, passkeyResponse() as any)).success).toBe(false);

    seed();
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: baseCredential }));
    verifyAuthenticationResponse.mockResolvedValueOnce({ verified: false });
    expect((await service.completeAuthentication(email, state, passkeyResponse() as any)).success).toBe(false);

    seed();
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: baseCredential }));
    verifyAuthenticationResponse.mockResolvedValueOnce({ verified: true, authenticationInfo: { newCounter: 2 } });
    expect((await service.completeAuthentication(email, state, passkeyResponse() as any)).success).toBe(false);
  });

  it('rejects counter races and suspended or deleted users after valid verification', async () => {
    const service = new PasskeyService(mockEnv);
    const state = 'd'.repeat(64);
    const credential = { credential_id: 'AQI', user_id: userId, public_key: 'AwQ', counter: 0, device_type: 'singleDevice', backed_up: 0, transports: '[]' };
    const seed = () => kv.set(`passkey:challenge:${state}`, JSON.stringify({ flow: 'authentication', challenge: 'c', userId }));

    seed();
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: credential }))
      .mockResolvedValueOnce(jsonResponse({ success: false }, 409));
    verifyAuthenticationResponse.mockResolvedValueOnce({ verified: true, authenticationInfo: { newCounter: 1 } });
    expect((await service.completeAuthentication(email, state, passkeyResponse() as any)).success).toBe(false);

    seed();
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: credential }))
      .mockResolvedValueOnce(jsonResponse({ success: true }))
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { status: 'SUSPENDED' } }));
    verifyAuthenticationResponse.mockResolvedValueOnce({ verified: true, authenticationInfo: { newCounter: 1 } });
    expect((await service.completeAuthentication(email, state, passkeyResponse() as any)).success).toBe(false);

    seed();
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: credential }))
      .mockResolvedValueOnce(jsonResponse({ success: true }))
      .mockResolvedValueOnce(jsonResponse({ success: false }, 404));
    verifyAuthenticationResponse.mockResolvedValueOnce({ verified: true, authenticationInfo: { newCounter: 1 } });
    expect((await service.completeAuthentication(email, state, passkeyResponse() as any)).success).toBe(false);
  });

  it('rejects malformed authentication responses', async () => {
    const response = await app.fetch(new Request('http://localhost/passkeys/authenticate/complete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, state: 'bad', response: {} }),
    }), mockEnv);
    expect(response.status).toBe(400);
  });
});
