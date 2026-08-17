import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticatorDevice,
  AuthenticatorTransportFuture,
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/types';
import { Env } from '../types/env';
import { decryptEmail, encryptEmail, generateSecureToken, hashEmail } from '../utils/crypto';

const CHALLENGE_TTL_SECONDS = 300;
const PASSKEY_TOKEN_TTL_SECONDS = 604800;
const DEFAULT_RP_ID = 'localhost';
const DEFAULT_RP_NAME = 'Seasoned';
const DEFAULT_ORIGIN = 'http://localhost:5173';

interface StoredChallenge {
  challenge: string;
  flow: 'registration' | 'authentication';
  userId: string;
  expiresAt?: number;
}

interface PasskeyCredentialRecord {
  credential_id: string;
  user_id: string;
  public_key: string;
  counter: number;
  device_type: 'singleDevice' | 'multiDevice';
  backed_up: number | boolean;
  transports?: string | null;
}

interface UserRecord {
  status?: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  email_encrypted?: string | null;
}

// A discoverable-credential challenge is not bound to a user: the account is
// only known once the authenticator returns a user handle. The empty string
// marks that state so a discoverable assertion can never satisfy a challenge
// that was issued for a specific account, or the reverse.
const DISCOVERABLE_CHALLENGE_USER = '';

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid base64url value');
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function parseTransports(value: string | null | undefined): AuthenticatorTransportFuture[] | undefined {
  if (!value) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')
      ? parsed as AuthenticatorTransportFuture[]
      : undefined;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isRegistrationResponse(value: unknown): value is RegistrationResponseJSON {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.rawId !== 'string' || typeof value.type !== 'string') {
    return false;
  }
  const response = value.response;
  return isRecord(response) && typeof response.clientDataJSON === 'string' && typeof response.attestationObject === 'string';
}

export function isAuthenticationResponse(value: unknown): value is AuthenticationResponseJSON {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.rawId !== 'string' || typeof value.type !== 'string') {
    return false;
  }
  const response = value.response;
  return isRecord(response) && typeof response.clientDataJSON === 'string' &&
    typeof response.authenticatorData === 'string' && typeof response.signature === 'string';
}

export class PasskeyService {
  constructor(private readonly env: Env) {
    if (env.ENVIRONMENT !== 'development') {
      if (!env.WEBAUTHN_RP_ID || !env.WEBAUTHN_ORIGIN || !env.PASSKEY_SERVICE_TOKEN || !env.PASSKEY_CHALLENGE_DO) {
        throw new Error('WebAuthn RP, service-token, and challenge storage configuration are required outside development');
      }
      const userManagementUrl = new URL(env.USER_MANAGEMENT_WORKER_URL);
      if (userManagementUrl.protocol !== 'https:') {
        throw new Error('User management URL must use HTTPS outside development');
      }
      const origin = new URL(env.WEBAUTHN_ORIGIN);
      if (origin.protocol !== 'https:' || env.WEBAUTHN_RP_ID === 'localhost') {
        throw new Error('WebAuthn production configuration must use HTTPS and a non-localhost RP ID');
      }
      if (origin.hostname !== env.WEBAUTHN_RP_ID && !origin.hostname.endsWith(`.${env.WEBAUTHN_RP_ID}`)) {
        throw new Error('WebAuthn RP ID must match the configured origin');
      }
    }
  }

  private get rpId(): string {
    return this.env.WEBAUTHN_RP_ID || DEFAULT_RP_ID;
  }

  private get rpName(): string {
    return this.env.WEBAUTHN_RP_NAME || DEFAULT_RP_NAME;
  }

  private get origin(): string {
    return this.env.WEBAUTHN_ORIGIN || DEFAULT_ORIGIN;
  }

  private serviceHeaders(contentType = false): HeadersInit {
    const headers: Record<string, string> = {};
    if (contentType) headers['Content-Type'] = 'application/json';
    if (this.env.PASSKEY_SERVICE_TOKEN) headers['X-Internal-Auth'] = this.env.PASSKEY_SERVICE_TOKEN;
    return headers;
  }

  private async userManagement(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    const serviceHeaders = this.serviceHeaders(init.body !== undefined);
    Object.entries(serviceHeaders).forEach(([name, value]) => headers.set(name, value));
    return fetch(`${this.env.USER_MANAGEMENT_WORKER_URL}${path}`, { ...init, headers });
  }

