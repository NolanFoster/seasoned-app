import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import app from '@/index';
import { Env } from '@/types/env';

// Setup crypto polyfill for testing
beforeAll(async () => {
  // @ts-ignore - Node.js crypto import for test environment
  const { webcrypto } = await import('node:crypto');
  
  if (!(globalThis as any).crypto) {
    // Adding crypto to globalThis for testing
    (globalThis as any).crypto = webcrypto;
  }
});

// We'll use vi.mocked() approach like the health tests

describe('OTP Endpoints', () => {
  let mockEnv: Env;

  beforeEach(() => {
    mockEnv = {
      OTP_KV: {
        put: vi.fn(),
        get: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
        getWithMetadata: vi.fn()
      } as unknown as KVNamespace,
      USER_MANAGEMENT_WORKER_URL: 'https://user-management-worker-preview.your-domain.workers.dev',
      ENVIRONMENT: 'preview'
    };

    // Mock User Management Worker integration
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true })
    } as Response));

    // Mock OTP_KV operations to simulate actual KV behavior
    const otpStore = new Map<string, { value: string; expiration?: number }>();
    
    vi.mocked(mockEnv.OTP_KV.put).mockImplementation(async (key: string, value: any, options?: any) => {
      const expiration = options?.expirationTtl ? Date.now() + (options.expirationTtl * 1000) : undefined;
      otpStore.set(key, { value: value as string, expiration });
    });

    (vi.mocked(mockEnv.OTP_KV.get) as any).mockImplementation(async (key: string) => {
      const item = otpStore.get(key);
      if (!item) return null;
      
      if (item.expiration && Date.now() > item.expiration) {
        otpStore.delete(key);
        return null;
      }
      
      return item.value;
    });

    vi.mocked(mockEnv.OTP_KV.delete).mockImplementation(async (key: string) => {
      otpStore.delete(key);
    });

    // Mock successful D1 operation by default
  });

  describe('POST /otp/generate', () => {
    it('should generate OTP successfully', async () => {
      const request = new Request('http://localhost/otp/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com' })
      });

      const response = await app.fetch(request, mockEnv);
      const result = await response.json() as any;

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.message).toBe('OTP generated successfully');
      expect(result.otp).toBeDefined();
      expect(result.otp).toHaveLength(6);
    });

    it('should reject request without email', async () => {
      const request = new Request('http://localhost/otp/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      const response = await app.fetch(request, mockEnv);
      const result = await response.json() as any;

      expect(response.status).toBe(400);
      expect(result.success).toBe(false);
      expect(result.message).toBe('Email is required and must be a string');
    });

    it('should reject request with invalid email type', async () => {
      const request = new Request('http://localhost/otp/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 123 })
      });

      const response = await app.fetch(request, mockEnv);
      const result = await response.json() as any;

      expect(response.status).toBe(400);
      expect(result.success).toBe(false);
      expect(result.message).toBe('Email is required and must be a string');
    });

    it('should reject request when OTP already exists', async () => {
      const email = 'test@example.com';
      
      // Generate first OTP
      const request1 = new Request('http://localhost/otp/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      
      await app.fetch(request1, mockEnv);

      // Try to generate second OTP
      const request2 = new Request('http://localhost/otp/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      const response2 = await app.fetch(request2, mockEnv);
      const result2 = await response2.json() as any;

      expect(response2.status).toBe(409);
      expect(result2.success).toBe(false);
      expect(result2.message).toContain('OTP already exists');
    });

    it('should not return OTP in production environment', async () => {
      mockEnv.ENVIRONMENT = 'production';
      
      const request = new Request('http://localhost/otp/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com' })
      });

      const response = await app.fetch(request, mockEnv);
      const result = await response.json() as any;

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.otp).toBeUndefined();
    });
  });

  describe('POST /otp/verify', () => {
    it('should verify correct OTP', async () => {
      const email = 'test@example.com';
      
      // Generate OTP
      const generateRequest = new Request('http://localhost/otp/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      
      const generateResponse = await app.fetch(generateRequest, mockEnv);
      const generateResult = await generateResponse.json() as any;
      const otp = generateResult.otp;

      // Verify OTP
      const verifyRequest = new Request('http://localhost/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp })
      });

      const verifyResponse = await app.fetch(verifyRequest, mockEnv);
      const verifyResult = await verifyResponse.json() as any;

      expect(verifyResponse.status).toBe(200);
      expect(verifyResult.success).toBe(true);
      expect(verifyResult.message).toBe('OTP verified successfully');
    });

    it('should reject incorrect OTP', async () => {
      const email = 'test@example.com';
      
      // Generate OTP
      const generateRequest = new Request('http://localhost/otp/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      
      await app.fetch(generateRequest, mockEnv);

      // Verify with wrong OTP
      const verifyRequest = new Request('http://localhost/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: '000000' })
      });

      const verifyResponse = await app.fetch(verifyRequest, mockEnv);
      const verifyResult = await verifyResponse.json() as any;

      expect(verifyResponse.status).toBe(400);
      expect(verifyResult.success).toBe(false);
      expect(verifyResult.message).toBe('Invalid OTP');
      expect(verifyResult.remainingAttempts).toBe(2);
    });

    it('should reject request without email', async () => {
      const request = new Request('http://localhost/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp: '123456' })
      });

      const response = await app.fetch(request, mockEnv);
      const result = await response.json() as any;

      expect(response.status).toBe(400);
      expect(result.success).toBe(false);
      expect(result.message).toBe('Email is required and must be a string');
    });

    it('should reject request without OTP', async () => {
      const request = new Request('http://localhost/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com' })
      });

      const response = await app.fetch(request, mockEnv);
      const result = await response.json() as any;

      expect(response.status).toBe(400);
      expect(result.success).toBe(false);
      expect(result.message).toBe('OTP is required and must be a string');
    });
  });

  describe('GET /otp/status/:email', () => {
    it('should return status for existing OTP', async () => {
      const email = 'test@example.com';
      
      // Generate OTP
      const generateRequest = new Request('http://localhost/otp/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      
      await app.fetch(generateRequest, mockEnv);

      // Check status
      const statusRequest = new Request(`http://localhost/otp/status/${encodeURIComponent(email)}`, {
        method: 'GET'
      });

      const statusResponse = await app.fetch(statusRequest, mockEnv);
      const statusResult = await statusResponse.json() as any;

      expect(statusResponse.status).toBe(200);
      expect(statusResult.success).toBe(true);
      expect(statusResult.exists).toBe(true);
      expect(statusResult.attempts).toBe(0);
      expect(statusResult.expiresAt).toBeDefined();
    });

    it('should return status for non-existent OTP', async () => {
      const email = 'nonexistent@example.com';
      
      const statusRequest = new Request(`http://localhost/otp/status/${encodeURIComponent(email)}`, {
        method: 'GET'
      });

      const statusResponse = await app.fetch(statusRequest, mockEnv);
      const statusResult = await statusResponse.json() as any;

      expect(statusResponse.status).toBe(200);
      expect(statusResult.success).toBe(true);
      expect(statusResult.exists).toBe(false);
      expect(statusResult.attempts).toBeUndefined();
      expect(statusResult.expiresAt).toBeUndefined();
    });
  });

  describe('DELETE /otp/:email', () => {
    it('should delete existing OTP', async () => {
      const email = 'test@example.com';
      
      // Generate OTP
      const generateRequest = new Request('http://localhost/otp/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      
      await app.fetch(generateRequest, mockEnv);

      // Delete OTP
      const deleteRequest = new Request(`http://localhost/otp/${encodeURIComponent(email)}`, {
        method: 'DELETE'
      });

      const deleteResponse = await app.fetch(deleteRequest, mockEnv);
      const deleteResult = await deleteResponse.json() as any;

      expect(deleteResponse.status).toBe(200);
      expect(deleteResult.success).toBe(true);
      expect(deleteResult.message).toBe('OTP deleted successfully');

      // Verify OTP is gone
      const statusRequest = new Request(`http://localhost/otp/status/${encodeURIComponent(email)}`, {
        method: 'GET'
      });

      const statusResponse = await app.fetch(statusRequest, mockEnv);
      const statusResult = await statusResponse.json() as any;

      expect(statusResult.exists).toBe(false);
    });

    it('should return success even for non-existent OTP', async () => {
      const email = 'nonexistent@example.com';
      
      const deleteRequest = new Request(`http://localhost/otp/${encodeURIComponent(email)}`, {
        method: 'DELETE'
      });

      const deleteResponse = await app.fetch(deleteRequest, mockEnv);
      const deleteResult = await deleteResponse.json() as any;

      expect(deleteResponse.status).toBe(200);
      expect(deleteResult.success).toBe(true);
      expect(deleteResult.message).toBe('OTP deleted successfully');
    });
  });

  describe('Integration flow', () => {
    it('should handle complete OTP lifecycle', async () => {
      const email = 'integration@example.com';

      // 1. Generate OTP
      const generateRequest = new Request('http://localhost/otp/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      const generateResponse = await app.fetch(generateRequest, mockEnv);
      const generateResult = await generateResponse.json() as any;
      
      expect(generateResponse.status).toBe(200);
      expect(generateResult.success).toBe(true);
      
      const otp = generateResult.otp;

      // 2. Check status
      const statusRequest = new Request(`http://localhost/otp/status/${encodeURIComponent(email)}`, {
        method: 'GET'
      });

      const statusResponse = await app.fetch(statusRequest, mockEnv);
      const statusResult = await statusResponse.json() as any;

      expect(statusResponse.status).toBe(200);
      expect(statusResult.exists).toBe(true);
      expect(statusResult.attempts).toBe(0);

      // 3. Verify OTP
      const verifyRequest = new Request('http://localhost/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp })
      });

      const verifyResponse = await app.fetch(verifyRequest, mockEnv);
      const verifyResult = await verifyResponse.json() as any;

      expect(verifyResponse.status).toBe(200);
      expect(verifyResult.success).toBe(true);

      // 4. Check status after verification (should be gone)
      const finalStatusRequest = new Request(`http://localhost/otp/status/${encodeURIComponent(email)}`, {
        method: 'GET'
      });

      const finalStatusResponse = await app.fetch(finalStatusRequest, mockEnv);
      const finalStatusResult = await finalStatusResponse.json() as any;

      expect(finalStatusResult.exists).toBe(false);
    });
  });
});
