/**
 * Main feeder handler that orchestrates the recipe feeding process
 */

// import { log } from '../../shared/utility-functions.js';
import { scanRecipeKeys } from '../utils/kv-scanner.js';
import { batchCheckVectorStore } from '../utils/vector-checker.js';
import { safeQueueRecipes } from '../utils/queue-producer.js';

// Temporary log function for testing
const log = (level, message, data = {}, context = {}) => {
  const timestamp = new Date().toISOString();
  const logEntry = { timestamp, level, message, ...data, ...context };
  console.log(JSON.stringify(logEntry));
};

/**
 * Processes recipes continuously until target count is reached or KV is exhausted
 * @param {Object} env - Cloudflare environment bindings
 * @param {number} targetQueueCount - Target number of recipes to queue
 * @param {string} cursor - Pagination cursor for KV scanning
 * @returns {Promise<{success: boolean, stats: Object, nextCursor: string|null}>}
 */
export async function processRecipesUntilTarget(env, targetQueueCount = 100, cursor = null) {
  const startTime = Date.now();
  log('info', 'Starting continuous recipe processing', { targetQueueCount, cursor: cursor || 'none' }, { worker: 'recipe-feeder' });
  
  const stats = {
    scanned: 0,
    existsInVector: 0,
    missingFromVector: 0,
    queued: 0,
    errors: 0,
    processingTimeMs: 0,
    batchesProcessed: 0
  };
  
  let currentCursor = cursor;
  let hasMore = true;
  let recipesToQueue = [];
  
  try {
    // Continue scanning until we have enough recipes to queue or run out of KV values
    while (hasMore && recipesToQueue.length < targetQueueCount) {
      log('info', `Scanning batch ${stats.batchesProcessed + 1}`, { 
        currentQueueCount: recipesToQueue.length, 
        targetQueueCount,
        cursor: currentCursor || 'none' 
      }, { worker: 'recipe-feeder' });
      
      // Step 1: Scan KV storage for recipe keys (use smaller batch size for efficiency)
      const batchSize = Math.min(50, targetQueueCount - recipesToQueue.length);
      const kvResult = await scanRecipeKeys(env, batchSize, currentCursor);
      stats.batchesProcessed++;
      
      if (kvResult.keys.length === 0) {
        log('info', 'No more recipes found in KV storage', {}, { worker: 'recipe-feeder' });
        hasMore = false;
        break;
      }
      
      stats.scanned += kvResult.keys.length;
      log('info', 'Found recipes in KV storage', { 
        batchCount: kvResult.keys.length, 
        totalScanned: stats.scanned,
        currentQueueCount: recipesToQueue.length 
      }, { worker: 'recipe-feeder' });
      
      // Step 2: Check which recipes already exist in vector store
      const vectorCheck = await batchCheckVectorStore(env, kvResult.keys);
      stats.existsInVector += vectorCheck.exists.length;
      stats.missingFromVector += vectorCheck.missing.length;
      
      // Add missing recipes to our queue list
      recipesToQueue.push(...vectorCheck.missing);
      
      log('info', 'Vector check complete for batch', { 
        exists: vectorCheck.exists.length, 
        missing: vectorCheck.missing.length,
        totalMissing: recipesToQueue.length,
        targetQueueCount 
      }, { worker: 'recipe-feeder' });
      
      // Update cursor for next iteration
      currentCursor = kvResult.cursor;
      hasMore = kvResult.hasMore;
      
      // If we've reached our target, we can stop scanning
      if (recipesToQueue.length >= targetQueueCount) {
        log('info', 'Reached target queue count, stopping KV scan', { 
          targetQueueCount, 
          actualCount: recipesToQueue.length 
        }, { worker: 'recipe-feeder' });
        break;
      }
      
      // If no more recipes in KV, we're done
      if (!hasMore) {
        log('info', 'No more recipes in KV storage, stopping scan', {}, { worker: 'recipe-feeder' });
        break;
      }
    }
    
    // Step 3: Queue the recipes we found (limit to target count)
    const finalRecipesToQueue = recipesToQueue.slice(0, targetQueueCount);
    
    if (finalRecipesToQueue.length > 0) {
      log('info', 'Queuing recipes for embedding', { 
        count: finalRecipesToQueue.length,
        targetQueueCount,
        totalScanned: stats.scanned 
      }, { worker: 'recipe-feeder' });
      
      const queueResult = await safeQueueRecipes(env, finalRecipesToQueue, {
        chunkSize: 50,
        validate: true
      });
      
      stats.queued = queueResult.stats.queued;
      
      if (!queueResult.success) {
        log('error', 'Errors occurred while queuing recipes', { errors: queueResult.errors }, { worker: 'recipe-feeder' });
        stats.errors = queueResult.errors.length;
      }
      
      log('info', 'Successfully queued recipes for embedding', { count: stats.queued }, { worker: 'recipe-feeder' });
    } else {
      log('info', 'No recipes need to be queued', {}, { worker: 'recipe-feeder' });
    }
    
    // Calculate processing time
    stats.processingTimeMs = Date.now() - startTime;
    
    log('info', 'Continuous processing complete', { 
      stats, 
      processingTimeMs: stats.processingTimeMs,
      reachedTarget: finalRecipesToQueue.length >= targetQueueCount,
      kvExhausted: !hasMore
    }, { worker: 'recipe-feeder' });
    
    return {
      success: stats.errors === 0,
      stats,
      nextCursor: currentCursor,
      hasMore,
      reachedTarget: finalRecipesToQueue.length >= targetQueueCount,
      kvExhausted: !hasMore
    };
    
  } catch (error) {
    stats.processingTimeMs = Date.now() - startTime;
    log('error', 'Error in continuous recipe processing', { error: error.message }, { worker: 'recipe-feeder' });
    
    return {
      success: false,
      stats: { ...stats, errors: 1 },
      nextCursor: currentCursor,
      hasMore,
      reachedTarget: false,
      kvExhausted: !hasMore,
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
  log('info', 'Starting full feeding cycle', { targetQueueCount: maxBatchSize, maxCycles }, { worker: 'recipe-feeder' });
  
  const totalStats = {
    scanned: 0,
    existsInVector: 0,
    missingFromVector: 0,
    queued: 0,
    errors: 0,
    totalProcessingTimeMs: 0,
    batchesProcessed: 0
  };
  
  let cycles = 0;
  let cursor = null;
  let hasMore = true;
  let firstError = null;
  
  try {
    while (hasMore && cycles < maxCycles) {
      const cycleStartTime = Date.now();
      
      // Check if we're running out of time
      if (cycleStartTime - startTime > maxProcessingTimeMs) {
        log('info', 'Stopping due to time limit', { elapsedTime: cycleStartTime - startTime }, { worker: 'recipe-feeder' });
        break;
      }
      
      cycles++;
      log('info', `--- Cycle ${cycles} ---`, {}, { worker: 'recipe-feeder' });
      
      const result = await processRecipesUntilTarget(env, maxBatchSize, cursor);
      
      // Accumulate stats
      Object.keys(totalStats).forEach(key => {
        if (key !== 'totalProcessingTimeMs' && result.stats[key]) {
          totalStats[key] += result.stats[key];
        }
      });
      
      cursor = result.nextCursor;
      hasMore = result.hasMore;
      
      if (!result.success) {
        log('error', `Cycle ${cycles} completed with errors`, { error: result.error }, { worker: 'recipe-feeder' });
        if (result.error && !firstError) {
          firstError = result.error;
        }
        break;
      }
      
      // If we reached our target, we're done
      if (result.reachedTarget) {
        log('info', 'Cycle complete - target reached', { 
          reachedTarget: result.reachedTarget, 
          queued: result.stats.queued,
          target: maxBatchSize
        }, { worker: 'recipe-feeder' });
        break;
      }
      
      // Only stop if we've exhausted KV AND haven't queued anything in this cycle
      if (result.kvExhausted && result.stats.queued === 0) {
        log('info', 'Cycle complete - KV exhausted with no recipes queued', { 
          kvExhausted: result.kvExhausted,
          queued: result.stats.queued
        }, { worker: 'recipe-feeder' });
        break;
      }
      
      if (!hasMore) {
        log('info', 'No more recipes to process - cycle complete', {}, { worker: 'recipe-feeder' });
        break;
      }
    }
    
    totalStats.totalProcessingTimeMs = Date.now() - startTime;
    
    log('info', 'Feeding cycle complete', { totalStats, cycles }, { worker: 'recipe-feeder' });
    
    return {
      success: totalStats.errors === 0,
      totalStats,
      cycles,
      completedFully: totalStats.queued >= maxBatchSize || (!hasMore && totalStats.scanned > 0),
      error: firstError
    };
    
  } catch (error) {
    totalStats.totalProcessingTimeMs = Date.now() - startTime;
    log('error', 'Error in full feeding cycle', { error: error.message }, { worker: 'recipe-feeder' });
    
    return {
      success: false,
      totalStats: { ...totalStats, errors: totalStats.errors + 1 },
      cycles,
      completedFully: false,
      error: error.message
    };
  }
}