// Test environment setup for Vitest
// This file sets up the necessary environment for running tests

// Load crypto polyfill
import './setup-crypto-polyfill.js';

// Set up global environment variables for tests
global.TEST_ENV = true;

// Mock Cloudflare Worker globals if needed
if (!global.Response) {
  global.Response = class Response {
    constructor(body, init = {}) {
      this.body = body;
      this.status = init.status || 200;
      this.statusText = init.statusText || 'OK';
      this.headers = new Map(Object.entries(init.headers || {}));
    }
    
    async text() {
      return String(this.body);
    }
    
    async json() {
      return JSON.parse(this.body);
    }
  };
}

if (!global.Request) {
  global.Request = class Request {
    constructor(url, init = {}) {
      this.url = url;
      this.method = init.method || 'GET';
      this.headers = new Map(Object.entries(init.headers || {}));
      this.body = init.body;
    }
    
    async text() {
      return String(this.body);
    }
    
    async json() {
      return JSON.parse(this.body);
    }
  };
}

// Add any other global setup needed for tests
console.log('Test environment initialized');