import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '@/index';
import { Env } from '@/types/env';

interface HealthResponse {
  status: string;
  timestamp: string;
  environment: string;
  services: {
    auth_kv: string;
    otp_kv: string;
    d1: string;
  };
}

describe('Health Endpoint', () => {
  let mockEnv: Env;

  beforeEach(() => {
    mockEnv = {
      AUTH_KV: {
        put: vi.fn(),
        get: vi.fn(),
      } as unknown as KVNamespace,
      OTP_KV: {
        put: vi.fn(),
        get: vi.fn(),
      } as unknown as KVNamespace,
      AUTH_DB: {
        prepare: vi.fn(),
      } as unknown as D1Database,
      ENVIRONMENT: 'preview'
    };
  });

  it('should return healthy when all services are operational', async () => {
    // Mock successful AUTH_KV operations
    vi.mocked(mockEnv.AUTH_KV.put).mockResolvedValue(undefined);
    vi.mocked(mockEnv.AUTH_KV.get).mockResolvedValue('test-value' as any);

    // Mock successful OTP_KV operations
    vi.mocked(mockEnv.OTP_KV.put).mockResolvedValue(undefined);
    vi.mocked(mockEnv.OTP_KV.get).mockResolvedValue('test-value' as any);

    // Mock successful D1 operation
    vi.mocked(mockEnv.AUTH_DB.prepare).mockReturnValue({
      first: vi.fn().mockResolvedValue({ test: 1 })
    } as any);

    const req = new Request('http://localhost/health', { method: 'GET' });
    const response = await app.fetch(req, mockEnv);
    const data = await response.json() as HealthResponse;

    expect(response.status).toBe(200);
    expect(data.status).toBe('healthy');
    expect(data.services.auth_kv).toBe('healthy');
    expect(data.services.otp_kv).toBe('healthy');
    expect(data.services.d1).toBe('healthy');
    expect(data.environment).toBe('preview');
  });

  it('should return degraded when AUTH_KV is unhealthy', async () => {
    // Mock failed AUTH_KV operations
    vi.mocked(mockEnv.AUTH_KV.put).mockRejectedValue(new Error('KV Error'));

    // Mock successful OTP_KV operations
    vi.mocked(mockEnv.OTP_KV.put).mockResolvedValue(undefined);
    vi.mocked(mockEnv.OTP_KV.get).mockResolvedValue('test-value' as any);

    // Mock successful D1 operation
    vi.mocked(mockEnv.AUTH_DB.prepare).mockReturnValue({
      first: vi.fn().mockResolvedValue({ test: 1 })
    } as any);

    const req = new Request('http://localhost/health', { method: 'GET' });
    const response = await app.fetch(req, mockEnv);
    const data = await response.json() as HealthResponse;

    expect(response.status).toBe(503);
    expect(data.status).toBe('degraded');
    expect(data.services.auth_kv).toBe('unhealthy');
    expect(data.services.otp_kv).toBe('healthy');
    expect(data.services.d1).toBe('healthy');
  });

  it('should return degraded when D1 is unhealthy', async () => {
    // Mock successful AUTH_KV operations
    vi.mocked(mockEnv.AUTH_KV.put).mockResolvedValue(undefined);
    vi.mocked(mockEnv.AUTH_KV.get).mockResolvedValue('test-value' as any);

    // Mock successful OTP_KV operations
    vi.mocked(mockEnv.OTP_KV.put).mockResolvedValue(undefined);
    vi.mocked(mockEnv.OTP_KV.get).mockResolvedValue('test-value' as any);

    // Mock failed D1 operation
    vi.mocked(mockEnv.AUTH_DB.prepare).mockReturnValue({
      first: vi.fn().mockRejectedValue(new Error('D1 Error'))
    } as any);

    const req = new Request('http://localhost/health', { method: 'GET' });
    const response = await app.fetch(req, mockEnv);
    const data = await response.json() as HealthResponse;

    expect(response.status).toBe(503);
    expect(data.status).toBe('degraded');
    expect(data.services.auth_kv).toBe('healthy');
    expect(data.services.otp_kv).toBe('healthy');
    expect(data.services.d1).toBe('unhealthy');
  });

  it('should return unhealthy when all services are down', async () => {
    // Mock failed AUTH_KV operations
    vi.mocked(mockEnv.AUTH_KV.put).mockRejectedValue(new Error('KV Error'));

    // Mock failed OTP_KV operations
    vi.mocked(mockEnv.OTP_KV.put).mockRejectedValue(new Error('OTP_KV Error'));

    // Mock failed D1 operation
    vi.mocked(mockEnv.AUTH_DB.prepare).mockReturnValue({
      first: vi.fn().mockRejectedValue(new Error('D1 Error'))
    } as any);

    const req = new Request('http://localhost/health', { method: 'GET' });
    const response = await app.fetch(req, mockEnv);
    const data = await response.json() as HealthResponse;

    expect(response.status).toBe(500);
    expect(data.status).toBe('unhealthy');
    expect(data.services.auth_kv).toBe('unhealthy');
    expect(data.services.otp_kv).toBe('unhealthy');
    expect(data.services.d1).toBe('unhealthy');
  });
});