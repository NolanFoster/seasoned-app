export interface Env {
  // KV Namespace binding
  OTP_KV: KVNamespace;
  
  // Environment variables
  ENVIRONMENT: 'development' | 'preview' | 'staging' | 'production';
  USER_MANAGEMENT_WORKER_URL: string;
  
  // AWS SES configuration
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_REGION?: string;
  FROM_EMAIL?: string;
  
  // JWT configuration
  JWT_SECRET: string;
}