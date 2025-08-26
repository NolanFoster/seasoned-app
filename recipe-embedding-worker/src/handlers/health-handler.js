/**
 * Health check endpoint handler
 */
export async function handleHealth(request, env, corsHeaders) {
  try {
    // Check KV store availability
    let kvStatus = 'unknown';
    try {
      // Try to perform a simple KV operation
      await env.RECIPE_STORAGE.get('health-check', { type: 'text' });
      kvStatus = 'healthy';
    } catch (error) {
      kvStatus = 'unhealthy';
      console.error('KV health check failed:', error);
    }

    // Check AI binding availability
    let aiStatus = 'unknown';
    try {
      // Check if AI binding exists
      if (env.AI) {
        aiStatus = 'healthy';
      } else {
        aiStatus = 'missing';
      }
    } catch (error) {
      aiStatus = 'unhealthy';
      console.error('AI health check failed:', error);
    }

    const isHealthy = kvStatus === 'healthy' && aiStatus === 'healthy';

    return new Response(JSON.stringify({
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      environment: env.ENVIRONMENT || 'development',
      services: {
        kv_storage: kvStatus,
        ai_binding: aiStatus
      },
      uptime: process.uptime ? Math.floor(process.uptime()) : 'unknown'
    }), {
      status: isHealthy ? 200 : 503,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Health check error:', error);
    return new Response(JSON.stringify({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
}
