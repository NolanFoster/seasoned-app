import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  AuthenticatorTransportFuture,
  WebAuthnCredential,
} from '@simplewebauthn/server';
import { Env } from '../types/env';
import { generateSecureToken } from '../utils/crypto';

const CHALLENGE_TTL = 300; // 5 minutes

function uint8ArrayToBase64url(arr: Uint8Array): string {
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function base64urlToUint8Array(str: string): Uint8Array<ArrayBuffer> {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>;
}

interface StoredRegChallenge {
  challenge: string;
  userId: string;
  email: string;
}

interface StoredAuthChallenge {
  challenge: string;
  userId: string | null;
}

interface PasskeyCredentialRecord {
  credential_id: string;
  user_id: string;
  public_key: string;
  counter: number;
  device_type: string;
  backed_up: number;
  transports: string | null;
}

export class PasskeyService {
  constructor(private env: Env) {}

  private get rpID() { return this.env.WEBAUTHN_RP_ID ?? 'localhost'; }
  private get rpName() { return this.env.WEBAUTHN_RP_NAME ?? 'Seasoned'; }
  private get origin() { return this.env.WEBAUTHN_ORIGIN ?? 'http://localhost:5173'; }
  private get umURL() { return this.env.USER_MANAGEMENT_WORKER_URL; }

  private async fetchCredentialsForUser(userId: string): Promise<PasskeyCredentialRecord[]> {
    const res = await fetch(`${this.umURL}/passkey-credentials/user/${encodeURIComponent(userId)}`);
    if (!res.ok) return [];
    const json = await res.json() as { success: boolean; data?: PasskeyCredentialRecord[] };
    return json.success && json.data ? json.data : [];
  }

  // --- Registration ---

  async beginRegistration(userId: string, email: string): Promise<{
    success: boolean;
    options?: PublicKeyCredentialCreationOptionsJSON;
    error?: string;
  }> {
    const existing = await this.fetchCredentialsForUser(userId);

    const encoder = new TextEncoder();
    const options = await generateRegistrationOptions({
      rpName: this.rpName,
      rpID: this.rpID,
      userID: encoder.encode(userId) as Uint8Array<ArrayBuffer>,
      userName: email,
      userDisplayName: email,
      attestationType: 'none',
      excludeCredentials: existing.map((c) => ({
        id: c.credential_id,
        transports: (c.transports ? JSON.parse(c.transports) : []) as AuthenticatorTransportFuture[],
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    await this.env.OTP_KV.put(
      `passkey:reg:${userId}`,
      JSON.stringify({ challenge: options.challenge, userId, email } satisfies StoredRegChallenge),
      { expirationTtl: CHALLENGE_TTL }
    );

    return { success: true, options };
  }

  async completeRegistration(userId: string, email: string, response: RegistrationResponseJSON): Promise<{
    success: boolean;
    credential?: { credentialId: string; deviceType: string; backedUp: boolean };
    error?: string;
  }> {
    const raw = await this.env.OTP_KV.get(`passkey:reg:${userId}`);
    if (!raw) {
      return { success: false, error: 'Registration challenge expired or not found' };
    }

    const stored = JSON.parse(raw) as StoredRegChallenge;
    await this.env.OTP_KV.delete(`passkey:reg:${userId}`);

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: stored.challenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpID,
      });
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Verification failed' };
    }

    if (!verification.verified || !verification.registrationInfo) {
      return { success: false, error: 'Registration verification failed' };
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

    const createRes = await fetch(`${this.umURL}/passkey-credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        credential_id: credential.id,
        user_id: userId,
        public_key: uint8ArrayToBase64url(credential.publicKey),
        counter: credential.counter,
        device_type: credentialDeviceType,
        backed_up: credentialBackedUp,
        transports: credential.transports,
      }),
    });

    if (!createRes.ok) {
      return { success: false, error: 'Failed to store passkey credential' };
    }

    return {
      success: true,
      credential: {
        credentialId: credential.id,
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
      },
    };
  }

  // --- Authentication ---

  async beginAuthentication(userId: string | null): Promise<{
    success: boolean;
    options?: PublicKeyCredentialRequestOptionsJSON;
    sessionToken?: string;
    error?: string;
  }> {
    let allowCredentials: { id: string; transports?: AuthenticatorTransportFuture[] }[] = [];

    if (userId) {
      const creds = await this.fetchCredentialsForUser(userId);
      if (creds.length === 0) {
        return { success: false, error: 'no_passkeys' };
      }
      allowCredentials = creds.map((c) => ({
        id: c.credential_id,
        transports: (c.transports ? JSON.parse(c.transports) : undefined) as AuthenticatorTransportFuture[] | undefined,
      }));
    }

    const options = await generateAuthenticationOptions({
      rpID: this.rpID,
      allowCredentials,
      userVerification: 'preferred',
    });

    const sessionToken = generateSecureToken(16);

    await this.env.OTP_KV.put(
      `passkey:auth:${sessionToken}`,
      JSON.stringify({ challenge: options.challenge, userId } satisfies StoredAuthChallenge),
      { expirationTtl: CHALLENGE_TTL }
    );

    return { success: true, options, sessionToken };
  }

  async completeAuthentication(sessionToken: string, response: AuthenticationResponseJSON): Promise<{
    success: boolean;
    jwtToken?: string;
    user?: { id: string; email: string };
    error?: string;
  }> {
    const raw = await this.env.OTP_KV.get(`passkey:auth:${sessionToken}`);
    if (!raw) {
      return { success: false, error: 'Authentication challenge expired or not found' };
    }

    const stored = JSON.parse(raw) as StoredAuthChallenge;
    await this.env.OTP_KV.delete(`passkey:auth:${sessionToken}`);

    // Look up the credential
    const credRes = await fetch(
      `${this.umURL}/passkey-credentials/${encodeURIComponent(response.id)}`
    );
    if (!credRes.ok) {
      return { success: false, error: 'Passkey credential not found' };
    }
    const credJson = await credRes.json() as { success: boolean; data?: PasskeyCredentialRecord };
    if (!credJson.success || !credJson.data) {
      return { success: false, error: 'Passkey credential not found' };
    }
    const storedCred = credJson.data;

    // Verify the credential belongs to the expected user (if we targeted one)
    if (stored.userId && storedCred.user_id !== stored.userId) {
      return { success: false, error: 'Credential does not belong to expected user' };
    }

    const authenticatorCredential: WebAuthnCredential = {
      id: storedCred.credential_id,
      publicKey: base64urlToUint8Array(storedCred.public_key),
      counter: storedCred.counter,
      transports: storedCred.transports
        ? (JSON.parse(storedCred.transports) as AuthenticatorTransportFuture[])
        : undefined,
    };

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: stored.challenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpID,
        credential: authenticatorCredential,
        requireUserVerification: true,
      });
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Verification failed' };
    }

    if (!verification.verified) {
      return { success: false, error: 'Authentication verification failed' };
    }

    const { newCounter } = verification.authenticationInfo;

    // Replay attack detection: counter must advance if it was non-zero
    if (storedCred.counter !== 0 && newCounter <= storedCred.counter) {
      return { success: false, error: 'Counter regression detected — possible cloned authenticator' };
    }

    // Update counter
    await fetch(`${this.umURL}/passkey-credentials/${encodeURIComponent(storedCred.credential_id)}/counter`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ counter: newCounter }),
    });

    const userId = storedCred.user_id;

    // Resolve user email from user management worker
    const userRes = await fetch(`${this.umURL}/users/${encodeURIComponent(userId)}`);
    const userJson = userRes.ok
      ? await userRes.json() as { success: boolean; data?: { email_encrypted?: string } }
      : null;
    const email = (userJson?.success && userJson.data?.email_encrypted) ? userJson.data.email_encrypted : '';

    // Issue JWT
    const { JWTService } = await import('./jwt-service');
    const jwtService = new JWTService(this.env);
    const tokenResult = await jwtService.createToken(userId, email, 604800);

    if (!tokenResult.success || !tokenResult.token) {
      return { success: false, error: 'Failed to issue JWT' };
    }

    // Record login history (best-effort)
    fetch(`${this.umURL}/login-history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        login_method: 'PASSKEY',
        success: true,
      }),
    }).catch(() => {/* non-fatal */});

    return {
      success: true,
      jwtToken: tokenResult.token,
      user: { id: userId, email },
    };
  }
}
