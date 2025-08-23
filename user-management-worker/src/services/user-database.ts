import { D1Database } from '@cloudflare/workers-types';
import {
  User,
  UserLoginHistory,
  CreateUserInput,
  CreateLoginHistoryInput,
  UpdateUserInput,
  DatabaseResult,
  PaginatedResult,
  RecentLoginActivity,
  UserStatistics
} from '../types/database';

export class UserDatabaseService {
  constructor(private db: D1Database) {}

  // User Management
  async createUser(input: CreateUserInput): Promise<DatabaseResult<User>> {
    try {
      const user_id = input.email_hash; // Use email hash as user_id for simplicity
      
      const result = await this.db.prepare(`
        INSERT INTO users (
          user_id, email_hash, email_encrypted, status, account_type, 
          email_verified, two_factor_enabled
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `).bind(
        user_id,
        input.email_hash,
        input.email_encrypted || null,
        input.status || 'ACTIVE',
        input.account_type || 'FREE',
        input.email_verified || false,
        input.two_factor_enabled || false
      ).first<User>();

      if (!result) {
        return { success: false, error: 'Failed to create user' };
      }

      return { success: true, data: result };
    } catch (error) {
      console.error('Error creating user:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async getUserById(user_id: string): Promise<DatabaseResult<User>> {
    try {
      const result = await this.db.prepare(`
        SELECT * FROM users WHERE user_id = ?
      `).bind(user_id).first<User>();

      if (!result) {
        return { success: false, error: 'User not found' };
      }

      return { success: true, data: result };
    } catch (error) {
      console.error('Error getting user by ID:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async getUserByEmailHash(email_hash: string): Promise<DatabaseResult<User>> {
    try {
      const result = await this.db.prepare(`
        SELECT * FROM users WHERE email_hash = ?
      `).bind(email_hash).first<User>();

      if (!result) {
        return { success: false, error: 'User not found' };
      }

      return { success: true, data: result };
    } catch (error) {
      console.error('Error getting user by email hash:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async updateUser(user_id: string, input: UpdateUserInput): Promise<DatabaseResult<User>> {
    try {
      const updateFields: string[] = [];
      const values: any[] = [];

      if (input.status !== undefined) {
        updateFields.push('status = ?');
        values.push(input.status);
      }
      if (input.account_type !== undefined) {
        updateFields.push('account_type = ?');
        values.push(input.account_type);
      }
      if (input.email_verified !== undefined) {
        updateFields.push('email_verified = ?');
        values.push(input.email_verified);
      }
      if (input.two_factor_enabled !== undefined) {
        updateFields.push('two_factor_enabled = ?');
        values.push(input.two_factor_enabled);
      }

      if (updateFields.length === 0) {
        return { success: false, error: 'No fields to update' };
      }

      values.push(user_id);

      const result = await this.db.prepare(`
        UPDATE users SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
        RETURNING *
      `).bind(...values).first<User>();

      if (!result) {
        return { success: false, error: 'User not found or update failed' };
      }

      return { success: true, data: result };
    } catch (error) {
      console.error('Error updating user:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async deleteUser(user_id: string): Promise<DatabaseResult<{ affectedRows: number }>> {
    try {
      const result = await this.db.prepare(`
        DELETE FROM users WHERE user_id = ?
      `).bind(user_id).run();

      return { success: true, affectedRows: result.meta?.changes || 0 };
    } catch (error) {
      console.error('Error deleting user:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Login History Management
  async createLoginHistory(input: CreateLoginHistoryInput): Promise<DatabaseResult<UserLoginHistory>> {
    try {
      const result = await this.db.prepare(`
        INSERT INTO user_login_history (
          user_id, ip_address, user_agent, location_data,
          country, region, city, latitude, longitude, timezone,
          login_method, success, failure_reason, device_fingerprint, risk_score
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `).bind(
        input.user_id,
        input.ip_address || null,
        input.user_agent || null,
        input.location_data || null,
        input.country || null,
        input.region || null,
        input.city || null,
        input.latitude || null,
        input.longitude || null,
        input.timezone || null,
        input.login_method,
        input.success,
        input.failure_reason || null,
        input.device_fingerprint || null,
        input.risk_score || 0
      ).first<UserLoginHistory>();

      if (!result) {
        return { success: false, error: 'Failed to create login history' };
      }

      return { success: true, data: result };
    } catch (error) {
      console.error('Error creating login history:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Query Methods
  async getRecentLoginActivity(limit: number = 50): Promise<DatabaseResult<RecentLoginActivity[]>> {
    try {
      const result = await this.db.prepare(`
        SELECT * FROM recent_login_activity LIMIT ?
      `).bind(limit).all<RecentLoginActivity>();

      return { success: true, data: result.results };
    } catch (error) {
      console.error('Error getting recent login activity:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async getUserStatistics(user_id: string): Promise<DatabaseResult<UserStatistics>> {
    try {
      const result = await this.db.prepare(`
        SELECT * FROM user_statistics WHERE user_id = ?
      `).bind(user_id).first<UserStatistics>();

      if (!result) {
        return { success: false, error: 'User statistics not found' };
      }

      return { success: true, data: result };
    } catch (error) {
      console.error('Error getting user statistics:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async getUsersWithPagination(page: number = 1, limit: number = 20): Promise<DatabaseResult<PaginatedResult<User>>> {
    try {
      const offset = (page - 1) * limit;

      // Get total count
      const countResult = await this.db.prepare(`
        SELECT COUNT(*) as total FROM users
      `).first<{ total: number }>();

      if (!countResult) {
        return { success: false, error: 'Failed to get user count' };
      }

      const total = countResult.total;

      // Get users for current page
      const usersResult = await this.db.prepare(`
        SELECT * FROM users 
        ORDER BY created_at DESC 
        LIMIT ? OFFSET ?
      `).bind(limit, offset).all<User>();

      const hasMore = offset + limit < total;

      return {
        success: true,
        data: {
          data: usersResult.results,
          total,
          page,
          limit,
          hasMore
        }
      };
    } catch (error) {
      console.error('Error getting users with pagination:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Utility Methods
  async getUsersByStatus(status: 'ACTIVE' | 'SUSPENDED' | 'DELETED'): Promise<DatabaseResult<User[]>> {
    try {
      const result = await this.db.prepare(`
        SELECT * FROM users WHERE status = ? ORDER BY created_at DESC
      `).bind(status).all<User>();

      return { success: true, data: result.results };
    } catch (error) {
      console.error('Error getting users by status:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async searchUsers(query: string, limit: number = 20): Promise<DatabaseResult<User[]>> {
    try {
      const searchQuery = `%${query}%`;
      const result = await this.db.prepare(`
        SELECT u.* FROM users u
        WHERE u.email_hash LIKE ?
        ORDER BY u.created_at DESC
        LIMIT ?
      `).bind(searchQuery, limit).all<User>();

      return { success: true, data: result.results };
    } catch (error) {
      console.error('Error searching users:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}
