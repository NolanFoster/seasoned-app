/**
 * Root endpoint handler - provides basic worker information
 */
export async function handleRoot(request, env, corsHeaders) {
  return new Response(JSON.stringify({
    service: 'Recipe Embedding Worker',
    version: '1.0.0',
    description: 'Generates embeddings for recipes using AI',
    environment: env.ENVIRONMENT || 'development',
    endpoints: {
      '/': 'Worker information',
      '/health': 'Health check',
      '/embed': 'Manual embedding generation (POST)'
    },
    scheduled: {
      frequency: 'Daily at 2 AM UTC',
      description: 'Automatically processes all recipes for embedding generation'
    }
  }), {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
}
