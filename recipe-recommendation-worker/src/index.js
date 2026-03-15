/**
 * Recipe Recommendation Worker
 * Provides recipe recommendations based on location and date using OpenAI models
 * Now integrated with recipe fetching to return actual recipes instead of just tags
 */

import { log as baseLog, generateRequestId } from '../../shared/utility-functions.js';

// Import shared utilities
import { metrics, sendAnalytics, categorizeError } from './shared-utilities.js';

// Import handlers
import { handleRoot } from './handlers/root-handler.js';
import { handleHealth } from './handlers/health-handler.js';
import { handleRecommendations } from './handlers/recommendations-handler.js';
import { handleMetrics } from './handlers/metrics-handler.js';

// Wrapper to automatically add worker context
function log(level, message, data = {}, context = {}) {
  return baseLog(level, message, data, { worker: 'recipe-recommendation-worker', ...context });
}


export default {
  async fetch(request, env) {
    const requestId = generateRequestId();
    const startTime = Date.now();
    const url = new URL(request.url);
    const userAgent = request.headers.get('User-Agent') || 'unknown';
    const cfCountry = request.cf?.country || 'unknown';
    const cfRay = request.headers.get('CF-Ray') || 'unknown';
    
    // Log incoming request
    log('info', 'Request received', {
      requestId,
      method: request.method,
      path: url.pathname,
      userAgent,
      country: cfCountry,
      cfRay,
      query: Object.fromEntries(url.searchParams.entries())
    });

    // Increment request counter
    metrics.increment('requests_total', 1, { 
      method: request.method, 
      path: url.pathname,
      country: cfCountry
    });
    
    // Enable CORS
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Request-ID',
      'X-Request-ID': requestId,
    };

    try {
      let response;
      let routeHandled = false;

      // Handle CORS preflight
      if (request.method === 'OPTIONS') {
        metrics.increment('requests_preflight', 1);
        log('debug', 'CORS preflight request', { requestId });
        return new Response(null, { headers: corsHeaders });
      }

      // Route handling
      switch (url.pathname) {
        case '/':
          response = await handleRoot(request, env, corsHeaders);
          routeHandled = true;
          break;
        case '/recommendations':
          if (request.method === 'POST') {
            response = await handleRecommendations(request, env, corsHeaders, requestId);
            routeHandled = true;
          } else {
            // Method not allowed for non-POST requests
            response = new Response(JSON.stringify({ error: 'Method not allowed' }), {
              status: 405,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
            routeHandled = true;
          }
          break;
        case '/health':
          response = await handleHealth(env, corsHeaders, requestId);
          routeHandled = true;
          break;
        case '/metrics':
          response = await handleMetrics(corsHeaders, requestId);
          routeHandled = true;
          break;
        default:
          response = new Response(JSON.stringify({ error: 'Not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
          break;
      }

      const duration = Date.now() - startTime;
      
      // Record response metrics
      metrics.timing('request_duration', duration, { 
        method: request.method, 
        path: url.pathname,
        status: response.status.toString(),
        country: cfCountry
      });
      
      metrics.increment('responses_total', 1, { 
        status: response.status.toString(),
        path: url.pathname,
        method: request.method
      });

      // Log successful response
      log('info', 'Request completed', {
        requestId,
        method: request.method,
        path: url.pathname,
        status: response.status,
        duration: `${duration}ms`,
        country: cfCountry,
        routeHandled
      });

      // Send success analytics
      await sendAnalytics(env, 'request_success', {
        requestId,
        method: request.method,
        path: url.pathname,
        status: response.status,
        duration,
        country: cfCountry,
        userAgent: userAgent.substring(0, 100), // Truncate for analytics
        routeHandled
      });

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      const { category, severity } = categorizeError(error);
      
      // Record error metrics
      metrics.increment('errors_total', 1, { 
        category,
        severity,
        path: url.pathname,
        method: request.method
      });
      
      metrics.timing('request_duration', duration, { 
        method: request.method, 
        path: url.pathname,
        status: '500',
        error: true
      });

      // Log error with full context
      log('error', 'Worker error', {
        requestId,
        method: request.method,
        path: url.pathname,
        error: error.message,
        stack: error.stack,
        category,
        severity,
        duration: `${duration}ms`,
        country: cfCountry
      });

      // Send error analytics
      await sendAnalytics(env, 'request_error', {
        requestId,
        method: request.method,
        path: url.pathname,
        error: error.message.substring(0, 200), // Truncate for analytics
        category,
        severity,
        duration,
        country: cfCountry,
        userAgent: userAgent.substring(0, 100)
      });

      return new Response(JSON.stringify({ 
        error: 'Internal server error',
        requestId 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};

// Export functions for testing and handlers
export { 
  getRecipeRecommendations, 
  getSeason, 
  enhanceRecommendationsWithRecipes, 
  searchRecipeByCategory,
  extractCookingTerms
} from './recommendation-service.js';
