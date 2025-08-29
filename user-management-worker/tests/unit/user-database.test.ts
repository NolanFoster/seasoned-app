import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserDatabaseService } from '../../src/services/user-database';
import { D1Database } from '@cloudflare/workers-types';

describe('UserDatabaseService', () => {
  let mockDb: D1Database;
  let userDB: UserDatabaseService;

  beforeEach(() => {
    mockDb = {
      prepare: vi.fn(),
      batch: vi.fn(),
      exec: vi.fn(),
      dump: vi.fn()
    } as unknown as D1Database;
    
    userDB = new UserDatabaseService(mockDb);
  });

  describe('createUser', () => {
    it('should return error when no fields to update', async () => {
      const result = await userDB.updateUser('test_hash', {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('No fields to update');
    });
  });

  describe('updateUser', () => {
    it('should return error when no fields to update', async () => {
      const result = await userDB.updateUser('test_hash', {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('No fields to update');
    });
  });

  describe('basic functionality', () => {
    it('should instantiate correctly', () => {
      expect(userDB).toBeInstanceOf(UserDatabaseService);
      expect(mockDb.prepare).toBeDefined();
    });

    it('should have required methods', () => {
      expect(typeof userDB.createUser).toBe('function');
      expect(typeof userDB.getUserById).toBe('function');
      expect(typeof userDB.updateUser).toBe('function');
      expect(typeof userDB.deleteUser).toBe('function');
      expect(typeof userDB.createLoginHistory).toBe('function');
    });
  });
});
