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
 * Progress tracking keys for KV storage
 */
const PROGRESS_KEYS = {
  LAST_PROCESSED_INDEX: 'embedding_progress_last_index',
  TOTAL_RECIPES: 'embedding_progress_total_count',
  LAST_RUN_TIMESTAMP: 'embedding_progress_last_run',
  PROCESSED_RECIPE_IDS: 'embedding_progress_processed_ids',
  FAILED_RECIPE_IDS: 'embedding_progress_failed_ids',
  CURRENT_BATCH_START: 'embedding_progress_batch_start'
};

/**
 * Reset progress tracking data
 */
async function resetProgress(env) {
  try {
    const resetData = {
      lastProcessedIndex: 0,
      totalRecipes: 0,
      lastRunTimestamp: null,
      processedRecipeIds: [],
      failedRecipeIds: [],
      currentBatchStart: 0
    };

    await env.RECIPE_STORAGE.put(PROGRESS_KEYS.LAST_PROCESSED_INDEX, JSON.stringify(resetData));
    console.log('Progress tracking reset successfully');
    return true;
  } catch (error) {
    console.error('Error resetting progress:', error);
    return false;
  }
}

/**
 * Get progress tracking data from KV
 */
async function getProgressData(env) {
  try {
    const progressData = await env.RECIPE_STORAGE.get(PROGRESS_KEYS.LAST_PROCESSED_INDEX);
    if (!progressData) {
      return {
        lastProcessedIndex: 0,
        totalRecipes: 0,
        lastRunTimestamp: null,
        processedRecipeIds: new Set(),
        failedRecipeIds: new Set(),
        currentBatchStart: 0
      };
    }

    const data = JSON.parse(progressData);
    
    // Validate and sanitize the data
    const sanitizedData = {
      lastProcessedIndex: Math.max(0, parseInt(data.lastProcessedIndex) || 0),
      totalRecipes: Math.max(0, parseInt(data.totalRecipes) || 0),
      lastRunTimestamp: data.lastRunTimestamp ? parseInt(data.lastRunTimestamp) : null,
      processedRecipeIds: new Set(Array.isArray(data.processedRecipeIds) ? data.processedRecipeIds : []),
      failedRecipeIds: new Set(Array.isArray(data.failedRecipeIds) ? data.failedRecipeIds : []),
      currentBatchStart: Math.max(0, parseInt(data.currentBatchStart) || 0)
    };

    // If timestamp is too old (more than 7 days), reset progress
    if (sanitizedData.lastRunTimestamp && (Date.now() - sanitizedData.lastRunTimestamp) > 7 * 24 * 60 * 60 * 1000) {
      console.log('Progress data is too old, resetting...');
      await resetProgress(env);
      return {
        lastProcessedIndex: 0,
        totalRecipes: 0,
        lastRunTimestamp: null,
        processedRecipeIds: new Set(),
        failedRecipeIds: new Set(),
        currentBatchStart: 0
      };
    }

    return sanitizedData;
  } catch (error) {
    console.error('Error getting progress data:', error);
    // If there's an error parsing the data, reset it
    await resetProgress(env);
    return {
      lastProcessedIndex: 0,
      totalRecipes: 0,
      lastRunTimestamp: null,
      processedRecipeIds: new Set(),
      failedRecipeIds: new Set(),
      currentBatchStart: 0
    };
  }
}

/**
 * Save progress tracking data to KV
 */
async function saveProgressData(env, progressData) {
  try {
    const dataToSave = {
      lastProcessedIndex: progressData.lastProcessedIndex,
      totalRecipes: progressData.totalRecipes,
      lastRunTimestamp: progressData.lastRunTimestamp,
      processedRecipeIds: Array.from(progressData.processedRecipeIds),
      failedRecipeIds: Array.from(progressData.failedRecipeIds),
      currentBatchStart: progressData.currentBatchStart
    };

    await env.RECIPE_STORAGE.put(PROGRESS_KEYS.LAST_PROCESSED_INDEX, JSON.stringify(dataToSave));
  } catch (error) {
    console.error('Error saving progress data:', error);
  }
}

