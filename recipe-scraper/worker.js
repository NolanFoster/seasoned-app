/**
 * Recipe Scraper
 * Scrapes recipe data from URLs using JSON-LD structured data
 * Stores recipes in KV database with hashed URL as key
 */

// Utility function to generate a unique ID from URL
function generateRecipeId(url) {
  const encoder = new TextEncoder();
  const data = encoder.encode(url);
  return crypto.subtle.digest('SHA-256', data)
    .then(hash => {
      const hashArray = Array.from(new Uint8Array(hash));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    });
}

// Compress data using gzip and encode as base64
async function compressData(data) {
  const encoder = new TextEncoder();
  const jsonString = JSON.stringify(data);
  const jsonBytes = encoder.encode(jsonString);
  
  // Use CompressionStream for gzip compression
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  const reader = cs.readable.getReader();
  
  writer.write(jsonBytes);
  writer.close();
  
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  
  // Combine chunks into a single Uint8Array
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const compressedData = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    compressedData.set(chunk, offset);
    offset += chunk.length;
  }
  
  // Convert to base64 string for storage
  return btoa(String.fromCharCode(...compressedData));
}

// Decompress data using gzip from base64
async function decompressData(compressedBase64) {
  // Convert base64 string back to Uint8Array
  const compressedData = new Uint8Array(
    atob(compressedBase64).split('').map(char => char.charCodeAt(0))
  );
  
  // Use DecompressionStream for gzip decompression
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();
  
  writer.write(compressedData);
  writer.close();
  
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  
  // Combine chunks and decode to string
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const decompressedBytes = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    decompressedBytes.set(chunk, offset);
    offset += chunk.length;
  }
  
  const decoder = new TextDecoder();
  const jsonString = decoder.decode(decompressedBytes);
  return JSON.parse(jsonString);
}

// Save recipe to KV storage
async function saveRecipeToKV(env, recipeId, recipeData) {
  try {
    const recipeRecord = {
      id: recipeId,
      url: recipeData.url,
      data: recipeData.data,
      scrapedAt: new Date().toISOString(),
      version: '1.1' // Updated version to indicate compression
    };
    
    // Compress the recipe record before saving
    const compressedData = await compressData(recipeRecord);
    await env.RECIPE_STORAGE.put(recipeId, compressedData);
    return { success: true, id: recipeId };
  } catch (error) {
    console.error('Error saving recipe to KV:', error);
    return { success: false, error: error.message };
  }
}

// Get recipe from KV storage
async function getRecipeFromKV(env, recipeId) {
  try {
    const recipeData = await env.RECIPE_STORAGE.get(recipeId);
    if (!recipeData) {
      return { success: false, error: 'Recipe not found' };
    }
    
    let recipe;
    
    // Try to parse as JSON first (uncompressed data)
    try {
      recipe = JSON.parse(recipeData);
    } catch (parseError) {
      // If JSON parsing fails, try to decompress (compressed data)
      try {
        recipe = await decompressData(recipeData);
      } catch (decompressError) {
        console.error('Failed to parse or decompress recipe data:', parseError, decompressError);
        return { success: false, error: 'Invalid recipe data format' };
      }
    }
    
    return { success: true, recipe };
  } catch (error) {
    console.error('Error retrieving recipe from KV:', error);
    return { success: false, error: error.message };
  }
}

// List all recipes from KV storage (with pagination)
async function listRecipesFromKV(env, cursor = null, limit = 50) {
  try {
    const listOptions = { limit };
    if (cursor) {
      listOptions.cursor = cursor;
    }
    
    const result = await env.RECIPE_STORAGE.list(listOptions);
    
    const recipes = [];
    for (const key of result.keys) {
      const recipeData = await env.RECIPE_STORAGE.get(key.name);
      if (recipeData) {
        let recipe;
        
        // Try to parse as JSON first (uncompressed data)
        try {
          recipe = JSON.parse(recipeData);
        } catch (parseError) {
          // If JSON parsing fails, try to decompress (compressed data)
          try {
            recipe = await decompressData(recipeData);
          } catch (decompressError) {
            console.error('Failed to parse or decompress recipe data:', parseError, decompressError);
            continue; // Skip this recipe and continue with others
          }
        }
        
        recipes.push(recipe);
      }
    }
    
    return {
      success: true,
      recipes,
      cursor: result.cursor,
      list_complete: result.list_complete
    };
  } catch (error) {
    console.error('Error listing recipes from KV:', error);
    return { success: false, error: error.message };
  }
}

