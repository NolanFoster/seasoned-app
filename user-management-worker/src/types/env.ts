export interface Env {
  // D1 Database binding for user management
  USER_DB: D1Database;
  
  // Environment variables
  ENVIRONMENT: 'development' | 'preview' | 'staging' | 'production';
}
