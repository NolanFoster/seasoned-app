// Database schema types for USER_DB
// These types correspond to the tables defined in schema.sql

export interface User {
  user_id: string;
  email_hash: string;
  email_encrypted?: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  account_type: 'FREE' | 'PREMIUM' | 'ADMIN';
  created_at: string;
  updated_at: string;
  last_activity_at?: string;
  email_verified: boolean;
  two_factor_enabled: boolean;
}

export interface NutritionGoals {
  focus: string | null;
  targets: Record<string, number>;
}

export interface ConsentFlags {
  learn_from_activity: boolean;
  share_anon_evals: boolean;
}

export interface CulinaryProfile {
  user_id: string;
  diet_tags: string[];
  hard_allergens: string[];
  soft_avoids: string[];
  cuisine_likes: string[];
  cuisine_dislikes: string[];
  spice_level: number;
  skill_level: 'beginner' | 'intermediate' | 'advanced';
  default_servings: number;
  max_cook_time_min: number;
  equipment: string[];
  nutrition_goals: NutritionGoals;
  units_pref: 'us' | 'metric';
  exclude_ingredients: string[];
  notes_freeform: string;
  consent_flags: ConsentFlags;
  created_at: string;
  updated_at: string;
}

export interface CulinaryProfileInput {
  diet_tags?: string[];
  hard_allergens?: string[];
  soft_avoids?: string[];
  cuisine_likes?: string[];
  cuisine_dislikes?: string[];
  spice_level?: number;
  skill_level?: 'beginner' | 'intermediate' | 'advanced';
  default_servings?: number;
  max_cook_time_min?: number;
  equipment?: string[];
  nutrition_goals?: NutritionGoals;
  units_pref?: 'us' | 'metric';
  exclude_ingredients?: string[];
  notes_freeform?: string;
  consent_flags?: ConsentFlags;
}

export type PantryLocation = 'fridge' | 'freezer' | 'pantry' | 'other';

export interface PantryItem {
  id: number;
  user_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  location: PantryLocation;
  expires_on: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface PantryItemInput {
  name: string;
  quantity?: number | null;
  unit?: string | null;
  location?: PantryLocation;
  expires_on?: string | null;
  tags?: string[];
}

export interface RecipeNote {
  id: number;
  user_id: string;
  recipe_id: string;
  recipe_title: string | null;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface RecipeNoteInput {
  recipe_id: string;
  recipe_title?: string | null;
  body: string;
}

export type LoginMethod = 'OTP' | 'MAGIC_LINK' | 'PASSKEY';

export interface UserLoginHistory {
  id?: number;
  user_id: string;
  login_timestamp: string;
  ip_address?: string;
  user_agent?: string;
  location_data?: string; // JSON string
  country?: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  login_method: LoginMethod;
  success: boolean;
  failure_reason?: string;
  device_fingerprint?: string;
  risk_score: number;
}

export interface PasskeyCredential {
  credential_id: string;
  user_id: string;
  public_key: string;
  counter: number;
  device_type: 'singleDevice' | 'multiDevice';
  backed_up: number;
  transports?: string;
  created_at: string;
  last_used_at?: string;
}

// Parsed types for JSON fields
export interface LocationData {
  country?: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  isp?: string;
  organization?: string;
}

// View types
export interface RecentLoginActivity {
  user_id: string;
  email_hash: string;
  login_timestamp: string;
  ip_address?: string;
  country?: string;
  city?: string;
  login_method: LoginMethod;
  success: boolean;
  risk_score: number;
}

export interface UserStatistics {
  user_id: string;
  email_hash: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  account_type: 'FREE' | 'PREMIUM' | 'ADMIN';
  created_at: string;
  last_activity_at?: string;
  total_logins: number;
  successful_logins: number;
  failed_logins: number;
  last_login?: string;
  unique_ips: number;
  unique_countries: number;
}

// Input types for creating/updating records
export interface CreateUserInput {
  email_hash: string;
  email_encrypted?: string;
  status?: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  account_type?: 'FREE' | 'PREMIUM' | 'ADMIN';
  email_verified?: boolean;
  two_factor_enabled?: boolean;
}

export interface CreateLoginHistoryInput {
  user_id: string;
  ip_address?: string;
  user_agent?: string;
  location_data?: string;
  country?: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  login_method: LoginMethod;
  success: boolean;
  failure_reason?: string;
  device_fingerprint?: string;
  risk_score?: number;
}

export interface CreatePasskeyCredentialInput {
  credential_id: string;
  user_id: string;
  public_key: string;
  counter: number;
  device_type: 'singleDevice' | 'multiDevice';
  backed_up: boolean;
  transports?: string[];
}

// Update types
export interface UpdateUserInput {
  email_encrypted?: string;
  status?: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  account_type?: 'FREE' | 'PREMIUM' | 'ADMIN';
  email_verified?: boolean;
  two_factor_enabled?: boolean;
}

// Query result types
export interface UserWithLoginHistory extends User {
  login_history: UserLoginHistory[];
}

// Database operation results
export interface DatabaseResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  affectedRows?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export type CulinaryEventType =
  | 'recipe_saved'
  | 'recipe_cooked_started'
  | 'recipe_cooked_completed'
  | 'recipe_elevated'
  | 'recipe_adapted'
  | 'planner_added'
  | 'feedback_rating'
  | 'feedback_tag'
  | 'generate_accepted'
  | 'generate_discarded';

export interface CulinaryEventFeatures {
  cuisines?: string[];
  diet_tags?: string[];
  cooking_methods?: string[];
  key_ingredients?: string[];
  prep_time_min?: number;
  cook_time_min?: number;
  rating?: number;
  tags?: string[];
  notes?: string;
  source?: string;
  [key: string]: unknown;
}

export interface CulinaryEvent {
  id: number;
  user_id: string;
  event_type: CulinaryEventType;
  recipe_id: string | null;
  recipe_name: string | null;
  features: CulinaryEventFeatures;
  created_at: string;
}

export interface CreateCulinaryEventInput {
  event_type: CulinaryEventType;
  recipe_id?: string | null;
  recipe_name?: string | null;
  features?: CulinaryEventFeatures;
}

export interface InferredPreferences {
  top_cuisines: { name: string; score: number; count: number }[];
  top_ingredients: { name: string; score: number; count: number }[];
  top_cooking_methods: { name: string; score: number; count: number }[];
  avg_prep_time_min: number | null;
  avg_cook_time_min: number | null;
  feedback_summary: {
    average_rating: number | null;
    tags_count: Record<string, number>;
  };
  total_events: number;
  recent_events_count: number;
}

