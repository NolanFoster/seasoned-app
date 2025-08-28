/**
 * Get all recipe keys from KV storage
 */
export async function getRecipeKeys(RECIPE_STORAGE) {
  try {
    const keys = [];
    let cursor = null;
    
    do {
      const result = await RECIPE_STORAGE.list({ cursor });
      keys.push(...result.keys.map(key => key.name));
      cursor = result.cursor;
    } while (cursor && !result.list_complete);
    
    return keys;
  } catch (error) {
    console.error('Error getting recipe keys from KV:', error);
    throw error;
  }
}

/**
 * Get recipe from KV storage (handles compression)
 */
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

/**
 * Decompress data using gzip from base64
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