/**
 * Update progress tracking for a specific recipe
 */
async function updateRecipeProgress(env, recipeId, status, progressData) {
  if (status === 'processed') {
    progressData.processedRecipeIds.add(recipeId);
    progressData.failedRecipeIds.delete(recipeId); // Remove from failed if it was there
  } else if (status === 'failed') {
    progressData.failedRecipeIds.add(recipeId);
    progressData.processedRecipeIds.delete(recipeId); // Remove from processed if it was there
  }

  // Save progress after each recipe to ensure persistence
  await saveProgressData(env, progressData);
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

    // Get progress data from previous runs
    const progressData = await getProgressData(env);
    console.log(`Progress from last run: ${progressData.lastProcessedIndex}/${progressData.totalRecipes} recipes processed`);

    // Get all recipe keys from KV storage
    let recipeKeys;
    try {
      recipeKeys = await getRecipeKeys(env.RECIPE_STORAGE);
      console.log(`Found ${recipeKeys.length} recipes to process`);
      
      // Update total count if it changed
      if (progressData.totalRecipes !== recipeKeys.length) {
        progressData.totalRecipes = recipeKeys.length;
        await saveProgressData(env, progressData);
      }
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

    // Start processing from where we left off
    let currentIndex = progressData.lastProcessedIndex;
    let currentBatchStart = progressData.currentBatchStart;
    
    // If we're starting fresh or the batch was interrupted, start from the beginning
    if (currentIndex === 0 || (Date.now() - (progressData.lastRunTimestamp || 0)) > 24 * 60 * 60 * 1000) {
      currentIndex = 0;
      currentBatchStart = 0;
      progressData.processedRecipeIds.clear();
      progressData.failedRecipeIds.clear();
      console.log('Starting fresh processing run');
    } else if (progressData.failedRecipeIds.size > 0) {
      // If we have failed recipes, prioritize retrying them first
      console.log(`Found ${progressData.failedRecipeIds.size} failed recipes to retry`);
      // We'll process failed recipes first in the processing loop
    }

    // Update run timestamp
    progressData.lastRunTimestamp = Date.now();
    progressData.currentBatchStart = currentBatchStart;
    await saveProgressData(env, progressData);

    // Process recipes with progress tracking
    const results = await processRecipesWithProgress(
      recipeKeys, 
      env, 
      progressData, 
      currentIndex, 
      currentBatchStart,
      isScheduled
    );

    const duration = Date.now() - startTime;
    console.log(`Embedding generation completed: ${results.processed} processed, ${results.skipped} skipped, ${results.errors} errors in ${duration}ms`);

    return new Response(JSON.stringify({
      message: 'Embedding generation completed',
      ...results,
      duration,
      environment: env.ENVIRONMENT || 'development',
      progress: {
        currentIndex: progressData.lastProcessedIndex,
        totalRecipes: progressData.totalRecipes,
        processedCount: progressData.processedRecipeIds.size,
        failedCount: progressData.failedRecipeIds.size,
        completionPercentage: Math.round((progressData.processedRecipeIds.size / progressData.totalRecipes) * 100)
      }
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
 * Reset progress handler - manually resets embedding generation progress
 */
export async function handleReset(request, env, corsHeaders) {
  try {
    // Reset progress tracking
    const resetSuccess = await resetProgress(env);
    
    if (resetSuccess) {
      return new Response(JSON.stringify({
        status: 'success',
        message: 'Progress tracking reset successfully',
        environment: env.ENVIRONMENT || 'development'
      }), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    } else {
      return new Response(JSON.stringify({
        error: 'Failed to reset progress',
        environment: env.ENVIRONMENT || 'development'
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

  } catch (error) {
    console.error('Error resetting progress:', error);
    return new Response(JSON.stringify({
      error: 'Failed to reset progress',
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
 * Progress check handler - returns current embedding generation progress
 */
export async function handleProgress(request, env, corsHeaders) {
  try {
    // Get progress data from KV
    const progressData = await getProgressData(env);
    
    // Get current recipe count
    let currentRecipeCount = 0;
    try {
      const recipeKeys = await getRecipeKeys(env.RECIPE_STORAGE);
      currentRecipeCount = recipeKeys.length;
    } catch (error) {
      console.error('Failed to get current recipe count:', error);
    }

    // Calculate completion statistics
    const processedCount = progressData.processedRecipeIds.size;
    const failedCount = progressData.failedRecipeIds.size;
    const totalRecipes = Math.max(progressData.totalRecipes, currentRecipeCount);
    const completionPercentage = totalRecipes > 0 ? Math.round((processedCount / totalRecipes) * 100) : 0;
    
    // Determine status
    let status = 'idle';
    if (progressData.lastRunTimestamp) {
      const timeSinceLastRun = Date.now() - progressData.lastRunTimestamp;
      if (timeSinceLastRun < 5 * 60 * 1000) { // 5 minutes
        status = 'running';
      } else if (timeSinceLastRun < 60 * 60 * 1000) { // 1 hour
        status = 'recent';
      } else {
        status = 'stale';
      }
    }

    return new Response(JSON.stringify({
      status: 'success',
      progress: {
        status,
        currentIndex: progressData.lastProcessedIndex,
        totalRecipes,
        processedCount,
        failedCount,
        completionPercentage,
        lastRunTimestamp: progressData.lastRunTimestamp,
        currentBatchStart: progressData.currentBatchStart
      },
      environment: env.ENVIRONMENT || 'development'
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });

  } catch (error) {
    console.error('Error getting progress:', error);
    return new Response(JSON.stringify({
      error: 'Failed to get progress',
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
 * Process recipes with progress tracking and checkpointing
 */
async function processRecipesWithProgress(recipeKeys, env, progressData, startIndex, batchStart, isScheduled) {
  const results = {
    processed: 0,
    skipped: 0,
    errors: 0,
    details: [],
    subrequestsUsed: 0
  };

  let currentIndex = startIndex;
  let subrequestCount = 0;
  const maxSubrequests = isScheduled ? 48 : 45; // Conservative limits for 50 max
  
  console.log(`Starting processing from index ${currentIndex} (batch start: ${batchStart})`);

  // Create a priority queue: failed recipes first, then new recipes
  const priorityRecipeIds = [];
  
  // Add failed recipes first (for retry)
  if (progressData.failedRecipeIds.size > 0) {
    priorityRecipeIds.push(...Array.from(progressData.failedRecipeIds));
  }
  
  // Add remaining recipes that haven't been processed
  for (let i = currentIndex; i < recipeKeys.length; i++) {
    const recipeId = recipeKeys[i];
    if (!progressData.processedRecipeIds.has(recipeId) && !progressData.failedRecipeIds.has(recipeId)) {
      priorityRecipeIds.push(recipeId);
    }
  }
  
  console.log(`Processing ${priorityRecipeIds.length} recipes (${progressData.failedRecipeIds.size} retries, ${priorityRecipeIds.length - progressData.failedRecipeIds.size} new)`);
  
  let priorityIndex = 0;
  while (priorityIndex < priorityRecipeIds.length && subrequestCount < maxSubrequests) {
    const recipeId = priorityRecipeIds[priorityIndex];
    
    try {
      // Check if we already processed this recipe successfully (double-check)
      if (progressData.processedRecipeIds.has(recipeId)) {
        results.skipped++;
        results.details.push({ recipeId, status: 'skipped', reason: 'already_processed' });
        priorityIndex++;
        continue;
      }

      // Check if this recipe already has an embedding in the vector database
      const existingEmbedding = await checkExistingEmbedding(recipeId, env.RECIPE_VECTORS);
      results.subrequestsUsed++;

      if (existingEmbedding) {
        results.skipped++;
        results.details.push({ recipeId, status: 'skipped', reason: 'already_has_embedding' });
        
        // Mark as processed since it already has an embedding
        await updateRecipeProgress(env, recipeId, 'processed', progressData);
        progressData.processedRecipeIds.add(recipeId);
        priorityIndex++;
        continue;
      }

      // Get recipe data from KV
      const recipeResult = await getRecipeFromKV(env, recipeId);
      results.subrequestsUsed++;

      if (!recipeResult.success || !recipeResult.recipe) {
        results.skipped++;
        results.details.push({ recipeId, status: 'skipped', reason: 'no_data' });
        priorityIndex++;
        continue;
      }

      const recipeData = recipeResult.recipe;

      // Generate embedding text from recipe data
      const embeddingText = generateEmbeddingText(recipeData);

      if (!embeddingText) {
        results.skipped++;
        results.details.push({ recipeId, status: 'skipped', reason: 'no_text' });
        priorityIndex++;
        continue;
      }

      // Generate embedding using Cloudflare AI
      const embedding = await generateEmbedding(embeddingText, env.AI);
      results.subrequestsUsed++;

      if (!embedding) {
        results.errors++;
        results.details.push({ recipeId, status: 'error', reason: 'embedding_failed' });
        
        // Mark as failed for retry in next run
        await updateRecipeProgress(env, recipeId, 'failed', progressData);
        progressData.failedRecipeIds.add(recipeId);
        priorityIndex++;
        continue;
      }

      // Store embedding in vectorize
      await storeEmbedding(recipeId, embedding, recipeData, env.RECIPE_VECTORS);
      results.subrequestsUsed++;

      results.processed++;
      results.details.push({ recipeId, status: 'processed' });
      
      // Mark as successfully processed
      await updateRecipeProgress(env, recipeId, 'processed', progressData);
      progressData.processedRecipeIds.add(recipeId);
      
      // Update progress checkpoint - track the original index in recipeKeys
      const originalIndex = recipeKeys.indexOf(recipeId);
      if (originalIndex !== -1) {
        progressData.lastProcessedIndex = Math.max(progressData.lastProcessedIndex, originalIndex);
      }
      progressData.currentBatchStart = batchStart;
      await saveProgressData(env, progressData);
      
      priorityIndex++;

    } catch (error) {
      console.error(`Error processing recipe ${recipeId}:`, error);
      results.errors++;
      results.details.push({ recipeId, status: 'error', reason: error.message });
      
      // Mark as failed for retry in next run
      await updateRecipeProgress(env, recipeId, 'failed', progressData);
      progressData.failedRecipeIds.add(recipeId);
      priorityIndex++;
    }

    // Check if we're approaching the subrequest limit
    if (subrequestCount >= maxSubrequests) {
      console.log(`Stopping processing to avoid subrequest limit. Processed ${results.processed} recipes.`);
      results.details.push({
        status: 'info',
        message: `Stopped processing after ${results.processed} recipes to avoid subrequest limit. Remaining recipes will be processed in next run.`
      });
      break;
    }

    // Add a small delay between recipes to prevent overwhelming the system
    if (priorityIndex < priorityRecipeIds.length && subrequestCount < maxSubrequests) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // Final progress update - ensure we've processed as far as possible
  if (priorityRecipeIds.length > 0) {
    const lastProcessedRecipeId = priorityRecipeIds[priorityIndex - 1];
    const lastOriginalIndex = recipeKeys.indexOf(lastProcessedRecipeId);
    if (lastOriginalIndex !== -1) {
      progressData.lastProcessedIndex = Math.max(progressData.lastProcessedIndex, lastOriginalIndex);
    }
  }
  progressData.currentBatchStart = batchStart;
  await saveProgressData(env, progressData);

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
