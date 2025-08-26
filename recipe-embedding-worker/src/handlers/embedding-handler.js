/**
 * Decompress data using gzip from base64 (copied from shared/kv-storage.js)
 */
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

/**
 * Get recipe from KV storage (handles compression)
 */
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

/**
 * Embedding generation handler - processes recipes for embedding generation
 */
export async function handleEmbedding(request, env, corsHeaders) {
  try {
    const startTime = Date.now();

    // Parse request body to check if this is a scheduled run
    const contentType = request.headers.get('content-type') || '';
    let requestBody = {};

    if (contentType.includes('application/json')) {
      try {
        requestBody = await request.json();
      } catch (error) {
        console.warn('Failed to parse request body:', error);
      }
    }

    const isScheduled = requestBody.scheduled === true;
    console.log(`Starting embedding generation (${isScheduled ? 'scheduled' : 'manual'})`);

    // Get all recipe keys from KV storage
    const recipeKeys = await getRecipeKeys(env.RECIPE_STORAGE);
    console.log(`Found ${recipeKeys.length} recipes to process`);

    if (recipeKeys.length === 0) {
      return new Response(JSON.stringify({
        message: 'No recipes found in storage',
        processed: 0,
        duration: Date.now() - startTime
      }), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    // Process recipes in small batches to avoid subrequest limits
    // Cloudflare Workers limit: 50 subrequests per invocation
    const batchSize = isScheduled ? 3 : 2; // Much smaller batches to stay under limits
    const results = {
      processed: 0,
      skipped: 0,
      errors: 0,
      details: []
    };

    // Track subrequests to avoid hitting Cloudflare's 50 subrequest limit
    let subrequestCount = 0;
    const maxSubrequests = isScheduled ? 40 : 20; // Conservative limits

    for (let i = 0; i < recipeKeys.length; i += batchSize) {
      // Check if we're approaching the subrequest limit
      if (subrequestCount >= maxSubrequests) {
        console.log(`Stopping processing to avoid subrequest limit. Processed ${results.processed} recipes.`);
        results.details.push({
          status: 'info',
          message: `Stopped processing after ${results.processed} recipes to avoid subrequest limit. Remaining recipes will be processed in next run.`
        });
        break;
      }

      const batch = recipeKeys.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(recipeKeys.length / batchSize)} (subrequests: ${subrequestCount}/${maxSubrequests})`);

      const batchResults = await processBatch(batch, env);
      
      // Count subrequests used in this batch
      subrequestCount += batchResults.subrequestsUsed || 0;

      results.processed += batchResults.processed;
      results.skipped += batchResults.skipped;
      results.errors += batchResults.errors;
      results.details.push(...batchResults.details);

      // Add a longer delay between batches to prevent overwhelming the system
      if (i + batchSize < recipeKeys.length && subrequestCount < maxSubrequests) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    const duration = Date.now() - startTime;
    console.log(`Embedding generation completed: ${results.processed} processed, ${results.skipped} skipped, ${results.errors} errors in ${duration}ms`);

    return new Response(JSON.stringify({
      message: 'Embedding generation completed',
      ...results,
      duration,
      environment: env.ENVIRONMENT || 'development'
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });

  } catch (error) {
    console.error('Error in embedding generation:', error);
    return new Response(JSON.stringify({
      error: 'Failed to generate embeddings',
      details: error.message,
      environment: env.ENVIRONMENT || 'development'
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
}

/**
 * Get all recipe keys from KV storage
 */
async function getRecipeKeys(kvStorage) {
  try {
    const keys = [];
    let cursor = null;

    do {
      const listResult = await kvStorage.list({ cursor, limit: 1000 });
      keys.push(...listResult.keys.map(key => key.name));
      cursor = listResult.list_complete ? null : listResult.cursor;
    } while (cursor);

    return keys;
  } catch (error) {
    console.error('Error getting recipe keys:', error);
    return [];
  }
}

/**
 * Process a batch of recipes for embedding generation
 */
async function processBatch(recipeKeys, env) {
  const results = {
    processed: 0,
    skipped: 0,
    errors: 0,
    details: [],
    subrequestsUsed: 0
  };

  for (const key of recipeKeys) {
    try {
      // Get recipe data from KV using shared library (handles compression)
      const recipeResult = await getRecipeFromKV(env, key);

      if (!recipeResult.success || !recipeResult.recipe) {
        results.skipped++;
        results.details.push({ key, status: 'skipped', reason: 'no_data' });
        continue;
      }

      const recipeData = recipeResult.recipe;

      // Check if embedding already exists in vectorize
      const existingEmbedding = await checkExistingEmbedding(key, env.RECIPE_VECTORS);
      results.subrequestsUsed++; // Count Vectorize query as subrequest
      
      if (existingEmbedding) {
        results.skipped++;
        results.details.push({ key, status: 'skipped', reason: 'already_exists' });
        continue;
      }

      // Generate embedding text from recipe data
      const embeddingText = generateEmbeddingText(recipeData);

      if (!embeddingText) {
        results.skipped++;
        results.details.push({ key, status: 'skipped', reason: 'no_text' });
        continue;
      }

      // Generate embedding using Cloudflare AI
      const embedding = await generateEmbedding(embeddingText, env.AI);
      results.subrequestsUsed++; // Count AI call as subrequest

      if (!embedding) {
        results.errors++;
        results.details.push({ key, status: 'error', reason: 'embedding_failed' });
        continue;
      }

      // Store embedding in vectorize
      await storeEmbedding(key, embedding, recipeData, env.RECIPE_VECTORS);
      results.subrequestsUsed++; // Count Vectorize upsert as subrequest

      results.processed++;
      results.details.push({ key, status: 'processed' });

    } catch (error) {
      console.error(`Error processing recipe ${key}:`, error);
      results.errors++;
      results.details.push({ key, status: 'error', reason: error.message });
    }
  }

  return results;
}

/**
 * Check if embedding already exists for a recipe
 */
async function checkExistingEmbedding(recipeId, vectorStorage) {
  try {
    // Query vectorize to see if this recipe already has an embedding
    const query = await vectorStorage.query([0.0], {
      filter: { id: recipeId },
      topK: 1
    });
    return query.matches && query.matches.length > 0;
  } catch (error) {
    console.warn(`Could not check existing embedding for ${recipeId}:`, error);
    return false; // Assume it doesn't exist if we can't check
  }
}

/**
 * Generate text for embedding from recipe data
 */
function generateEmbeddingText(recipe) {
  try {
    const parts = [];

    // Recipe data might be nested under 'data' property (from KV compression format)
    const recipeData = recipe.data || recipe;

    // Add recipe title
    if (recipeData.name || recipeData.title) {
      parts.push(recipeData.name || recipeData.title);
    }

    // Add description
    if (recipeData.description) {
      parts.push(recipeData.description);
    }

    // Add ingredients
    if (recipeData.ingredients && Array.isArray(recipeData.ingredients)) {
      const ingredients = recipeData.ingredients
        .map(ing => typeof ing === 'string' ? ing : ing.text || ing.name || '')
        .filter(ing => ing.trim())
        .join(', ');
      if (ingredients) {
        parts.push(`Ingredients: ${ingredients}`);
      }
    }

    // Add instructions
    if (recipeData.instructions && Array.isArray(recipeData.instructions)) {
      const instructions = recipeData.instructions
        .map(inst => typeof inst === 'string' ? inst : inst.text || '')
        .filter(inst => inst.trim())
        .join(' ');
      if (instructions) {
        parts.push(`Instructions: ${instructions}`);
      }
    }

    // Add recipe yield
    if (recipeData.recipeYield || recipeData.yield) {
      parts.push(`Serves: ${recipeData.recipeYield || recipeData.yield}`);
    }

    // Add cook time
    if (recipeData.totalTime || recipeData.cookTime) {
      parts.push(`Cook time: ${recipeData.totalTime || recipeData.cookTime}`);
    }

    // Add keywords/tags
    if (recipeData.keywords) {
      const keywords = Array.isArray(recipeData.keywords)
        ? recipeData.keywords.join(', ')
        : recipeData.keywords;
      parts.push(`Keywords: ${keywords}`);
    }

    return parts.join('. ').substring(0, 8000); // Limit to reasonable size
  } catch (error) {
    console.error('Error generating embedding text:', error);
    return '';
  }
}

/**
 * Generate embedding using Cloudflare AI
 */
async function generateEmbedding(text, aiBinding) {
  try {
    const response = await aiBinding.run('@cf/baai/bge-small-en-v1.5', {
      text: text
    });

    if (response && response.data && Array.isArray(response.data[0])) {
      return response.data[0];
    }

    console.error('Invalid embedding response:', response);
    return null;
  } catch (error) {
    console.error('Error generating embedding:', error);
    return null;
  }
}

/**
 * Store embedding in vectorize
 */
async function storeEmbedding(recipeId, embedding, recipeData, vectorStorage) {
  try {
    // Recipe data might be nested under 'data' property (from KV compression format)
    const data = recipeData.data || recipeData;

    await vectorStorage.upsert([{
      id: recipeId,
      values: embedding,
      metadata: {
        title: data.name || data.title || 'Untitled Recipe',
        description: (data.description || '').substring(0, 500),
        url: recipeData.url || data.url || '',
        image: data.image || '',
        prepTime: data.prepTime || '',
        cookTime: data.cookTime || '',
        totalTime: data.totalTime || '',
        recipeYield: data.recipeYield || data.yield || '',
        category: data.recipeCategory || '',
        cuisine: data.recipeCuisine || '',
        scrapedAt: recipeData.scrapedAt || '',
        updatedAt: new Date().toISOString()
      }
    }]);
  } catch (error) {
    console.error(`Error storing embedding for ${recipeId}:`, error);
    throw error;
  }
}
