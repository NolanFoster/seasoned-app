/**
 * Vector Store Checker utility for checking if recipes exist in vector database
 */

/**
 * Checks if a single recipe exists in the vector store
 * @param {Object} env - Cloudflare environment bindings
 * @param {string} recipeId - Recipe ID to check
 * @returns {Promise<boolean>} True if recipe exists in vector store
 */
export async function recipeExistsInVectorStore(env, recipeId) {
  try {
    // Query the vector store for this specific recipe ID
    // Using a dummy vector since we're just checking if the ID exists
    const dummyVector = new Array(384).fill(0); // 384-dimensional zero vector
    
    const queryResult = await env.RECIPE_VECTORS.query(dummyVector, {
      topK: 1,
      filter: { recipeId: { $eq: recipeId } }
    });
    
    // If we get any results, the recipe exists
    return !!(queryResult.matches && queryResult.matches.length > 0);
    
  } catch (error) {
    console.error(`Error checking vector store for recipe ${recipeId}:`, error);
    // If there's an error, assume it doesn't exist to be safe
    return false;
  }
}

/**
 * Checks multiple recipes in batch against vector store
 * @param {Object} env - Cloudflare environment bindings
 * @param {string[]} recipeIds - Array of recipe IDs to check
 * @returns {Promise<{exists: string[], missing: string[]}>}
 */
export async function batchCheckVectorStore(env, recipeIds) {
  const exists = [];
  const missing = [];
  
  console.log(`Checking ${recipeIds.length} recipes against vector store`);
  
  // Check each recipe individually
  // Note: We could optimize this with parallel requests, but we want to be mindful of rate limits
  for (const recipeId of recipeIds) {
    try {
      const existsInVector = await recipeExistsInVectorStore(env, recipeId);
      
      if (existsInVector) {
        exists.push(recipeId);
      } else {
        missing.push(recipeId);
      }
    } catch (error) {
      console.error(`Error checking recipe ${recipeId}:`, error);
      // Assume missing if error occurs
      missing.push(recipeId);
    }
  }
  
  console.log(`Vector store check complete: ${exists.length} exist, ${missing.length} missing`);
  
  return { exists, missing };
}

/**
 * Optimized batch check using parallel requests (use with caution for rate limits)
 * @param {Object} env - Cloudflare environment bindings
 * @param {string[]} recipeIds - Array of recipe IDs to check
 * @param {number} concurrency - Number of parallel requests (default: 5)
 * @returns {Promise<{exists: string[], missing: string[]}>}
 */
export async function parallelBatchCheckVectorStore(env, recipeIds, concurrency = 5) {
  const exists = [];
  const missing = [];
  
  console.log(`Parallel checking ${recipeIds.length} recipes with concurrency: ${concurrency}`);
  
  // Process recipes in chunks with limited concurrency
  for (let i = 0; i < recipeIds.length; i += concurrency) {
    const chunk = recipeIds.slice(i, i + concurrency);
    
    const chunkPromises = chunk.map(async (recipeId) => {
      try {
        const existsInVector = await recipeExistsInVectorStore(env, recipeId);
        return { recipeId, exists: existsInVector };
      } catch (error) {
        console.error(`Error checking recipe ${recipeId}:`, error);
        return { recipeId, exists: false };
      }
    });
    
    const chunkResults = await Promise.all(chunkPromises);
    
    chunkResults.forEach(result => {
      if (result.exists) {
        exists.push(result.recipeId);
      } else {
        missing.push(result.recipeId);
      }
    });
  }
  
  console.log(`Parallel vector store check complete: ${exists.length} exist, ${missing.length} missing`);
  
  return { exists, missing };
}