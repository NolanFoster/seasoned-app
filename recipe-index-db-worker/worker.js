/**
 * Recipe Index DB Worker
 * Scrapes recipe data from URLs using JSON-LD structured data
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

// Normalize ingredients to ensure they're always arrays
function normalizeIngredients(ingredients) {
  if (!ingredients) return [];
  if (typeof ingredients === 'string') return [ingredients];
  if (Array.isArray(ingredients)) {
    return ingredients.map(ing => {
      if (typeof ing === 'string') return ing;
      if (ing.name) return ing.name;
      if (ing.text) return ing.text;
      return String(ing);
    }).filter(Boolean);
  }
  return [];
}

// Normalize instructions
function normalizeInstructions(instructions) {
  if (!instructions) return [];
  if (typeof instructions === 'string') return [instructions];
  if (Array.isArray(instructions)) {
    return instructions.map(inst => {
      if (typeof inst === 'string') return inst;
      if (inst.name) return inst.name;
      if (inst.text) return inst.text;
      if (inst['@type'] === 'HowToStep' && inst.text) return inst.text;
      return String(inst);
    }).filter(Boolean);
  }
  if (instructions['@type'] === 'HowToSection' && instructions.itemListElement) {
    return normalizeInstructions(instructions.itemListElement);
  }
  return [];
}

// Validate if the JSON-LD object is a valid Recipe schema
function validateRecipeSchema(jsonLd) {
  if (!jsonLd) return false;
  
  // Check if it's a Recipe type
  const type = jsonLd['@type'];
  if (type === 'Recipe') return true;
  
  // Check if it's an array of types including Recipe
  if (Array.isArray(type) && type.includes('Recipe')) return true;
  
  // Check if it's nested in @graph
  if (jsonLd['@graph'] && Array.isArray(jsonLd['@graph'])) {
    return jsonLd['@graph'].some(item => 
      item['@type'] === 'Recipe' || 
      (Array.isArray(item['@type']) && item['@type'].includes('Recipe'))
    );
  }
  
  return false;
}

// Extract recipe data from JSON-LD
function extractRecipeData(jsonLd, url) {
  let recipe = null;
  
  // Direct Recipe object
  if (jsonLd['@type'] === 'Recipe' || 
      (Array.isArray(jsonLd['@type']) && jsonLd['@type'].includes('Recipe'))) {
    recipe = jsonLd;
  }
  // Recipe in @graph
  else if (jsonLd['@graph'] && Array.isArray(jsonLd['@graph'])) {
    recipe = jsonLd['@graph'].find(item => 
      item['@type'] === 'Recipe' || 
      (Array.isArray(item['@type']) && item['@type'].includes('Recipe'))
    );
  }
  
  if (!recipe) return null;
  
  // Extract and normalize recipe data
  return {
    name: recipe.name || '',
    description: recipe.description || '',
    url: url,
    image: recipe.image?.url || recipe.image || '',
    author: recipe.author?.name || recipe.author || '',
    datePublished: recipe.datePublished || '',
    prepTime: recipe.prepTime || '',
    cookTime: recipe.cookTime || '',
    totalTime: recipe.totalTime || '',
    recipeYield: recipe.recipeYield || '',
    recipeCategory: recipe.recipeCategory || '',
    recipeCuisine: recipe.recipeCuisine || '',
    keywords: recipe.keywords || '',
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
        this.jsonLdScripts.push(parsed);
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
        urls.map(url => processRecipeUrl(url))
      );
      
      // Return results
      return new Response(JSON.stringify({
        results,
        summary: {
          total: results.length,
          successful: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length
        }
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'healthy',
        service: 'recipe-index-db-worker'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Default response
    return new Response('Recipe Index DB Worker - Use /scrape?url=<recipe-url> to scrape recipes', {
      headers: { 'Content-Type': 'text/plain' }
    });
  }
};