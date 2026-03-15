import { describe, it, expect, beforeEach } from 'vitest';
import { handleRoot } from '../../src/handlers/root-handler.js';

describe('Root Handler', () => {
  let mockEnv;
  let mockRequest;

  beforeEach(() => {
    mockEnv = {
      ENVIRONMENT: 'test'
    };
    mockRequest = new Request('https://example.com/');
  });

  it('should return service information', async () => {
    const response = await handleRoot(mockRequest, mockEnv);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/json');
    expect(data.service).toBe('AI Image Generation Worker');
    expect(data.version).toBe('1.0.0');
    expect(data.environment).toBe('test');
  });

  it('should include endpoint documentation', async () => {
    const response = await handleRoot(mockRequest, mockEnv);
    const data = await response.json();

    expect(data.endpoints).toBeDefined();
    expect(data.endpoints.health).toBe('/health');
    expect(data.endpoints.generate).toBe('/generate');
    expect(data.documentation).toBeDefined();
    expect(data.documentation.generate).toBeDefined();
  });

  it('should use default environment when not provided', async () => {
    delete mockEnv.ENVIRONMENT;
    const response = await handleRoot(mockRequest, mockEnv);
    const data = await response.json();

    expect(data.environment).toBe('development');
  });
});