  private async getCredentials(userId: string): Promise<PasskeyCredentialRecord[]> {
    const response = await this.userManagement(`/passkey-credentials/user/${encodeURIComponent(userId)}`);
    if (!response.ok) return [];
    const body = await response.json() as { success?: boolean; data?: PasskeyCredentialRecord[] };
    return body.success && Array.isArray(body.data) ? body.data : [];
  }

  private async storeChallenge(state: string, challenge: StoredChallenge): Promise<void> {
    if (this.env.PASSKEY_CHALLENGE_DO) {
      const objectId = this.env.PASSKEY_CHALLENGE_DO.idFromName(state);
      const response = await this.env.PASSKEY_CHALLENGE_DO.get(objectId).fetch('https://passkey-challenge/store', {
        method: 'POST',
        body: JSON.stringify({ ...challenge, expiresAt: Date.now() + CHALLENGE_TTL_SECONDS * 1000 }),
      });
      if (!response.ok) throw new Error('Unable to store passkey challenge');
      return;
    }

    // KV is retained only for local development, where a Durable Object is not
    // normally provisioned. Production and deployed preview/staging must use
    // the atomic Durable Object claim path.
    if (this.env.ENVIRONMENT !== 'development') throw new Error('Passkey challenge storage is not configured');
    await this.env.OTP_KV.put(`passkey:challenge:${state}`, JSON.stringify({ ...challenge, expiresAt: Date.now() + CHALLENGE_TTL_SECONDS * 1000 }), { expirationTtl: CHALLENGE_TTL_SECONDS });
  }

  private async consumeChallenge(state: string, flow: StoredChallenge['flow']): Promise<StoredChallenge | null> {
    if (!/^[a-f0-9]{64}$/.test(state)) return null;

    if (this.env.PASSKEY_CHALLENGE_DO) {
      const objectId = this.env.PASSKEY_CHALLENGE_DO.idFromName(state);
      const response = await this.env.PASSKEY_CHALLENGE_DO.get(objectId).fetch('https://passkey-challenge/claim', { method: 'POST' });
      if (!response.ok) return null;
      const body = await response.json() as { success?: boolean; data?: StoredChallenge };
      const stored = body.success ? body.data : undefined;
      return stored && stored.flow === flow && typeof stored.challenge === 'string' && typeof stored.userId === 'string' &&
        (!stored.expiresAt || stored.expiresAt > Date.now())
        ? stored
        : null;
    }

    if (this.env.ENVIRONMENT !== 'development') return null;
    const key = `passkey:challenge:${state}`;
    const raw = await this.env.OTP_KV.get(key);
    // Local KV fallback only; deployed environments require the atomic DO path.
    await this.env.OTP_KV.delete(key);
    if (!raw) return null;

    try {
      const stored = JSON.parse(raw) as StoredChallenge;
      if (stored.flow !== flow || typeof stored.challenge !== 'string' || typeof stored.userId !== 'string') return null;
      return stored;
    } catch {
      return null;
    }
  }

  async beginRegistration(userId: string, email: string): Promise<{
    success: boolean;
    state?: string;
    options?: PublicKeyCredentialCreationOptionsJSON;
    error?: string;
  }> {
    const existing = await this.getCredentials(userId);
    const options = await generateRegistrationOptions({
      rpName: this.rpName,
      rpID: this.rpId,
      userID: encodeBase64Url(new TextEncoder().encode(userId)),
      userName: email,
      userDisplayName: email,
      attestationType: 'none',
      excludeCredentials: existing.map((credential) => ({
        id: decodeBase64Url(credential.credential_id),
        type: 'public-key',
        transports: parseTransports(credential.transports),
      })),
      authenticatorSelection: {
        // Discoverable so the authenticator can offer this credential before
        // the account is known; 'preferred' would let an authenticator create
        // a credential that only a username-first flow could ever find.
        residentKey: 'required',
        requireResidentKey: true,
        userVerification: 'required',
      },
    });

    const state = generateSecureToken(32);
    await this.storeChallenge(state, { challenge: options.challenge, flow: 'registration', userId });

    return { success: true, state, options };
  }

  /**
   * Store the address behind a user handle so a discoverable assertion can mint
   * a session token. Best effort: the passkey itself is already usable through
   * the email-first flow, so a storage failure degrades usernameless sign-in
   * rather than losing a credential the authenticator has already created.
   */
  private async rememberEmail(userId: string, email: string): Promise<void> {
    const key = this.env.EMAIL_ENCRYPTION_KEY;
    if (!key) {
      console.warn('EMAIL_ENCRYPTION_KEY is not configured; usernameless passkey sign-in will be unavailable for this credential');
      return;
    }

    try {
      const response = await this.userManagement(`/users/${encodeURIComponent(userId)}`, {
        method: 'PUT',
        headers: this.serviceHeaders(true),
        body: JSON.stringify({ email_encrypted: await encryptEmail(email, key) }),
      });
      if (!response.ok) throw new Error(`user update returned ${response.status}`);
    } catch (error) {
      console.error('Unable to store encrypted email for usernameless sign-in:', error);
    }
  }

