export interface Env {
  // D1 Database binding for user management
  USER_DB: D1Database;
  
  // Environment variables
  ENVIRONMENT: 'development' | 'preview' | 'staging' | 'production';
  // Shared JWT secret used to validate auth-worker Bearer tokens for user-owned routes.
  JWT_SECRET?: string;
  // Explicit kill switch; omitted keeps the additive profile API enabled.
  CULINARY_PROFILE_ENABLED?: string;
  // Explicit kill switch for the additive manual pantry API.
  PANTRY_ENABLED?: string;
  // Explicit kill switch for ephemeral pantry photo scanning.
  PANTRY_SCAN_ENABLED?: string;
  // Optional Cloudflare Workers AI binding used by the pantry scan endpoint.
  AI?: { run(model: string, input: Record<string, unknown>): Promise<unknown> };
  // Explicit kill switch for the additive private recipe notes API.
  RECIPE_NOTES_ENABLED?: string;
  // Explicit kill switch for meal plan / grocery list sync.
  MEAL_PLAN_SYNC_ENABLED?: string;
  // Optional service-to-service secret for passkey credential routes.
  PASSKEY_SERVICE_TOKEN?: string;
}

// Extend the interface to include index signature for Hono compatibility
export interface Bindings extends Env {
  [key: string]: any;
}
