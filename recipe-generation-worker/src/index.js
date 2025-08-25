export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Route handling
    if (url.pathname === '/') {
      // API documentation endpoint
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
    
    // Health check endpoint
    if (url.pathname === '/health' && request.method === 'GET') {
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

    // Recipe generation endpoint (placeholder for future implementation)
    if (url.pathname === '/generate' && request.method === 'POST') {
      try {
        // Parse the request body
        const contentType = request.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          return new Response(JSON.stringify({ 
            error: 'Content-Type must be application/json' 
          }), {
            status: 400,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json'
            }
          });
        }

        const requestBody = await request.json();
        
        // TODO: Implement recipe generation logic
        // For now, return a placeholder response
        return new Response(JSON.stringify({
          message: 'Recipe generation endpoint - implementation coming soon',
          requestData: requestBody,
          environment: env.ENVIRONMENT || 'development'
        }), {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      } catch (error) {
        console.error('Error processing recipe generation request:', error);
        return new Response(JSON.stringify({ 
          error: 'Failed to process recipe generation request',
          details: error.message 
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
    }

    // 404 for unknown routes
    return new Response(JSON.stringify({ 
      error: 'Not Found',
      message: 'The requested endpoint does not exist'
    }), {
      status: 404,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
};