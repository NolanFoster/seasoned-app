import { generateRecipeHTML } from './template.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
    
    // Match /recipe/:id pattern
    const recipeMatch = url.pathname.match(/^\/recipe\/([^\/]+)$/);
    if (recipeMatch && request.method === 'GET') {
      const recipeId = recipeMatch[1];
      
      try {
        // Fetch recipe data from the recipe save worker
        const apiUrl = env.RECIPE_SAVE_WORKER_URL || 'https://recipe-save-worker.recipesage2.workers.dev';
        const recipeResponse = await fetch(`${apiUrl}/recipe/get?id=${recipeId}`, {
          headers: {
            'Accept': 'application/json'
          }
        });

        if (!recipeResponse.ok) {
          if (recipeResponse.status === 404) {
            return new Response(generateErrorPage('Recipe not found', 'The recipe you are looking for does not exist.'), {
              status: 404,
              headers: {
                ...corsHeaders,
                'Content-Type': 'text/html;charset=UTF-8'
              }
            });
          }
          throw new Error(`Failed to fetch recipe: ${recipeResponse.status}`);
        }

        const recipe = await recipeResponse.json();
        
        if (!recipe) {
          return new Response(generateErrorPage('Invalid recipe', 'The recipe data is invalid or incomplete.'), {
            status: 404,
            headers: {
              ...corsHeaders,
              'Content-Type': 'text/html;charset=UTF-8'
            }
          });
        }

        // Extract the actual recipe data from the response
        // The save worker returns data nested in a 'data' property
        const recipeData = recipe.data || recipe;

        // Generate HTML page
        const html = generateRecipeHTML(recipeData);
        
        return new Response(html, {
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/html;charset=UTF-8',
            'Cache-Control': 'public, max-age=3600' // Cache for 1 hour
          }
        });
      } catch (error) {
        console.error('Error fetching recipe:', error);
        return new Response(generateErrorPage('Error loading recipe', 'There was an error loading the recipe. Please try again later.'), {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/html;charset=UTF-8'
          }
        });
      }
    }

    // 404 for unmatched routes
    return new Response(generateErrorPage('Page not found', 'The page you are looking for does not exist.'), {
      status: 404,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/html;charset=UTF-8'
      }
    });
  }
};

// Generate home page HTML
function generateHomePage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recipe View Service</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
      background: #f5f5f5;
    }
    h1 {
      color: #2c3e50;
      border-bottom: 3px solid #3498db;
      padding-bottom: 0.5rem;
    }
    .endpoint {
      background: white;
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 1rem;
      margin: 1rem 0;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .method {
      display: inline-block;
      background: #3498db;
      color: white;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      font-weight: bold;
      font-size: 0.9rem;
    }
    .path {
      font-family: monospace;
      color: #e74c3c;
      font-size: 1.1rem;
    }
    .description {
      margin-top: 0.5rem;
      color: #666;
    }
    .example {
      background: #f8f9fa;
      border-left: 4px solid #3498db;
      padding: 0.5rem 1rem;
      margin-top: 0.5rem;
      font-family: monospace;
      font-size: 0.9rem;
      color: #2c3e50;
    }
  </style>
</head>
<body>
  <h1>Recipe View Service</h1>
  <p>This service provides shareable recipe pages with a beautiful full-screen view.</p>
  
  <div class="endpoint">
    <span class="method">GET</span> <span class="path">/recipe/:id</span>
    <div class="description">
      Returns a beautifully formatted HTML page for a specific recipe.
    </div>
    <div class="example">
      Example: /recipe/abc123def456
    </div>
  </div>
  
  <div class="endpoint">
    <span class="method">GET</span> <span class="path">/</span>
    <div class="description">
      This documentation page.
    </div>
  </div>
</body>
</html>`;
}

// Generate error page HTML
function generateErrorPage(title, message) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      text-align: center;
      padding: 2rem;
    }
    .error-container {
      max-width: 500px;
      background: rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 20px;
      padding: 3rem;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    }
    h1 {
      font-size: 2.5rem;
      margin: 0 0 1rem 0;
      font-weight: 600;
    }
    p {
      font-size: 1.2rem;
      margin: 0;
      opacity: 0.9;
    }
    a {
      color: white;
      text-decoration: none;
      display: inline-block;
      margin-top: 2rem;
      padding: 0.75rem 2rem;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 25px;
      transition: all 0.3s ease;
      border: 1px solid rgba(255, 255, 255, 0.3);
    }
    a:hover {
      background: rgba(255, 255, 255, 0.3);
      transform: translateY(-2px);
    }
  </style>
</head>
<body>
  <div class="error-container">
    <h1>${title}</h1>
    <p>${message}</p>
    <a href="/">Go to Home</a>
  </div>
</body>
</html>`;
}