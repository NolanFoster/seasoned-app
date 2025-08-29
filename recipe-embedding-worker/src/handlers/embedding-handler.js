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
    // Throw the error for critical failures so it can be caught by the queue error handler
    throw error;
  }
}

/**
 * Process a single recipe ID for embedding generation
 */
export async function processEmbeddingMessage(recipeId, env) {
  try {
    // Validate recipe ID
    if (!recipeId || recipeId.trim() === '') {
      console.log('Empty or invalid recipe ID provided');
      return { success: false, reason: 'invalid_recipe_id' };
    }

    console.log(`Processing recipe: ${recipeId}`);

    // Check if this recipe already has an embedding
    const existingEmbedding = await checkExistingEmbedding(recipeId, env.RECIPE_VECTORS);
    if (existingEmbedding) {
      console.log(`Recipe ${recipeId} already has embedding, skipping`);
      return { success: false, reason: 'already_has_embedding' };
    }

    // Get recipe data from KV
    const recipeResult = await getRecipeFromKV(env, recipeId);
    if (!recipeResult.success || !recipeResult.recipe) {
      console.error(`Failed to get recipe ${recipeId} from KV:`, recipeResult.error);
      return { success: false, reason: 'recipe_not_found' };
    }

    const recipeData = recipeResult.recipe;

    // Generate embedding text from recipe data
    const embeddingText = generateEmbeddingText(recipeData);
    if (!embeddingText) {
      console.error(`No embedding text generated for recipe ${recipeId}`);
      return { success: false, reason: 'no_embedding_text' };
    }

    // Generate embedding using Cloudflare AI
    const embedding = await generateEmbedding(embeddingText, env.AI);
    if (!embedding) {
      console.error(`Failed to generate embedding for recipe ${recipeId}`);
      return { success: false, reason: 'embedding_generation_failed' };
    }

    // Store embedding in vectorize
    await storeEmbedding(recipeId, embedding, recipeData, env.RECIPE_VECTORS);
    
    console.log(`Successfully processed recipe ${recipeId}`);
    return { success: true, recipeId };

  } catch (error) {
    console.error(`Error processing recipe ${recipeId}:`, error);
    // Re-throw the error so it can be caught by the queue error handler
    throw error;
  }
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
