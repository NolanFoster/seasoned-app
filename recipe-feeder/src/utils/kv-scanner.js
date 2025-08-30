/**
 * KV Scanner utility for scanning recipe keys in batches
 */

/**
 * Scans KV storage for recipe keys using list API with cursor-based pagination
 * @param {Object} env - Cloudflare environment bindings
 * @param {number} batchSize - Number of keys to fetch per batch
 * @param {string} cursor - Cursor for pagination (optional)
 * @returns {Promise<{keys: string[], cursor: string|null, hasMore: boolean}>}
 */
export async function scanRecipeKeys(env, batchSize = 100, cursor = null) {
  try {
    console.log(`Scanning KV for recipes, batch size: ${batchSize}, cursor: ${cursor || 'none'}`);
    
    const options = {
      limit: batchSize
    };
    
    if (cursor) {
      options.cursor = cursor;
    }
    
    const result = await env.RECIPE_STORAGE.list(options);
    
    // Extract just the recipe IDs from the key names
    const recipeKeys = result.keys.map(keyInfo => keyInfo.name);
    
    console.log(`Found ${recipeKeys.length} recipe keys in this batch`);
    
    return {
      keys: recipeKeys,
      cursor: result.cursor || null,
      hasMore: !result.list_complete,
      totalScanned: recipeKeys.length
    };
    
  } catch (error) {
    console.error('Error scanning KV storage:', error);
    throw new Error(`Failed to scan KV storage: ${error.message}`);
  }
}

/**
 * Gets a specific batch of recipe keys starting from a given cursor
 * @param {Object} env - Cloudflare environment bindings  
 * @param {number} batchSize - Number of keys to fetch
 * @param {string} startCursor - Starting cursor position
 * @returns {Promise<{keys: string[], nextCursor: string|null}>}
 */
export async function getRecipeKeysBatch(env, batchSize = 100, startCursor = null) {
  const result = await scanRecipeKeys(env, batchSize, startCursor);
  
  return {
    keys: result.keys,
    nextCursor: result.cursor,
    hasMore: result.hasMore
  };
}

/**
 * Estimates total number of recipes in KV storage (for monitoring purposes)
 * @param {Object} env - Cloudflare environment bindings
 * @returns {Promise<number>} Estimated total count
 */
export async function estimateRecipeCount(env) {
  try {
    // Get a sample to estimate total count
    const sampleSize = 1000;
    const result = await env.RECIPE_STORAGE.list({ limit: sampleSize });
    
    if (result.list_complete) {
      // We got everything in one batch
      return result.keys.length;
    } else {
      // This is an estimate - KV doesn't provide exact counts
      console.log('KV storage contains more than 1000 recipes (exact count not available)');
      return sampleSize; // Return sample size as minimum estimate
    }
  } catch (error) {
    console.error('Error estimating recipe count:', error);
    return 0;
  }
}