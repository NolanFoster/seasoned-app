import { describe, it, expect } from 'vitest';
import {
  getSeasonForMonth,
  getPeakProduce,
  getSeasonalitySummary
} from '../seasonal-produce.js';

describe('seasonal-produce heuristics', () => {
  it('correctly maps months to seasons in northern hemisphere', () => {
    expect(getSeasonForMonth(1, 'n')).toBe('winter');
    expect(getSeasonForMonth(4, 'n')).toBe('spring');
    expect(getSeasonForMonth(7, 'n')).toBe('summer');
    expect(getSeasonForMonth(10, 'n')).toBe('fall');
  });

  it('inverts seasons in southern hemisphere', () => {
    expect(getSeasonForMonth(1, 's')).toBe('summer');
    expect(getSeasonForMonth(4, 's')).toBe('fall');
    expect(getSeasonForMonth(7, 's')).toBe('winter');
    expect(getSeasonForMonth(10, 's')).toBe('spring');
  });

  it('returns peak produce list', () => {
    const summerProduce = getPeakProduce(7, 'n');
    expect(summerProduce).toContain('tomatoes');
    expect(summerProduce).toContain('zucchini');
  });

  it('returns formatted seasonality summary', () => {
    const summary = getSeasonalitySummary(8, 'n');
    expect(summary.season).toBe('summer');
    expect(summary.hemisphere).toBe('n');
    expect(summary.peakProduce).toContain('corn');
    expect(summary.label).toContain('Summer Peak Produce');
  });

  it('throws on invalid month', () => {
    expect(() => getSeasonForMonth(13, 'n')).toThrow(/Month must be between 1 and 12/);
  });
});
