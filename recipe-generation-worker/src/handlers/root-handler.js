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
      }
    },
    usage: {
      healthCheck: 'curl https://recipe-generation-worker.nolanfoster.workers.dev/health',
      recipeGeneration: 'curl -X POST https://recipe-generation-worker.nolanfoster.workers.dev/generate -H "Content-Type: application/json" -d \'{"ingredients": ["chicken", "rice"], "cuisine": "italian"}\''
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
