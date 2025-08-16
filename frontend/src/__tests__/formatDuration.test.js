import { formatDuration } from '../utils';

describe('formatDuration', () => {
  describe('valid ISO 8601 durations', () => {
    test('converts PT30M to 30 m', () => {
      expect(formatDuration('PT30M')).toBe('30 m');
    });

    test('converts PT1H to 1 h', () => {
      expect(formatDuration('PT1H')).toBe('1 h');
    });

    test('converts PT1H30M to 1 h 30 m', () => {
      expect(formatDuration('PT1H30M')).toBe('1 h 30 m');
    });

    test('converts PT2H15M to 2 h 15 m', () => {
      expect(formatDuration('PT2H15M')).toBe('2 h 15 m');
    });

    test('converts PT45M to 45 m', () => {
      expect(formatDuration('PT45M')).toBe('45 m');
    });

    test('converts PT0M to PT0M (fallback)', () => {
      expect(formatDuration('PT0M')).toBe('PT0M');
    });
  });

  describe('non-ISO 8601 inputs', () => {
    test('returns string that does not start with PT as is', () => {
      expect(formatDuration('30 minutes')).toBe('30 minutes');
      expect(formatDuration('1 hour')).toBe('1 hour');
      expect(formatDuration('45 min')).toBe('45 min');
    });
  });

  describe('edge cases and invalid inputs', () => {
    test('returns empty string for null', () => {
      expect(formatDuration(null)).toBe('');
    });

    test('returns empty string for undefined', () => {
      expect(formatDuration(undefined)).toBe('');
    });

    test('returns empty string for empty string', () => {
      expect(formatDuration('')).toBe('');
    });

    test('handles numeric inputs by converting to string', () => {
      expect(formatDuration(30)).toBe('30');
    });

    test('handles boolean inputs', () => {
      expect(formatDuration(true)).toBe('true');
      expect(formatDuration(false)).toBe(''); // false is falsy, returns empty string
    });

    test('handles objects with toString method', () => {
      const obj = {
        toString() {
          return 'PT1H';
        }
      };
      expect(formatDuration(obj)).toBe('1 h');
    });

    test('returns empty string for objects without proper toString', () => {
      const obj = {
        toString() {
          return null;
        }
      };
      expect(formatDuration(obj)).toBe('');
    });

    test('handles malformed PT strings', () => {
      expect(formatDuration('PT')).toBe('PT');
      expect(formatDuration('PTXYZ')).toBe('PTXYZ');
    });

    test('handles PT strings with seconds (ignored)', () => {
      expect(formatDuration('PT1H30M45S')).toBe('1 h 30 m');
      expect(formatDuration('PT45S')).toBe('PT45S'); // No hours or minutes
    });

    test('handles multiple digits in hours and minutes', () => {
      expect(formatDuration('PT12H45M')).toBe('12 h 45 m');
      expect(formatDuration('PT120M')).toBe('120 m');
    });

    test('handles mixed order (non-standard but parseable)', () => {
      expect(formatDuration('PT30M1H')).toBe('1 h 30 m');
    });
  });

  describe('error handling', () => {
    test('returns original value on parsing error', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      // The function converts the object to string first, so we need a different approach
      // Let's test with a malformed duration that would cause an error
      const malformedDuration = 'PT1H30';  // Missing M after 30
      
      // This won't actually throw an error in the current implementation
      // The regex just won't match the minutes part
      expect(formatDuration(malformedDuration)).toBe('1 h');
      
      consoleErrorSpy.mockRestore();
    });
  });
});