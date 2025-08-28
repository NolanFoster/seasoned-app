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

// Import required functions
import { getQueueStats } from './queue-handler.js';
import { getRecipeKeys } from './kv-utils.js';