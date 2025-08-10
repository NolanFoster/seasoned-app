// Recipe API with SQLite (D1) and image upload support
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Get all recipes
      if (pathname === '/recipes' && request.method === 'GET') {
        const recipes = await getRecipes(env);
        return new Response(JSON.stringify(recipes), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Get single recipe by ID
      if (pathname.startsWith('/recipe/') && request.method === 'GET') {
        const id = pathname.split('/')[2];
        const recipe = await getRecipeById(env, id);
        if (!recipe) {
          return new Response('Recipe not found', { 
            status: 404,
            headers: corsHeaders
          });
        }
        return new Response(JSON.stringify(recipe), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Create new recipe
      if (pathname === '/recipe' && request.method === 'POST') {
        const body = await request.json();
        const recipeId = await createRecipe(env, body);
        return new Response(JSON.stringify({ id: recipeId, message: 'Recipe created' }), {
          status: 201,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Update recipe
      if (pathname.startsWith('/recipe/') && request.method === 'PUT') {
        const id = pathname.split('/')[2];
        const body = await request.json();
        const success = await updateRecipe(env, id, body);
        if (!success) {
          return new Response('Recipe not found', { 
            status: 404,
            headers: corsHeaders
          });
        }
        return new Response(JSON.stringify({ message: 'Recipe updated' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Delete recipe
      if (pathname.startsWith('/recipe/') && request.method === 'DELETE') {
        const id = pathname.split('/')[2];
        const success = await deleteRecipe(env, id);
        if (!success) {
          return new Response('Recipe not found', { 
            status: 404,
            headers: corsHeaders
          });
        }
        return new Response(JSON.stringify({ message: 'Recipe deleted' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Serve uploaded images
      if (pathname.startsWith('/images/') && request.method === 'GET') {
        const fileName = pathname.split('/')[2];
        try {
          const object = await env.recipe_images.get(fileName);
          if (!object) {
            return new Response('Image not found', { status: 404 });
          }
          
          return new Response(object.body, {
            headers: {
              'Content-Type': object.httpMetadata?.contentType || 'image/jpeg',
              'Cache-Control': 'public, max-age=31536000',
              ...corsHeaders
            }
          });
        } catch (error) {
          console.error('Error serving image:', error);
          return new Response('Error serving image', { status: 500 });
        }
      }

      // Upload image
      if (pathname === '/upload-image' && request.method === 'POST') {
        try {
          console.log('Image upload request received');
          const formData = await request.formData();
          const file = formData.get('image');
          const recipeId = formData.get('recipeId');
          
          console.log('Form data parsed:', { 
            hasFile: !!file, 
            fileName: file?.name, 
            recipeId: recipeId,
            envKeys: Object.keys(env)
          });
          
          if (!file || !recipeId) {
            console.log('Missing file or recipeId:', { file: !!file, recipeId: !!recipeId });
            return new Response('Missing image or recipe ID', { 
              status: 400,
              headers: corsHeaders
            });
          }

          const imageUrl = await uploadImage(env, file, recipeId);
          console.log('Upload result:', imageUrl);
          
          if (imageUrl) {
            // Update recipe with image URL
            await updateRecipeImage(env, recipeId, imageUrl);
            console.log('Recipe image updated in database');
          }

          return new Response(JSON.stringify({ imageUrl }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } catch (error) {
          console.error('Upload endpoint error:', error);
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      // Clip recipe from URL
      if (pathname === '/clip' && request.method === 'POST') {
        const body = await request.json();
        const pageUrl = body.url;
        
        try {
          const recipe = await extractRecipeFromUrl(pageUrl);
          if (!recipe) {
            return new Response('No recipe found in JSON-LD', { 
              status: 404,
              headers: corsHeaders
            });
          }
          
          const recipeId = await createRecipe(env, recipe);
          return new Response(JSON.stringify({ ...recipe, id: recipeId }), { 
            status: 200, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } catch (e) {
          return new Response('Error fetching or parsing: ' + e.message, { 
            status: 500,
            headers: corsHeaders
          });
        }
      }

      return new Response('Not Found', { 
        status: 404,
        headers: corsHeaders
      });
    } catch (error) {
      console.error('API Error:', error);
      return new Response('Internal Server Error', { 
        status: 500,
        headers: corsHeaders
      });
    }
  }
};

// Database functions
async function getRecipes(env) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM recipes ORDER BY created_at DESC'
  ).all();
  
  return results.map(recipe => ({
    ...recipe,
    ingredients: JSON.parse(recipe.ingredients),
    instructions: JSON.parse(recipe.instructions)
  }));
}

async function getRecipeById(env, id) {
  const result = await env.DB.prepare(
    'SELECT * FROM recipes WHERE id = ?'
  ).bind(id).first();
  
  if (!result) return null;
  
  return {
    ...result,
    ingredients: JSON.parse(result.ingredients),
    instructions: JSON.parse(result.instructions)
  };
}

async function createRecipe(env, recipeData) {
  const { name, description, ingredients, instructions, image_url, source_url } = recipeData;
  
  try {
    const result = await env.DB.prepare(`
      INSERT INTO recipes (name, description, ingredients, instructions, image_url, source_url)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      name,
      description || '',
      JSON.stringify(ingredients),
      JSON.stringify(instructions),
      image_url || null,
      source_url || null
    ).run();
    
    return result.meta.last_row_id;
  } catch (error) {
    // Check if it's a duplicate constraint violation
    if (error.message && error.message.includes('UNIQUE constraint failed')) {
      throw new Error('A recipe with this name and source already exists');
    }
    throw error;
  }
}

async function updateRecipe(env, id, recipeData) {
  const { name, description, ingredients, instructions, image_url, source_url } = recipeData;
  
  const result = await env.DB.prepare(`
    UPDATE recipes 
    SET name = ?, description = ?, ingredients = ?, instructions = ?, image_url = ?, source_url = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    name,
    description || '',
    JSON.stringify(ingredients),
    JSON.stringify(instructions),
    image_url || null,
    source_url || null,
    id
  ).run();
  
  return result.meta.changes > 0;
}

async function deleteRecipe(env, id) {
  const result = await env.DB.prepare(
    'DELETE FROM recipes WHERE id = ?'
  ).bind(id).run();
  
  return result.meta.changes > 0;
}

async function updateRecipeImage(env, recipeId, imageUrl) {
  await env.DB.prepare(
    'UPDATE recipes SET image_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(imageUrl, recipeId).run();
}

// Image upload function
async function uploadImage(env, file, recipeId) {
  try {
    console.log('Starting image upload for recipe:', recipeId);
    console.log('File info:', { name: file.name, type: file.type, size: file.size });
    
    const fileBuffer = await file.arrayBuffer();
    const fileName = `recipe-${recipeId}-${Date.now()}-${file.name}`;
    
    console.log('Uploading to R2 with filename:', fileName);
    
    // Upload to R2
    await env.recipe_images.put(fileName, fileBuffer, {
      httpMetadata: {
        contentType: file.type,
      },
    });
    
    // Generate the image URL using your custom domain
    const imageUrl = `https://images.nolanfoster.me/${fileName}`;
    console.log('Image uploaded successfully:', imageUrl);
    
    return imageUrl;
  } catch (error) {
    console.error('Image upload error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      envKeys: Object.keys(env)
    });
    return null;
  }
}

// Recipe extraction from URL
async function extractRecipeFromUrl(pageUrl) {
  try {
    console.log('Fetching recipe from:', pageUrl);
    const response = await fetch(pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const html = await response.text();
    console.log('HTML fetched, length:', html.length);
    
    // Helper function to decode HTML entities
    function decodeHtmlEntities(text) {
      if (typeof text !== 'string') return text;
      return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'");
    }
    
    // Try JSON-LD structured data first
    const ldJsonRegex = /<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi;
    let match;
    let recipe = null;
    
    while ((match = ldJsonRegex.exec(html)) !== null) {
      try {
        let json = JSON.parse(match[1].trim());
        if (Array.isArray(json)) json = json[0];
        
        console.log('Parsed JSON-LD:', JSON.stringify(json, null, 2));
        
        if (json['@type'] === 'Recipe' || (Array.isArray(json['@type']) && json['@type'].includes('Recipe'))) {
          console.log('Found Recipe JSON-LD:', json.name);
          console.log('Recipe ingredients:', json.recipeIngredient);
          console.log('Recipe instructions:', json.recipeInstructions);
          recipe = {
            name: decodeHtmlEntities(json.name),
            description: decodeHtmlEntities(json.description || ''),
            ingredients: (json.recipeIngredient || []).map(decodeHtmlEntities),
            instructions: (json.recipeInstructions || []).map(i => 
              decodeHtmlEntities(typeof i === 'string' ? i : i.text || i.name || '')
            ),
            image_url: json.image ? (Array.isArray(json.image) ? json.image[0] : json.image.url || json.image) : '',
            source_url: pageUrl
          };
          break;
        } else if (json['@graph']) {
          for (let item of json['@graph']) {
            if (item['@type'] === 'Recipe') {
              console.log('Found Recipe in @graph:', item.name);
              console.log('Recipe ingredients:', item.recipeIngredient);
              console.log('Recipe instructions:', item.recipeInstructions);
              recipe = {
                name: decodeHtmlEntities(item.name),
                description: decodeHtmlEntities(item.description || ''),
                ingredients: (item.recipeIngredient || []).map(decodeHtmlEntities),
                instructions: (item.recipeInstructions || []).map(i => 
                  decodeHtmlEntities(typeof i === 'string' ? i : i.text || i.name || '')
                ),
                image_url: item.image ? (Array.isArray(item.image) ? item.image[0] : item.image.url || item.image) : '',
                source_url: pageUrl
              };
              break;
            }
          }
          if (recipe) break;
        }
      } catch (e) {
        console.error('JSON parse error:', e);
      }
    }
    
    // If no JSON-LD found, try to extract from HTML structure
    if (!recipe) {
      console.log('No JSON-LD found, trying HTML extraction...');
      
      // Extract title
      const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i) || 
                        html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : 'Untitled Recipe';
      
      // Extract ingredients (look for common patterns)
      const ingredients = [];
      const ingredientMatches = html.match(/<li[^>]*>([^<]+)<\/li>/gi) || [];
      for (let match of ingredientMatches) {
        const text = match.replace(/<[^>]*>/g, '').trim();
        if (text.length > 10 && text.length < 200 && 
            !text.includes('©') && !text.includes('Privacy') && 
            !text.includes('Terms') && !text.includes('Cookie')) {
          ingredients.push(text);
        }
      }
      
      // Extract instructions (look for numbered lists or paragraphs)
      const instructions = [];
      const instructionMatches = html.match(/<p[^>]*>([^<]+)<\/p>/gi) || [];
      for (let match of instructionMatches) {
        const text = match.replace(/<[^>]*>/g, '').trim();
        if (text.length > 20 && text.length < 500 && 
            !text.includes('©') && !text.includes('Privacy') && 
            !text.includes('Terms') && !text.includes('Cookie')) {
          instructions.push(text);
        }
      }
      
      // Extract image
      const imageMatch = html.match(/<img[^>]*src=["']([^"']+)["'][^>]*>/i);
      const image_url = imageMatch ? imageMatch[1] : '';
      
      if (ingredients.length > 0 || instructions.length > 0) {
        console.log('Created recipe from HTML:', { title, ingredients: ingredients.length, instructions: instructions.length });
        recipe = {
          name: title,
          description: 'Recipe extracted from website',
          ingredients: ingredients.slice(0, 20), // Limit to first 20 ingredients
          instructions: instructions.slice(0, 20), // Limit to first 20 instructions
          image_url: image_url,
          source_url: pageUrl
        };
      }
    }
    
    if (recipe) {
      console.log('Recipe extracted successfully:', {
        name: recipe.name,
        ingredients: recipe.ingredients.length,
        instructions: recipe.instructions.length
      });
    } else {
      console.log('No recipe could be extracted');
    }
    
    return recipe;
  } catch (error) {
    console.error('Error extracting recipe:', error);
    throw error;
  }
}
