import { describe, it, expect } from 'vitest';
import worker from '../src/recipe-clipper.js';

// Mock globals for testing
global.Response = class Response {
  constructor(body, init = {}) {
    this.body = body;
    this.status = init.status || 200;
    this.headers = new Map(Object.entries(init.headers || {}));
  }
  
  async text() {
    return String(this.body);
  }
  
  async json() {
    return JSON.parse(this.body);
  }
};

global.Request = class Request {
  constructor(url, init = {}) {
    this.url = url;
    this.method = init.method || 'GET';
    this.headers = init.headers || {};
    this.body = init.body;
  }
  
  async json() {
    return JSON.parse(this.body);
  }
};

describe('Worker Basic Tests', () => {
  it('should handle OPTIONS requests', async () => {
    const request = new Request('http://localhost/clip', {
      method: 'OPTIONS'
    });

    const env = {
      SAVE_WORKER_URL: 'https://test.workers.dev',
      AI: { run: async () => ({ response: '{}' }) }
    };

    const response = await worker.fetch(request, env);
    
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('should return health check', async () => {
    const request = new Request('http://localhost/health', {
      method: 'GET'
    });

    const env = {
      SAVE_WORKER_URL: 'https://test.workers.dev',
      AI: { run: async () => ({ response: '{}' }) }
    };

    const response = await worker.fetch(request, env);
    const result = await response.json();
    
    expect(response.status).toBe(200);
    expect(result.status).toBe('healthy');
  });

  it('should reject POST without URL', async () => {
    const request = new Request('http://localhost/clip', {
      method: 'POST',
      body: JSON.stringify({})
    });

    const env = {
      SAVE_WORKER_URL: 'https://test.workers.dev',
      AI: { run: async () => ({ response: '{}' }) }
    };

    const response = await worker.fetch(request, env);
    
    expect(response.status).toBe(400);
    expect(await response.text()).toBe('URL is required');
  });
});