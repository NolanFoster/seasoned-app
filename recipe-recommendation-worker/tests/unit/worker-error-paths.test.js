/**
 * Tests for worker outer catch block and default route (404)
 * Covers index.js branches that require handler errors or unknown routes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock root-handler so we can control whether it throws
vi.mock('../../src/handlers/root-handler.js', () => ({
  handleRoot: vi.fn()
}));

import { handleRoot } from '../../src/handlers/root-handler.js';
import workerModule from '../../src/index.js';

describe('Worker - default route (404)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 404 for unknown routes', async () => {
    const request = new Request('http://localhost/unknown-route', { method: 'GET' });
    const response = await workerModule.fetch(request, {});

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe('Not found');
  });

  it('should return 405 for GET /recommendations', async () => {
    const request = new Request('http://localhost/recommendations', { method: 'GET' });
    const response = await workerModule.fetch(request, {});

    expect(response.status).toBe(405);
    const data = await response.json();
    expect(data.error).toBe('Method not allowed');
  });
});

describe('Worker - outer catch block', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 500 and requestId when handler throws generic error', async () => {
    handleRoot.mockRejectedValueOnce(new Error('unexpected failure'));

    const request = new Request('http://localhost/', { method: 'GET' });
    const response = await workerModule.fetch(request, {});

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Internal server error');
    expect(data.requestId).toBeDefined();
  });

  it('should handle timeout error in outer catch', async () => {
    handleRoot.mockRejectedValueOnce(new Error('timeout exceeded'));

    const request = new Request('http://localhost/', { method: 'GET' });
    const response = await workerModule.fetch(request, {});

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Internal server error');
  });

  it('should handle validation error in outer catch', async () => {
    handleRoot.mockRejectedValueOnce(new Error('validation failed'));

    const request = new Request('http://localhost/', { method: 'GET' });
    const response = await workerModule.fetch(request, {});

    expect(response.status).toBe(500);
  });

  it('should handle invalid input error in outer catch', async () => {
    handleRoot.mockRejectedValueOnce(new Error('invalid request data'));

    const request = new Request('http://localhost/', { method: 'GET' });
    const response = await workerModule.fetch(request, {});

    expect(response.status).toBe(500);
  });

  it('should handle not found error in outer catch', async () => {
    handleRoot.mockRejectedValueOnce(new Error('item not found in database'));

    const request = new Request('http://localhost/', { method: 'GET' });
    const response = await workerModule.fetch(request, {});

    expect(response.status).toBe(500);
  });

  it('should handle 404 error in outer catch', async () => {
    handleRoot.mockRejectedValueOnce(new Error('service returned 404'));

    const request = new Request('http://localhost/', { method: 'GET' });
    const response = await workerModule.fetch(request, {});

    expect(response.status).toBe(500);
  });

  it('should include CORS headers in error response', async () => {
    handleRoot.mockRejectedValueOnce(new Error('network error'));

    const request = new Request('http://localhost/', { method: 'GET' });
    const response = await workerModule.fetch(request, {});

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('X-Request-ID')).toBeDefined();
  });

  it('should call sendAnalytics with ANALYTICS binding on error', async () => {
    handleRoot.mockRejectedValueOnce(new Error('AI service error'));
    const mockWriteDataPoint = vi.fn().mockResolvedValue(undefined);

    const request = new Request('http://localhost/', { method: 'GET' });
    const response = await workerModule.fetch(request, {
      ANALYTICS: { writeDataPoint: mockWriteDataPoint }
    });

    expect(response.status).toBe(500);
    expect(mockWriteDataPoint).toHaveBeenCalled();
  });
});
