import type { EmailMessage } from 'cloudflare:email';

export interface SendEmailBinding {
  send(message: EmailMessage): Promise<void>;
}

export interface Env {
  // KV Namespace binding
  OTP_KV: KVNamespace;
  OTP_KV_PREFIX?: string;
  PASSKEY_CHALLENGE_DO?: DurableObjectNamespace;
  
  // Environment variables
  ENVIRONMENT: 'development' | 'preview' | 'staging' | 'production';
  USER_MANAGEMENT_WORKER_URL: string;
  
  // Cloudflare Email Workers send_email binding
  send_email: SendEmailBinding;
  FROM_EMAIL?: string;
  
  // JWT configuration
  JWT_SECRET: string;

  // WebAuthn relying-party configuration. Defaults are for local development only.
  WEBAUTHN_RP_ID?: string;
  WEBAUTHN_RP_NAME?: string;
  WEBAUTHN_ORIGIN?: string;
  PASSKEY_SERVICE_TOKEN?: string;
}