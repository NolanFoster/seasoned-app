/**
 * Main feeder handler that orchestrates the recipe feeding process
 */

import { scanRecipeKeys } from '../utils/kv-scanner.js';
import { batchCheckVectorStore } from '../utils/vector-checker.js';
import { safeQueueRecipes } from '../utils/queue-producer.js';

/**
 * Processes a batch of recipes by checking vector store and queuing missing ones
 * @param {Object} env - Cloudflare environment bindings
 * @param {number} batchSize - Number of recipes to process in this batch
 * @param {string} cursor - Pagination cursor for KV scanning
 * @returns {Promise<{success: boolean, stats: Object, nextCursor: string|null}>}
 */
export async function processRecipeBatch(env, batchSize = 100, cursor = null) {
  const startTime = Date.now();
  console.log(`Starting recipe batch processing: batchSize=${batchSize}, cursor=${cursor || 'none'}`);
  
  const stats = {
    scanned: 0,
    existsInVector: 0,
    missingFromVector: 0,
    queued: 0,
    errors: 0,
    processingTimeMs: 0
  };
  
  try {
    // Step 1: Scan KV storage for recipe keys
    console.log('Step 1: Scanning KV storage for recipe keys...');
    const kvResult = await scanRecipeKeys(env, batchSize, cursor);
    stats.scanned = kvResult.keys.length;
    
    if (kvResult.keys.length === 0) {
      console.log('No more recipes found in KV storage');
      return {
        success: true,
        stats,
        nextCursor: null,
        hasMore: false
      };
    }
    
    console.log(`Found ${kvResult.keys.length} recipes in KV storage`);
    
    // Step 2: Check which recipes already exist in vector store
    console.log('Step 2: Checking vector store for existing recipes...');
    const vectorCheck = await batchCheckVectorStore(env, kvResult.keys);
    stats.existsInVector = vectorCheck.exists.length;
    stats.missingFromVector = vectorCheck.missing.length;
    
    console.log(`Vector check complete: ${vectorCheck.exists.length} exist, ${vectorCheck.missing.length} missing`);
    
    // Step 3: Queue missing recipes for embedding
    if (vectorCheck.missing.length > 0) {
      console.log(`Step 3: Queuing ${vectorCheck.missing.length} missing recipes...`);
      
      const queueResult = await safeQueueRecipes(env, vectorCheck.missing, {
        chunkSize: 50,
        validate: true
      });
      
      stats.queued = queueResult.stats.queued;
      
      if (!queueResult.success) {
        console.error('Errors occurred while queuing recipes:', queueResult.errors);
        stats.errors = queueResult.errors.length;
      }
      
      console.log(`Successfully queued ${stats.queued} recipes for embedding`);
    } else {
      console.log('No recipes need to be queued - all already exist in vector store');
    }
    
    // Calculate processing time
    stats.processingTimeMs = Date.now() - startTime;
    
    console.log(`Batch processing complete in ${stats.processingTimeMs}ms:`, stats);
    
    return {
      success: stats.errors === 0,
      stats,
      nextCursor: kvResult.cursor,
      hasMore: kvResult.hasMore
    };
    
  } catch (error) {
    stats.processingTimeMs = Date.now() - startTime;
    console.error('Error in recipe batch processing:', error);
    
    return {
      success: false,
      stats: { ...stats, errors: 1 },
      nextCursor: cursor, // Return same cursor to retry
      hasMore: true,
      error: error.message
    };
  }
}

/**
 * Executes the complete feeding cycle
 * @param {Object} env - Cloudflare environment bindings
 * @param {Object} options - Configuration options
 * @returns {Promise<{success: boolean, totalStats: Object, cycles: number}>}
 */
export async function executeFullFeedingCycle(env, options = {}) {
  const {
    maxBatchSize = parseInt(env.BATCH_SIZE) || 100,
    maxCycles = 1, // Default to 1 cycle per cron run
    maxProcessingTimeMs = 50000 // 50 seconds max per cron run
  } = options;
  
  const startTime = Date.now();
  console.log(`Starting full feeding cycle: maxBatchSize=${maxBatchSize}, maxCycles=${maxCycles}`);
  
  const totalStats = {
    scanned: 0,
    existsInVector: 0,
    missingFromVector: 0,
    queued: 0,
    errors: 0,
    totalProcessingTimeMs: 0
  };
  
  let cycles = 0;
  let cursor = null;
  let hasMore = true;
  
  try {
    while (hasMore && cycles < maxCycles) {
      const cycleStartTime = Date.now();
      
      // Check if we're running out of time
      if (cycleStartTime - startTime > maxProcessingTimeMs) {
        console.log(`Stopping due to time limit: ${cycleStartTime - startTime}ms`);
        break;
      }
      
      cycles++;
      console.log(`\\n--- Cycle ${cycles} ---`);
      
      const batchResult = await processRecipeBatch(env, maxBatchSize, cursor);
      
      // Accumulate stats
      Object.keys(totalStats).forEach(key => {
        if (key !== 'totalProcessingTimeMs' && batchResult.stats[key]) {
          totalStats[key] += batchResult.stats[key];
        }
      });
      
      cursor = batchResult.nextCursor;
      hasMore = batchResult.hasMore;
      
      if (!batchResult.success) {
        console.error(`Cycle ${cycles} completed with errors`);
        break;
      }
      
      if (!hasMore) {
        console.log('No more recipes to process - cycle complete');
        break;
      }
    }
    
    totalStats.totalProcessingTimeMs = Date.now() - startTime;
    
    console.log(`\\nFeeding cycle complete after ${cycles} cycles:`, totalStats);
    
    return {
      success: totalStats.errors === 0,
      totalStats,
      cycles,
      completedFully: !hasMore
    };
    
  } catch (error) {
    totalStats.totalProcessingTimeMs = Date.now() - startTime;
    console.error('Error in full feeding cycle:', error);
    
    return {
      success: false,
      totalStats: { ...totalStats, errors: totalStats.errors + 1 },
      cycles,
      completedFully: false,
      error: error.message
    };
  }
}