/**
 * Metrics endpoint handler - provides observability metrics
 */

import { log } from '../../../shared/utility-functions.js';
import { metrics } from '../shared-utilities.js';

export async function handleMetrics(corsHeaders, requestId) {
  try {
    log('debug', 'Metrics requested', { requestId });
    
    const metricsData = {
      timestamp: new Date().toISOString(),
      requestId,
      metrics: metrics.getMetrics(),
      summary: {
        totalMetrics: metrics.metrics.size,
        uptime: Date.now()
      }
    };

    metrics.increment('metrics_requests', 1);
    
    return new Response(JSON.stringify(metricsData, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    log('error', 'Error retrieving metrics', {
      requestId,
      error: error.message
    });

    return new Response(JSON.stringify({ 
      error: 'Failed to retrieve metrics',
      requestId
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
