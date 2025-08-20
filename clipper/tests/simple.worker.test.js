import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/recipe-clipper.js';

describe('Simple Worker Test', () => {
  it('should respond to OPTIONS request', async () => {
    const request = new Request('http://example.com/clip', {
      method: 'OPTIONS',
    });
    
    const response = await worker.fetch(request, env);
    expect(response.status).toBe(200);
  });
});