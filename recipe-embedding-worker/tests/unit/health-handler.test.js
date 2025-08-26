import { describe, it, expect } from 'vitest';
import { handleHealth } from '../../src/handlers/health-handler.js';

describe('Health Handler', () => {
  it('should return healthy status when all services are available', async () => {
    const request = createMockRequest('/health');
    const env = getMockEnv();
    const corsHeaders = getMockCorsHeaders();

    // Mock successful KV operation
    env.RECIPE_STORAGE.get.mockResolvedValue(null);

    const response = await handleHealth(request, env, corsHeaders);
    const data = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(data.status).toBe('healthy');
    expect(data.services.kv_storage).toBe('healthy');
    expect(data.services.ai_binding).toBe('healthy');
    expect(data.timestamp).toBeDefined();
    expect(data.environment).toBe('test');
  });

  it('should return unhealthy status when KV fails', async () => {
    const request = createMockRequest('/health');
    const env = getMockEnv();
    const corsHeaders = getMockCorsHeaders();

    // Mock KV failure
    env.RECIPE_STORAGE.get.mockRejectedValue(new Error('KV unavailable'));

    const response = await handleHealth(request, env, corsHeaders);
    const data = await parseResponse(response);

    expect(response.status).toBe(503);
    expect(data.status).toBe('unhealthy');
    expect(data.services.kv_storage).toBe('unhealthy');
  });

  it('should return unhealthy status when AI binding is missing', async () => {
    const request = createMockRequest('/health');
    const env = { ...getMockEnv(), AI: undefined };
    const corsHeaders = getMockCorsHeaders();

    // Mock successful KV operation
    env.RECIPE_STORAGE.get.mockResolvedValue(null);

    const response = await handleHealth(request, env, corsHeaders);
    const data = await parseResponse(response);

    expect(response.status).toBe(503);
    expect(data.status).toBe('unhealthy');
    expect(data.services.ai_binding).toBe('missing');
  });

  it('should handle health check errors gracefully', async () => {
    const request = createMockRequest('/health');
    const env = getMockEnv();
    const corsHeaders = getMockCorsHeaders();

    // Mock KV to throw during the health check
    env.RECIPE_STORAGE.get.mockImplementation(() => {
      throw new Error('Unexpected error');
    });

    const response = await handleHealth(request, env, corsHeaders);
    const data = await parseResponse(response);

    expect(response.status).toBe(503);
    expect(data.status).toBe('unhealthy');
    expect(data.services.kv_storage).toBe('unhealthy');
  });

  it('should include CORS headers', async () => {
    const request = createMockRequest('/health');
    const env = getMockEnv();
    const corsHeaders = getMockCorsHeaders();

    env.RECIPE_STORAGE.get.mockResolvedValue(null);

    const response = await handleHealth(request, env, corsHeaders);

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Content-Type')).toBe('application/json');
  });
});
