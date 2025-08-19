import { describe, test, expect } from 'vitest';
import { formatDuration, isValidUrl, decimalToFraction, formatIngredientAmount } from '../utility-functions.js';

describe('utility-functions', () => {
  describe('formatDuration', () => {
    test('formats ISO 8601 duration correctly', () => {
      expect(formatDuration('PT1H30M')).toBe('1 h 30 m');
      expect(formatDuration('PT45M')).toBe('45 m');
      expect(formatDuration('PT2H')).toBe('2 h');
      expect(formatDuration('PT1H')).toBe('1 h');
    });

    test('returns empty string for invalid input', () => {
      expect(formatDuration('')).toBe('');
      expect(formatDuration(null)).toBe('');
      expect(formatDuration(undefined)).toBe('');
    });

    test('returns as-is for non-ISO duration strings', () => {
      expect(formatDuration('30 minutes')).toBe('30 minutes');
      expect(formatDuration('1 hour')).toBe('1 hour');
    });
  });

  describe('isValidUrl', () => {
    test('validates URLs with protocols', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('http://example.com')).toBe(true);
      expect(isValidUrl('https://www.example.com')).toBe(true);
    });

    test('validates URLs starting with www', () => {
      expect(isValidUrl('www.example.com')).toBe(true);
      expect(isValidUrl('www.recipe-site.com')).toBe(true);
    });

    test('validates domain names', () => {
      expect(isValidUrl('example.com')).toBe(true);
      expect(isValidUrl('recipes.food.com')).toBe(true);
    });

    test('rejects invalid URLs', () => {
      expect(isValidUrl('not a url')).toBe(false);
      expect(isValidUrl('just-text')).toBe(false);
      expect(isValidUrl('')).toBe(false);
      expect(isValidUrl('example')).toBe(false);
    });
  });

  describe('decimalToFraction', () => {
    test('converts common decimal fractions correctly', () => {
      expect(decimalToFraction(0.125)).toBe('1/8');
      expect(decimalToFraction(0.25)).toBe('1/4');
      expect(decimalToFraction(0.333)).toBe('1/3');
      expect(decimalToFraction(0.375)).toBe('3/8');
      expect(decimalToFraction(0.5)).toBe('1/2');
      expect(decimalToFraction(0.625)).toBe('5/8');
      expect(decimalToFraction(0.666)).toBe('2/3');
      expect(decimalToFraction(0.75)).toBe('3/4');
      expect(decimalToFraction(0.875)).toBe('7/8');
    });

    test('handles the specific problematic decimal from the issue', () => {
      expect(decimalToFraction(0.33333334326744)).toBe('1/3');
    });

    test('converts mixed numbers correctly', () => {
      expect(decimalToFraction(1.5)).toBe('1 1/2');
      expect(decimalToFraction(2.25)).toBe('2 1/4');
      expect(decimalToFraction(2.333)).toBe('2 1/3');
      expect(decimalToFraction(3.75)).toBe('3 3/4');
    });

    test('handles whole numbers', () => {
      expect(decimalToFraction(1)).toBe('1');
      expect(decimalToFraction(2)).toBe('2');
      expect(decimalToFraction(3)).toBe('3');
      expect(decimalToFraction(10)).toBe('10');
    });

    test('handles edge cases', () => {
      expect(decimalToFraction(0)).toBe('0');
      expect(decimalToFraction(null)).toBe('');
      expect(decimalToFraction(undefined)).toBe('');
      expect(decimalToFraction(NaN)).toBe('');
    });

    test('handles less common fractions', () => {
      expect(decimalToFraction(0.2)).toBe('1/5');
      expect(decimalToFraction(0.4)).toBe('2/5');
      expect(decimalToFraction(0.6)).toBe('3/5');
      expect(decimalToFraction(0.8)).toBe('4/5');
    });
  });

  describe('formatIngredientAmount', () => {
    test('converts decimal amounts in ingredient strings', () => {
      expect(formatIngredientAmount('0.33333334326744 cup flour')).toBe('1/3 cup flour');
      expect(formatIngredientAmount('1.5 tablespoons sugar')).toBe('1 1/2 tablespoons sugar');
      expect(formatIngredientAmount('0.25 teaspoon salt')).toBe('1/4 teaspoon salt');
      expect(formatIngredientAmount('2.666 cups milk')).toBe('2 2/3 cups milk');
      expect(formatIngredientAmount('0.125 pound butter')).toBe('1/8 pound butter');
    });

    test('preserves whole numbers', () => {
      expect(formatIngredientAmount('3 eggs')).toBe('3 eggs');
      expect(formatIngredientAmount('2 cups water')).toBe('2 cups water');
      expect(formatIngredientAmount('10 ounces chocolate')).toBe('10 ounces chocolate');
    });

    test('handles ingredients without numbers', () => {
      expect(formatIngredientAmount('pinch of salt')).toBe('pinch of salt');
      expect(formatIngredientAmount('fresh herbs to taste')).toBe('fresh herbs to taste');
      expect(formatIngredientAmount('zest of one lemon')).toBe('zest of one lemon');
    });

    test('preserves already formatted ASCII fractions', () => {
      expect(formatIngredientAmount('1/2 cup already formatted')).toBe('1/2 cup already formatted');
      expect(formatIngredientAmount('3/4 teaspoon vanilla')).toBe('3/4 teaspoon vanilla');
      expect(formatIngredientAmount('2 1/3 cups flour')).toBe('2 1/3 cups flour');
    });

    test('converts Unicode fractions to ASCII fractions', () => {
      expect(formatIngredientAmount('½ cup sugar')).toBe('1/2 cup sugar');
      expect(formatIngredientAmount('¼ teaspoon salt')).toBe('1/4 teaspoon salt');
      expect(formatIngredientAmount('¾ pound butter')).toBe('3/4 pound butter');
      expect(formatIngredientAmount('⅓ cup milk')).toBe('1/3 cup milk');
      expect(formatIngredientAmount('⅔ tablespoon honey')).toBe('2/3 tablespoon honey');
      expect(formatIngredientAmount('⅛ teaspoon nutmeg')).toBe('1/8 teaspoon nutmeg');
      expect(formatIngredientAmount('⅜ cup cocoa')).toBe('3/8 cup cocoa');
      expect(formatIngredientAmount('⅝ cup water')).toBe('5/8 cup water');
      expect(formatIngredientAmount('⅞ cup flour')).toBe('7/8 cup flour');
    });

    test('handles mixed Unicode and decimal conversions', () => {
      expect(formatIngredientAmount('½ cup sugar and 0.25 cup honey')).toBe('1/2 cup sugar and 1/4 cup honey');
      expect(formatIngredientAmount('Use ¾ cup or 0.75 cup flour')).toBe('Use 3/4 cup or 3/4 cup flour');
    });

    test('handles multiple Unicode fractions in one string', () => {
      expect(formatIngredientAmount('½ cup sugar, ¼ cup butter, ⅓ cup milk')).toBe('1/2 cup sugar, 1/4 cup butter, 1/3 cup milk');
    });

    test('handles edge cases', () => {
      expect(formatIngredientAmount('')).toBe('');
      expect(formatIngredientAmount(null)).toBe('');
      expect(formatIngredientAmount(undefined)).toBe('');
      expect(formatIngredientAmount(123)).toBe('');
    });

    test('handles complex ingredient strings', () => {
      expect(formatIngredientAmount('2.5 cups all-purpose flour')).toBe('2 1/2 cups all-purpose flour');
      expect(formatIngredientAmount('0.666 cup (about ⅔ cup) sugar')).toBe('2/3 cup (about 2/3 cup) sugar');
      expect(formatIngredientAmount('1.333 cups (1⅓ cups) broth')).toBe('1 1/3 cups (1 1/3 cups) broth');
    });
  });
});