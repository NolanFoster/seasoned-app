/**
 * Shared test environment setup utility
 * Loads environment variables from .env.test file for consistent test configuration
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Load environment variables from .env.test file
 * @param {string} envPath - Optional custom path to .env file
 * @returns {Object} Parsed environment variables
 */
export function loadTestEnv(envPath = null) {
  const defaultPath = join(__dirname, '..', '.env.test');
  const path = envPath || defaultPath;
  
  try {
    const envContent = readFileSync(path, 'utf8');
    const envVars = {};
    
    envContent.split('\n').forEach(line => {
      // Skip comments and empty lines
      if (line.trim() === '' || line.trim().startsWith('#')) {
        return;
      }
      
      const [key, ...valueParts] = line.split('=');
      if (key) {
        const value = valueParts.join('=').trim();
        envVars[key.trim()] = value;
      }
    });
    
    return envVars;
  } catch (error) {
    console.warn(`Warning: Could not load test environment from ${path}:`, error.message);
    return {};
  }
}

/**
 * Setup test environment variables
 * Merges loaded env vars with existing process.env
 */
export function setupTestEnvironment() {
  const testEnv = loadTestEnv();
  
  // Merge with process.env
  Object.keys(testEnv).forEach(key => {
    if (!process.env[key]) {
      process.env[key] = testEnv[key];
    }
  });
  
  // For frontend tests, also set up import.meta.env mock
  if (global.import && global.import.meta) {
    global.import.meta.env = {
      ...global.import.meta.env,
      ...testEnv
    };
  }
  
  return testEnv;
}

/**
 * Create a mock Cloudflare Worker environment
 * @param {Object} overrides - Optional overrides for specific bindings
 * @returns {Object} Mock environment object for Cloudflare Workers
 */
export function createMockWorkerEnv(overrides = {}) {
  const testEnv = loadTestEnv();
  
  return {
    // Environment variables from wrangler.toml [vars]
    SEARCH_DB_URL: testEnv.SEARCH_DB_URL,
    IMAGE_DOMAIN: testEnv.IMAGE_DOMAIN,
    FDC_API_KEY: testEnv.FDC_API_KEY,
    SAVE_WORKER_URL: testEnv.SAVE_WORKER_URL,
    GPT_API_URL: testEnv.GPT_API_URL,
    
    // KV Namespace binding
    RECIPE_STORAGE: {
      get: jest?.fn() || (() => Promise.resolve(null)),
      put: jest?.fn() || (() => Promise.resolve()),
      delete: jest?.fn() || (() => Promise.resolve()),
      list: jest?.fn() || (() => Promise.resolve({ keys: [] }))
    },
    
    // R2 Bucket binding
    RECIPE_IMAGES: {
      get: jest?.fn() || (() => Promise.resolve(null)),
      put: jest?.fn() || (() => Promise.resolve()),
      delete: jest?.fn() || (() => Promise.resolve()),
      list: jest?.fn() || (() => Promise.resolve({ objects: [] }))
    },
    
    // D1 Database binding
    SEARCH_DB: {
      prepare: jest?.fn() || (() => ({
        bind: () => ({
          all: () => Promise.resolve({ results: [] }),
          first: () => Promise.resolve(null),
          run: () => Promise.resolve({ success: true })
        })
      }))
    },
    
    // Durable Object binding
    RECIPE_SAVER: {
      idFromName: jest?.fn() || ((name) => ({ toString: () => `id-${name}` })),
      get: jest?.fn() || ((id) => ({
        fetch: () => Promise.resolve(new Response('{}', { status: 200 }))
      }))
    },
    
    // AI binding for Cloudflare Workers AI
    AI: {
      run: jest?.fn() || (() => Promise.resolve({ response: 'Mock AI response' }))
    },
    
    // Analytics Engine binding
    ANALYTICS: {
      writeDataPoint: jest?.fn() || (() => {})
    },
    
    // Apply any overrides
    ...overrides
  };
}

/**
 * Reset all mock functions in a worker environment
 * @param {Object} env - The mock worker environment to reset
 */
export function resetMockWorkerEnv(env) {
  // Reset KV mocks
  if (env.RECIPE_STORAGE) {
    Object.values(env.RECIPE_STORAGE).forEach(fn => {
      if (fn.mockReset) fn.mockReset();
    });
  }
  
  // Reset R2 mocks
  if (env.RECIPE_IMAGES) {
    Object.values(env.RECIPE_IMAGES).forEach(fn => {
      if (fn.mockReset) fn.mockReset();
    });
  }
  
  // Reset other mocks
  ['SEARCH_DB', 'RECIPE_SAVER', 'AI', 'ANALYTICS'].forEach(binding => {
    if (env[binding] && typeof env[binding] === 'object') {
      Object.values(env[binding]).forEach(fn => {
        if (fn && fn.mockReset) fn.mockReset();
      });
    }
  });
}