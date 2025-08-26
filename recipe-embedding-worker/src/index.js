import { handleRoot } from './handlers/root-handler.js';
import { handleHealth } from './handlers/health-handler.js';
import { handleEmbedding } from './handlers/embedding-handler.js';

export default {
  // Handle HTTP requests
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Route handling
    if (url.pathname === '/') {
      return handleRoot(request, env, corsHeaders);
    }

    // Health check endpoint
    if (url.pathname === '/health' && request.method === 'GET') {
      return handleHealth(request, env, corsHeaders);
    }

    // Manual embedding generation endpoint
    if (url.pathname === '/embed' && request.method === 'POST') {
      return handleEmbedding(request, env, corsHeaders);
    }

    // 404 for unknown routes
    return new Response(JSON.stringify({
      error: 'Not Found',
      message: 'The requested endpoint does not exist'
    }), {
      status: 404,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  },

  // Handle scheduled events (cron jobs)
  async scheduled(controller, env, _ctx) {
    console.log('Starting scheduled embedding generation task');

    try {
      // Create a fake request object for the embedding handler
      const fakeRequest = new Request('https://example.com/embed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduled: true })
      });

      // Use the same handler but in scheduled mode
      const result = await handleEmbedding(fakeRequest, env, {});

      if (result.status === 200) {
        console.log('Scheduled embedding generation completed successfully');
      } else {
        console.error('Scheduled embedding generation failed:', await result.text());
      }
    } catch (error) {
      console.error('Error in scheduled embedding generation:', error);
    }
  }
};
