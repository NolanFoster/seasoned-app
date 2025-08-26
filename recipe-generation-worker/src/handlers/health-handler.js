/**
 * Health check endpoint handler - provides service health status
 */
export async function handleHealth(request, env, corsHeaders) {
  return new Response(JSON.stringify({
    status: 'healthy',
    environment: env.ENVIRONMENT || 'development',
    timestamp: new Date().toISOString(),
    service: 'recipe-generation-worker'
  }), {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
}
