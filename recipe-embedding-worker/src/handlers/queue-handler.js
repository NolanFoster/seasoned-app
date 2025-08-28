// Import the processRecipe function from the recipe handler
import { processRecipe } from './recipe-handler.js';

/**
 * Queue message structure for Cloudflare Queues
 */
export const QUEUE_MESSAGE_TYPES = {
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
export async function getQueueStats(env) {
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
export async function updateQueueStats(env, stats) {
  try {
    await env.RECIPE_STORAGE.put('embedding_queue_stats', JSON.stringify(stats));
  } catch (error) {
    console.error('Error updating queue stats:', error);
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