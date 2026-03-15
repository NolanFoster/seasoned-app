/**
 * AI Image Generation Worker
 * Generates images from recipes using Cloudflare's FLUX model
 */

import { handleGenerate } from './handlers/generate-handler.js';
import { handleHealth } from './handlers/health-handler.js';
import { handleRoot } from './handlers/root-handler.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    try {
      // Route handling
      if (url.pathname === '/' && request.method === 'GET') {
        return handleRoot(request, env);
      }
      
      if (url.pathname === '/health' && request.method === 'GET') {
        return handleHealth(request, env);
      }
      
      if (url.pathname === '/generate' && request.method === 'POST') {
        return handleGenerate(request, env, ctx);
      }
      
      // 404 for unmatched routes
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
      
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({ 
        error: 'Internal server error',
        message: error.message 
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  }
};