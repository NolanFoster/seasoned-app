export interface Env {
  // KV Namespace binding
  OTP_KV: KVNamespace;
  
  // D1 Database binding
  AUTH_DB: D1Database;
  
  // Environment variables
  ENVIRONMENT: 'development' | 'preview' | 'staging' | 'production';
}