// Delete recipe from KV storage
async function deleteRecipeFromKV(env, recipeId) {
  try {
    await env.RECIPE_STORAGE.delete(recipeId);
    return { success: true };
  } catch (error) {
    console.error('Error deleting recipe from KV:', error);
    return { success: false, error: error.message };
  }
}

// Decode HTML entities
function decodeHtmlEntities(text) {
  if (typeof text !== 'string') return text;
  
  const entities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
    '&copy;': '©',
    '&reg;': '®',
    '&trade;': '™'
  };
  
  return text.replace(/&[#\w]+;/g, entity => {
    return entities[entity] || entity;
  });
}

// Normalize ingredients to ensure they're always arrays
function normalizeIngredients(ingredients) {
  if (!ingredients) return [];
  if (typeof ingredients === 'string') return [decodeHtmlEntities(ingredients)];
  if (Array.isArray(ingredients)) {
    return ingredients.map(ing => {
      if (typeof ing === 'string') return decodeHtmlEntities(ing);
      if (ing.name) return decodeHtmlEntities(ing.name);
      if (ing.text) return decodeHtmlEntities(ing.text);
      return decodeHtmlEntities(String(ing));
    }).filter(Boolean);
  }
  return [];
}

// Normalize instructions
function normalizeInstructions(instructions) {
  if (!instructions) return [];
  if (typeof instructions === 'string') return [decodeHtmlEntities(instructions)];
  if (Array.isArray(instructions)) {
    return instructions.map(inst => {
      if (typeof inst === 'string') return decodeHtmlEntities(inst);
      if (inst.name) return decodeHtmlEntities(inst.name);
      if (inst.text) return decodeHtmlEntities(inst.text);
      if (inst['@type'] === 'HowToStep' && inst.text) return decodeHtmlEntities(inst.text);
      return decodeHtmlEntities(String(inst));
    }).filter(Boolean);
  }
  if (instructions['@type'] === 'HowToSection' && instructions.itemListElement) {
    return normalizeInstructions(instructions.itemListElement);
  }
  return [];
}

// Helper to check if a type value represents a schema.org/Recipe
function isRecipeType(typeValue) {
  if (typeof typeValue === 'string') {
    return typeValue === 'Recipe' || 
           typeValue === 'schema:Recipe' || 
           typeValue === 'https://schema.org/Recipe' ||
           typeValue === 'http://schema.org/Recipe';
  }
  return false;
}

// Validate if the JSON-LD object is a valid schema.org/Recipe
function validateRecipeSchema(jsonLd) {
  if (!jsonLd) return false;
  
  // Check for proper @context (schema.org)
  const context = jsonLd['@context'];
  const hasSchemaContext = context && (
    context === 'https://schema.org' ||
    context === 'http://schema.org' ||
    context === 'https://schema.org/' ||
    context === 'http://schema.org/' ||
    (typeof context === 'object' && context['@vocab'] && context['@vocab'].includes('schema.org'))
  );
  
  // Check if it's a Recipe type (with or without namespace)
  const type = jsonLd['@type'];
  
  if (isRecipeType(type)) return true;
  
  // Check if it's an array of types including Recipe
  if (Array.isArray(type) && type.some(isRecipeType)) return true;
  
  // Check if it's nested in @graph
  if (jsonLd['@graph'] && Array.isArray(jsonLd['@graph'])) {
    return jsonLd['@graph'].some(item => {
      const itemType = item['@type'];
      return isRecipeType(itemType) || 
             (Array.isArray(itemType) && itemType.some(isRecipeType));
    });
  }
  
  return false;
}