  async completeRegistration(userId: string, email: string, state: string, response: RegistrationResponseJSON): Promise<{
    success: boolean;
    credentialId?: string;
    error?: string;
  }> {
    const challenge = await this.consumeChallenge(state, 'registration');
    if (!challenge || challenge.userId !== userId) {
      return { success: false, error: 'Registration challenge expired or invalid' };
    }

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpId,
        expectedType: 'webauthn.create',
        requireUserVerification: true,
      });
    } catch (error) {
      console.warn('Passkey registration verification failed:', error);
      return { success: false, error: 'Passkey registration failed' };
    }

    if (!verification.verified || !verification.registrationInfo) {
      return { success: false, error: 'Passkey registration failed' };
    }

    const info = verification.registrationInfo;
    const credentialId = encodeBase64Url(info.credentialID);
    const responseTransports = response.response.transports;
    const createResponse = await this.userManagement('/passkey-credentials', {
      method: 'POST',
      headers: this.serviceHeaders(true),
      body: JSON.stringify({
        credential_id: credentialId,
        user_id: userId,
        public_key: encodeBase64Url(info.credentialPublicKey),
        counter: info.counter,
        device_type: info.credentialDeviceType,
        backed_up: info.credentialBackedUp,
        transports: responseTransports,
      }),
    });

    if (!createResponse.ok) {
      return { success: false, error: 'Unable to save passkey' };
    }

    await this.rememberEmail(userId, email);

    return { success: true, credentialId };
  }

  /**
   * Omitting the email starts a usernameless flow: the authenticator picks a
   * discoverable credential and names its owner through the user handle. The
   * email-scoped flow is kept for credentials that predate discoverability.
   */
  async beginAuthentication(email?: string): Promise<{
    success: boolean;
    state?: string;
    options?: PublicKeyCredentialRequestOptionsJSON;
    error?: string;
  }> {
    if (!email) {
      // The address is only recoverable from storage, so a missing key would
      // fail after the user has already been prompted for verification.
      if (!this.env.EMAIL_ENCRYPTION_KEY) {
        return { success: false, error: 'Usernameless passkey sign-in is not configured on this deployment' };
      }

      const options = await generateAuthenticationOptions({
        rpID: this.rpId,
        userVerification: 'required',
      });
      const state = generateSecureToken(32);
      await this.storeChallenge(state, {
        challenge: options.challenge,
        flow: 'authentication',
        userId: DISCOVERABLE_CHALLENGE_USER,
      });

      return { success: true, state, options };
    }

    const userId = await hashEmail(email);
    const credentials = await this.getCredentials(userId);
    if (credentials.length === 0) {
      return { success: false, error: 'No passkey is registered for this email' };
    }

    const options = await generateAuthenticationOptions({
      rpID: this.rpId,
      allowCredentials: credentials.map((credential) => ({
        id: decodeBase64Url(credential.credential_id),
        type: 'public-key',
        transports: parseTransports(credential.transports),
      })),
      userVerification: 'required',
    });
    const state = generateSecureToken(32);
    await this.storeChallenge(state, { challenge: options.challenge, flow: 'authentication', userId });

    return { success: true, state, options };
  }

  /**
   * Recover the address stored at registration. Returns null when the key is
   * absent or the value cannot be authenticated, which keeps a rotated key from
   * signing anyone in under an address it cannot actually verify.
   */
  private async recoverEmail(user: UserRecord | undefined): Promise<string | null> {
    const key = this.env.EMAIL_ENCRYPTION_KEY;
    if (!key || !user?.email_encrypted) return null;
    return decryptEmail(user.email_encrypted, key);
  }

  /**
   * Read the account id out of an assertion's user handle. Registration writes
   * the SHA-256 email hash there, so anything else is rejected rather than
   * trusted as an account id.
   */
  private decodeUserHandle(value: string | undefined): string | null {
    if (typeof value !== 'string' || value.length === 0) return null;
    try {
      const handle = new TextDecoder().decode(decodeBase64Url(value));
      return /^[a-f0-9]{64}$/.test(handle) ? handle : null;
    } catch {
      return null;
    }
  }

  async completeAuthentication(email: string | undefined, state: string, response: AuthenticationResponseJSON): Promise<{
    success: boolean;
    jwtToken?: string;
    user?: { id: string; email: string };
    error?: string;
  }> {
    const challenge = await this.consumeChallenge(state, 'authentication');
    if (!challenge) {
      return { success: false, error: 'Authentication challenge expired or invalid' };
    }

    // The challenge records which account it was issued for, so an assertion
    // can only complete the flow that produced it.
    let userId: string;
    if (email) {
      userId = await hashEmail(email);
      if (challenge.userId !== userId) {
        return { success: false, error: 'Authentication challenge expired or invalid' };
      }
    } else {
      const handle = this.decodeUserHandle(response.response.userHandle);
      if (challenge.userId !== DISCOVERABLE_CHALLENGE_USER || !handle) {
        return { success: false, error: 'Authentication challenge expired or invalid' };
      }
      userId = handle;
    }

    let credential: PasskeyCredentialRecord | undefined;
    try {
      const credentialResponse = await this.userManagement(`/passkey-credentials/${encodeURIComponent(response.id)}`);
      if (credentialResponse.ok) {
        const body = await credentialResponse.json() as { success?: boolean; data?: PasskeyCredentialRecord };
        credential = body.success ? body.data : undefined;
      }
    } catch (error) {
      console.error('Error loading passkey credential:', error);
    }

    if (!credential || credential.user_id !== userId) {
      return { success: false, error: 'Passkey authentication failed' };
    }

    let verification;
    try {
      const authenticator: AuthenticatorDevice = {
        credentialID: decodeBase64Url(credential.credential_id),
        credentialPublicKey: decodeBase64Url(credential.public_key),
        counter: credential.counter,
        transports: parseTransports(credential.transports),
      };
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpId,
        expectedType: 'webauthn.get',
        authenticator,
        requireUserVerification: true,
      });
    } catch (error) {
      console.warn('Passkey authentication verification failed:', error);
      return { success: false, error: 'Passkey authentication failed' };
    }

    if (!verification.verified) {
      return { success: false, error: 'Passkey authentication failed' };
    }

    const { newCounter } = verification.authenticationInfo;
    if (credential.counter > 0 && newCounter <= credential.counter) {
      return { success: false, error: 'Passkey authentication failed' };
    }

    // User deletion cascades credentials. Fail closed if account status cannot be
    // positively established before mutating the authenticator counter.
    const userResponse = await this.userManagement(`/users/${encodeURIComponent(userId)}`);
    if (!userResponse.ok) {
      return { success: false, error: 'Passkey authentication failed' };
    }
    const userBody = await userResponse.json() as { success?: boolean; data?: UserRecord };
    if (!userBody.success || userBody.data?.status !== 'ACTIVE') {
      return { success: false, error: 'Passkey authentication failed' };
    }

    // Resolved before the counter is advanced so a credential registered before
    // the address was stored can still be retried through the email-first flow.
    const resolvedEmail = email ?? await this.recoverEmail(userBody.data);
    if (!resolvedEmail) {
      return { success: false, error: 'Enter your email address to use this passkey' };
    }

    // An email-first sign-in is the other moment the address is known, so a
    // credential registered before this existed becomes usable without one on
    // the next attempt.
    if (email && !userBody.data?.email_encrypted) {
      await this.rememberEmail(userId, email);
    }

    const counterResponse = await this.userManagement(
      `/passkey-credentials/${encodeURIComponent(credential.credential_id)}/counter`,
      {
        method: 'PATCH',
        headers: this.serviceHeaders(true),
        body: JSON.stringify({ previous_counter: credential.counter, counter: newCounter }),
      },
    );
    if (!counterResponse.ok) {
      return { success: false, error: 'Passkey authentication failed' };
    }

    const { JWTService } = await import('./jwt-service');
    const tokenResult = await new JWTService(this.env).createToken(userId, resolvedEmail, PASSKEY_TOKEN_TTL_SECONDS);
    if (!tokenResult.success || !tokenResult.token) {
      return { success: false, error: 'Passkey authentication failed' };
    }

    await this.userManagement('/login-history', {
      method: 'POST',
      headers: this.serviceHeaders(true),
      body: JSON.stringify({ user_id: userId, login_method: 'PASSKEY', success: true }),
    }).catch((error) => console.error('Unable to record passkey login:', error));

    return {
      success: true,
      jwtToken: tokenResult.token,
      user: { id: userId, email: resolvedEmail },
    };
  }
}
