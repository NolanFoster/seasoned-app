import { describe, it, expect, vi } from 'vitest';
import app from '@/index';
import { Env } from '@/types/env';

describe('Health Endpoint', () => {
  const mockEnv: Env = {
    AUTH_KV: {
      put: vi.fn(),
      get: vi.fn(),
    } as unknown as KVNamespace,
    AUTH_DB: {
      prepare: vi.fn(),
    } as unknown as D1Database,
    ENVIRONMENT: 'preview'
  };

  it('should return healthy when all services are operational', async () => {
    // Mock successful KV operations
    vi.mocked(mockEnv.AUTH_KV.put).mockResolvedValue(undefined);
    vi.mocked(mockEnv.AUTH_KV.get).mockResolvedValue('test-value');

    // Mock successful D1 operation
    vi.mocked(mockEnv.AUTH_DB.prepare).mockReturnValue({
      first: vi.fn().mockResolvedValue({ test: 1 })
    } as any);

    const response = await app.request('/health', {}, mockEnv);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('healthy');
    expect(data.services.kv).toBe('healthy');
    expect(data.services.d1).toBe('healthy');
    expect(data.environment).toBe('preview');
  });

  it('should return degraded when KV is unhealthy', async () => {
    // Mock failed KV operations
    vi.mocked(mockEnv.AUTH_KV.put).mockRejectedValue(new Error('KV Error'));

    // Mock successful D1 operation
    vi.mocked(mockEnv.AUTH_DB.prepare).mockReturnValue({
      first: vi.fn().mockResolvedValue({ test: 1 })
    } as any);

    const response = await app.request('/health', {}, mockEnv);
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.status).toBe('degraded');
    expect(data.services.kv).toBe('unhealthy');
    expect(data.services.d1).toBe('healthy');
  });

  it('should return degraded when D1 is unhealthy', async () => {
    // Mock successful KV operations
    vi.mocked(mockEnv.AUTH_KV.put).mockResolvedValue(undefined);
    vi.mocked(mockEnv.AUTH_KV.get).mockResolvedValue('test-value');

    // Mock failed D1 operation
    vi.mocked(mockEnv.AUTH_DB.prepare).mockReturnValue({
      first: vi.fn().mockRejectedValue(new Error('D1 Error'))
    } as any);

    const response = await app.request('/health', {}, mockEnv);
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.status).toBe('degraded');
    expect(data.services.kv).toBe('healthy');
    expect(data.services.d1).toBe('unhealthy');
  });

  it('should return unhealthy when both services are down', async () => {
    // Mock failed KV operations
    vi.mocked(mockEnv.AUTH_KV.put).mockRejectedValue(new Error('KV Error'));

    // Mock failed D1 operation
    vi.mocked(mockEnv.AUTH_DB.prepare).mockReturnValue({
      first: vi.fn().mockRejectedValue(new Error('D1 Error'))
    } as any);

    const response = await app.request('/health', {}, mockEnv);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.status).toBe('unhealthy');
    expect(data.services.kv).toBe('unhealthy');
    expect(data.services.d1).toBe('unhealthy');
  });
});