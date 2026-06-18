// Ensure `crypto` is accessible as a bare top-level identifier in Node 18.
// Node 18 exposes the Web Crypto API on globalThis.crypto (stable since 18.0.0)
// but the bare `crypto` binding was not added until Node 19. This polyfill
// materializes it so production code using `crypto.getRandomValues()` etc. works
// in both Node 18 and Node 20+ test environments.
const _g = globalThis as Record<string, unknown>;
if (typeof crypto === 'undefined' && typeof _g['crypto'] !== 'undefined') {
  Object.defineProperty(globalThis, 'crypto', {
    value: _g['crypto'],
    writable: true,
    configurable: true,
    enumerable: true,
  });
}
