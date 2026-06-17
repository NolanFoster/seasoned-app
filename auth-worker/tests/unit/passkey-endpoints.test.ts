import { describe, it, expect, beforeEach, vi } from 'vitest';
import app from '../../src/index';
import { JWTService } from '../../src/services/jwt-service';

// --- Mocks ---

vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: vi.fn().mockResolvedValue({
    challenge: 'mock-challenge-base64url',
    rp: { id: 'localhost', name: 'Seasoned' },
    user: { id: 'dXNlcklk', name: 'test@example.com', displayName: 'test@example.com' },
    pubKeyCredParams: [],
    timeout: 60000,
    excludeCredentials: [],
    authenticatorSelection: {},
    attestation: 'none',
  }),
  verifyRegistrationResponse: vi.fn().mockResolvedValue({
    verified: true,
    registrationInfo: {
      credential: {
        id: 'cred-id-base64url',
        publicKey: new Uint8Array([1, 2, 3, 4]),
        counter: 0,
        transports: ['internal'],
      },
      credentialDeviceType: 'singleDevice',
      credentialBackedUp: false,
    },
  }),
  generateAuthenticationOptions: vi.fn().mockResolvedValue({
    challenge: 'mock-auth-challenge-base64url',
    rpId: 'localhost',
    allowCredentials: [],
    userVerification: 'preferred',
    timeout: 60000,
  }),
  verifyAuthenticationResponse: vi.fn().mockResolvedValue({
    verified: true,
    authenticationInfo: {
      credentialID: 'cred-id-base64url',
      newCounter: 1,
      userVerified: true,
      credentialDeviceType: 'singleDevice',
      credentialBackedUp: false,
      origin: 'http://localhost:5173',
      rpID: 'localhost',
    },
  }),
}));

// --- Shared fixtures ---

const JWT_SECRET = 'test-secret-key-for-jwt-signing-32-chars-long';
const UM_URL = 'http://localhost:8788';

function makeEnv(kvOverrides = {}) {
  return {
    OTP_KV: {
      get: vi.fn(),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      ...kvOverrides,
    } as any,
    USER_MANAGEMENT_WORKER_URL: UM_URL,
    ENVIRONMENT: 'preview' as const,
    JWT_SECRET,
    FROM_EMAIL: 'test@example.com',
    WEBAUTHN_RP_ID: 'localhost',
    WEBAUTHN_RP_NAME: 'Seasoned',
    WEBAUTHN_ORIGIN: 'http://localhost:5173',
    send_email: { send: vi.fn().mockResolvedValue(undefined) },
  };
}

async function makeValidToken(env: ReturnType<typeof makeEnv>) {
  const svc = new JWTService(env);
  const result = await svc.createToken('user-email-hash', 'user@example.com', 604800);
  return result.token!;
}

function mockFetch(...responses: Array<{ ok: boolean; status?: number; body: unknown }>) {
  let call = 0;
  return vi.fn().mockImplementation(async () => {
    const r = responses[Math.min(call++, responses.length - 1)];
    return {
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 500),
      json: async () => r.body,
    };
  });
}

// Stored passkey credential returned by user-management-worker
const STORED_CRED = {
  credential_id: 'cred-id-base64url',
  user_id: 'user-email-hash',
  // base64url of Uint8Array([1,2,3,4])
  public_key: 'AQID',
  counter: 0,
  device_type: 'singleDevice',
  backed_up: 0,
  transports: '["internal"]',
};

// -------------------------------------------------------------------
// /passkeys/register/begin
// -------------------------------------------------------------------

