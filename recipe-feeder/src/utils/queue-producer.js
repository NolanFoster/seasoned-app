/**
 * Queue Producer utility for sending recipes to the embedding queue
 */

/**
 * Sends a batch of recipe IDs to the embedding queue
 * @param {Object} env - Cloudflare environment bindings
 * @param {string[]} recipeIds - Array of recipe IDs to queue
 * @param {Object} options - Optional configuration
 * @returns {Promise<{success: boolean, queued: number, errors: any[]}>}
 */
export async function queueRecipesForEmbedding(env, recipeIds, options = {}) {
  if (!recipeIds || recipeIds.length === 0) {
    return { success: true, queued: 0, errors: [] };
  }
  
  console.log(`Queuing ${recipeIds.length} recipes for embedding`);
  
  const errors = [];
  let queuedCount = 0;
  
  try {
    // Prepare messages for the queue
    // Each message body is just the recipe ID as a string
    const messages = recipeIds.map(recipeId => ({
      body: recipeId,
      ...options.messageOptions
    }));
    
    // Send batch to queue
    await env.EMBEDDING_QUEUE.sendBatch(messages);
    queuedCount = messages.length;
    
    console.log(`Successfully queued ${queuedCount} recipes for embedding`);
    
    return {
      success: true,
      queued: queuedCount,
      errors: []
    };
    
  } catch (error) {
    console.error('Error queuing recipes for embedding:', error);
    errors.push({
      type: 'queue_error',
      message: error.message,
      recipeIds: recipeIds
    });
    
    return {
      success: false,
      queued: queuedCount,
      errors: errors
    };
  }
}

/**
 * Sends recipes to queue in smaller chunks to avoid hitting limits
 * @param {Object} env - Cloudflare environment bindings
 * @param {string[]} recipeIds - Array of recipe IDs to queue
 * @param {number} chunkSize - Size of each chunk (default: 50)
 * @returns {Promise<{success: boolean, totalQueued: number, errors: any[]}>}
 */
export async function queueRecipesInChunks(env, recipeIds, chunkSize = 50) {
  if (!recipeIds || recipeIds.length === 0) {
    return { success: true, totalQueued: 0, errors: [] };
  }
  
  console.log(`Queuing ${recipeIds.length} recipes in chunks of ${chunkSize}`);
  
  const allErrors = [];
  let totalQueued = 0;
  
  // Process recipes in chunks
  for (let i = 0; i < recipeIds.length; i += chunkSize) {
    const chunk = recipeIds.slice(i, i + chunkSize);
    
    try {
      const result = await queueRecipesForEmbedding(env, chunk);
      
      if (result.success) {
        totalQueued += result.queued;
      } else {
        allErrors.push(...result.errors);
      }
      
      // Small delay between chunks to be nice to the queue
      if (i + chunkSize < recipeIds.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
    } catch (error) {
      console.error(`Error processing chunk ${i / chunkSize + 1}:`, error);
      allErrors.push({
        type: 'chunk_error',
        message: error.message,
        chunkStart: i,
        chunkSize: chunk.length
      });
    }
  }
  
  const success = allErrors.length === 0;
  console.log(`Chunk queuing complete: ${totalQueued} queued, ${allErrors.length} errors`);
  
  return {
    success,
    totalQueued,
    errors: allErrors
  };
}

/**
 * Validates recipe IDs before queuing
 * @param {string[]} recipeIds - Array of recipe IDs to validate
 * @returns {{valid: string[], invalid: string[]}}
 */
export function validateRecipeIds(recipeIds) {
  const valid = [];
  const invalid = [];
  
  for (const recipeId of recipeIds) {
    if (typeof recipeId === 'string' && recipeId.trim().length > 0) {
      valid.push(recipeId.trim());
    } else {
      invalid.push(recipeId);
    }
  }
  
  if (invalid.length > 0) {
    console.warn(`Found ${invalid.length} invalid recipe IDs:`, invalid);
  }
  
  return { valid, invalid };
}

/**
 * Queues recipes with validation and error handling
 * @param {Object} env - Cloudflare environment bindings
 * @param {string[]} recipeIds - Array of recipe IDs to queue
 * @param {Object} options - Configuration options
 * @returns {Promise<{success: boolean, stats: Object, errors: any[]}>}
 */
export async function safeQueueRecipes(env, recipeIds, options = {}) {
  const { chunkSize = 50, validate = true } = options;
  
  let recipesToQueue = recipeIds;
  const stats = {
    input: recipeIds.length,
    validated: 0,
    queued: 0,
    invalid: 0
  };
  
  // Validate recipe IDs if requested
  if (validate) {
    const validation = validateRecipeIds(recipeIds);
    recipesToQueue = validation.valid;
    stats.validated = validation.valid.length;
    stats.invalid = validation.invalid.length;
    
    if (validation.invalid.length > 0) {
      console.warn(`Skipping ${validation.invalid.length} invalid recipe IDs`);
    }
  } else {
    stats.validated = recipeIds.length;
  }
  
  // Queue the validated recipes
  const result = await queueRecipesInChunks(env, recipesToQueue, chunkSize);
  stats.queued = result.totalQueued;
  
  return {
    success: result.success && stats.invalid === 0,
    stats,
    errors: result.errors
  };
}