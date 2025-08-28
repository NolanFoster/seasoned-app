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
 * Process a single recipe for embedding generation
 */
export async function processRecipe(env, recipeId, attempts = 0) {
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

// Import required functions
import { getQueueStats } from './queue-handler.js';
import { checkExistingEmbedding, generateEmbeddingText, generateEmbedding, storeEmbedding } from './embedding-utils.js';