// Extract recipe data from JSON-LD
function extractRecipeData(jsonLd, url) {
  let recipe = null;
  
  // Direct Recipe object
  const type = jsonLd['@type'];
  if (isRecipeType(type) || (Array.isArray(type) && type.some(isRecipeType))) {
    recipe = jsonLd;
  }
  // Recipe in @graph
  else if (jsonLd['@graph'] && Array.isArray(jsonLd['@graph'])) {
    recipe = jsonLd['@graph'].find(item => {
      const itemType = item['@type'];
      return isRecipeType(itemType) || 
             (Array.isArray(itemType) && itemType.some(isRecipeType));
    });
  }
  
  if (!recipe) return null;
  
  // Extract and normalize recipe data
  return {
    name: decodeHtmlEntities(recipe.name || ''),
    description: decodeHtmlEntities(recipe.description || ''),
    url: url,
    image: recipe.image?.url || recipe.image || '',
    author: decodeHtmlEntities(recipe.author?.name || recipe.author || ''),
    datePublished: recipe.datePublished || '',
    prepTime: recipe.prepTime || '',
    cookTime: recipe.cookTime || '',
    totalTime: recipe.totalTime || '',
    recipeYield: decodeHtmlEntities(recipe.recipeYield || ''),
    recipeCategory: decodeHtmlEntities(recipe.recipeCategory || ''),
    recipeCuisine: decodeHtmlEntities(recipe.recipeCuisine || ''),
    keywords: decodeHtmlEntities(recipe.keywords || ''),
    ingredients: normalizeIngredients(recipe.recipeIngredient),
    instructions: normalizeInstructions(recipe.recipeInstructions),
    nutrition: recipe.nutrition || {},
    aggregateRating: recipe.aggregateRating || {},
  };
}

// HTMLRewriter handler to extract JSON-LD scripts
class JSONLDExtractor {
  constructor() {
    this.jsonLdScripts = [];
  }
  
  element(element) {
    // We'll get the text content in the text handler
    this.currentScript = '';
  }
  
  text(text) {
    this.currentScript += text.text;
    if (text.lastInTextNode) {
      try {
        const parsed = JSON.parse(this.currentScript);
        // Handle both single objects and arrays of JSON-LD
        if (Array.isArray(parsed)) {
          this.jsonLdScripts.push(...parsed);
        } else {
          this.jsonLdScripts.push(parsed);
        }
      } catch (e) {
        console.error('Failed to parse JSON-LD:', e);
      }
      this.currentScript = '';
    }
  }
}

// Process a single URL
async function processRecipeUrl(url) {
  try {
    // Fetch the HTML page
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RecipeIndexBot/1.0)',
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    // Use HTMLRewriter to extract JSON-LD
    const extractor = new JSONLDExtractor();
    const rewriter = new HTMLRewriter()
      .on('script[type="application/ld+json"]', extractor);
    
    // Process the response through HTMLRewriter
    await rewriter.transform(response).text();
    
    // Find valid recipe data
    let recipeData = null;
    for (const jsonLd of extractor.jsonLdScripts) {
      if (validateRecipeSchema(jsonLd)) {
        recipeData = extractRecipeData(jsonLd, url);
        if (recipeData) break;
      }
    }
    
    if (!recipeData) {
      return {
        success: false,
        url,
        error: 'No valid Recipe JSON-LD found'
      };
    }
    
    // Generate unique ID
    const id = await generateRecipeId(url);
    recipeData.id = id;
    
    return {
      success: true,
      url,
      data: recipeData
    };
    
  } catch (error) {
    return {
      success: false,
      url,
      error: error.message
    };
  }
}

