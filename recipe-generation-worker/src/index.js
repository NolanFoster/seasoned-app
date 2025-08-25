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
      // Home page - show API documentation
      return new Response(generateHomePage(), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/html;charset=UTF-8'
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

function generateHomePage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Recipe Generation Service</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            line-height: 1.6;
            color: #333;
        }
        .header {
            text-align: center;
            margin-bottom: 40px;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border-radius: 10px;
        }
        .endpoint {
            background: #f8f9fa;
            border-left: 4px solid #007bff;
            padding: 15px;
            margin: 20px 0;
            border-radius: 5px;
        }
        .method {
            font-weight: bold;
            color: #007bff;
        }
        .url {
            font-family: monospace;
            background: #e9ecef;
            padding: 2px 6px;
            border-radius: 3px;
        }
        .description {
            margin-top: 10px;
            color: #666;
        }
        .health-status {
            display: inline-block;
            padding: 4px 8px;
            background: #28a745;
            color: white;
            border-radius: 3px;
            font-size: 12px;
            margin-left: 10px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🍳 Recipe Generation Service</h1>
        <p>AI-powered recipe generation and customization</p>
        <div class="health-status">Healthy</div>
    </div>

    <h2>API Endpoints</h2>
    
    <div class="endpoint">
        <div><span class="method">GET</span> <span class="url">/health</span></div>
        <div class="description">Health check endpoint to verify service status</div>
    </div>

    <div class="endpoint">
        <div><span class="method">POST</span> <span class="url">/generate</span></div>
        <div class="description">Generate a new recipe based on provided parameters (coming soon)</div>
    </div>

    <h2>Usage Examples</h2>
    
    <h3>Health Check</h3>
    <pre><code>curl https://recipe-generation-worker.nolanfoster.workers.dev/health</code></pre>

    <h3>Recipe Generation (Coming Soon)</h3>
    <pre><code>curl -X POST https://recipe-generation-worker.nolanfoster.workers.dev/generate \\
  -H "Content-Type: application/json" \\
  -d '{"ingredients": ["chicken", "rice"], "cuisine": "italian"}'</code></pre>

    <h2>Environment</h2>
    <p>This service supports multiple environments:</p>
    <ul>
        <li><strong>Preview:</strong> For development and testing</li>
        <li><strong>Staging:</strong> For pre-production validation</li>
        <li><strong>Production:</strong> For live usage</li>
    </ul>

    <footer style="margin-top: 40px; text-align: center; color: #666;">
        <p>Recipe Generation Service - Powered by Cloudflare Workers</p>
    </footer>
</body>
</html>`;
}