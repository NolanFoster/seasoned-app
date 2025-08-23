import { vi } from 'vitest';

// Mock D1Database for testing
global.D1Database = class MockD1Database {
  constructor() {
    this.data = new Map();
    this.prepare = vi.fn();
    this.batch = vi.fn();
    this.exec = vi.fn();
    this.dump = vi.fn();
  }
};

// Helper function to create mock prepare chains
global.createMockPrepare = (returnValue, isArray = false) => {
  if (isArray) {
    return vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({ results: returnValue })
      })
    });
  }
  
  return vi.fn().mockReturnValue({
    bind: vi.fn().mockReturnValue({
      first: vi.fn().mockResolvedValue(returnValue)
    })
  });
};

// Helper function to create mock prepare chains for run operations
global.createMockPrepareRun = (changes = 1) => {
  return vi.fn().mockReturnValue({
    bind: vi.fn().mockReturnValue({
      run: vi.fn().mockResolvedValue({ meta: { changes } })
    })
  });
};

// Mock Response for fetch testing
global.Response = class MockResponse {
  constructor(body, init = {}) {
    this.body = body;
    this.status = init.status || 200;
    this.ok = this.status >= 200 && this.status < 300;
    this.headers = new Map(Object.entries(init.headers || {}));
  }

  json() {
    return Promise.resolve(this.body);
  }

  text() {
    return Promise.resolve(JSON.stringify(this.body));
  }
};

// Mock Request for testing
global.Request = class MockRequest {
  constructor(url, init = {}) {
    this.url = url;
    this.method = init.method || 'GET';
    this.headers = new Map(Object.entries(init.headers || {}));
    this.body = init.body;
  }

  header(name) {
    return this.headers.get(name);
  }
};

// Mock fetch for testing external calls
global.fetch = vi.fn();

// Mock console methods
global.console = {
  ...console,
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn()
};

// Mock crypto for testing
Object.defineProperty(global, 'crypto', {
  value: {
    getRandomValues: vi.fn(),
    randomUUID: vi.fn(() => 'test-uuid')
  },
  writable: true
});

// Mock Date for consistent testing
global.Date = class MockDate extends Date {
  constructor(...args) {
    if (args.length === 0) {
      super('2024-01-01T00:00:00.000Z');
    } else {
      super(...args);
    }
  }

  static now() {
    return new Date('2024-01-01T00:00:00.000Z').getTime();
  }
};
