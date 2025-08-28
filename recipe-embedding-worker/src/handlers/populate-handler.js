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

// Import required functions
import { getRecipeKeys } from './kv-utils.js';
import { checkExistingEmbedding } from './embedding-utils.js';
import { addBulkToEmbeddingQueue, getQueueStats, updateQueueStats } from './queue-handler.js';