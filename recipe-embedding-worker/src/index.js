import { handleRoot } from './handlers/root-handler.js';
import { handleHealth } from './handlers/health-handler.js';
import { handleEmbedding } from './handlers/recipe-handler.js';
import { handleProgress } from './handlers/progress-handler.js';
import { handleReset } from './handlers/progress-handler.js';
import { handlePopulateQueue } from './handlers/populate-handler.js';
import { handleAddToQueue } from './handlers/queue-handler.js';
import { handleQueueMessage } from './handlers/queue-handler.js';

export default {
  // Handle HTTP requests (minimal API for monitoring and manual operations)
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
      'Access-Control-Allow-Headers': 'Content-Type'
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Route handling
    if (url.pathname === '/') {
      return handleRoot(request, env, corsHeaders);
    }

    // Health check endpoint
    if (url.pathname === '/health' && request.method === 'GET') {
      return handleHealth(request, env, corsHeaders);
    }

    // Manual embedding generation endpoint (for testing/monitoring)
    if (url.pathname === '/embed' && request.method === 'POST') {
      return handleEmbedding(request, env, corsHeaders);
    }

    // Progress check endpoint
    if (url.pathname === '/progress' && request.method === 'GET') {
      return handleProgress(request, env, corsHeaders);
    }

    // Reset progress endpoint
    if (url.pathname === '/reset' && request.method === 'DELETE') {
      return handleReset(request, env, corsHeaders);
    }

    // Populate queue endpoint (for initial setup and bulk operations)
    if (url.pathname === '/populate-queue' && request.method === 'POST') {
      return handlePopulateQueue(request, env, corsHeaders);
    }

    // Add to queue endpoint (for other workers)
    if (url.pathname === '/queue/add' && request.method === 'POST') {
      return handleAddToQueue(request, env, corsHeaders);
    }

    // 404 for unknown routes
    return new Response(JSON.stringify({
      error: 'Not Found',
      message: 'The requested endpoint does not exist'
    }), {
      status: 404,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  },

  // Handle scheduled events (cron jobs) - minimal for monitoring
  async scheduled(controller, env, _ctx) {
    console.log('Starting scheduled monitoring task');

    try {
      // Just log the current queue status for monitoring
      const queueStats = await getQueueStats(env);
      console.log('Current queue status:', queueStats);
      
      // No actual processing - this worker is a pure consumer
      console.log('Scheduled monitoring completed - worker is a pure queue consumer');
    } catch (error) {
      console.error('Error in scheduled monitoring:', error);
    }
  },

  // Handle Cloudflare Queue messages - PRIMARY FUNCTION
  async queue(batch, env, ctx) {
    console.log(`Received ${batch.messages.length} messages from queue`);
    
    try {
      const results = await handleQueueMessage(batch, env);
      console.log('Queue processing results:', results);
      return results;
    } catch (error) {
      console.error('Error processing queue messages:', error);
      
      // Acknowledge all messages to prevent infinite retries
      for (const message of batch.messages) {
        message.ack();
      }
      
      throw error;
    }
  }
};

// Import required function
import { getQueueStats } from './handlers/queue-handler.js';
