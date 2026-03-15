/**
 * Unit tests for shared-utilities.js
 * Covers categorizeError and sendAnalytics branches
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { categorizeError, sendAnalytics } from '../../src/shared-utilities.js';

describe('categorizeError', () => {
  it('should categorize AI errors', () => {
    const result = categorizeError(new Error('AI service error'));
    expect(result.category).toBe('ai_error');
    expect(result.severity).toBe('error');
  });

  it('should categorize network errors', () => {
    const result = categorizeError(new Error('network failure'));
    expect(result.category).toBe('network_error');
    expect(result.severity).toBe('error');
  });

  it('should categorize fetch errors', () => {
    const result = categorizeError(new Error('fetch failed'));
    expect(result.category).toBe('network_error');
    expect(result.severity).toBe('error');
  });

  it('should categorize timeout errors', () => {
    const result = categorizeError(new Error('request timeout exceeded'));
    expect(result.category).toBe('timeout_error');
    expect(result.severity).toBe('error');
  });

  it('should categorize validation errors', () => {
    const result = categorizeError(new Error('validation failed'));
    expect(result.category).toBe('validation_error');
    expect(result.severity).toBe('warning');
  });

  it('should categorize invalid input errors', () => {
    const result = categorizeError(new Error('invalid input provided'));
    expect(result.category).toBe('validation_error');
    expect(result.severity).toBe('warning');
  });

  it('should categorize not found errors', () => {
    const result = categorizeError(new Error('item not found'));
    expect(result.category).toBe('not_found_error');
    expect(result.severity).toBe('warning');
  });

  it('should categorize 404 errors', () => {
    const result = categorizeError(new Error('returned 404 status'));
    expect(result.category).toBe('not_found_error');
    expect(result.severity).toBe('warning');
  });

  it('should categorize unknown errors', () => {
    const result = categorizeError(new Error('something unexpected happened'));
    expect(result.category).toBe('unknown');
    expect(result.severity).toBe('error');
  });

  it('should pass context through', () => {
    const ctx = { requestId: 'test-123' };
    const result = categorizeError(new Error('AI error'), ctx);
    expect(result.category).toBe('ai_error');
    expect(result.context).toBe(ctx);
  });

  it('should use default empty context when not provided', () => {
    const result = categorizeError(new Error('unknown error'));
    expect(result.context).toEqual({});
  });
});

describe('sendAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should skip analytics when ANALYTICS binding is not present', async () => {
    const env = {};
    // Should not throw
    await expect(sendAnalytics(env, 'test_event', { key: 'value' })).resolves.toBeUndefined();
  });

  it('should write data point when ANALYTICS binding is present', async () => {
    const mockWriteDataPoint = vi.fn().mockResolvedValue(undefined);
    const env = { ANALYTICS: { writeDataPoint: mockWriteDataPoint } };

    await sendAnalytics(env, 'test_event', { key: 'value' });

    expect(mockWriteDataPoint).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'test_event',
        key: 'value',
        timestamp: expect.any(Number)
      })
    );
  });

  it('should handle writeDataPoint errors gracefully', async () => {
    const mockWriteDataPoint = vi.fn().mockRejectedValue(new Error('Analytics service down'));
    const env = { ANALYTICS: { writeDataPoint: mockWriteDataPoint } };
    const errorSpy = vi.spyOn(console, 'error');

    await sendAnalytics(env, 'test_event', {});

    expect(errorSpy).toHaveBeenCalledWith('Analytics write failed:', expect.any(Error));
  });

  it('should use empty data object by default', async () => {
    const mockWriteDataPoint = vi.fn().mockResolvedValue(undefined);
    const env = { ANALYTICS: { writeDataPoint: mockWriteDataPoint } };

    await sendAnalytics(env, 'test_event');

    expect(mockWriteDataPoint).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'test_event' })
    );
  });
});
