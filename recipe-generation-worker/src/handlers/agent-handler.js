/**
 * Conversational kitchen agent turn orchestrator handler.
 * Maps high-level user intent ("plan 3 dinners with chicken", "make it dairy-free", "what can I cook")
 * to structured assistant responses and proposed actions.
 */

import { buildGenerationConstraints } from '../../../shared/culinary-profile.js';

function json(body, status, corsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

/**
 * Handle POST /agent/turn
 */
export async function handleAgentTurn(request, env, corsHeaders) {
  try {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return json({ error: 'Content-Type must be application/json' }, 400, corsHeaders);
    }

    const payload = await request.json();
    const { sessionId, message, context = {}, profile = {} } = payload;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return json({ error: 'Message is required' }, 400, corsHeaders);
    }

    const trimmedMessage = message.trim();
    const normalizedProfile = buildGenerationConstraints(profile, context.overrides || {});

    // Guardrail: refuse medication/clinical advice
    const lower = trimmedMessage.toLowerCase();
    if (lower.includes('dose') || lower.includes('medication') || lower.includes('ozempic') || lower.includes('wegovy') || lower.includes('prescription')) {
      return json({
        sessionId: sessionId || 'default',
        message: 'I can help with cooking, recipe customization, and kitchen planning, but I cannot provide medical or prescription advice. Please consult your healthcare provider.',
        proposedActions: [],
        disclaimer: 'Not medical advice'
      }, 200, corsHeaders);
    }

    const proposedActions = [];
    let assistantMessage = '';

    if (lower.includes('plan') || lower.includes('dinner') || lower.includes('week')) {
      assistantMessage = 'I\'ve prepared a meal plan outline tailored to your preferences. Review the proposed plan below before applying it to your planner.';
      proposedActions.push({
        type: 'fill_meal_plan',
        title: 'Fill meal plan slots',
        payload: {
          slots: ['2026-08-17::dinner', '2026-08-18::dinner', '2026-08-19::dinner'],
          usePantry: Boolean(context.usePantry),
          overrides: {
            dietary: normalizedProfile.dietary,
            hardAllergens: normalizedProfile.hardAllergens
          }
        }
      });
    } else if (lower.includes('grocery') || lower.includes('shop') || lower.includes('list')) {
      assistantMessage = 'I can build your grocery list based on your upcoming scheduled meals and pantry gaps.';
      proposedActions.push({
        type: 'build_grocery_list',
        title: 'Build grocery list from plan',
        payload: {
          subtractPantry: Boolean(context.usePantry)
        }
      });
    } else if (lower.includes('adapt') || lower.includes('substitute') || lower.includes('swap') || lower.includes('dairy-free')) {
      assistantMessage = 'I can adapt this recipe to fit your dietary goals while keeping the flavor balanced.';
      proposedActions.push({
        type: 'adapt_recipe',
        title: 'Adapt recipe constraints',
        payload: {
          adaptationGoal: 'dairy_free',
          substitutions: [{ from: 'dairy', to: 'plant-based alternatives' }]
        }
      });
    } else {
      assistantMessage = `Here are a few quick culinary suggestions based on your request: "${trimmedMessage}". Would you like me to generate a recipe or plan ahead?`;
      proposedActions.push({
        type: 'generate_recipe',
        title: 'Generate customized recipe',
        payload: {
          query: trimmedMessage,
          constraints: normalizedProfile
        }
      });
    }

    return json({
      sessionId: sessionId || 'default',
      message: assistantMessage,
      proposedActions,
      disclaimer: 'AI assistant estimates. Destructive actions require your confirmation.'
    }, 200, corsHeaders);
  } catch (error) {
    return json({
      error: 'Agent orchestration failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500, corsHeaders);
  }
}
