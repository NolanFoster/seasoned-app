/**
 * Health check handler
 */

export async function handleHealth(request, env) {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: env.ENVIRONMENT || 'development',
    services: {
      ai: 'available',
      r2: 'available'
    }
  };

  // Check if AI binding is available
  if (!env.AI) {
    health.services.ai = 'unavailable';
    health.status = 'degraded';
  }

  // Check if R2 bucket is available
  if (!env.RECIPE_IMAGES) {
    health.services.r2 = 'unavailable';
    health.status = 'degraded';
  }

  return new Response(JSON.stringify(health, null, 2), {
    status: health.status === 'healthy' ? 200 : 503,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}