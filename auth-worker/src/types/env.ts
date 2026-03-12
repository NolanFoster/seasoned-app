interface SendEmail {
  send(message: import('cloudflare:email').EmailMessage): Promise<void>;
}

export interface Env {
  // KV Namespace binding
  OTP_KV: KVNamespace;
  
  // Environment variables
  ENVIRONMENT: 'development' | 'preview' | 'staging' | 'production';
  USER_MANAGEMENT_WORKER_URL: string;
  
  // Cloudflare Email binding
  SEND_EMAIL: SendEmail;
  FROM_EMAIL?: string;
  
  // JWT configuration
  JWT_SECRET: string;
}
