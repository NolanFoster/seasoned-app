import type { EmailMessage } from 'cloudflare:email';

export interface SendEmailBinding {
  send(message: EmailMessage): Promise<void>;
}

export interface Env {
  // KV Namespace binding
  OTP_KV: KVNamespace;
  
  // Environment variables
  ENVIRONMENT: 'development' | 'preview' | 'staging' | 'production';
  USER_MANAGEMENT_WORKER_URL: string;
  
  // Cloudflare Email Workers send_email binding
  send_email: SendEmailBinding;
  FROM_EMAIL?: string;
  
  // JWT configuration
  JWT_SECRET: string;
}