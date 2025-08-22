/**
 * Metrics Collection Utility
 * A reusable metrics collector for tracking performance and usage across workers
 */

export class MetricsCollector {
  constructor() {
    this.metrics = new Map();
  }

  /**
   * Increment a counter metric
   * @param {string} metric - The metric name
   * @param {number} value - The value to increment by (default: 1)
   * @param {Object} tags - Additional tags for the metric
   */
  increment(metric, value = 1, tags = {}) {
    const key = `${metric}:${JSON.stringify(tags)}`;
    const current = this.metrics.get(key) || { count: 0, tags };
    current.count += value;
    this.metrics.set(key, current);
  }

  /**
   * Record timing information for a metric
   * @param {string} metric - The metric name
   * @param {number} duration - The duration in milliseconds
   * @param {Object} tags - Additional tags for the metric
   */
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

  /**
   * Get all collected metrics
   * @returns {Object} All metrics data
   */
  getMetrics() {
    const result = {};
    for (const [key, value] of this.metrics.entries()) {
      result[key] = value;
    }
    return result;
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.metrics.clear();
  }

  /**
   * Get metrics for a specific metric name
   * @param {string} metricName - The metric name to filter by
   * @returns {Object} Filtered metrics
   */
  getMetricsByName(metricName) {
    const result = {};
    for (const [key, value] of this.metrics.entries()) {
      if (key.startsWith(metricName)) {
        result[key] = value;
      }
    }
    return result;
  }

  /**
   * Get a summary of all metrics
   * @returns {Object} Summary statistics
   */
  getSummary() {
    const metrics = this.getMetrics();
    const summary = {
      totalMetrics: Object.keys(metrics).length,
      counters: {},
      timings: {}
    };

    for (const [key, value] of Object.entries(metrics)) {
      if (key.includes('_duration:')) {
        const metricName = key.split('_duration:')[0];
        summary.timings[metricName] = {
          count: value.count,
          avg: value.avg,
          min: value.min,
          max: value.max,
          total: value.total
        };
      } else {
        const metricName = key.split(':')[0];
        if (!summary.counters[metricName]) {
          summary.counters[metricName] = 0;
        }
        summary.counters[metricName] += value.count;
      }
    }

    return summary;
  }
}

// Export a default instance for convenience
export const metrics = new MetricsCollector();

export default MetricsCollector;
