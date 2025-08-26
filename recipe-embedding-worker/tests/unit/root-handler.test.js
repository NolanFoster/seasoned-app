import { describe, it, expect } from 'vitest';
import { handleRoot } from '../../src/handlers/root-handler.js';

describe('Root Handler', () => {
  it('should return worker information', async () => {
    const request = createMockRequest('/');
    const env = getMockEnv();
    const corsHeaders = getMockCorsHeaders();

    const response = await handleRoot(request, env, corsHeaders);
    const data = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(data.service).toBe('Recipe Embedding Worker');
    expect(data.version).toBe('1.0.0');
    expect(data.environment).toBe('test');
    expect(data.endpoints).toBeDefined();
    expect(data.scheduled).toBeDefined();
  });

  it('should include CORS headers', async () => {
    const request = createMockRequest('/');
    const env = getMockEnv();
    const corsHeaders = getMockCorsHeaders();

    const response = await handleRoot(request, env, corsHeaders);

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Content-Type')).toBe('application/json');
  });

  it('should handle missing environment variable', async () => {
    const request = createMockRequest('/');
    const env = { ...getMockEnv(), ENVIRONMENT: undefined };
    const corsHeaders = getMockCorsHeaders();

    const response = await handleRoot(request, env, corsHeaders);
    const data = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(data.environment).toBe('development');
  });
});
