import { formatDuration, isValidUrl, formatIngredientAmount, decimalToFraction } from '../../__mocks__/utility-functions.js';

describe('Shared Utility Functions', () => {
  describe('formatDuration', () => {
    it('should format ISO 8601 durations correctly', () => {
      expect(formatDuration('PT30M')).toBe('30 m');
      expect(formatDuration('PT1H')).toBe('1 h');
      expect(formatDuration('PT1H30M')).toBe('1 h 30 m');
      expect(formatDuration('PT2H45M')).toBe('2 h 45 m');
      expect(formatDuration('PT90M')).toBe('90 m');
    });

    it('should handle invalid inputs', () => {
      expect(formatDuration(null)).toBe('');
      expect(formatDuration(undefined)).toBe('');
      expect(formatDuration('')).toBe('');
      expect(formatDuration(123)).toBe('123');
      expect(formatDuration({})).toBe('[object Object]');
    });

    it('should return non-ISO durations as-is', () => {
      expect(formatDuration('30 minutes')).toBe('30 minutes');
      expect(formatDuration('1 hour')).toBe('1 hour');
      expect(formatDuration('45 min')).toBe('45 min');
    });

    it('should handle edge cases', () => {
      expect(formatDuration('PT0M')).toBe('PT0M');
      expect(formatDuration('PT')).toBe('PT');
      expect(formatDuration('PTXYZ')).toBe('PTXYZ');
    });

    it('should handle errors gracefully', () => {
      // Test with object that throws on toString()
      const problematicObject = {
        toString: () => { throw new Error('Cannot convert'); }
      };
      expect(formatDuration(problematicObject)).toBe('');
    });
  });

  describe('isValidUrl', () => {
    it('should validate URLs with protocols', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('http://example.com')).toBe(true);
      expect(isValidUrl('https://sub.example.com')).toBe(true);
      expect(isValidUrl('https://example.com/path')).toBe(true);
    });

    it('should validate URLs starting with www', () => {
      expect(isValidUrl('www.example.com')).toBe(true);
      expect(isValidUrl('www.sub.example.com')).toBe(true);
      expect(isValidUrl('WWW.EXAMPLE.COM')).toBe(true);
    });

    it('should validate domain-only URLs', () => {
      expect(isValidUrl('example.com')).toBe(true);
      expect(isValidUrl('sub.example.com')).toBe(true);
      expect(isValidUrl('my-site.co.uk')).toBe(true);
      expect(isValidUrl('test123.org')).toBe(true);
    });

    it('should reject invalid URLs', () => {
      expect(isValidUrl('not a url')).toBe(false);
      expect(isValidUrl('example')).toBe(false);
      expect(isValidUrl('.com')).toBe(false);
      expect(isValidUrl('example.')).toBe(false);
      expect(isValidUrl('a.b')).toBe(false); // TLD too short
      expect(isValidUrl('http://')).toBe(false);
      expect(isValidUrl('')).toBe(false);
      expect(isValidUrl('   ')).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(isValidUrl(null)).toBe(false);
      expect(isValidUrl(undefined)).toBe(false);
      expect(isValidUrl(123)).toBe(false);
      expect(isValidUrl({})).toBe(false);
    });
  });

  describe('decimalToFraction', () => {
    it('should convert common decimals to fractions', () => {
      expect(decimalToFraction(0.5)).toBe('1/2');
      expect(decimalToFraction(0.25)).toBe('1/4');
      expect(decimalToFraction(0.75)).toBe('3/4');
      expect(decimalToFraction(0.333)).toBe('1/3');
      expect(decimalToFraction(0.666)).toBe('2/3');
      expect(decimalToFraction(0.125)).toBe('1/8');
      expect(decimalToFraction(0.375)).toBe('3/8');
      expect(decimalToFraction(0.625)).toBe('5/8');
      expect(decimalToFraction(0.875)).toBe('7/8');
    });

    it('should handle mixed numbers', () => {
      expect(decimalToFraction(1.5)).toBe('1 1/2');
      expect(decimalToFraction(2.25)).toBe('2 1/4');
      expect(decimalToFraction(3.75)).toBe('3 3/4');
      expect(decimalToFraction(1.333)).toBe('1 1/3');
    });

    it('should handle whole numbers', () => {
      expect(decimalToFraction(0)).toBe('0');
      expect(decimalToFraction(1)).toBe('1');
      expect(decimalToFraction(5)).toBe('5');
      expect(decimalToFraction(1.0)).toBe('1');
    });

    it('should handle edge cases', () => {
      expect(decimalToFraction(null)).toBe('');
      expect(decimalToFraction(undefined)).toBe('');
      expect(decimalToFraction(NaN)).toBe('');
      expect(decimalToFraction('not a number')).toBe('');
    });

    it('should handle less common fractions', () => {
      expect(decimalToFraction(0.2)).toBe('1/5');
      expect(decimalToFraction(0.4)).toBe('2/5');
      expect(decimalToFraction(0.6)).toBe('3/5');
      expect(decimalToFraction(0.8)).toBe('4/5');
    });

    it('should handle very small fractional parts', () => {
      expect(decimalToFraction(1.001)).toBe('1');
      expect(decimalToFraction(2.009)).toBe('2');
    });

    it('should handle fractions requiring calculation', () => {
      // These don't match common fractions exactly
      expect(decimalToFraction(0.35)).toMatch(/^\d+\/\d+$/);
      expect(decimalToFraction(0.15)).toMatch(/^\d+\/\d+$/);
      expect(decimalToFraction(0.85)).toMatch(/^\d+\/\d+$/);
    });
  });

  describe('formatIngredientAmount', () => {
    it('should convert Unicode fractions to ASCII', () => {
      expect(formatIngredientAmount('½ cup')).toBe('1/2 cup');
      expect(formatIngredientAmount('¼ teaspoon')).toBe('1/4 teaspoon');
      expect(formatIngredientAmount('¾ tablespoon')).toBe('3/4 tablespoon');
      expect(formatIngredientAmount('⅓ cup flour')).toBe('1/3 cup flour');
      expect(formatIngredientAmount('⅔ cup sugar')).toBe('2/3 cup sugar');
    });

    it('should handle mixed numbers with Unicode fractions', () => {
      expect(formatIngredientAmount('1½ cups')).toBe('1 1/2 cups');
      expect(formatIngredientAmount('2¼ teaspoons')).toBe('2 1/4 teaspoons');
      expect(formatIngredientAmount('3⅓ tablespoons')).toBe('3 1/3 tablespoons');
      expect(formatIngredientAmount('1⅝ cups flour')).toBe('1 5/8 cups flour');
    });

    it('should convert decimal amounts to fractions', () => {
      expect(formatIngredientAmount('0.5 cup')).toBe('1/2 cup');
      expect(formatIngredientAmount('0.25 teaspoon')).toBe('1/4 teaspoon');
      expect(formatIngredientAmount('0.75 tablespoon')).toBe('3/4 tablespoon');
      expect(formatIngredientAmount('1.5 cups')).toBe('1 1/2 cups');
      expect(formatIngredientAmount('2.25 teaspoons')).toBe('2 1/4 teaspoons');
    });

    it('should handle multiple fractions in one string', () => {
      expect(formatIngredientAmount('½ to ¾ cup')).toBe('1/2 to 3/4 cup');
      expect(formatIngredientAmount('1½ - 2½ cups')).toBe('1 1/2 - 2 1/2 cups');
    });

    it('should keep whole numbers as-is', () => {
      expect(formatIngredientAmount('2 cups')).toBe('2 cups');
      expect(formatIngredientAmount('3 tablespoons')).toBe('3 tablespoons');
      expect(formatIngredientAmount('10 ounces')).toBe('10 ounces');
    });

    it('should handle edge cases', () => {
      expect(formatIngredientAmount(null)).toBe('');
      expect(formatIngredientAmount(undefined)).toBe('');
      expect(formatIngredientAmount('')).toBe('');
      expect(formatIngredientAmount(123)).toBe('');
      expect(formatIngredientAmount({})).toBe('');
    });

    it('should handle all Unicode fraction replacements', () => {
      expect(formatIngredientAmount('⅕ cup')).toBe('1/5 cup');
      expect(formatIngredientAmount('⅖ cups')).toBe('2/5 cups');
      expect(formatIngredientAmount('⅗ tablespoon')).toBe('3/5 tablespoon');
      expect(formatIngredientAmount('⅘ teaspoon')).toBe('4/5 teaspoon');
      expect(formatIngredientAmount('⅙ ounce')).toBe('1/6 ounce');
      expect(formatIngredientAmount('⅚ pound')).toBe('5/6 pound');
      expect(formatIngredientAmount('⅐ gram')).toBe('1/7 gram');
      expect(formatIngredientAmount('⅛ cup')).toBe('1/8 cup');
      expect(formatIngredientAmount('⅜ tablespoon')).toBe('3/8 tablespoon');
      expect(formatIngredientAmount('⅝ teaspoon')).toBe('5/8 teaspoon');
      expect(formatIngredientAmount('⅞ cup')).toBe('7/8 cup');
      expect(formatIngredientAmount('⅑ liter')).toBe('1/9 liter');
      expect(formatIngredientAmount('⅒ kilogram')).toBe('1/10 kilogram');
    });

    it('should handle complex ingredient strings', () => {
      expect(formatIngredientAmount('1½ cups all-purpose flour, plus 2 tablespoons')).toBe('1 1/2 cups all-purpose flour, plus 2 tablespoons');
      expect(formatIngredientAmount('0.5 cup (1 stick) butter')).toBe('1/2 cup (1 stick) butter');
      expect(formatIngredientAmount('2.5 pounds chicken')).toBe('2 1/2 pounds chicken');
    });
  });
});