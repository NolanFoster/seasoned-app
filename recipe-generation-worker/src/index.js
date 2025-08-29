import { handleRoot } from './handlers/root-handler.js';
import { handleHealth } from './handlers/health-handler.js';
import { handleGenerate } from './handlers/generate-handler.js';

export default {
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

    // Recipe generation endpoint
    if (url.pathname === '/generate' && request.method === 'POST') {
      return handleGenerate(request, env, corsHeaders);
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
  }
};
