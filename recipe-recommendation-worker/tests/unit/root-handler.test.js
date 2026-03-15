/**
 * Tests for root handler
 */

import { describe, it, expect, vi } from 'vitest';
import { handleRoot } from '../../src/handlers/root-handler.js';

// Mock shared utility-functions used transitively
vi.mock('../../../shared/utility-functions.js', () => ({
  log: vi.fn(),
  generateRequestId: vi.fn(() => 'req-test-id')
}));

describe('handleRoot', () => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  it('should return 200 with API info', async () => {
    const request = new Request('http://localhost/');
    const env = {};

    const response = await handleRoot(request, env, corsHeaders);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/json');
  });

  it('should include service name in response', async () => {
    const request = new Request('http://localhost/');
    const env = {};

    const response = await handleRoot(request, env, corsHeaders);
    const data = await response.json();

    expect(data.service).toBe('recipe-recommendation-worker');
    expect(data.version).toBeDefined();
    expect(data.description).toBeDefined();
  });

  it('should include endpoints in response', async () => {
    const request = new Request('http://localhost/');
    const env = {};

    const response = await handleRoot(request, env, corsHeaders);
    const data = await response.json();

    expect(data.endpoints).toBeDefined();
    expect(data.endpoints['POST /recommendations']).toBeDefined();
    expect(data.endpoints['GET /health']).toBeDefined();
    expect(data.endpoints['GET /metrics']).toBeDefined();
  });

  it('should include a timestamp in response', async () => {
    const request = new Request('http://localhost/');
    const env = {};

    const response = await handleRoot(request, env, corsHeaders);
    const data = await response.json();

    expect(data.timestamp).toBeDefined();
    expect(new Date(data.timestamp).getTime()).not.toBeNaN();
  });

  it('should include CORS headers in response', async () => {
    const request = new Request('http://localhost/');
    const env = {};

    const response = await handleRoot(request, env, corsHeaders);

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('should include POST /recommendations parameters documentation', async () => {
    const request = new Request('http://localhost/');
    const env = {};

    const response = await handleRoot(request, env, corsHeaders);
    const data = await response.json();

    const recEndpoint = data.endpoints['POST /recommendations'];
    expect(recEndpoint.parameters).toBeDefined();
    expect(recEndpoint.example).toBeDefined();
  });
});
