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
 * Queue message structure for Cloudflare Queues
 */
const QUEUE_MESSAGE_TYPES = {
  RECIPE_EMBEDDING: 'recipe_embedding',
  BULK_POPULATE: 'bulk_populate',
  REPROCESS: 'reprocess'
};

/**
 * Add a recipe to the embedding queue using Cloudflare Queues
 */
export async function addToEmbeddingQueue(env, recipeId, priority = 'normal') {
  try {
    const message = {
      type: QUEUE_MESSAGE_TYPES.RECIPE_EMBEDDING,
      recipeId,
      priority,
      timestamp: Date.now(),
      attempts: 0
    };

    // Send message to Cloudflare Queue
    await env.EMBEDDING_QUEUE.send(message);
    
    console.log(`Added recipe ${recipeId} to embedding queue with ${priority} priority`);
    return { success: true, messageId: recipeId };
  } catch (error) {
    console.error(`Error adding recipe ${recipeId} to queue:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Add multiple recipes to the embedding queue for bulk operations
 */
export async function addBulkToEmbeddingQueue(env, recipeIds, priority = 'normal') {
  try {
    const messages = recipeIds.map(recipeId => ({
      type: QUEUE_MESSAGE_TYPES.RECIPE_EMBEDDING,
      recipeId,
      priority,
      timestamp: Date.now(),
      attempts: 0
    }));

    // Send messages in batches (Cloudflare Queues supports up to 100 messages per batch)
    const batchSize = 100;
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      await env.EMBEDDING_QUEUE.sendBatch(batch);
    }
    
    console.log(`Added ${recipeIds.length} recipes to embedding queue with ${priority} priority`);
    return { success: true, count: recipeIds.length };
  } catch (error) {
    console.error(`Error adding bulk recipes to queue:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Get queue statistics from Cloudflare Queues
 */
async function getQueueStats(env) {
  try {
    // Note: Cloudflare Queues doesn't provide direct queue statistics via the binding
    // We'll use KV to track our own statistics
    const statsData = await env.RECIPE_STORAGE.get('embedding_queue_stats');
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
 * Update queue statistics in KV storage
 */
async function updateQueueStats(env, stats) {
  try {
    await env.RECIPE_STORAGE.put('embedding_queue_stats', JSON.stringify(stats));
  } catch (error) {
    console.error('Error updating queue stats:', error);
  }
}

/**
 * Process a single recipe for embedding generation
 */
async function processRecipe(env, recipeId, attempts = 0) {
  try {
    console.log(`Processing recipe ${recipeId} (attempt ${attempts})`);

    // Check if this recipe already has an embedding
    const existingEmbedding = await checkExistingEmbedding(recipeId, env.RECIPE_VECTORS);
    if (existingEmbedding) {
      console.log(`Recipe ${recipeId} already has embedding, skipping`);
      return { status: 'skipped', reason: 'already_has_embedding' };
    }

    // Get recipe data from KV
    const recipeResult = await getRecipeFromKV(env, recipeId);
    if (!recipeResult.success || !recipeResult.recipe) {
      console.log(`Recipe ${recipeId} has no data, skipping`);
      return { status: 'skipped', reason: 'no_data' };
    }

    const recipeData = recipeResult.recipe;

    // Generate embedding text from recipe data
    const embeddingText = generateEmbeddingText(recipeData);
    if (!embeddingText) {
      console.log(`Recipe ${recipeId} has no text content, skipping`);
      return { status: 'skipped', reason: 'no_text' };
    }

    // Generate embedding using Cloudflare AI
    const embedding = await generateEmbedding(embeddingText, env.AI);
    if (!embedding) {
      console.log(`Failed to generate embedding for recipe ${recipeId}`);
      return { status: 'failed', reason: 'embedding_failed' };
    }

    // Store embedding in vectorize
    await storeEmbedding(recipeId, embedding, recipeData, env.RECIPE_VECTORS);
    
    console.log(`Successfully processed recipe ${recipeId}`);
    return { status: 'completed' };

  } catch (error) {
    console.error(`Error processing recipe ${recipeId}:`, error);
    return { status: 'failed', reason: error.message };
  }
}

/**
 * Embedding generation handler - processes recipes from Cloudflare Queue
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

    // Get queue statistics
    const queueStats = await getQueueStats(env);
    console.log(`Queue status: ${queueStats.pending} pending, ${queueStats.processing} processing, ${queueStats.completed} completed`);

    // For manual runs, we'll process a limited number of recipes
    // For scheduled runs, we'll process more but still respect limits
    const maxRecipesPerRun = isScheduled ? 20 : 10;
    const maxSubrequests = isScheduled ? 48 : 45; // Conservative limits for 50 max

    console.log(`Processing up to ${maxRecipesPerRun} recipes (max ${maxSubrequests} subrequests)`);

    // Process recipes (this will be handled by the queue consumer)
    // For now, we'll return a message indicating the queue is being processed
    const duration = Date.now() - startTime;

    return new Response(JSON.stringify({
      message: 'Embedding generation initiated',
      queueStats,
      duration,
      environment: env.ENVIRONMENT || 'development',
      note: 'Recipes are processed via Cloudflare Queue consumer'
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
 * Queue consumer function - processes messages from Cloudflare Queue
 */
export async function handleQueueMessage(batch, env) {
  console.log(`Processing ${batch.messages.length} messages from queue`);
  
  const results = {
    processed: 0,
    skipped: 0,
    failed: 0,
    details: []
  };

  for (const message of batch.messages) {
    try {
      const { recipeId, type, attempts = 0 } = message.body;
      
      if (type === QUEUE_MESSAGE_TYPES.RECIPE_EMBEDDING) {
        const result = await processRecipe(env, recipeId, attempts);
        
        results.details.push({ recipeId, ...result });
        
        if (result.status === 'completed') {
          results.processed++;
        } else if (result.status === 'skipped') {
          results.skipped++;
        } else if (result.status === 'failed') {
          results.failed++;
          
          // If failed and under retry limit, requeue with backoff
          if (attempts < 3) {
            const retryMessage = {
              ...message.body,
              attempts: attempts + 1,
              timestamp: Date.now()
            };
            
            // Add exponential backoff delay
            const delay = Math.min(1000 * Math.pow(2, attempts), 30000); // Max 30 seconds
            await env.EMBEDDING_QUEUE.send(retryMessage, { delaySeconds: Math.floor(delay / 1000) });
            
            console.log(`Requeued recipe ${recipeId} for retry (attempt ${attempts + 1})`);
          } else {
            console.log(`Recipe ${recipeId} failed after ${attempts} attempts, giving up`);
          }
        }
      }
      
      // Acknowledge the message
      message.ack();
      
    } catch (error) {
      console.error('Error processing queue message:', error);
      results.failed++;
      results.details.push({ 
        recipeId: message.body?.recipeId || 'unknown', 
        status: 'failed', 
        reason: error.message 
      });
      
      // Acknowledge the message to remove it from the queue
      message.ack();
    }
  }

  // Update statistics
  const currentStats = await getQueueStats(env);
  const updatedStats = {
    ...currentStats,
    completed: currentStats.completed + results.processed,
    failed: currentStats.failed + results.failed,
    skipped: currentStats.skipped + results.skipped,
    lastUpdated: Date.now()
  };
  await updateQueueStats(env, updatedStats);

  console.log(`Queue processing completed: ${results.processed} processed, ${results.skipped} skipped, ${results.failed} failed`);
  return results;
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
        messageId: result.messageId, // Include messageId for manual tracking
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
    
    // Check which recipes need embeddings
    const recipesToQueue = [];
    let checkedCount = 0;
    const batchSize = 50; // Process in batches to avoid timeouts
    
    for (let i = 0; i < recipeKeys.length; i += batchSize) {
      const batch = recipeKeys.slice(i, i + batchSize);
      console.log(`Checking batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(recipeKeys.length / batchSize)} (${batch.length} recipes)`);
      
      for (const recipeId of batch) {
        checkedCount++;
        
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
    
    // Add recipes to Cloudflare Queue using bulk operation
    let addedCount = 0;
    if (recipesToQueue.length > 0) {
      try {
        const result = await addBulkToEmbeddingQueue(env, recipesToQueue, priority);
        if (result.success) {
          addedCount = result.count;
        } else {
          console.error('Failed to add recipes to queue:', result.error);
        }
      } catch (error) {
        console.error('Error adding recipes to queue:', error);
      }
    }
    
    // Update queue statistics
    const currentStats = await getQueueStats(env);
    const updatedStats = {
      ...currentStats,
      total: currentStats.total + addedCount,
      pending: currentStats.pending + addedCount,
      lastUpdated: Date.now()
    };
    await updateQueueStats(env, updatedStats);
    
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
    // Clear queue statistics (Cloudflare Queues handles the actual queue)
    await env.RECIPE_STORAGE.put('embedding_queue_stats', JSON.stringify({
      total: 0,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
      lastUpdated: Date.now()
    }));
    
    console.log('Embedding queue statistics reset successfully');
    
    return new Response(JSON.stringify({
      status: 'success',
      message: 'Embedding queue statistics reset successfully',
      note: 'Note: Cloudflare Queue messages are managed automatically. This only resets local statistics.',
      environment: env.ENVIRONMENT || 'development'
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });

  } catch (error) {
    console.error('Error resetting queue statistics:', error);
    return new Response(JSON.stringify({
      error: 'Failed to reset queue statistics',
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
    // Get queue statistics from KV storage
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
    
    // Determine status based on queue activity
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

    // Check if there are pending items
    if (queueStats.pending > 0) {
      status = 'processing';
    }

    return new Response(JSON.stringify({
      status: 'success',
      progress: {
        status,
        totalRecipes,
        queueStats,
        completionPercentage,
        lastUpdated: queueStats.lastUpdated,
        note: 'Queue processing is handled automatically by Cloudflare Queues'
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
