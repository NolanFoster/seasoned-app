import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  storeOTP,
  verifyOTPForEmail,
  hasOTP,
  deleteOTP,
  getOTPStats
} from '../../src/utils/otp-manager';

// Setup crypto polyfill for testing
beforeAll(async () => {
  const { webcrypto } = await import('node:crypto');
  
  if (!globalThis.crypto) {
    // @ts-ignore - Adding crypto to globalThis for testing
    globalThis.crypto = webcrypto;
  }
});

// Mock KV namespace
class MockKVNamespace implements KVNamespace {
  private store = new Map<string, { value: string; expiration?: number }>();

  async get(key: string): Promise<string | null> {
    const item = this.store.get(key);
    if (!item) return null;
    
    if (item.expiration && Date.now() > item.expiration) {
      this.store.delete(key);
      return null;
    }
    
    return item.value;
  }

  async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
    const expiration = options?.expirationTtl ? Date.now() + (options.expirationTtl * 1000) : undefined;
    this.store.set(key, { value, expiration });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  // Mock implementations for other KV methods (not used in our tests)
  async list(): Promise<any> { return { keys: [] }; }
  async getWithMetadata(): Promise<any> { return { value: null, metadata: null }; }
}

describe('OTP Manager', () => {
  let mockKV: MockKVNamespace;

  beforeEach(() => {
    mockKV = new MockKVNamespace();
  });

  describe('storeOTP', () => {
    it('should store OTP successfully with generated OTP', async () => {
      const email = 'test@example.com';
      const result = await storeOTP(mockKV, email);

      expect(result.success).toBe(true);
      expect(result.message).toBe('OTP stored successfully');
      expect(result.otp).toBeDefined();
      expect(result.otp).toHaveLength(6);
    });

    it('should store OTP successfully with provided OTP', async () => {
      const email = 'test@example.com';
      const otp = '123456';
      const result = await storeOTP(mockKV, email, otp);

      expect(result.success).toBe(true);
      expect(result.message).toBe('OTP stored successfully');
      expect(result.otp).toBe(otp);
    });

    it('should store OTP with custom expiry', async () => {
      const email = 'test@example.com';
      const result = await storeOTP(mockKV, email, undefined, 10);

      expect(result.success).toBe(true);
      expect(result.otp).toBeDefined();
    });
  });

  describe('verifyOTPForEmail', () => {
    it('should verify correct OTP', async () => {
      const email = 'test@example.com';
      const storeResult = await storeOTP(mockKV, email);
      
      const verifyResult = await verifyOTPForEmail(mockKV, email, storeResult.otp!);
      
      expect(verifyResult.success).toBe(true);
      expect(verifyResult.message).toBe('OTP verified successfully');
    });

    it('should reject incorrect OTP', async () => {
      const email = 'test@example.com';
      await storeOTP(mockKV, email, '123456');
      
      const verifyResult = await verifyOTPForEmail(mockKV, email, '654321');
      
      expect(verifyResult.success).toBe(false);
      expect(verifyResult.message).toBe('Invalid OTP');
      expect(verifyResult.remainingAttempts).toBe(2);
    });

    it('should return not found for non-existent OTP', async () => {
      const email = 'test@example.com';
      
      const verifyResult = await verifyOTPForEmail(mockKV, email, '123456');
      
      expect(verifyResult.success).toBe(false);
      expect(verifyResult.message).toBe('OTP not found or expired');
    });

    it('should handle maximum attempts exceeded', async () => {
      const email = 'test@example.com';
      await storeOTP(mockKV, email, '123456');
      
      // Make 3 failed attempts
      await verifyOTPForEmail(mockKV, email, '000001');
      await verifyOTPForEmail(mockKV, email, '000002');
      const finalResult = await verifyOTPForEmail(mockKV, email, '000003');
      
      expect(finalResult.success).toBe(false);
      expect(finalResult.message).toBe('Invalid OTP. Maximum attempts exceeded.');
      expect(finalResult.remainingAttempts).toBeUndefined();
    });

    it('should delete OTP after successful verification', async () => {
      const email = 'test@example.com';
      const storeResult = await storeOTP(mockKV, email);
      
      await verifyOTPForEmail(mockKV, email, storeResult.otp!);
      
      // Try to verify again - should fail as OTP is deleted
      const secondVerifyResult = await verifyOTPForEmail(mockKV, email, storeResult.otp!);
      expect(secondVerifyResult.success).toBe(false);
      expect(secondVerifyResult.message).toBe('OTP not found or expired');
    });
  });

  describe('hasOTP', () => {
    it('should return true when OTP exists', async () => {
      const email = 'test@example.com';
      await storeOTP(mockKV, email);
      
      const exists = await hasOTP(mockKV, email);
      expect(exists).toBe(true);
    });

    it('should return false when OTP does not exist', async () => {
      const email = 'test@example.com';
      
      const exists = await hasOTP(mockKV, email);
      expect(exists).toBe(false);
    });

    it('should return false for expired OTP', async () => {
      const email = 'test@example.com';
      // Store OTP with very short expiry
      await storeOTP(mockKV, email, undefined, 0.001); // 0.001 minutes = 0.06 seconds
      
      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const exists = await hasOTP(mockKV, email);
      expect(exists).toBe(false);
    });
  });

  describe('deleteOTP', () => {
    it('should delete existing OTP', async () => {
      const email = 'test@example.com';
      await storeOTP(mockKV, email);
      
      const deleted = await deleteOTP(mockKV, email);
      expect(deleted).toBe(true);
      
      const exists = await hasOTP(mockKV, email);
      expect(exists).toBe(false);
    });

    it('should return true even if OTP does not exist', async () => {
      const email = 'test@example.com';
      
      const deleted = await deleteOTP(mockKV, email);
      expect(deleted).toBe(true);
    });
  });

  describe('getOTPStats', () => {
    it('should return stats for existing OTP', async () => {
      const email = 'test@example.com';
      await storeOTP(mockKV, email);
      
      const stats = await getOTPStats(mockKV, email);
      
      expect(stats.exists).toBe(true);
      expect(stats.attempts).toBe(0);
      expect(stats.expiresAt).toBeDefined();
      expect(stats.expiresAt).toBeGreaterThan(Date.now());
    });

    it('should return stats with attempts after failed verification', async () => {
      const email = 'test@example.com';
      await storeOTP(mockKV, email, '123456');
      
      // Make a failed attempt
      await verifyOTPForEmail(mockKV, email, '654321');
      
      const stats = await getOTPStats(mockKV, email);
      
      expect(stats.exists).toBe(true);
      expect(stats.attempts).toBe(1);
    });

    it('should return not exists for non-existent OTP', async () => {
      const email = 'test@example.com';
      
      const stats = await getOTPStats(mockKV, email);
      
      expect(stats.exists).toBe(false);
      expect(stats.attempts).toBeUndefined();
      expect(stats.expiresAt).toBeUndefined();
    });
  });

  describe('Email normalization', () => {
    it('should handle same email with different cases', async () => {
      const email1 = 'Test@Example.Com';
      const email2 = 'test@example.com';
      
      await storeOTP(mockKV, email1, '123456');
      
      const verifyResult = await verifyOTPForEmail(mockKV, email2, '123456');
      expect(verifyResult.success).toBe(true);
    });

    it('should handle email with whitespace', async () => {
      const email1 = '  test@example.com  ';
      const email2 = 'test@example.com';
      
      await storeOTP(mockKV, email1, '123456');
      
      const verifyResult = await verifyOTPForEmail(mockKV, email2, '123456');
      expect(verifyResult.success).toBe(true);
    });
  });
});