// Main request handler
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Handle /scrape endpoint
    if (url.pathname === '/scrape') {
      if (request.method !== 'GET' && request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
      }
      
      let urls = [];
      let saveToKV = url.searchParams.get('save') === 'true';
      let avoidOverwrite = url.searchParams.get('avoidOverwrite') === 'true';
      
      // GET request with single URL
      if (request.method === 'GET') {
        const targetUrl = url.searchParams.get('url');
        if (!targetUrl) {
          return new Response(JSON.stringify({
            error: 'Missing url parameter'
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        urls = [targetUrl];
      }
      
      // POST request with batch of URLs
      if (request.method === 'POST') {
        try {
          const body = await request.json();
          if (body.urls && Array.isArray(body.urls)) {
            urls = body.urls;
          } else if (body.url) {
            urls = [body.url];
          } else {
            return new Response(JSON.stringify({
              error: 'Missing url or urls in request body'
            }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          saveToKV = body.save === true;
          avoidOverwrite = body.avoidOverwrite === true;
        } catch (e) {
          return new Response(JSON.stringify({
            error: 'Invalid JSON in request body'
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
      
      // Process URLs
      const results = await Promise.all(
        urls.map(async (targetUrl) => {
          const result = await processRecipeUrl(targetUrl);
          
          // Save to KV if requested and successful
          if (saveToKV && result.success && env.RECIPE_STORAGE) {
            const recipeId = await generateRecipeId(targetUrl);
            
            // Check if recipe already exists when avoidOverwrite is true
            if (avoidOverwrite) {
              const existingRecipe = await getRecipeFromKV(env, recipeId);
              if (existingRecipe.success) {
                // Recipe already exists, return existing data instead of overwriting
                return {
                  success: true,
                  url: targetUrl,
                  data: existingRecipe.recipe.data,
                  alreadyExists: true,
                  existingRecipe: {
                    id: existingRecipe.recipe.id,
                    scrapedAt: existingRecipe.recipe.scrapedAt,
                    version: existingRecipe.recipe.version
                  },
                  recipeId: recipeId,
                  savedToKV: false,
                  message: 'Recipe already exists, not overwritten'
                };
              }
            }
            
            const saveResult = await saveRecipeToKV(env, recipeId, result);
            result.savedToKV = saveResult.success;
            result.recipeId = recipeId;
            if (!saveResult.success) {
              result.kvError = saveResult.error;
            }
          }
          
          return result;
        })
      );
      
      // Return results
      return new Response(JSON.stringify({
        results,
        summary: {
          total: results.length,
          successful: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length,
          savedToKV: results.filter(r => r.savedToKV).length
        }
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Handle /recipes endpoint - List all recipes (when no id parameter)
    if (url.pathname === '/recipes' && request.method === 'GET' && !url.searchParams.has('id')) {
      const cursor = url.searchParams.get('cursor');
      const limit = parseInt(url.searchParams.get('limit') || '50');
      
      const result = await listRecipesFromKV(env, cursor, limit);
      if (!result.success) {
        return new Response(JSON.stringify(result), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Handle /recipes endpoint - Get recipe by ID
    if (url.pathname === '/recipes' && request.method === 'GET' && url.searchParams.has('id')) {
      const recipeId = url.searchParams.get('id');
      const raw = url.searchParams.get('raw') === 'true';
      
      if (raw) {
        // Return raw compressed data for compression analysis
        const rawData = await env.RECIPE_STORAGE.get(recipeId);
        if (!rawData) {
          return new Response(JSON.stringify({ error: 'Recipe not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        return new Response(rawData, {
          headers: { 'Content-Type': 'text/plain' }
        });
      }
      
      const result = await getRecipeFromKV(env, recipeId);
      if (!result.success) {
        return new Response(JSON.stringify(result), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      return new Response(JSON.stringify(result.recipe), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Handle DELETE /recipes endpoint
    if (url.pathname === '/recipes' && request.method === 'DELETE') {
      const recipeId = url.searchParams.get('id');
      if (!recipeId) {
        return new Response(JSON.stringify({
          error: 'Missing id parameter'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      const result = await deleteRecipeFromKV(env, recipeId);
      if (!result.success) {
        return new Response(JSON.stringify(result), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      return new Response(JSON.stringify({ message: 'Recipe deleted successfully' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'healthy',
        service: 'recipe-scraper',
        features: ['scraping', 'kv-storage']
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Default response with API documentation
    return new Response(JSON.stringify({
      service: 'Recipe Scraper with KV Storage',
      endpoints: {
        'GET /scrape?url=<recipe-url>&save=true': 'Scrape a recipe and optionally save to KV',
        'GET /scrape?url=<recipe-url>&save=true&avoidOverwrite=true': 'Scrape a recipe but avoid overwriting existing ones',
        'POST /scrape': 'Scrape multiple recipes (JSON body with urls array, save boolean, and avoidOverwrite boolean)',
        'GET /recipes': 'List all stored recipes (supports cursor and limit params)',
        'GET /recipes?id=<recipe-id>': 'Get a specific recipe by ID',
        'DELETE /recipes?id=<recipe-id>': 'Delete a recipe by ID',
        'GET /health': 'Health check'
      },
      example: {
        scrape: 'GET /scrape?url=https://example.com/recipe&save=true',
        scrapeNoOverwrite: 'GET /scrape?url=https://example.com/recipe&save=true&avoidOverwrite=true',
        getRecipe: 'GET /recipes?id=<hashed-url-id>'
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
};