describe('POST /passkeys/register/begin', () => {
  it('returns 401 when no Authorization header', async () => {
    const env = makeEnv();
    const req = new Request('http://localhost/passkeys/register/begin', { method: 'POST' });
    const res = await app.fetch(req, env);
    expect(res.status).toBe(401);
    const body = await res.json() as any;
    expect(body.success).toBe(false);
  });

  it('returns 401 when token is invalid', async () => {
    const env = makeEnv();
    const req = new Request('http://localhost/passkeys/register/begin', {
      method: 'POST',
      headers: { Authorization: 'Bearer bad.token.here' },
    });
    const res = await app.fetch(req, env);
    expect(res.status).toBe(401);
  });

  it('returns 200 with registration options when authenticated', async () => {
    const env = makeEnv();
    const token = await makeValidToken(env);

    vi.stubGlobal('fetch', mockFetch(
      // GET /passkey-credentials/user/:id → no existing creds
      { ok: true, body: { success: true, data: [] } },
    ));

    const req = new Request('http://localhost/passkeys/register/begin', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const res = await app.fetch(req, env);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.options).toBeDefined();
    expect(env.OTP_KV.put).toHaveBeenCalledWith(
      expect.stringContaining('passkey:reg:'),
      expect.any(String),
      { expirationTtl: 300 }
    );

    vi.unstubAllGlobals();
  });
});

// -------------------------------------------------------------------
// /passkeys/register/complete
// -------------------------------------------------------------------

describe('POST /passkeys/register/complete', () => {
  it('returns 401 with no auth', async () => {
    const env = makeEnv();
    const req = new Request('http://localhost/passkeys/register/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response: {} }),
    });
    const res = await app.fetch(req, env);
    expect(res.status).toBe(401);
  });

  it('returns 400 when response body is missing', async () => {
    const env = makeEnv();
    const token = await makeValidToken(env);

    const req = new Request('http://localhost/passkeys/register/complete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });
    const res = await app.fetch(req, env);
    expect(res.status).toBe(400);
  });

  it('returns 400 when challenge not found in KV', async () => {
    const env = makeEnv({ get: vi.fn().mockResolvedValue(null) });
    const token = await makeValidToken(env);

    const req = new Request('http://localhost/passkeys/register/complete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ response: { id: 'x', rawId: 'x', type: 'public-key', response: {} } }),
    });
    const res = await app.fetch(req, env);
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.success).toBe(false);
    expect(body.message).toContain('expired');
  });

  it('returns 200 and stores credential on valid registration', async () => {
    const storedChallenge = JSON.stringify({
      challenge: 'mock-challenge-base64url',
      userId: 'user-email-hash',
      email: 'user@example.com',
    });
    const env = makeEnv({ get: vi.fn().mockResolvedValue(storedChallenge) });
    const token = await makeValidToken(env);

    vi.stubGlobal('fetch', mockFetch(
      // POST /passkey-credentials
      { ok: true, status: 201, body: { success: true, data: STORED_CRED } },
    ));

    const req = new Request('http://localhost/passkeys/register/complete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        response: { id: 'cred-id', rawId: 'cred-id', type: 'public-key', response: {} },
      }),
    });
    const res = await app.fetch(req, env);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.credential).toBeDefined();
    expect(body.credential.credentialId).toBe('cred-id-base64url');

    vi.unstubAllGlobals();
  });
});

// -------------------------------------------------------------------
// /passkeys/authenticate/begin
// -------------------------------------------------------------------

describe('POST /passkeys/authenticate/begin', () => {
  it('returns options without email (discoverable flow)', async () => {
    const env = makeEnv();
    const req = new Request('http://localhost/passkeys/authenticate/begin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const res = await app.fetch(req, env);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.options).toBeDefined();
    expect(body.sessionToken).toBeDefined();
    expect(typeof body.sessionToken).toBe('string');
  });

  it('returns 404 when no passkeys registered for email', async () => {
    const env = makeEnv();
    vi.stubGlobal('fetch', mockFetch(
      { ok: true, body: { success: true, data: [] } },
    ));

    const req = new Request('http://localhost/passkeys/authenticate/begin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com' }),
    });
    const res = await app.fetch(req, env);
    expect(res.status).toBe(404);
    const body = await res.json() as any;
    expect(body.success).toBe(false);

    vi.unstubAllGlobals();
  });

  it('returns options with allowCredentials when email has passkeys', async () => {
    const env = makeEnv();
    vi.stubGlobal('fetch', mockFetch(
      { ok: true, body: { success: true, data: [STORED_CRED] } },
    ));

    const req = new Request('http://localhost/passkeys/authenticate/begin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com' }),
    });
    const res = await app.fetch(req, env);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.sessionToken).toBeDefined();
    expect(env.OTP_KV.put).toHaveBeenCalledWith(
      expect.stringContaining('passkey:auth:'),
      expect.any(String),
      { expirationTtl: 300 }
    );

    vi.unstubAllGlobals();
  });
});

