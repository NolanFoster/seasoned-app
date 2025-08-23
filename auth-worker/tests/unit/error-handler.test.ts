import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { Env } from '@/types/env';

describe('Error Handler', () => {
  it('should handle errors properly', async () => {
    const app = new Hono<{ Bindings: Env }>();
    
    // Add a route that throws an error
    app.get('/error', () => {
      throw new Error('Test error');
    });

    // Add the error handler
    app.onError((err, c) => {
      console.error(`Error handling request: ${err}`);
      return c.json({
        error: 'Internal Server Error',
        message: err.message || 'An unexpected error occurred'
      }, 500);
    });

    const mockEnv: Env = {
      AUTH_KV: {} as KVNamespace,
      OTP_KV: {} as KVNamespace,
      AUTH_DB: {} as D1Database,
      ENVIRONMENT: 'preview'
    };

    // Spy on console.error
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const req = new Request('http://localhost/error', { method: 'GET' });
    const response = await app.fetch(req, mockEnv);
    const data = await response.json() as any;

    expect(response.status).toBe(500);
    expect(data.error).toBe('Internal Server Error');
    expect(data.message).toBe('Test error');
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error handling request: Error: Test error');

    consoleErrorSpy.mockRestore();
  });
});