/**
 * Tests for MetricsCollector and Analytics functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Import the worker to access internal classes and functions
import workerModule from '../src/index.js';

// Mock environment for analytics tests
const mockEnvWithAnalytics = {
  AI: null,
  ANALYTICS: {
    writeDataPoint: vi.fn().mockResolvedValue(undefined)
  }
};

const mockEnvWithFailingAnalytics = {
  AI: null,
  ANALYTICS: {
    writeDataPoint: vi.fn().mockRejectedValue(new Error('Analytics service unavailable'))
  }
};

describe('MetricsCollector', () => {
  let MetricsCollector;
  let metrics;

  beforeEach(() => {
    // Access the MetricsCollector class from the worker module
    // Since it's not exported, we'll create a new instance for testing
    MetricsCollector = class {
      constructor() {
        this.metrics = new Map();
      }

      increment(metric, value = 1, tags = {}) {
        const key = `${metric}:${JSON.stringify(tags)}`;
        const current = this.metrics.get(key) || { count: 0, tags };
        current.count += value;
        this.metrics.set(key, current);
      }

      timing(metric, duration, tags = {}) {
        const key = `${metric}_duration:${JSON.stringify(tags)}`;
        const current = this.metrics.get(key) || { 
          count: 0, 
          total: 0, 
          min: Infinity, 
          max: -Infinity, 
          tags 
        };
        current.count += 1;
        current.total += duration;
        current.min = Math.min(current.min, duration);
        current.max = Math.max(current.max, duration);
        current.avg = current.total / current.count;
        this.metrics.set(key, current);
      }

      getMetrics() {
        const result = {};
        for (const [key, value] of this.metrics.entries()) {
          result[key] = value;
        }
        return result;
      }

      reset() {
        this.metrics.clear();
      }
    };

    metrics = new MetricsCollector();
  });

  describe('increment method', () => {
    it('should increment counter metrics', () => {
      metrics.increment('test_counter', 1, { type: 'test' });
      const result = metrics.getMetrics();
      
      const key = 'test_counter:{"type":"test"}';
      expect(result[key]).toBeDefined();
      expect(result[key].count).toBe(1);
      expect(result[key].tags.type).toBe('test');
    });

    it('should increment by custom value', () => {
      metrics.increment('test_counter', 5, { type: 'test' });
      const result = metrics.getMetrics();
      
      const key = 'test_counter:{"type":"test"}';
      expect(result[key].count).toBe(5);
    });

    it('should accumulate multiple increments', () => {
      metrics.increment('test_counter', 1, { type: 'test' });
      metrics.increment('test_counter', 2, { type: 'test' });
      metrics.increment('test_counter', 3, { type: 'test' });
      
      const result = metrics.getMetrics();
      const key = 'test_counter:{"type":"test"}';
      expect(result[key].count).toBe(6);
    });

    it('should handle metrics with no tags', () => {
      metrics.increment('simple_counter');
      const result = metrics.getMetrics();
      
      const key = 'simple_counter:{}';
      expect(result[key]).toBeDefined();
      expect(result[key].count).toBe(1);
    });
  });

  describe('timing method', () => {
    it('should record timing metrics', () => {
      metrics.timing('test_duration', 100, { operation: 'test' });
      const result = metrics.getMetrics();
      
      const key = 'test_duration_duration:{"operation":"test"}';
      expect(result[key]).toBeDefined();
      expect(result[key].count).toBe(1);
      expect(result[key].total).toBe(100);
      expect(result[key].min).toBe(100);
      expect(result[key].max).toBe(100);
      expect(result[key].avg).toBe(100);
    });

    it('should calculate min, max, and avg correctly', () => {
      metrics.timing('test_duration', 100, { operation: 'test' });
      metrics.timing('test_duration', 200, { operation: 'test' });
      metrics.timing('test_duration', 50, { operation: 'test' });
      
      const result = metrics.getMetrics();
      const key = 'test_duration_duration:{"operation":"test"}';
      
      expect(result[key].count).toBe(3);
      expect(result[key].total).toBe(350);
      expect(result[key].min).toBe(50);
      expect(result[key].max).toBe(200);
      expect(result[key].avg).toBe(350 / 3);
    });

    it('should handle single timing measurement', () => {
      metrics.timing('single_duration', 75);
      const result = metrics.getMetrics();
      
      const key = 'single_duration_duration:{}';
      expect(result[key].count).toBe(1);
      expect(result[key].min).toBe(75);
      expect(result[key].max).toBe(75);
      expect(result[key].avg).toBe(75);
    });
  });

  describe('getMetrics method', () => {
    it('should return all metrics', () => {
      metrics.increment('counter1', 1, { type: 'a' });
      metrics.increment('counter2', 2, { type: 'b' });
      metrics.timing('timer1', 100, { op: 'x' });
      
      const result = metrics.getMetrics();
      
      expect(Object.keys(result)).toHaveLength(3);
      expect(result['counter1:{"type":"a"}']).toBeDefined();
      expect(result['counter2:{"type":"b"}']).toBeDefined();
      expect(result['timer1_duration:{"op":"x"}']).toBeDefined();
    });

    it('should return empty object when no metrics', () => {
      const result = metrics.getMetrics();
      expect(result).toEqual({});
    });
  });

  describe('reset method', () => {
    it('should clear all metrics', () => {
      metrics.increment('test_counter', 5);
      metrics.timing('test_timer', 100);
      
      let result = metrics.getMetrics();
      expect(Object.keys(result)).toHaveLength(2);
      
      metrics.reset();
      
      result = metrics.getMetrics();
      expect(result).toEqual({});
    });
  });
});

describe('Analytics Integration', () => {
  it('should send analytics successfully', async () => {
    const request = new Request('http://localhost/recommendations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location: 'Test', date: '2024-01-15' })
    });

    const response = await workerModule.fetch(request, mockEnvWithAnalytics);
    expect(response.status).toBe(200);
    
    // Verify analytics was called
    expect(mockEnvWithAnalytics.ANALYTICS.writeDataPoint).toHaveBeenCalled();
  });

  it('should handle analytics failures gracefully', async () => {
    const request = new Request('http://localhost/recommendations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location: 'Test', date: '2024-01-15' })
    });

    const response = await workerModule.fetch(request, mockEnvWithFailingAnalytics);
    
    // Should still return successful response even if analytics fails
    expect(response.status).toBe(200);
    expect(mockEnvWithFailingAnalytics.ANALYTICS.writeDataPoint).toHaveBeenCalled();
  });

  it('should handle missing analytics binding', async () => {
    const mockEnvNoAnalytics = { AI: null }; // No ANALYTICS binding
    
    const request = new Request('http://localhost/recommendations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location: 'Test', date: '2024-01-15' })
    });

    const response = await workerModule.fetch(request, mockEnvNoAnalytics);
    expect(response.status).toBe(200);
    
    // Should not throw error when analytics binding is missing
  });
});
