export interface Env {
  // KV Namespace binding
  AUTH_KV: KVNamespace;
  
  // D1 Database binding
  AUTH_DB: D1Database;
  
  // Environment variables
  ENVIRONMENT: 'development' | 'preview' | 'staging' | 'production';
}