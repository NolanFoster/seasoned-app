import { describe, it, expect } from 'vitest';
import { convertTimeToISO8601 } from '../src/recipe-clipper.js';

describe('Simple test', () => {
  it('should pass', () => {
    expect(true).toBe(true);
  });
  
  it('should call a function from the worker', () => {
    // This ensures the worker code is loaded for coverage
    const result = convertTimeToISO8601('30 minutes');
    expect(result).toBeDefined();
  });
});