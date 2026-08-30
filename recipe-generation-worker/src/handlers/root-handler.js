/**
 * Root endpoint handler - provides API documentation and service information
 */
export async function handleRoot(request, env, corsHeaders) {
  return new Response(JSON.stringify({
    service: 'Recipe Generation Service',
    description: 'AI-powered recipe generation and customization',
    version: '1.0.0',
    environment: env.ENVIRONMENT || 'development',
    endpoints: {
      'GET /': {
        description: 'API documentation and service information',
        response: 'JSON object with all available endpoints'
      },
      'GET /health': {
        description: 'Health check endpoint to verify service status',
        response: 'JSON object with health status, environment, and timestamp'
      },
      'POST /generate': {
        description: 'Generate a new recipe based on provided parameters',
        requestBody: {
          type: 'application/json',
          schema: {
            ingredients: 'Array of available ingredients',
            cuisine: 'Preferred cuisine style (optional)',
            dietary: 'Array of dietary restrictions (optional)',
            servings: 'Number of servings (optional)'
          }
        },
        response: 'JSON object with generated recipe (implementation coming soon)',
        status: 'Coming Soon'
      },
      'POST /feedback': {
        description: 'Record a user signal against a generation trace (for example saving a generated recipe)',
        requestBody: {
          type: 'application/json',
          schema: {
            traceId: 'Trace id returned by POST /generate',
            event: 'Supported feedback event, currently "recipe_saved"',
            recipeId: 'Id the recipe was saved under (optional)'
          }
        },
        response: 'JSON object reporting whether the feedback score was recorded'
      },
      'POST /adapt': {
        description: 'Adapt an existing recipe to dietary, allergen, time, equipment, or nutrition constraints',
        requestBody: {
          type: 'application/json',
          schema: {
            baseRecipe: 'Recipe object with name, ingredients, and instructions',
            constraints: 'Optional explicit adaptation constraints',
            culinaryProfile: 'Optional persisted kitchen profile'
          }
        },
        response: 'JSON object with adapted recipe, substitutions, notes, and lineage metadata'
      }
    },
    usage: {
      healthCheck: 'curl https://recipe-generation-worker.nolanfoster.workers.dev/health',
      recipeGeneration: 'curl -X POST https://recipe-generation-worker.nolanfoster.workers.dev/generate -H "Content-Type: application/json" -d \'{"ingredients": ["chicken", "rice"], "cuisine": "italian"}\'',
      generationFeedback: 'curl -X POST https://recipe-generation-worker.nolanfoster.workers.dev/feedback -H "Content-Type: application/json" -d \'{"traceId": "0194f0d6-6a3a-7c2b-9c1a-1f1b2c3d4e5f", "event": "recipe_saved"}\'',
      recipeAdaptation: 'curl -X POST https://recipe-generation-worker.nolanfoster.workers.dev/adapt -H "Content-Type: application/json" -d \'{"baseRecipe": {"name": "Pasta", "ingredients": ["1 cup pasta"], "instructions": ["Cook pasta"]}, "constraints": {"dietary": ["gluten_free"]}}\''
    },
    environments: {
      preview: 'For development and testing',
      staging: 'For pre-production validation',
      production: 'For live usage'
    }
  }), {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
}
