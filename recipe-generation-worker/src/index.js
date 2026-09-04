import { handleRoot } from './handlers/root-handler.js';
import { handleHealth } from './handlers/health-handler.js';
import { handleGenerate } from './handlers/generate-handler.js';
import { handleAdapt } from './handlers/adapt-handler.js';
import { handleGroceryList } from './handlers/grocery-list-handler.js';
import { handleMealPlanFill } from './handlers/meal-plan-fill-handler.js';
import { handleAgentTurn } from './handlers/agent-handler.js';
import {
  handleKitchenWorkflowCancel,
  handleKitchenWorkflowGet,
  handleKitchenWorkflowResume,
  handleKitchenWorkflowStart
} from './handlers/kitchen-workflow-handler.js';
import { handleFeedback } from './handlers/feedback-handler.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS headers — Fix #3: add X-User-Id to Access-Control-Allow-Headers so
    // cross-origin browser preflight requests pass for workflow inspection and
    // all other routes that rely on the documented identity header.
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-User-Id'
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

    // Flag-gated durable kitchen workflow endpoints. IDs are deliberately
    // parsed here so /start cannot be mistaken for a persisted workflow.
    if (url.pathname === '/agent/workflow/start' && request.method === 'POST') {
      return handleKitchenWorkflowStart(request, env, corsHeaders);
    }

    const workflowMatch = url.pathname.match(/^\/agent\/workflow\/([^/]+)(?:\/(resume|cancel))?$/);
    if (workflowMatch && workflowMatch[1] !== 'start') {
      const workflowId = workflowMatch[1];
      const action = workflowMatch[2];
      if (!action && request.method === 'GET') {
        return handleKitchenWorkflowGet(request, env, corsHeaders, workflowId);
      }
      if (action === 'resume' && request.method === 'POST') {
        return handleKitchenWorkflowResume(request, env, corsHeaders, workflowId);
      }
      if (action === 'cancel' && request.method === 'POST') {
        return handleKitchenWorkflowCancel(request, env, corsHeaders, workflowId);
      }
    }

    // 404 for unknown routes
    return new Response(
      JSON.stringify({
        error: 'Not Found',
        message: 'The requested endpoint does not exist'
      }),
      {
        status: 404,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );
  }
};
