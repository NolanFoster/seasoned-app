/**
 * Health check endpoint handler - provides service health status
 */

import { log } from '../../../shared/utility-functions.js';
import { metrics } from '../index.js';

export async function handleHealth(env, corsHeaders, requestId) {
  const startTime = Date.now();
  
  try {
    log('debug', 'Health check requested', { requestId });
    
    // Test AI binding availability
    const aiAvailable = !!env.AI;
    let aiStatus = 'not_configured';
    
    if (aiAvailable) {
      try {
        // Simple test to verify AI binding works
        await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
          prompt: 'Say "OK"',
          max_tokens: 5
        });
        aiStatus = 'healthy';
      } catch (error) {
        aiStatus = 'error';
        log('warn', 'AI health check failed', { requestId, error: error.message });
      }
    }

    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      requestId,
      services: {
        ai: aiStatus
      },
      metrics: {
        uptime: Date.now() - startTime,
        totalRequests: Array.from(metrics.metrics.keys())
          .filter(key => key.startsWith('requests_total'))
          .reduce((sum, key) => sum + (metrics.metrics.get(key)?.count || 0), 0)
      }
    };

    const duration = Date.now() - startTime;
    metrics.increment('health_checks', 1);
    metrics.timing('health_check_duration', duration);
    
    log('info', 'Health check completed', {
      requestId,
      duration: `${duration}ms`,
      aiStatus
    });

    return new Response(JSON.stringify(health), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    
    log('error', 'Health check failed', {
      requestId,
      error: error.message,
      duration: `${duration}ms`
    });

    return new Response(JSON.stringify({ 
      status: 'unhealthy',
      error: error.message,
      requestId
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