// -------------------------------------------------------------------
// /passkeys/authenticate/complete
// -------------------------------------------------------------------

describe('POST /passkeys/authenticate/complete', () => {
  it('returns 400 when sessionToken is missing', async () => {
    const env = makeEnv();
    const req = new Request('http://localhost/passkeys/authenticate/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response: {} }),
    });
    const res = await app.fetch(req, env);
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.success).toBe(false);
    expect(body.message).toContain('sessionToken');
  });

  it('returns 400 when response is missing', async () => {
    const env = makeEnv();
    const req = new Request('http://localhost/passkeys/authenticate/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionToken: 'abc123' }),
    });
    const res = await app.fetch(req, env);
    expect(res.status).toBe(400);
  });

  it('returns 400 when challenge not found in KV', async () => {
    const env = makeEnv({ get: vi.fn().mockResolvedValue(null) });
    const req = new Request('http://localhost/passkeys/authenticate/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionToken: 'expired-token',
        response: { id: 'cred-id-base64url', type: 'public-key', response: {} },
      }),
    });
    const res = await app.fetch(req, env);
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.success).toBe(false);
  });

  it('returns 400 when credential is not found', async () => {
    const storedChallenge = JSON.stringify({
      challenge: 'mock-auth-challenge-base64url',
      userId: 'user-email-hash',
    });
    const env = makeEnv({ get: vi.fn().mockResolvedValue(storedChallenge) });

    vi.stubGlobal('fetch', mockFetch(
      // GET /passkey-credentials/:id → not found
      { ok: false, status: 404, body: { success: false, message: 'Not found' } },
    ));

    const req = new Request('http://localhost/passkeys/authenticate/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionToken: 'valid-session-token',
        response: { id: 'cred-id-base64url', type: 'public-key', response: {} },
      }),
    });
    const res = await app.fetch(req, env);
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.success).toBe(false);

    vi.unstubAllGlobals();
  });

  it('returns 200 with JWT on successful authentication', async () => {
    const storedChallenge = JSON.stringify({
      challenge: 'mock-auth-challenge-base64url',
      userId: 'user-email-hash',
    });
    const env = makeEnv({ get: vi.fn().mockResolvedValue(storedChallenge) });

    vi.stubGlobal('fetch', mockFetch(
      // GET /passkey-credentials/:id
      { ok: true, body: { success: true, data: STORED_CRED } },
      // PATCH /passkey-credentials/:id/counter
      { ok: true, body: { success: true, data: { ...STORED_CRED, counter: 1 } } },
      // GET /users/:user_id
      { ok: true, body: { success: true, data: { user_id: 'user-email-hash', email_encrypted: 'user@example.com' } } },
      // POST /login-history (best-effort, fires and forgets)
      { ok: true, body: { success: true } },
    ));

    const req = new Request('http://localhost/passkeys/authenticate/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionToken: 'valid-session-token',
        response: { id: 'cred-id-base64url', type: 'public-key', response: {} },
      }),
    });
    const res = await app.fetch(req, env);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.token).toBeDefined();
    expect(body.expiresIn).toBe(604800);
    expect(body.user).toBeDefined();
    expect(body.user.id).toBe('user-email-hash');

    vi.unstubAllGlobals();
  });

  it('returns 400 when user_id mismatch detected', async () => {
    const storedChallenge = JSON.stringify({
      challenge: 'mock-auth-challenge-base64url',
      userId: 'different-user-hash', // mismatch
    });
    const env = makeEnv({ get: vi.fn().mockResolvedValue(storedChallenge) });

    vi.stubGlobal('fetch', mockFetch(
      { ok: true, body: { success: true, data: STORED_CRED } }, // returns user-email-hash
    ));

    const req = new Request('http://localhost/passkeys/authenticate/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionToken: 'valid-session-token',
        response: { id: 'cred-id-base64url', type: 'public-key', response: {} },
      }),
    });
    const res = await app.fetch(req, env);
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.success).toBe(false);

    vi.unstubAllGlobals();
  });

  it('returns 400 when WebAuthn verification fails', async () => {
    const { verifyAuthenticationResponse } = await import('@simplewebauthn/server');
    vi.mocked(verifyAuthenticationResponse).mockResolvedValueOnce({
      verified: false,
      authenticationInfo: {} as any,
    });

    const storedChallenge = JSON.stringify({
      challenge: 'mock-auth-challenge-base64url',
      userId: 'user-email-hash',
    });
    const env = makeEnv({ get: vi.fn().mockResolvedValue(storedChallenge) });

    vi.stubGlobal('fetch', mockFetch(
      { ok: true, body: { success: true, data: STORED_CRED } },
    ));

    const req = new Request('http://localhost/passkeys/authenticate/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionToken: 'valid-session-token',
        response: { id: 'cred-id-base64url', type: 'public-key', response: {} },
      }),
    });
    const res = await app.fetch(req, env);
    expect(res.status).toBe(400);

    vi.unstubAllGlobals();
  });

  it('returns 400 when counter regression is detected', async () => {
    const { verifyAuthenticationResponse } = await import('@simplewebauthn/server');
    vi.mocked(verifyAuthenticationResponse).mockResolvedValueOnce({
      verified: true,
      authenticationInfo: {
        credentialID: 'cred-id-base64url',
        newCounter: 1, // equal to stored counter → regression
        userVerified: true,
        credentialDeviceType: 'singleDevice' as any,
        credentialBackedUp: false,
        origin: 'http://localhost:5173',
        rpID: 'localhost',
      },
    });

    const credWithCounter = { ...STORED_CRED, counter: 5 }; // stored > new
    const storedChallenge = JSON.stringify({
      challenge: 'mock-auth-challenge-base64url',
      userId: 'user-email-hash',
    });
    const env = makeEnv({ get: vi.fn().mockResolvedValue(storedChallenge) });

    vi.stubGlobal('fetch', mockFetch(
      { ok: true, body: { success: true, data: credWithCounter } },
    ));

    const req = new Request('http://localhost/passkeys/authenticate/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionToken: 'valid-session-token',
        response: { id: 'cred-id-base64url', type: 'public-key', response: {} },
      }),
    });
    const res = await app.fetch(req, env);
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.message).toContain('Counter regression');

    vi.unstubAllGlobals();
  });

  it('returns 200 with empty email when user lookup fails', async () => {
    const storedChallenge = JSON.stringify({
      challenge: 'mock-auth-challenge-base64url',
      userId: null,
    });
    const env = makeEnv({ get: vi.fn().mockResolvedValue(storedChallenge) });

    vi.stubGlobal('fetch', mockFetch(
      // GET /passkey-credentials/:id → success
      { ok: true, body: { success: true, data: STORED_CRED } },
      // PATCH counter → success
      { ok: true, body: { success: true, data: { ...STORED_CRED, counter: 1 } } },
      // GET /users/:user_id → not found
      { ok: false, status: 404, body: { success: false } },
      // POST /login-history
      { ok: true, body: { success: true } },
    ));

    const req = new Request('http://localhost/passkeys/authenticate/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionToken: 'valid-session-token',
        response: { id: 'cred-id-base64url', type: 'public-key', response: {} },
      }),
    });
    const res = await app.fetch(req, env);
    // Should still succeed — email falls back to empty string
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.token).toBeDefined();

    vi.unstubAllGlobals();
  });
});
