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
  login_method: 'OTP' | 'MAGIC_LINK';
  success: boolean;
  failure_reason?: string;
  device_fingerprint?: string;
  risk_score: number;
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
  login_method: 'OTP' | 'MAGIC_LINK';
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
  login_method: 'OTP' | 'MAGIC_LINK';
  success: boolean;
  failure_reason?: string;
  device_fingerprint?: string;
  risk_score?: number;
}

// Update types
export interface UpdateUserInput {
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
