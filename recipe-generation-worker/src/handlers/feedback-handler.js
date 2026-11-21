import { OpikClient } from '../opik-client.js';

/**
 * Events the app is allowed to report, mapped to the feedback score they
 * write. Keeping the mapping server-side means a caller can only report that
 * something happened - it can never invent score names or values.
 */
export const FEEDBACK_EVENTS = {
  recipe_saved: {
    name: 'user_saved_recipe',
    value: 1,
    categoryName: 'positive',
    reason: 'User saved the AI-generated recipe'
  }
};

// Opik trace ids are opaque identifiers; accept only id-shaped strings so a
// malformed client can't push arbitrary payloads at the tracing backend.
const TRACE_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

function jsonResponse(body, status, corsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
}

/**
 * Feedback endpoint handler - records user signals against a generation trace.
 *
 * Saving a generated recipe is the strongest signal available that the user
 * liked what the model produced, so it is logged back onto the trace that
 * produced the recipe as a positive feedback score.
 */
export async function handleFeedback(request, env, corsHeaders) {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return jsonResponse({ error: 'Content-Type must be application/json' }, 400, corsHeaders);
  }

  let requestBody;
  try {
    requestBody = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400, corsHeaders);
  }

  const traceId = requestBody?.traceId;
  if (typeof traceId !== 'string' || !TRACE_ID_PATTERN.test(traceId)) {
    return jsonResponse({ error: 'traceId is required and must be a valid trace identifier' }, 400, corsHeaders);
  }

  const event = requestBody?.event;
  const scoreDefinition = typeof event === 'string' ? FEEDBACK_EVENTS[event] : null;
  if (!scoreDefinition) {
    return jsonResponse({
      error: 'event is required and must be a supported feedback event',
      supportedEvents: Object.keys(FEEDBACK_EVENTS)
    }, 400, corsHeaders);
  }

  // Feedback is observability only: with tracing turned off there is nothing
  // to attach the signal to, and that is not a client error.
  const opikClient = new OpikClient(env.OPIK_API_KEY, 'recipe-generation');
  if (!env.OPIK_API_KEY || !opikClient.isHealthy()) {
    return jsonResponse({
      success: true,
      recorded: false,
      reason: 'tracing_disabled',
      event
    }, 200, corsHeaders);
  }

  const recipeId = typeof requestBody?.recipeId === 'string' ? requestBody.recipeId.slice(0, 200) : null;
  const recorded = await opikClient.logTraceFeedback(traceId, {
    name: scoreDefinition.name,
    value: scoreDefinition.value,
    categoryName: scoreDefinition.categoryName,
    reason: recipeId ? `${scoreDefinition.reason} (saved as ${recipeId})` : scoreDefinition.reason
  });

  if (!recorded) {
    return jsonResponse({
      success: false,
      recorded: false,
      error: 'Failed to record feedback score',
      event
    }, 500, corsHeaders);
  }

  return jsonResponse({
    success: true,
    recorded: true,
    event,
    traceId,
    score: { name: scoreDefinition.name, value: scoreDefinition.value }
  }, 200, corsHeaders);
}
