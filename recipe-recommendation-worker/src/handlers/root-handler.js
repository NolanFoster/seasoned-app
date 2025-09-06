/**
 * Root endpoint handler - provides API information and available endpoints
 */

export async function handleRoot(request, env, corsHeaders) {
  const apiInfo = {
    service: 'recipe-recommendation-worker',
    version: '1.0.0',
    description: 'AI-powered recipe recommendation service',
    endpoints: {
      'POST /recommendations': {
        description: 'Get AI-generated recipe recommendations',
        parameters: {
          location: 'string (optional) - Geographic location for seasonal recommendations',
          date: 'string (optional) - Date in YYYY-MM-DD format (defaults to today)',
          limit: 'number (optional) - Number of recipes per category (1-10, defaults to 3)'
        },
        example: {
          location: 'Seattle, WA',
          date: '2024-01-15',
          limit: 3
        }
      },
      'GET /health': {
        description: 'Health check endpoint with service status'
      },
      'GET /metrics': {
        description: 'Observability metrics and performance data'
      }
    },
    timestamp: new Date().toISOString()
  };

  return new Response(JSON.stringify(apiInfo, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
