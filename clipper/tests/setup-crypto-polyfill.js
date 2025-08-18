/**
 * Crypto Polyfill for Node.js Test Environment
 * 
 * This file provides a Web Crypto API polyfill for Node.js testing
 * since the clipper uses shared/kv-storage.js which relies on crypto.subtle
 */

// Check if crypto is already available (e.g., in newer Node.js versions)
if (typeof global.crypto === 'undefined') {
  // Create a mock crypto object with subtle API
  const mockArrayBuffer = new ArrayBuffer(32);
  const mockUint8Array = new Uint8Array(mockArrayBuffer);
  
  // Fill with predictable values for consistent hashing in tests
  for (let i = 0; i < mockUint8Array.length; i++) {
    mockUint8Array[i] = i % 256;
  }

  Object.defineProperty(global, 'crypto', {
    value: {
      subtle: {
        digest: async (algorithm, data) => {
          // Simple mock that returns a consistent ArrayBuffer
          // In real tests, this would be the SHA-256 hash of the input
          return mockArrayBuffer.slice(); // Return a copy
        }
      }
    },
    writable: true,
    configurable: true
  });
}

// Ensure TextEncoder is available (usually available in Node.js 11+)
if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = class TextEncoder {
    encode(str) {
      return new Uint8Array(Buffer.from(str, 'utf8'));
    }
  };
}

// Ensure TextDecoder is available (usually available in Node.js 11+)
if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = class TextDecoder {
    decode(buffer) {
      return Buffer.from(buffer).toString('utf8');
    }
  };
}

console.log('✅ Crypto polyfill loaded for Node.js test environment');