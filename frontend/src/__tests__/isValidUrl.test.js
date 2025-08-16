import { isValidUrl } from '../utils';

describe('isValidUrl', () => {
  describe('valid URLs with protocols', () => {
    test('validates http:// URLs', () => {
      expect(isValidUrl('http://example.com')).toBe(true);
      expect(isValidUrl('http://www.example.com')).toBe(true);
      expect(isValidUrl('http://example.com/path')).toBe(true);
      expect(isValidUrl('http://example.com:8080')).toBe(true);
    });

    test('validates https:// URLs', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('https://www.example.com')).toBe(true);
      expect(isValidUrl('https://example.com/path?query=value')).toBe(true);
      expect(isValidUrl('https://example.com#anchor')).toBe(true);
    });

    test('validates complex URLs', () => {
      expect(isValidUrl('https://sub.example.com/path/to/page?q=1&v=2#section')).toBe(true);
      expect(isValidUrl('https://example.co.uk')).toBe(true);
      expect(isValidUrl('https://192.168.1.1')).toBe(true);
      expect(isValidUrl('https://localhost:3000')).toBe(true);
    });
  });

  describe('valid URLs with www prefix', () => {
    test('validates www. URLs without protocol', () => {
      expect(isValidUrl('www.example.com')).toBe(true);
      expect(isValidUrl('www.example.co.uk')).toBe(true);
      expect(isValidUrl('www.sub.example.com')).toBe(true);
      expect(isValidUrl('WWW.EXAMPLE.COM')).toBe(true); // Case insensitive
    });
  });

  describe('valid domain-only URLs', () => {
    test('validates simple domain names', () => {
      expect(isValidUrl('example.com')).toBe(true);
      expect(isValidUrl('example.org')).toBe(true);
      expect(isValidUrl('example.net')).toBe(true);
      expect(isValidUrl('example.io')).toBe(true);
    });

    test('validates complex domain names', () => {
      expect(isValidUrl('sub.example.com')).toBe(true);
      expect(isValidUrl('sub.sub.example.com')).toBe(true);
      expect(isValidUrl('example.co.uk')).toBe(true);
      expect(isValidUrl('my-site.com')).toBe(true);
      expect(isValidUrl('123site.com')).toBe(true);
    });

    test('validates international TLDs', () => {
      expect(isValidUrl('example.travel')).toBe(true);
      expect(isValidUrl('example.museum')).toBe(true);
      expect(isValidUrl('example.photography')).toBe(true);
    });
  });

  describe('invalid URLs', () => {
    test('rejects URLs with spaces', () => {
      expect(isValidUrl('example .com')).toBe(false);
      expect(isValidUrl('ex ample.com')).toBe(false);
      expect(isValidUrl('www.example .com')).toBe(false);
      expect(isValidUrl('http://example .com')).toBe(false);
    });

    test('rejects invalid domain formats', () => {
      expect(isValidUrl('example')).toBe(false); // No TLD
      expect(isValidUrl('.com')).toBe(false); // TLD only
      expect(isValidUrl('example.')).toBe(false); // Trailing dot
      expect(isValidUrl('.example.com')).toBe(false); // Leading dot
      expect(isValidUrl('ex ample.com')).toBe(false); // Space in domain
      expect(isValidUrl('example..com')).toBe(false); // Double dots
    });

    test('rejects single letter TLDs', () => {
      expect(isValidUrl('example.c')).toBe(false);
      expect(isValidUrl('test.x')).toBe(false);
    });

    test('rejects domains with short second-level parts', () => {
      expect(isValidUrl('a.com')).toBe(false); // Single letter before TLD
      expect(isValidUrl('a.b.com')).toBe(false); // The regex requires at least 2 chars in the part before the TLD
    });

    test('rejects completely invalid formats', () => {
      expect(isValidUrl('not a url')).toBe(false);
      expect(isValidUrl('12345')).toBe(false);
      expect(isValidUrl('')).toBe(false);
      expect(isValidUrl('ftp://example.com')).toBe(false); // Not http/https
      expect(isValidUrl('://example.com')).toBe(false); // Missing protocol
      expect(isValidUrl('http://')).toBe(false); // Protocol only
    });

    test('rejects special characters in wrong places', () => {
      expect(isValidUrl('example@.com')).toBe(false);
      expect(isValidUrl('example$.com')).toBe(false);
      expect(isValidUrl('example%.com')).toBe(false);
      expect(isValidUrl('example#.com')).toBe(false);
    });
  });

  describe('edge cases', () => {
    test('handles null and undefined', () => {
      expect(isValidUrl(null)).toBe(false);
      expect(isValidUrl(undefined)).toBe(false);
    });

    test('handles non-string inputs', () => {
      expect(isValidUrl(123)).toBe(false);
      expect(isValidUrl(true)).toBe(false);
      expect(isValidUrl(false)).toBe(false);
      expect(isValidUrl({})).toBe(false);
      expect(isValidUrl([])).toBe(false);
      expect(isValidUrl(() => {})).toBe(false);
    });

    test('handles URLs with ports', () => {
      expect(isValidUrl('example.com:8080')).toBe(false); // Port without protocol not supported by regex
      expect(isValidUrl('http://example.com:3000')).toBe(true);
      expect(isValidUrl('https://example.com:443')).toBe(true);
    });

    test('handles URLs with authentication', () => {
      expect(isValidUrl('http://user:pass@example.com')).toBe(true);
      expect(isValidUrl('https://user@example.com')).toBe(true);
    });

    test('handles IP addresses', () => {
      expect(isValidUrl('192.168.1.1')).toBe(false); // IP without protocol not supported by regex
      expect(isValidUrl('http://192.168.1.1')).toBe(true);
      expect(isValidUrl('https://192.168.1.1:8080')).toBe(true);
    });

    test('handles localhost', () => {
      expect(isValidUrl('localhost')).toBe(false); // No TLD
      expect(isValidUrl('http://localhost')).toBe(true);
      expect(isValidUrl('https://localhost:3000')).toBe(true);
    });
  });
});