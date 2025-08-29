/**
 * Recipe Feeder Worker - Cloudflare Worker that feeds recipes to the embedding queue
 * 
 * This worker runs on a cron schedule and:
 * 1. Scans KV storage for recipe keys
 * 2. Checks which recipes are missing from the vector store
 * 3. Queues missing recipes for embedding processing
 */

import { executeFullFeedingCycle } from './handlers/feeder-handler.js';

export default {
  /**
   * Handle scheduled cron triggers
   * @param {ScheduledController} controller - Cron controller
   * @param {Object} env - Environment bindings
   * @param {ExecutionContext} ctx - Execution context
   */
  async scheduled(controller, env, _ctx) {
    const startTime = Date.now();
    const cronTime = new Date(controller.scheduledTime).toISOString();
    
    console.log(`\\n=== Recipe Feeder Cron Job Started at ${cronTime} ===`);
    console.log(`Environment: ${env.ENVIRONMENT}`);
    console.log(`Batch size: ${env.BATCH_SIZE}`);
    
    try {
      // Execute the feeding cycle
      const result = await executeFullFeedingCycle(env, {
        maxBatchSize: parseInt(env.BATCH_SIZE) || 100,
        maxCycles: 1, // One cycle per cron run
        maxProcessingTimeMs: 50000 // 50 seconds max
      });
      
      const duration = Date.now() - startTime;
      
      if (result.success) {
        console.log(`\\n✅ Cron job completed successfully in ${duration}ms`);
        console.log('Final stats:', result.totalStats);
        
        // Log summary for monitoring
        console.log(`SUMMARY: Processed ${result.totalStats.scanned} recipes, ` +
                   `queued ${result.totalStats.queued} for embedding, ` +
                   `${result.totalStats.existsInVector} already existed`);
      } else {
        console.error(`\\n❌ Cron job completed with errors in ${duration}ms`);
        console.error('Final stats:', result.totalStats);
        if (result.error) {
          console.error('Error:', result.error);
          // Re-throw to ensure the cron job is marked as failed
          throw new Error(result.error);
        }
      }
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`\\n💥 Cron job failed after ${duration}ms:`, error);
      
      // Re-throw to ensure the cron job is marked as failed
      throw error;
    }
    
    console.log(`=== Recipe Feeder Cron Job Ended ===\\n`);
  },

  /**
   * Handle HTTP requests (for testing and manual triggers)
   * @param {Request} request - HTTP request
   * @param {Object} env - Environment bindings
   * @param {ExecutionContext} ctx - Execution context
   */
  async fetch(request, env, _ctx) {
    const url = new URL(request.url);
    
    // Only allow GET requests for testing
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }
    
    try {
      if (url.pathname === '/') {
        // Health check endpoint
        return new Response(JSON.stringify({
          service: 'recipe-feeder',
          status: 'healthy',
          environment: env.ENVIRONMENT,
          batchSize: env.BATCH_SIZE,
          timestamp: new Date().toISOString()
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      if (url.pathname === '/trigger') {
        // Manual trigger endpoint for testing
        console.log('Manual trigger requested');
        
        const result = await executeFullFeedingCycle(env, {
          maxBatchSize: parseInt(env.BATCH_SIZE) || 100,
          maxCycles: 1
        });
        
        return new Response(JSON.stringify({
          triggered: true,
          result: result,
          timestamp: new Date().toISOString()
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      if (url.pathname === '/status') {
        // Status endpoint with basic info
        return new Response(JSON.stringify({
          service: 'recipe-feeder',
          description: 'Feeds recipes from KV to embedding queue',
          features: [
            'Scans KV storage for recipe keys',
            'Checks vector store for existing embeddings',
            'Queues missing recipes for embedding',
            'Runs on cron schedule'
          ],
          environment: env.ENVIRONMENT,
          configuration: {
            batchSize: env.BATCH_SIZE,
            cronSchedule: env.ENVIRONMENT === 'production' ? 'hourly' : 
                         env.ENVIRONMENT === 'staging' ? 'every 30min' : 'every 15min'
          },
          timestamp: new Date().toISOString()
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // 404 for unknown paths
      return new Response('Not found', { status: 404 });
      
    } catch (error) {
      console.error('Error handling request:', error);
      
      return new Response(JSON.stringify({
        error: 'Internal server error',
        message: error.message,
        timestamp: new Date().toISOString()
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};