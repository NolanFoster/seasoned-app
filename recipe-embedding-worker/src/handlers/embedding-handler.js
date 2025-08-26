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
    let recipeKeys;
    try {
      recipeKeys = await getRecipeKeys(env.RECIPE_STORAGE);
      console.log(`Found ${recipeKeys.length} recipes to process`);
    } catch (error) {
      console.error('Failed to get recipe keys:', error);
      return new Response(JSON.stringify({
        error: 'Failed to access recipe storage',
        details: error.message,
        environment: env.ENVIRONMENT || 'development',
        availableBindings: Object.keys(env).filter(key => key !== 'ENVIRONMENT')
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

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

    // Process recipes dynamically, checking for existing embeddings during processing
    const recipesToProcess = [...recipeKeys]; // Start with all recipes

    // Process recipes in small batches to avoid subrequest limits
    // Cloudflare Workers limit: 50 subrequests per invocation
    // Each recipe uses 3 subrequests: KV get + AI embedding + Vectorize upsert
    const batchSize = isScheduled ? 6 : 5; // Optimized for 50 subrequest limit
    const results = {
      processed: 0,
      skipped: 0,
      errors: 0,
      details: []
    };

    // Track subrequests to avoid hitting Cloudflare's 50 subrequest limit
    let subrequestCount = 0;
    const maxSubrequests = isScheduled ? 48 : 45; // Conservative limits for 50 max
    let currentIndex = 0;

    while (currentIndex < recipesToProcess.length && subrequestCount < maxSubrequests) {
      // Check if we're approaching the subrequest limit
      if (subrequestCount >= maxSubrequests) {
        console.log(`Stopping processing to avoid subrequest limit. Processed ${results.processed} recipes.`);
        results.details.push({
          status: 'info',
          message: `Stopped processing after ${results.processed} recipes to avoid subrequest limit. Remaining recipes will be processed in next run.`
        });
        break;
      }

      // Get next batch of recipes to process
      const batch = recipesToProcess.slice(currentIndex, currentIndex + batchSize);
      console.log(`Processing batch starting at index ${currentIndex} (subrequests: ${subrequestCount}/${maxSubrequests})`);

      const batchResults = await processBatchWithDynamicFiltering(batch, env, recipesToProcess, currentIndex);
      
      // Count subrequests used in this batch
      subrequestCount += batchResults.subrequestsUsed || 0;

      results.processed += batchResults.processed;
      results.skipped += batchResults.skipped;
      results.errors += batchResults.errors;
      results.details.push(...batchResults.details);

      // Update current index based on how many recipes were actually processed
      currentIndex += batchResults.processed + batchResults.skipped + batchResults.errors;

      // Add a longer delay between batches to prevent overwhelming the system
      if (currentIndex < recipesToProcess.length && subrequestCount < maxSubrequests) {
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
    // Check if kvStorage is available
    if (!kvStorage) {
      console.error('KV storage binding is not available. Check wrangler.toml configuration.');
      throw new Error('KV storage binding (RECIPE_STORAGE) is not available');
    }

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
    throw error; // Re-throw to provide better error handling upstream
  }
}

/**
 * Get all existing vector IDs from vectorize storage
 */
async function getExistingVectorIds(vectorStorage) {
  try {
    const existingIds = new Set();
    
    // Query with a dummy vector to get all records, using a large topK
    // We'll use a zero vector since we just want to get the IDs
    const dummyVector = new Array(384).fill(0); // Assuming 384-dimensional vectors
    
    // Get all existing vectors in batches
    let cursor = null;
    const batchSize = 1000;
    
    do {
      const query = await vectorStorage.query(dummyVector, {
        topK: batchSize,
        cursor: cursor
      });
      
      if (query.matches) {
        query.matches.forEach(match => {
          if (match.id) {
            existingIds.add(match.id);
          }
        });
      }
      
      cursor = query.cursor || null;
    } while (cursor);
    
    console.log(`Found ${existingIds.size} existing vectors in database`);
    return existingIds;
  } catch (error) {
    console.error('Error getting existing vector IDs:', error);
    return new Set(); // Return empty set if we can't check
  }
}

/**
 * Filter out recipe keys that already have embeddings
 */
async function filterNewRecipes(recipeKeys, vectorStorage) {
  try {
    console.log(`Checking for existing embeddings among ${recipeKeys.length} recipes...`);
    
    // Get all existing vector IDs
    const existingIds = await getExistingVectorIds(vectorStorage);
    
    // Filter out recipes that already have embeddings
    const newRecipes = recipeKeys.filter(key => !existingIds.has(key));
    
    console.log(`Found ${recipeKeys.length - newRecipes.length} existing embeddings, ${newRecipes.length} new recipes to process`);
    
    return newRecipes;
  } catch (error) {
    console.error('Error filtering new recipes:', error);
    // If we can't check existing embeddings, process all recipes
    return recipeKeys;
  }
}

/**
 * Process a batch of recipes for embedding generation with dynamic filtering
 * If a recipe already has an embedding, it will try to grab another key from KV
 */
async function processBatchWithDynamicFiltering(recipeKeys, env, allRecipeKeys, currentIndex) {
  const results = {
    processed: 0,
    skipped: 0,
    errors: 0,
    details: [],
    subrequestsUsed: 0
  };

  let keyIndex = 0;
  let additionalKeysChecked = 0;
  const maxAdditionalChecks = 10; // Limit additional key checks to avoid infinite loops

  while (keyIndex < recipeKeys.length && additionalKeysChecked < maxAdditionalChecks) {
    const key = recipeKeys[keyIndex];

    try {
      // Check if this recipe already has an embedding in the vector database
      const existingEmbedding = await checkExistingEmbedding(key, env.RECIPE_VECTORS);
      results.subrequestsUsed++; // Count vectorize query as subrequest

      if (existingEmbedding) {
        results.skipped++;
        results.details.push({ key, status: 'skipped', reason: 'already_has_embedding' });
        
        // Try to grab another key from KV that we haven't processed yet
        const nextKey = await getNextUnprocessedKey(allRecipeKeys, currentIndex + keyIndex + 1, env.RECIPE_VECTORS);
        if (nextKey) {
          // Replace the current key with the new one
          recipeKeys[keyIndex] = nextKey;
          additionalKeysChecked++;
          continue; // Process the new key instead
        } else {
          // No more keys available, skip this one
          keyIndex++;
          continue;
        }
      }

      // Get recipe data from KV using shared library (handles compression)
      const recipeResult = await getRecipeFromKV(env, key);
      results.subrequestsUsed++; // Count KV get as subrequest

      if (!recipeResult.success || !recipeResult.recipe) {
        results.skipped++;
        results.details.push({ key, status: 'skipped', reason: 'no_data' });
        keyIndex++;
        continue;
      }

      const recipeData = recipeResult.recipe;

      // Generate embedding text from recipe data
      const embeddingText = generateEmbeddingText(recipeData);

      if (!embeddingText) {
        results.skipped++;
        results.details.push({ key, status: 'skipped', reason: 'no_text' });
        keyIndex++;
        continue;
      }

      // Generate embedding using Cloudflare AI
      const embedding = await generateEmbedding(embeddingText, env.AI);
      results.subrequestsUsed++; // Count AI call as subrequest

      if (!embedding) {
        results.errors++;
        results.details.push({ key, status: 'error', reason: 'embedding_failed' });
        keyIndex++;
        continue;
      }

      // Store embedding in vectorize
      await storeEmbedding(key, embedding, recipeData, env.RECIPE_VECTORS);
      results.subrequestsUsed++; // Count Vectorize upsert as subrequest

      results.processed++;
      results.details.push({ key, status: 'processed' });
      keyIndex++;

    } catch (error) {
      console.error(`Error processing recipe ${key}:`, error);
      results.errors++;
      results.details.push({ key, status: 'error', reason: error.message });
      keyIndex++;
    }
  }

  return results;
}

/**
 * Check if a recipe already has an embedding in the vector database
 */
async function checkExistingEmbedding(recipeId, vectorStorage) {
  try {
    // Try to get the embedding directly by ID first
    try {
      const existingEmbedding = await vectorStorage.getByIds([recipeId]);
      if (existingEmbedding && existingEmbedding.length > 0) {
        return true;
      }
    } catch (getError) {
      // If getByIds fails, fall back to query method
    }

    // Use a dummy vector to query for the specific recipe ID
    const dummyVector = new Array(384).fill(0);
    const query = await vectorStorage.query(dummyVector, {
      topK: 1000 // Query more results to find the specific ID
    });
    
    if (query.matches) {
      return query.matches.some(match => match.id === recipeId);
    }
    
    return false;
  } catch (error) {
    console.error(`Error checking existing embedding for ${recipeId}:`, error);
    return false; // Assume no existing embedding if we can't check
  }
}

/**
 * Get the next unprocessed key from the recipe keys list
 */
async function getNextUnprocessedKey(allRecipeKeys, startIndex, vectorStorage) {
  try {
    // Check keys starting from the given index
    for (let i = startIndex; i < allRecipeKeys.length; i++) {
      const key = allRecipeKeys[i];
      const hasEmbedding = await checkExistingEmbedding(key, vectorStorage);
      
      if (!hasEmbedding) {
        return key;
      }
    }
    
    return null; // No more unprocessed keys found
  } catch (error) {
    console.error('Error getting next unprocessed key:', error);
    return null;
  }
}

/**
 * Process a batch of recipes for embedding generation (legacy function for backward compatibility)
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
      results.subrequestsUsed++; // Count KV get as subrequest

      if (!recipeResult.success || !recipeResult.recipe) {
        results.skipped++;
        results.details.push({ key, status: 'skipped', reason: 'no_data' });
        continue;
      }

      const recipeData = recipeResult.recipe;

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
