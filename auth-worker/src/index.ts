import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { Env } from './types/env';

const app = new Hono<{ Bindings: Env }>();

// Middleware
app.use('*', logger());
app.use('*', cors());

// Health check endpoint
app.get('/health', async (c) => {
  const env = c.env;
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: env.ENVIRONMENT,
    services: {
      kv: 'unknown',
      d1: 'unknown'
    }
  };

  try {
    // Test KV access
    const testKey = '__health_check__';
    await env.AUTH_KV.put(testKey, new Date().toISOString(), {
      expirationTtl: 60 // Expire after 1 minute
    });
    const kvValue = await env.AUTH_KV.get(testKey);
    if (kvValue) {
      health.services.kv = 'healthy';
    }
  } catch (error) {
    health.services.kv = 'unhealthy';
    health.status = 'degraded';
    console.error('KV health check failed:', error);
  }

  try {
    // Test D1 access
    const result = await env.AUTH_DB.prepare('SELECT 1 as test').first();
    if (result?.test === 1) {
      health.services.d1 = 'healthy';
    }
  } catch (error) {
    // If table doesn't exist, try to check if D1 is accessible
    try {
      await env.AUTH_DB.prepare("SELECT name FROM sqlite_master WHERE type='table' LIMIT 1").first();
      health.services.d1 = 'healthy';
    } catch (innerError) {
      health.services.d1 = 'unhealthy';
      health.status = 'degraded';
      console.error('D1 health check failed:', error);
    }
  }

  // Determine overall health
  if (health.services.kv === 'unhealthy' && health.services.d1 === 'unhealthy') {
    health.status = 'unhealthy';
  }

  const statusCode = health.status === 'healthy' ? 200 : 
                     health.status === 'degraded' ? 503 : 500;

  return c.json(health, statusCode);
});

// Root endpoint
app.get('/', (c) => {
  return c.json({
    name: 'auth-worker',
    version: '1.0.0',
    endpoints: [
      {
        path: '/health',
        method: 'GET',
        description: 'Health check endpoint'
      }
    ]
  });
});

// 404 handler
app.notFound((c) => {
  return c.json({
    error: 'Not Found',
    message: `The requested endpoint ${c.req.path} does not exist`
  }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error(`Error handling request: ${err}`);
  return c.json({
    error: 'Internal Server Error',
    message: err.message || 'An unexpected error occurred'
  }, 500);
});

export default app;