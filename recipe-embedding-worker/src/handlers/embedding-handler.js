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
 * Queue management keys for KV storage
 */
const QUEUE_KEYS = {
  EMBEDDING_QUEUE: 'embedding_queue',
  PROCESSING_STATUS: 'embedding_processing_status',
  QUEUE_STATS: 'embedding_queue_stats'
};

/**
 * Queue item structure
 */
const QUEUE_ITEM_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped'
};

/**
 * Add a recipe to the embedding queue
 */
export async function addToEmbeddingQueue(env, recipeId, priority = 'normal') {
  try {
    // Get current queue
    const queueData = await env.RECIPE_STORAGE.get(QUEUE_KEYS.EMBEDDING_QUEUE);
    let queue = queueData ? JSON.parse(queueData) : [];
    
    // Check if recipe is already in queue
    const existingIndex = queue.findIndex(item => item.recipeId === recipeId);
    
    if (existingIndex !== -1) {
      // Update existing item
      queue[existingIndex] = {
        ...queue[existingIndex],
        priority,
        addedAt: Date.now(),
        attempts: 0
      };
    } else {
      // Add new item
      queue.push({
        recipeId,
        priority,
        status: QUEUE_ITEM_STATUS.PENDING,
        addedAt: Date.now(),
        attempts: 0,
        lastAttempt: null,
        error: null
      });
    }
    
    // Sort queue by priority (high, normal, low) and then by addedAt
    queue.sort((a, b) => {
      const priorityOrder = { high: 3, normal: 2, low: 1 };
      const aPriority = priorityOrder[a.priority] || 2;
      const bPriority = priorityOrder[b.priority] || 2;
      
      if (aPriority !== bPriority) {
        return bPriority - aPriority;
      }
      return a.addedAt - b.addedAt;
    });
    
    // Save updated queue
    await env.RECIPE_STORAGE.put(QUEUE_KEYS.EMBEDDING_QUEUE, JSON.stringify(queue));
    
    // Update queue stats
    await updateQueueStats(env, queue);
    
    console.log(`Added recipe ${recipeId} to embedding queue with ${priority} priority`);
    return { success: true, queueLength: queue.length };
  } catch (error) {
    console.error(`Error adding recipe ${recipeId} to queue:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Get next item from the embedding queue
 */
async function getNextQueueItem(env) {
  try {
    const queueData = await env.RECIPE_STORAGE.get(QUEUE_KEYS.EMBEDDING_QUEUE);
    if (!queueData) return null;
    
    const queue = JSON.parse(queueData);
    
    // Find the first pending item
    const pendingItem = queue.find(item => item.status === QUEUE_ITEM_STATUS.PENDING);
    
    if (pendingItem) {
      // Mark as processing
      pendingItem.status = QUEUE_ITEM_STATUS.PROCESSING;
      pendingItem.lastAttempt = Date.now();
      pendingItem.attempts += 1;
      
      // Save updated queue
      await env.RECIPE_STORAGE.put(QUEUE_KEYS.EMBEDDING_QUEUE, JSON.stringify(queue));
      
      return pendingItem;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting next queue item:', error);
    return null;
  }
}

/**
 * Update queue item status
 */
async function updateQueueItemStatus(env, recipeId, status, error = null) {
  try {
    const queueData = await env.RECIPE_STORAGE.get(QUEUE_KEYS.EMBEDDING_QUEUE);
    if (!queueData) return false;
    
    const queue = JSON.parse(queueData);
    const itemIndex = queue.findIndex(item => item.recipeId === recipeId);
    
    if (itemIndex !== -1) {
      queue[itemIndex].status = status;
      queue[itemIndex].lastAttempt = Date.now();
      
      if (error) {
        queue[itemIndex].error = error;
      }
      
      // Remove completed items from queue after some time (keep for 24 hours for monitoring)
      if (status === QUEUE_ITEM_STATUS.COMPLETED || status === QUEUE_ITEM_STATUS.SKIPPED) {
        queue[itemIndex].completedAt = Date.now();
      }
      
      // Save updated queue
      await env.RECIPE_STORAGE.put(QUEUE_KEYS.EMBEDDING_QUEUE, JSON.stringify(queue));
      
      // Update queue stats
      await updateQueueStats(env, queue);
      
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`Error updating queue item status for ${recipeId}:`, error);
    return false;
  }
}

/**
 * Update queue statistics
 */
async function updateQueueStats(env, queue) {
  try {
    const stats = {
      total: queue.length,
      pending: queue.filter(item => item.status === QUEUE_ITEM_STATUS.PENDING).length,
      processing: queue.filter(item => item.status === QUEUE_ITEM_STATUS.PROCESSING).length,
      completed: queue.filter(item => item.status === QUEUE_ITEM_STATUS.COMPLETED).length,
      failed: queue.filter(item => item.status === QUEUE_ITEM_STATUS.FAILED).length,
      skipped: queue.filter(item => item.status === QUEUE_ITEM_STATUS.SKIPPED).length,
      lastUpdated: Date.now()
    };
    
    await env.RECIPE_STORAGE.put(QUEUE_KEYS.QUEUE_STATS, JSON.stringify(stats));
  } catch (error) {
    console.error('Error updating queue stats:', error);
  }
}

/**
 * Get queue statistics
 */
async function getQueueStats(env) {
  try {
    const statsData = await env.RECIPE_STORAGE.get(QUEUE_KEYS.QUEUE_STATS);
    return statsData ? JSON.parse(statsData) : {
      total: 0,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
      lastUpdated: null
    };
  } catch (error) {
    console.error('Error getting queue stats:', error);
    return {
      total: 0,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
      lastUpdated: null
    };
  }
}

/**
 * Clean up old completed items from queue (older than 24 hours)
 */
async function cleanupOldQueueItems(env) {
  try {
    const queueData = await env.RECIPE_STORAGE.get(QUEUE_KEYS.EMBEDDING_QUEUE);
    if (!queueData) return;
    
    const queue = JSON.parse(queueData);
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
    
    const cleanedQueue = queue.filter(item => {
      if (item.status === QUEUE_ITEM_STATUS.COMPLETED || item.status === QUEUE_ITEM_STATUS.SKIPPED) {
        return item.completedAt && item.completedAt > cutoffTime;
      }
      return true;
    });
    
    if (cleanedQueue.length !== queue.length) {
      await env.RECIPE_STORAGE.put(QUEUE_KEYS.EMBEDDING_QUEUE, JSON.stringify(cleanedQueue));
      await updateQueueStats(env, cleanedQueue);
      console.log(`Cleaned up ${queue.length - cleanedQueue.length} old queue items`);
    }
  } catch (error) {
    console.error('Error cleaning up old queue items:', error);
  }
}

/**
 * Process items from the embedding queue
 */
async function processQueueItems(env, maxSubrequests, isScheduled) {
  const results = {
    processed: 0,
    skipped: 0,
    errors: 0,
    details: [],
    subrequestsUsed: 0
  };

  let subrequestCount = 0;
  let itemsProcessed = 0;
  const maxItemsPerRun = isScheduled ? 20 : 10; // Limit items per run to prevent timeouts

  console.log(`Processing up to ${maxItemsPerRun} items from queue`);

  while (itemsProcessed < maxItemsPerRun && subrequestCount < maxSubrequests) {
    // Get next item from queue
    const queueItem = await getNextQueueItem(env);
    if (!queueItem) {
      console.log('No more items in queue');
      break;
    }

    const { recipeId } = queueItem;
    console.log(`Processing recipe ${recipeId} (attempt ${queueItem.attempts})`);

    try {
      // Check if this recipe already has an embedding
      const existingEmbedding = await checkExistingEmbedding(recipeId, env.RECIPE_VECTORS);
      results.subrequestsUsed++;

      if (existingEmbedding) {
        results.skipped++;
        results.details.push({ recipeId, status: 'skipped', reason: 'already_has_embedding' });
        
        // Mark as skipped in queue
        await updateQueueItemStatus(env, recipeId, QUEUE_ITEM_STATUS.SKIPPED);
        itemsProcessed++;
        continue;
      }

      // Get recipe data from KV
      const recipeResult = await getRecipeFromKV(env, recipeId);
      results.subrequestsUsed++;

      if (!recipeResult.success || !recipeResult.recipe) {
        results.skipped++;
        results.details.push({ recipeId, status: 'skipped', reason: 'no_data' });
        
        // Mark as skipped in queue
        await updateQueueItemStatus(env, recipeId, QUEUE_ITEM_STATUS.SKIPPED);
        itemsProcessed++;
        continue;
      }

      const recipeData = recipeResult.recipe;

      // Generate embedding text from recipe data
      const embeddingText = generateEmbeddingText(recipeData);

      if (!embeddingText) {
        results.skipped++;
        results.details.push({ recipeId, status: 'skipped', reason: 'no_text' });
        
        // Mark as skipped in queue
        await updateQueueItemStatus(env, recipeId, QUEUE_ITEM_STATUS.SKIPPED);
        itemsProcessed++;
        continue;
      }

      // Generate embedding using Cloudflare AI
      const embedding = await generateEmbedding(embeddingText, env.AI);
      results.subrequestsUsed++;

      if (!embedding) {
        results.errors++;
        results.details.push({ recipeId, status: 'error', reason: 'embedding_failed' });
        
        // Mark as failed in queue (will be retried)
        await updateQueueItemStatus(env, recipeId, QUEUE_ITEM_STATUS.FAILED, 'Embedding generation failed');
        itemsProcessed++;
        continue;
      }

      // Store embedding in vectorize
      await storeEmbedding(recipeId, embedding, recipeData, env.RECIPE_VECTORS);
      results.subrequestsUsed++;

      results.processed++;
      results.details.push({ recipeId, status: 'processed' });
      
      // Mark as completed in queue
      await updateQueueItemStatus(env, recipeId, QUEUE_ITEM_STATUS.COMPLETED);
      itemsProcessed++;

    } catch (error) {
      console.error(`Error processing recipe ${recipeId}:`, error);
      results.errors++;
      results.details.push({ recipeId, status: 'error', reason: error.message });
      
      // Mark as failed in queue (will be retried)
      await updateQueueItemStatus(env, recipeId, QUEUE_ITEM_STATUS.FAILED, error.message);
      itemsProcessed++;
    }

    // Check if we're approaching the subrequest limit
    if (subrequestCount >= maxSubrequests) {
      console.log(`Stopping processing to avoid subrequest limit. Processed ${results.processed} recipes.`);
      results.details.push({
        status: 'info',
        message: `Stopped processing after ${results.processed} recipes to avoid subrequest limit. Remaining items will be processed in next run.`
      });
      break;
    }

    // Add a small delay between items to prevent overwhelming the system
    if (itemsProcessed < maxItemsPerRun && subrequestCount < maxSubrequests) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return results;
}

/**
 * Embedding generation handler - processes recipes from queue
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

    // Clean up old queue items
    await cleanupOldQueueItems(env);

    // Get queue statistics
    const queueStats = await getQueueStats(env);
    console.log(`Queue status: ${queueStats.pending} pending, ${queueStats.processing} processing, ${queueStats.completed} completed`);

    if (queueStats.pending === 0) {
      return new Response(JSON.stringify({
        message: 'No recipes pending in queue',
        queueStats,
        duration: Date.now() - startTime
      }), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    // Process recipes from queue (respecting subrequest limits)
    const maxSubrequests = isScheduled ? 48 : 45; // Conservative limits for 50 max
    const results = await processQueueItems(env, maxSubrequests, isScheduled);

    const duration = Date.now() - startTime;
    console.log(`Embedding generation completed: ${results.processed} processed, ${results.skipped} skipped, ${results.errors} errors in ${duration}ms`);

    // Get updated queue stats
    const updatedStats = await getQueueStats(env);

    return new Response(JSON.stringify({
      message: 'Embedding generation completed',
      ...results,
      duration,
      queueStats: updatedStats,
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
    
    // Check if it's a storage error
    if (error.message && error.message.includes('storage')) {
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
    
    // For other errors, return 200 but with error details
    return new Response(JSON.stringify({
      error: 'Failed to generate embeddings',
      details: error.message,
      environment: env.ENVIRONMENT || 'development'
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
}

/**
 * Add to queue handler - allows other workers to add recipes directly to the queue
 */
export async function handleAddToQueue(request, env, corsHeaders) {
  try {
    // Parse request body
    const requestBody = await request.json();
    const { recipeId, priority = 'normal' } = requestBody;
    
    if (!recipeId) {
      return new Response(JSON.stringify({
        error: 'Missing recipeId parameter',
        environment: env.ENVIRONMENT || 'development'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    
    // Validate priority
    const validPriorities = ['low', 'normal', 'high'];
    if (!validPriorities.includes(priority)) {
      return new Response(JSON.stringify({
        error: 'Invalid priority. Must be one of: low, normal, high',
        environment: env.ENVIRONMENT || 'development'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    
    // Add recipe to queue
    const result = await addToEmbeddingQueue(env, recipeId, priority);
    
    if (result.success) {
      return new Response(JSON.stringify({
        status: 'success',
        message: `Recipe ${recipeId} added to embedding queue`,
        recipeId,
        priority,
        queueLength: result.queueLength,
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
        error: 'Failed to add recipe to queue',
        details: result.error,
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
    console.error('Error adding recipe to queue:', error);
    return new Response(JSON.stringify({
      error: 'Failed to add recipe to queue',
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
 * Populate queue handler - compares KV storage with vector database and populates queue
 */
export async function handlePopulateQueue(request, env, corsHeaders) {
  try {
    const startTime = Date.now();
    
    // Parse request body for options
    const contentType = request.headers.get('content-type') || '';
    let requestBody = {};
    
    if (contentType.includes('application/json')) {
      try {
        requestBody = await request.json();
      } catch (error) {
        console.warn('Failed to parse request body:', error);
      }
    }
    
    const forceReprocess = requestBody.forceReprocess === true;
    const priority = requestBody.priority || 'normal';
    
    console.log(`Starting queue population (forceReprocess: ${forceReprocess}, priority: ${priority})`);
    
    // Get all recipe keys from KV storage
    let recipeKeys;
    try {
      recipeKeys = await getRecipeKeys(env.RECIPE_STORAGE);
      console.log(`Found ${recipeKeys.length} recipes in KV storage`);
    } catch (error) {
      console.error('Failed to get recipe keys:', error);
      return new Response(JSON.stringify({
        error: 'Failed to access recipe storage',
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
    
    if (recipeKeys.length === 0) {
      return new Response(JSON.stringify({
        message: 'No recipes found in storage',
        addedToQueue: 0,
        duration: Date.now() - startTime
      }), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    
    // Get current queue to avoid duplicates
    const currentQueueData = await env.RECIPE_STORAGE.get(QUEUE_KEYS.EMBEDDING_QUEUE);
    const currentQueue = currentQueueData ? JSON.parse(currentQueueData) : [];
    const currentQueueIds = new Set(currentQueue.map(item => item.recipeId));
    
    // Check which recipes need embeddings
    const recipesToQueue = [];
    let checkedCount = 0;
    const batchSize = 50; // Process in batches to avoid timeouts
    
    for (let i = 0; i < recipeKeys.length; i += batchSize) {
      const batch = recipeKeys.slice(i, i + batchSize);
      console.log(`Checking batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(recipeKeys.length / batchSize)} (${batch.length} recipes)`);
      
      for (const recipeId of batch) {
        checkedCount++;
        
        // Skip if already in queue (unless force reprocess)
        if (!forceReprocess && currentQueueIds.has(recipeId)) {
          continue;
        }
        
        // Check if recipe already has embedding (unless force reprocess)
        if (!forceReprocess) {
          try {
            const existingEmbedding = await checkExistingEmbedding(recipeId, env.RECIPE_VECTORS);
            if (existingEmbedding) {
              continue; // Skip recipes that already have embeddings
            }
          } catch (error) {
            console.warn(`Error checking existing embedding for ${recipeId}:`, error);
            // Continue and add to queue if we can't check
          }
        }
        
        // Add recipe to queue
        recipesToQueue.push(recipeId);
      }
      
      // Add a small delay between batches
      if (i + batchSize < recipeKeys.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log(`Found ${recipesToQueue.length} recipes that need embeddings`);
    
    // Add recipes to queue
    let addedCount = 0;
    for (const recipeId of recipesToQueue) {
      try {
        const result = await addToEmbeddingQueue(env, recipeId, priority);
        if (result.success) {
          addedCount++;
        }
      } catch (error) {
        console.error(`Error adding recipe ${recipeId} to queue:`, error);
      }
    }
    
    // Get updated queue stats
    const updatedStats = await getQueueStats(env);
    
    const duration = Date.now() - startTime;
    console.log(`Queue population completed: ${addedCount} recipes added to queue in ${duration}ms`);
    
    return new Response(JSON.stringify({
      message: 'Queue population completed',
      checked: checkedCount,
      found: recipesToQueue.length,
      addedToQueue: addedCount,
      queueStats: updatedStats,
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
    console.error('Error in queue population:', error);
    return new Response(JSON.stringify({
      error: 'Failed to populate queue',
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
    // Clear the entire queue
    await env.RECIPE_STORAGE.put(QUEUE_KEYS.EMBEDDING_QUEUE, JSON.stringify([]));
    await env.RECIPE_STORAGE.put(QUEUE_KEYS.QUEUE_STATS, JSON.stringify({
      total: 0,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
      lastUpdated: Date.now()
    }));
    
    console.log('Embedding queue reset successfully');
    
    return new Response(JSON.stringify({
      status: 'success',
      message: 'Embedding queue reset successfully',
      environment: env.ENVIRONMENT || 'development'
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });

  } catch (error) {
    console.error('Error resetting queue:', error);
    return new Response(JSON.stringify({
      error: 'Failed to reset queue',
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
    // Get queue statistics
    const queueStats = await getQueueStats(env);
    
    // Get current recipe count from KV
    let totalRecipes = 0;
    try {
      const recipeKeys = await getRecipeKeys(env.RECIPE_STORAGE);
      totalRecipes = recipeKeys.length;
    } catch (error) {
      console.error('Failed to get current recipe count:', error);
    }

    // Calculate completion statistics
    const processedCount = queueStats.completed + queueStats.skipped;
    const totalInQueue = queueStats.total;
    const completionPercentage = totalInQueue > 0 ? Math.round((processedCount / totalInQueue) * 100) : 0;
    
    // Determine status
    let status = 'idle';
    if (queueStats.lastUpdated) {
      const timeSinceLastUpdate = Date.now() - queueStats.lastUpdated;
      if (timeSinceLastUpdate < 5 * 60 * 1000) { // 5 minutes
        status = 'running';
      } else if (timeSinceLastUpdate < 60 * 60 * 1000) { // 1 hour
        status = 'recent';
      } else {
        status = 'stale';
      }
    }

    return new Response(JSON.stringify({
      status: 'success',
      progress: {
        status,
        totalRecipes,
        queueStats,
        completionPercentage,
        lastUpdated: queueStats.lastUpdated
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
