// Test environment setup for Vitest with Cloudflare Workers
// The Cloudflare Workers environment handles most of the setup automatically

// Set up test environment flag
global.TEST_ENV = true;

console.log('Cloudflare Workers test environment initialized');