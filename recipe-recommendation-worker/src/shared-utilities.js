/**
 * Shared utilities for the recipe recommendation worker
 * This file contains utilities that are used across multiple handlers
 * to avoid circular dependencies
 */

import { MetricsCollector } from '../../shared/metrics-collector.js';

// Global metrics collector
export const metrics = new MetricsCollector();

// Analytics utility for Cloudflare Analytics Engine
export async function sendAnalytics(env, event, data = {}) {
  try {
    if (env.ANALYTICS) {
      const analyticsData = {
        timestamp: Date.now(),
        event,
        ...data
      };
      
      await env.ANALYTICS.writeDataPoint(analyticsData);
    }
  } catch (error) {
    console.error('Analytics write failed:', error);
  }
}

// Error categorization utility
export function categorizeError(error, context = {}) {
  let category = 'unknown';
  let severity = 'error';
  
  if (error.message.includes('AI')) {
    category = 'ai_error';
  } else if (error.message.includes('network') || error.message.includes('fetch')) {
    category = 'network_error';
  } else if (error.message.includes('timeout')) {
    category = 'timeout_error';
  } else if (error.message.includes('validation') || error.message.includes('invalid')) {
    category = 'validation_error';
    severity = 'warning';
  } else if (error.message.includes('not found') || error.message.includes('404')) {
    category = 'not_found_error';
    severity = 'warning';
  }
  
  return { category, severity, context };
}
