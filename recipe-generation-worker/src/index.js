import { handleRoot } from './handlers/root-handler.js';
import { handleHealth } from './handlers/health-handler.js';
import { handleGenerate } from './handlers/generate-handler.js';
import { handleAdapt } from './handlers/adapt-handler.js';
import { handleGroceryList } from './handlers/grocery-list-handler.js';
import { handleMealPlanFill } from './handlers/meal-plan-fill-handler.js';
import { handleAgentTurn } from './handlers/agent-handler.js';
import { handleFeedback } from './handlers/feedback-handler.js';

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

    // Recipe adaptation endpoint
    if (url.pathname === '/adapt' && request.method === 'POST') {
      return handleAdapt(request, env, corsHeaders);
    }

    // Grocery list aggregation endpoint
    if (url.pathname === '/grocery-list' && request.method === 'POST') {
      return handleGroceryList(request, env, corsHeaders);
    }

    // Generation feedback endpoint (user signals logged onto generation traces)
    if (url.pathname === '/feedback' && request.method === 'POST') {
      return handleFeedback(request, env, corsHeaders);
    }

    // Meal-plan auto-fill endpoint
    if (url.pathname === '/meal-plan-fill' && request.method === 'POST') {
      return handleMealPlanFill(request, env, corsHeaders);
    }

    // Conversational kitchen agent endpoint
    if (url.pathname === '/agent/turn' && request.method === 'POST') {
      return handleAgentTurn(request, env, corsHeaders);
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
