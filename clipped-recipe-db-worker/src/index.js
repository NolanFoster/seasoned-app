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
      // Health check endpoint
      if (pathname === '/health' && request.method === 'GET') {
        try {
          // Perform health checks
          const healthStatus = await checkSystemHealth(env);
          
          return new Response(JSON.stringify(healthStatus), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } catch (error) {
          console.error('Health check error:', error);
          const unhealthyStatus = {
            status: 'UNHEALTHY',
            timestamp: new Date().toISOString(),
            checks: {
              database: { status: 'UNHEALTHY', error: error.message },
              r2: { status: 'UNHEALTHY', error: 'Health check failed' }
            },
            message: 'System health check failed'
          };
          
          return new Response(JSON.stringify(unhealthyStatus), {
            status: 503,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      // Get all recipes
      if (pathname === '/recipes' && request.method === 'GET') {
        const limit = url.searchParams.get('limit');
        const recipes = await getRecipes(env, limit);
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
        try {
          console.log('POST /recipe endpoint called');
          console.log('Request headers:', Object.fromEntries(request.headers.entries()));
          console.log('Request method:', request.method);
          console.log('Request URL:', request.url);
          
          const body = await request.json();
          console.log('Request body parsed successfully:', body);
          console.log('Request body received:', {
            hasName: !!body.name,
            hasDescription: !!body.description,
            hasImage: !!body.image,
            hasImageUrl: !!body.image_url,
            hasSourceUrl: !!body.source_url,
            hasIngredients: !!body.ingredients,
            hasRecipeIngredient: !!body.recipeIngredient,
            hasInstructions: !!body.instructions,
            hasRecipeInstructions: !!body.recipeInstructions
          });
          
          console.log('Creating recipe with body fields:', {
            hasName: !!body.name,
            hasIngredients: !!body.ingredients,
            hasRecipeIngredient: !!body.recipeIngredient,
            hasInstructions: !!body.instructions,
            hasRecipeInstructions: !!body.recipeInstructions
          });
          
          // Call recipe-save-worker to create the recipe
          console.log('Calling recipe-save-worker to create recipe:', {
            url: body.source_url || `manual://${Date.now()}`,
            hasTitle: !!body.title,
            hasIngredients: !!body.ingredients,
            hasInstructions: !!body.recipeInstructions
          });
          const recipeSaveResponse = await fetch(`${env.SAVE_WORKER_URL}/recipe/save`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              recipe: {
                ...body,
                url: body.source_url || `manual://${Date.now()}` // Ensure we have a URL
              }
            })
          });
          
          console.log('Recipe save response status:', recipeSaveResponse.status);
          console.log('Recipe save response headers:', Object.fromEntries(recipeSaveResponse.headers.entries()));
          
          if (!recipeSaveResponse.ok) {
            const errorText = await recipeSaveResponse.text();
            console.error('Failed to create recipe:', recipeSaveResponse.status, errorText);
            return new Response(JSON.stringify({ error: 'Failed to create recipe' }), {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
          
          const result = await recipeSaveResponse.json();
          console.log('Recipe save response body:', result);
          console.log('Recipe created with ID:', result.id);
          
          return new Response(JSON.stringify({ id: result.id, message: 'Recipe created' }), {
            status: 201,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } catch (error) {
          console.error('Error in POST /recipe endpoint:', error);
          console.error('Error details:', {
            message: error.message,
            code: error.code,
            stack: error.stack
          });
          
          return new Response(JSON.stringify({ 
            error: 'Failed to create recipe', 
            details: error.message 
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      // Update recipe
      if (pathname.startsWith('/recipe/') && request.method === 'PUT') {
        const id = pathname.split('/')[2];
        const body = await request.json();
        
        // Call recipe-save-worker to update the recipe
        console.log('Calling recipe-save-worker to update recipe:', { id, updates: body });
        const recipeSaveResponse = await fetch(`${env.SAVE_WORKER_URL}/recipe/update`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            recipeId: id,
            updates: body
          })
        });
        
        if (!recipeSaveResponse.ok) {
          const errorText = await recipeSaveResponse.text();
          console.error('Failed to update recipe:', recipeSaveResponse.status, errorText);
          
          if (recipeSaveResponse.status === 404) {
            return new Response('Recipe not found', { 
              status: 404,
              headers: corsHeaders
            });
          }
          
          return new Response(JSON.stringify({ error: 'Failed to update recipe' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        return new Response(JSON.stringify({ message: 'Recipe updated' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Delete recipe
      if (pathname.startsWith('/recipe/') && request.method === 'DELETE') {
        const id = pathname.split('/')[2];
        
        // Call recipe-save-worker to delete the recipe
        console.log('Calling recipe-save-worker to delete recipe:', { id });
        const recipeSaveResponse = await fetch(`${env.SAVE_WORKER_URL}/recipe/delete`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            recipeId: id
          })
        });
        
        if (!recipeSaveResponse.ok) {
          const errorText = await recipeSaveResponse.text();
          console.error('Failed to delete recipe:', recipeSaveResponse.status, errorText);
          
          if (recipeSaveResponse.status === 404) {
            return new Response('Recipe not found', { 
              status: 404,
              headers: corsHeaders
            });
          }
          
          return new Response(JSON.stringify({ error: 'Failed to delete recipe' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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
            // Update recipe with image URL using recipe-save-worker
            const recipeSaveResponse = await fetch(`${env.SAVE_WORKER_URL}/recipe/update`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                recipeId: recipeId,
                updates: {
                  imageUrl: imageUrl,
                  image: imageUrl, // backward compatibility
                  image_url: imageUrl // backward compatibility
                }
              })
            });
            
            if (!recipeSaveResponse.ok) {
              console.error('Failed to update recipe image:', recipeSaveResponse.status);
            } else {
              console.log('Recipe image updated in database');
            }
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
            return new Response('Failed to extract recipe data', { 
              status: 404,
              headers: corsHeaders
            });
          }
          
          // Call recipe-save-worker to create the recipe
          const recipeSaveResponse = await fetch(`${env.SAVE_WORKER_URL}/recipe/save`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              recipe: {
                ...recipe,
                url: url || recipe.source_url || `clipped://${Date.now()}`
              }
            })
          });
          
          if (!recipeSaveResponse.ok) {
            const errorText = await recipeSaveResponse.text();
            console.error('Failed to create recipe from clip:', recipeSaveResponse.status, errorText);
            return new Response(JSON.stringify({ error: 'Failed to save recipe' }), {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
          
          const result = await recipeSaveResponse.json();
          
          return new Response(JSON.stringify({ ...recipe, id: result.id }), { 
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
async function getRecipes(env, limit) {
  let query = 'SELECT * FROM recipes ORDER BY created_at DESC';
  let params = [];
  
  if (limit && !isNaN(parseInt(limit))) {
    query += ' LIMIT ?';
    params.push(parseInt(limit));
  }
  
  const { results } = await env.DB.prepare(query).bind(...params).all();
  
  return results.map(recipe => ({
    ...recipe,
    // Parse JSON fields back to arrays/objects
    recipeIngredient: recipe.recipe_ingredient ? JSON.parse(recipe.recipe_ingredient) : [],
    recipeInstructions: recipe.recipe_instructions ? JSON.parse(recipe.recipe_instructions) : [],
    // Map nutrition fields to a structured object
    nutrition: {
      calories: recipe.nutrition_calories || '',
      proteinContent: recipe.nutrition_protein || '',
      fatContent: recipe.nutrition_fat || '',
      carbohydrateContent: recipe.nutrition_carbohydrate || '',
      fiberContent: recipe.nutrition_fiber || '',
      sugarContent: recipe.nutrition_sugar || '',
      sodiumContent: recipe.nutrition_sodium || '',
      cholesterolContent: recipe.nutrition_cholesterol || '',
      saturatedFatContent: recipe.nutrition_saturated_fat || '',
      transFatContent: recipe.nutrition_trans_fat || '',
      unsaturatedFatContent: recipe.nutrition_unsaturated_fat || '',
      servingSize: recipe.nutrition_serving_size || ''
    },
    // Map rating fields to a structured object
    aggregateRating: {
      ratingValue: recipe.aggregate_rating_value || null,
      ratingCount: recipe.aggregate_rating_count || null,
      reviewCount: recipe.review_count || null
    },
    // Map video field
    video: recipe.video_url ? {
      contentUrl: recipe.video_url
    } : null,
    // Backward compatibility fields for frontend
    ingredients: recipe.recipe_ingredient ? JSON.parse(recipe.recipe_ingredient) : [],
    instructions: recipe.recipe_instructions ? JSON.parse(recipe.recipe_instructions) : [],
    image_url: recipe.image
  }));
}

async function getRecipeById(env, id) {
  const result = await env.DB.prepare(
    'SELECT * FROM recipes WHERE id = ?'
  ).bind(id).first();
  
  if (!result) return null;
  
  return {
    ...result,
    // Parse JSON fields back to arrays/objects
    recipeIngredient: result.recipe_ingredient ? JSON.parse(result.recipe_ingredient) : [],
    recipeInstructions: result.recipe_instructions ? JSON.parse(result.recipe_instructions) : [],
    // Map nutrition fields to a structured object
    nutrition: {
      calories: result.nutrition_calories,
      proteinContent: result.nutrition_protein,
      fatContent: result.nutrition_fat,
      carbohydrateContent: result.nutrition_carbohydrate,
      fiberContent: result.nutrition_fiber,
      sugarContent: result.nutrition_sugar,
      sodiumContent: result.nutrition_sodium,
      cholesterolContent: result.nutrition_cholesterol,
      saturatedFatContent: result.nutrition_saturated_fat,
      transFatContent: result.nutrition_trans_fat,
      unsaturatedFatContent: result.nutrition_unsaturated_fat,
      servingSize: result.nutrition_serving_size
    },
    // Map rating fields to a structured object
    aggregateRating: {
      ratingValue: result.aggregate_rating_value,
      ratingCount: result.aggregate_rating_count,
      reviewCount: result.review_count
    },
    // Map video field
    video: result.video_url ? {
      contentUrl: result.video_url
    } : null,
    // Backward compatibility fields for frontend
    ingredients: result.recipe_ingredient ? JSON.parse(result.recipe_ingredient) : [],
    instructions: result.recipe_instructions ? JSON.parse(result.recipe_instructions) : [],
    image_url: result.image
  };
}

// ===== DEPRECATED FUNCTIONS REMOVED =====
// All recipe CRUD functions have been moved to recipe-save-worker
// for centralized recipe management. Use the recipe-save-worker API:
// 
// - createRecipe: POST https://recipe-save-worker.nolanfoster.workers.dev/recipe/save
// - updateRecipe: PUT https://recipe-save-worker.nolanfoster.workers.dev/recipe/update  
// - deleteRecipe: DELETE https://recipe-save-worker.nolanfoster.workers.dev/recipe/delete
// - updateRecipeImage: Handled automatically by recipe-save-worker
// ===== END DEPRECATED FUNCTIONS =====

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
    
    // Generate the image URL using environment variable
    const imageUrl = `${env.IMAGE_DOMAIN}/${fileName}`;
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
            image: json.image ? (Array.isArray(json.image) ? json.image[0] : json.image.url || json.image) : '',
            description: decodeHtmlEntities(json.description || ''),
            author: decodeHtmlEntities(json.author || ''),
            datePublished: json.datePublished || '',
            prepTime: json.prepTime || '',
            cookTime: json.cookTime || '',
            totalTime: json.totalTime || '',
            recipeYield: json.recipeYield || '',
            recipeCategory: json.recipeCategory || '',
            recipeCuisine: json.recipeCuisine || '',
            keywords: json.keywords || '',
            recipeIngredient: (json.recipeIngredient || []).map(decodeHtmlEntities),
            recipeInstructions: (json.recipeInstructions || []).map(i => {
              if (typeof i === 'string') {
                return { "@type": "HowToStep", text: decodeHtmlEntities(i) };
              } else if (i && typeof i === 'object') {
                return { 
                  "@type": "HowToStep", 
                  text: decodeHtmlEntities(i.text || i.name || '') 
                };
              }
              return null;
            }).filter(step => step && step.text.length > 0),
            nutrition: json.nutrition ? {
              "@type": "NutritionInformation",
              calories: json.nutrition.calories || '',
              proteinContent: json.nutrition.proteinContent || '',
              fatContent: json.nutrition.fatContent || '',
              carbohydrateContent: json.nutrition.carbohydrateContent || '',
              fiberContent: json.nutrition.fiberContent || '',
              sugarContent: json.nutrition.sugarContent || '',
              sodiumContent: json.nutrition.sodiumContent || '',
              cholesterolContent: json.nutrition.cholesterolContent || '',
              saturatedFatContent: json.nutrition.saturatedFatContent || '',
              transFatContent: json.nutrition.transFatContent || '',
              unsaturatedFatContent: json.nutrition.unsaturatedFatContent || '',
              servingSize: json.nutrition.servingSize || ''
            } : null,
            aggregateRating: json.aggregateRating ? {
              "@type": "AggregateRating",
              ratingValue: parseFloat(json.aggregateRating.ratingValue) || null,
              ratingCount: parseInt(json.aggregateRating.ratingCount) || null,
              reviewCount: parseInt(json.aggregateRating.reviewCount) || null
            } : null,
            video: json.video ? {
              "@type": "VideoObject",
              name: decodeHtmlEntities(json.video.name || ''),
              description: decodeHtmlEntities(json.video.description || ''),
              contentUrl: json.video.contentUrl || ''
            } : null,
            source_url: pageUrl,
            // Backward compatibility fields for frontend
            ingredients: (json.recipeIngredient || []).map(decodeHtmlEntities),
            instructions: (json.recipeInstructions || []).map(i => {
              if (typeof i === 'string') {
                return decodeHtmlEntities(i);
              } else if (i && typeof i === 'object') {
                return decodeHtmlEntities(i.text || i.name || '');
              }
              return '';
            }).filter(step => step.length > 0),
            image_url: json.image ? (Array.isArray(json.image) ? json.image[0] : json.image.url || json.image) : ''
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
                image: item.image ? (Array.isArray(item.image) ? item.image[0] : item.image.url || item.image) : '',
                description: decodeHtmlEntities(item.description || ''),
                author: decodeHtmlEntities(item.author || ''),
                datePublished: item.datePublished || '',
                prepTime: item.prepTime || '',
                cookTime: item.cookTime || '',
                totalTime: item.totalTime || '',
                recipeYield: item.recipeYield || '',
                recipeCategory: item.recipeCategory || '',
                recipeCuisine: item.recipeCuisine || '',
                keywords: item.keywords || '',
                recipeIngredient: (item.recipeIngredient || []).map(decodeHtmlEntities),
                recipeInstructions: (item.recipeInstructions || []).map(i => {
                  if (typeof i === 'string') {
                    return { "@type": "HowToStep", text: decodeHtmlEntities(i) };
                  } else if (i && typeof i === 'object') {
                    return { 
                      "@type": "HowToStep", 
                      text: decodeHtmlEntities(i.text || i.name || '') 
                    };
                  }
                  return null;
                }).filter(step => step && step.text.length > 0),
                nutrition: item.nutrition ? {
                  "@type": "NutritionInformation",
                  calories: item.nutrition.calories || '',
                  proteinContent: item.nutrition.proteinContent || '',
                  fatContent: item.nutrition.fatContent || '',
                  carbohydrateContent: item.nutrition.carbohydrateContent || '',
                  fiberContent: item.nutrition.fiberContent || '',
                  sugarContent: item.nutrition.sugarContent || '',
                  sodiumContent: item.nutrition.sodiumContent || '',
                  cholesterolContent: item.nutrition.cholesterolContent || '',
                  saturatedFatContent: item.nutrition.saturatedFatContent || '',
                  transFatContent: item.nutrition.transFatContent || '',
                  unsaturatedFatContent: item.nutrition.unsaturatedFatContent || '',
                  servingSize: item.nutrition.servingSize || ''
                } : null,
                aggregateRating: item.aggregateRating ? {
                  "@type": "AggregateRating",
                  ratingValue: parseFloat(item.aggregateRating.ratingValue) || null,
                  ratingCount: parseInt(item.aggregateRating.ratingCount) || null,
                  reviewCount: parseInt(item.aggregateRating.reviewCount) || null
                } : null,
                video: item.video ? {
                  "@type": "VideoObject",
                  name: decodeHtmlEntities(item.video.name || ''),
                  description: decodeHtmlEntities(item.video.description || ''),
                  contentUrl: item.video.contentUrl || ''
                } : null,
                source_url: pageUrl,
                // Backward compatibility fields for frontend
                ingredients: (item.recipeIngredient || []).map(decodeHtmlEntities),
                instructions: (item.recipeInstructions || []).map(i => {
                  if (typeof i === 'string') {
                    return decodeHtmlEntities(i);
                  } else if (i && typeof i === 'object') {
                    return decodeHtmlEntities(i.text || i.name || '');
                  }
                  return '';
                }).filter(step => step.length > 0),
                image_url: item.image ? (Array.isArray(item.image) ? item.image[0] : item.image.url || item.image) : ''
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
      const extractedIngredients = [];
      const ingredientMatches = html.match(/<li[^>]*>([^<]+)<\/li>/gi) || [];
      for (let match of ingredientMatches) {
        const text = match.replace(/<[^>]*>/g, '').trim();
        if (text.length > 10 && text.length < 200 && 
            !text.includes('©') && !text.includes('Privacy') && 
            !text.includes('Terms') && !text.includes('Cookie')) {
          extractedIngredients.push(text);
        }
      }
      
      // Extract instructions (look for numbered lists or paragraphs)
      const extractedInstructions = [];
      const instructionMatches = html.match(/<p[^>]*>([^<]+)<\/p>/gi) || [];
      for (let match of instructionMatches) {
        const text = match.replace(/<[^>]*>/g, '').trim();
        if (text.length > 20 && text.length < 500 && 
            !text.includes('©') && !text.includes('Privacy') && 
            !text.includes('Terms') && !text.includes('Cookie')) {
          extractedInstructions.push(text);
        }
      }
      
      // Extract image
      const imageMatch = html.match(/<img[^>]*src=["']([^"']+)["'][^>]*>/i);
      const extractedImage = imageMatch ? imageMatch[1] : '';
      
      if (extractedIngredients.length > 0 || extractedInstructions.length > 0) {
        console.log('Created recipe from HTML:', { title, ingredients: extractedIngredients.length, instructions: extractedInstructions.length });
        recipe = {
          name: title,
          description: 'Recipe extracted from website',
          image: extractedImage,
          recipeIngredient: extractedIngredients.slice(0, 20), // Limit to first 20 ingredients
          recipeInstructions: extractedInstructions.slice(0, 20).map(instruction => ({
            "@type": "HowToStep",
            text: instruction
          })), // Limit to first 20 instructions
          source_url: pageUrl,
          // Backward compatibility fields for frontend
          ingredients: extractedIngredients.slice(0, 20),
          instructions: extractedInstructions.slice(0, 20),
          image_url: extractedImage
        };
      }
    }
    
    if (recipe) {
      console.log('Recipe extracted successfully:', {
        name: recipe.name,
        ingredients: recipe.recipeIngredient?.length || recipe.ingredients?.length || 0,
        instructions: recipe.recipeInstructions?.length || recipe.instructions?.length || 0
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

// Health check function
async function checkSystemHealth(env) {
  const checks = {};
  let overallStatus = 'HEALTHY';
  
  try {
    // Check database connectivity
    try {
      if (env.DB) {
        // Try a simple query to check database health
        const result = await env.DB.prepare('SELECT 1 as health_check').first();
        checks.database = { 
          status: 'HEALTHY', 
          message: 'Database connection successful',
          response_time: Date.now()
        };
      } else {
        checks.database = { 
          status: 'DEGRADED', 
          message: 'Database binding not available',
          response_time: Date.now()
        };
        overallStatus = 'DEGRADED';
      }
    } catch (error) {
      checks.database = { 
        status: 'UNHEALTHY', 
        error: error.message,
        response_time: Date.now()
      };
      overallStatus = 'UNHEALTHY';
    }
    
    // Check R2 bucket accessibility
    try {
      if (env.IMAGES) {
        // Try to list objects (this is a lightweight operation)
        await env.IMAGES.list({ limit: 1 });
        checks.r2 = { 
          status: 'HEALTHY', 
          message: 'R2 bucket accessible',
          response_time: Date.now()
        };
      } else {
        checks.r2 = { 
          status: 'DEGRADED', 
          message: 'R2 binding not available',
          response_time: Date.now()
        };
        if (overallStatus === 'HEALTHY') {
          overallStatus = 'DEGRADED';
        }
      }
    } catch (error) {
      checks.r2 = { 
        status: 'UNHEALTHY', 
        error: error.message,
        response_time: Date.now()
      };
      overallStatus = 'UNHEALTHY';
    }
    
    // Check environment variables
    const requiredEnvVars = ['DB', 'IMAGES'];
    const envCheck = {};
    requiredEnvVars.forEach(varName => {
      if (env[varName]) {
        envCheck[varName] = { status: 'HEALTHY', message: 'Available' };
      } else {
        envCheck[varName] = { status: 'DEGRADED', message: 'Not available' };
        if (overallStatus === 'HEALTHY') {
          overallStatus = 'DEGRADED';
        }
      }
    });
    checks.environment = envCheck;
    
    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      checks: checks,
      message: overallStatus === 'HEALTHY' ? 'All systems operational' : 
               overallStatus === 'DEGRADED' ? 'Some systems degraded' : 
               'Critical systems unavailable'
    };
    
  } catch (error) {
    console.error('Health check failed:', error);
    return {
      status: 'UNHEALTHY',
      timestamp: new Date().toISOString(),
      checks: checks,
      error: error.message,
      message: 'Health check failed'
    };
  }
}
