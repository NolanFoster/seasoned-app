/**
 * Root handler for the AI Image Generation Worker
 */

export async function handleRoot(request, env) {
  const response = {
    service: 'AI Image Generation Worker',
    version: '1.0.0',
    environment: env.ENVIRONMENT || 'development',
    endpoints: {
      health: '/health',
      generate: '/generate'
    },
    documentation: {
      generate: {
        method: 'POST',
        contentType: 'application/json',
        body: {
          recipe: 'Recipe object with title, description, ingredients, etc.',
          style: 'Optional: Image style (realistic, artistic, etc.)',
          aspectRatio: 'Optional: Aspect ratio (1:1, 16:9, etc.)'
        },
        response: {
          success: 'boolean',
          imageUrl: 'URL of the generated image',
          imageId: 'Unique identifier for the image',
          error: 'Error message if generation failed'
        }
      }
    }
  };

  return new Response(JSON.stringify(response, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}