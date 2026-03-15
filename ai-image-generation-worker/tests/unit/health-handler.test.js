import { describe, it, expect, beforeEach } from 'vitest';
import { handleHealth } from '../../src/handlers/health-handler.js';

describe('Health Handler', () => {
  let mockEnv;
  let mockRequest;

  beforeEach(() => {
    mockEnv = {
      ENVIRONMENT: 'test',
      AI: {},
      AI_GENERATED_RECIPE_IMAGES: {}
    };
    mockRequest = new Request('https://example.com/health');
  });

  it('should return healthy status when all services are available', async () => {
    const response = await handleHealth(mockRequest, mockEnv);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('healthy');
    expect(data.services.ai).toBe('available');
    expect(data.services.r2).toBe('available');
  });

  it('should return degraded status when AI is unavailable', async () => {
    delete mockEnv.AI;
    const response = await handleHealth(mockRequest, mockEnv);
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.status).toBe('degraded');
    expect(data.services.ai).toBe('unavailable');
    expect(data.services.r2).toBe('available');
  });

  it('should return degraded status when R2 is unavailable', async () => {
    delete mockEnv.AI_GENERATED_RECIPE_IMAGES;
    const response = await handleHealth(mockRequest, mockEnv);
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.status).toBe('degraded');
    expect(data.services.ai).toBe('available');
    expect(data.services.r2).toBe('unavailable');
  });

  it('should include timestamp in response', async () => {
    const response = await handleHealth(mockRequest, mockEnv);
    const data = await response.json();

    expect(data.timestamp).toBeDefined();
    expect(new Date(data.timestamp)).toBeInstanceOf(Date);
  });
});