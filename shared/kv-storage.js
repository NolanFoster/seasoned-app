/**
 * Shared KV Storage Library
 * Common functions for recipe storage and retrieval using Cloudflare KV
 * Used by both recipe-clipper and recipe-scraper workers
 */

// Utility function to generate a unique ID from URL
export function generateRecipeId(url) {
  const encoder = new TextEncoder();
  const data = encoder.encode(url);
  return crypto.subtle.digest('SHA-256', data)
    .then(hash => {
      const hashArray = Array.from(new Uint8Array(hash));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    });
}

// Compress data using gzip and encode as base64
export async function compressData(data) {
  const encoder = new TextEncoder();
  const jsonString = JSON.stringify(data);
  const jsonBytes = encoder.encode(jsonString);
  
  // Use CompressionStream for gzip compression
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  const reader = cs.readable.getReader();
  
  writer.write(jsonBytes);
  writer.close();
  
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  
  // Combine chunks into a single Uint8Array
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const compressedData = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    compressedData.set(chunk, offset);
    offset += chunk.length;
  }
  
  // Convert to base64 string for storage
  return btoa(String.fromCharCode(...compressedData));
}

// Decompress data using gzip from base64
export async function decompressData(compressedBase64) {
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

// Save recipe to KV storage
// DEPRECATED: Use recipe-save-worker API instead
export async function saveRecipeToKV(env, recipeId, recipeData) {
  throw new Error('Direct KV save is deprecated. Use recipe-save-worker API instead: POST https://recipe-save-worker.nolanfoster.workers.dev/recipe/save');
}

// Get recipe from KV storage
export async function getRecipeFromKV(env, recipeId) {
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

// List all recipes from KV storage (with pagination)
// DEPRECATED: Use recipe-save-worker API instead
export async function listRecipesFromKV(env, cursor = null, limit = 50) {
  throw new Error('Direct KV list is deprecated. Use recipe-save-worker API instead: GET https://recipe-save-worker.nolanfoster.workers.dev/recipes');
}

// Delete recipe from KV storage
// DEPRECATED: Use recipe-save-worker API instead
export async function deleteRecipeFromKV(env, recipeId) {
  throw new Error('Direct KV delete is deprecated. Use recipe-save-worker API instead: DELETE https://recipe-save-worker.nolanfoster.workers.dev/recipe/delete');
}

/**
 * Add recipe to embedding queue automatically when saved
 * This function should be called by the recipe-save-worker after successfully saving a recipe
 */
export async function addRecipeToEmbeddingQueue(env, recipeId, priority = 'normal') {
  try {
    // Check if we have access to the embedding worker
    if (!env.EMBEDDING_WORKER_URL) {
      console.warn('EMBEDDING_WORKER_URL not configured, cannot add recipe to embedding queue');
      return { success: false, error: 'Embedding worker URL not configured' };
    }
    
    // Add recipe to embedding queue via API call
    const response = await fetch(`${env.EMBEDDING_WORKER_URL}/queue/add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        recipeId,
        priority
      })
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log(`Recipe ${recipeId} added to embedding queue:`, result);
      return { success: true, ...result };
    } else {
      const errorText = await response.text();
      console.error(`Failed to add recipe ${recipeId} to embedding queue:`, errorText);
      return { success: false, error: errorText };
    }
  } catch (error) {
    console.error(`Error adding recipe ${recipeId} to embedding queue:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Check if recipe exists in KV storage
 */
export async function recipeExistsInKV(env, recipeId) {
  try {
    const recipeData = await env.RECIPE_STORAGE.get(recipeId);
    return { exists: !!recipeData, success: true };
  } catch (error) {
    console.error('Error checking recipe existence in KV:', error);
    return { exists: false, success: false, error: error.message };
  }
}

// Get recipe metadata without full data
export async function getRecipeMetadata(env, recipeId) {
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
    
    // Return only metadata, not the full recipe data
    return {
      success: true,
      metadata: {
        id: recipe.id,
        url: recipe.url,
        scrapedAt: recipe.scrapedAt,
        version: recipe.version,
        name: recipe.data?.name || 'Unknown',
        hasIngredients: !!(recipe.data?.ingredients && recipe.data.ingredients.length > 0),
        hasInstructions: !!(recipe.data?.instructions && recipe.data.instructions.length > 0),
        ingredientCount: recipe.data?.ingredients?.length || 0,
        instructionCount: recipe.data?.instructions?.length || 0
      }
    };
  } catch (error) {
    console.error('Error retrieving recipe metadata from KV:', error);
    return { success: false, error: error.message };
  }
}
