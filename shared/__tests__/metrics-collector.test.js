/**
 * Vitest test suite for MetricsCollector
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { MetricsCollector, metrics } from '../metrics-collector.js';

describe('MetricsCollector', () => {
  let collector;

  beforeEach(() => {
    collector = new MetricsCollector();
  });

  describe('increment', () => {
    test('should increment counter without tags', () => {
      collector.increment('test_counter');
      collector.increment('test_counter', 5);
      
      const result = collector.getMetrics();
      expect(result['test_counter:{}'].count).toBe(6);
    });

    test('should increment counter with tags', () => {
      collector.increment('test_counter', 1, { environment: 'test' });
      
      const result = collector.getMetrics();
      expect(result['test_counter:{"environment":"test"}'].count).toBe(1);
      expect(result['test_counter:{"environment":"test"}'].tags).toEqual({ environment: 'test' });
    });

    test('should handle multiple increments with different tags', () => {
      collector.increment('api_calls', 1, { endpoint: '/users' });
      collector.increment('api_calls', 2, { endpoint: '/orders' });
      collector.increment('api_calls', 1, { endpoint: '/users' });
      
      const result = collector.getMetrics();
      expect(result['api_calls:{"endpoint":"/users"}'].count).toBe(2);
      expect(result['api_calls:{"endpoint":"/orders"}'].count).toBe(2);
    });
  });

  describe('timing', () => {
    test('should record timing metrics', () => {
      collector.timing('request_duration', 100);
      collector.timing('request_duration', 200);
      collector.timing('request_duration', 150);
      
      const result = collector.getMetrics();
      const timingKey = 'request_duration_duration:{}';
      
      expect(result[timingKey].count).toBe(3);
      expect(result[timingKey].total).toBe(450);
      expect(result[timingKey].avg).toBe(150);
      expect(result[timingKey].min).toBe(100);
      expect(result[timingKey].max).toBe(200);
    });

    test('should record timing metrics with tags', () => {
      collector.timing('db_query', 50, { table: 'users' });
      collector.timing('db_query', 75, { table: 'orders' });
      
      const result = collector.getMetrics();
      expect(result['db_query_duration:{"table":"users"}'].avg).toBe(50);
      expect(result['db_query_duration:{"table":"orders"}'].avg).toBe(75);
    });

    test('should handle zero duration', () => {
      collector.timing('zero_timer', 0);
      
      const result = collector.getMetrics();
      expect(result['zero_timer_duration:{}'].min).toBe(0);
      expect(result['zero_timer_duration:{}'].max).toBe(0);
    });
  });

  describe('getMetrics', () => {
    test('should return all metrics', () => {
      collector.increment('counter1');
      collector.timing('timer1', 100);
      
      const result = collector.getMetrics();
      expect(Object.keys(result)).toHaveLength(2);
      expect(result['counter1:{}']).toBeDefined();
      expect(result['timer1_duration:{}']).toBeDefined();
    });

    test('should return empty object when no metrics', () => {
      const result = collector.getMetrics();
      expect(result).toEqual({});
    });
  });

  describe('getMetricsByName', () => {
    test('should filter metrics by name', () => {
      collector.increment('api_calls', 1, { endpoint: '/users' });
      collector.increment('api_calls', 1, { endpoint: '/orders' });
      collector.increment('db_queries', 1);
      
      const apiMetrics = collector.getMetricsByName('api_calls');
      expect(Object.keys(apiMetrics)).toHaveLength(2);
      expect(apiMetrics['api_calls:{"endpoint":"/users"}']).toBeDefined();
      expect(apiMetrics['api_calls:{"endpoint":"/orders"}']).toBeDefined();
    });

    test('should return empty object for non-existent metric', () => {
      const result = collector.getMetricsByName('nonexistent');
      expect(result).toEqual({});
    });
  });

  describe('getSummary', () => {
    test('should provide metrics summary', () => {
      collector.increment('counter1', 5);
      collector.increment('counter2', 3);
      collector.timing('timer1', 100);
      collector.timing('timer1', 200);
      
      const summary = collector.getSummary();
      
      expect(summary.totalMetrics).toBe(3);
      expect(summary.counters.counter1).toBe(5);
      expect(summary.counters.counter2).toBe(3);
      expect(summary.timings.timer1.count).toBe(2);
      expect(summary.timings.timer1.avg).toBe(150);
    });
  });

  describe('reset', () => {
    test('should clear all metrics', () => {
      collector.increment('test');
      collector.timing('test_timer', 100);
      
      expect(Object.keys(collector.getMetrics())).toHaveLength(2);
      
      collector.reset();
      
      expect(collector.getMetrics()).toEqual({});
    });
  });

  describe('edge cases', () => {
    test('should handle negative increments', () => {
      collector.increment('negative_test', -5);
      
      const result = collector.getMetrics();
      expect(result['negative_test:{}'].count).toBe(-5);
    });

    test('should handle complex tags', () => {
      const complexTags = {
        environment: 'production',
        version: '1.0.0',
        nested: { key: 'value' }
      };
      
      collector.increment('complex_metric', 1, complexTags);
      
      const result = collector.getMetrics();
      const key = Object.keys(result)[0];
      expect(result[key].tags).toEqual(complexTags);
    });
  });
});

describe('Global metrics instance', () => {
  beforeEach(() => {
    metrics.reset();
  });

  test('should work as singleton', () => {
    metrics.increment('global_test');
    
    const result = metrics.getMetrics();
    expect(result['global_test:{}'].count).toBe(1);
  });

  test('should maintain state across calls', () => {
    metrics.increment('persistent_counter');
    metrics.increment('persistent_counter', 2);
    
    const result = metrics.getMetrics();
    expect(result['persistent_counter:{}'].count).toBe(3);
  });
});
