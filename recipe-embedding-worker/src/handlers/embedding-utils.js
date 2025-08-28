/**
 * Check if a recipe already has an embedding in the vector database
 */
export async function checkExistingEmbedding(recipeId, RECIPE_VECTORS) {
  try {
    // Try to get existing embedding by ID first
    const existingById = await RECIPE_VECTORS.getByIds([recipeId]);
    if (existingById && existingById.length > 0) {
      return existingById[0];
    }

    // If not found by ID, try querying by metadata
    const queryResult = await RECIPE_VECTORS.query(recipeId, {
      topK: 1,
      returnMetadata: true
    });

    if (queryResult.matches && queryResult.matches.length > 0) {
      return queryResult.matches[0];
    }

    return null;
  } catch (error) {
    console.error(`Error checking existing embedding for ${recipeId}:`, error);
    return null;
  }
}

/**
 * Generate embedding text from recipe data
 */
export function generateEmbeddingText(recipeData) {
  try {
    if (!recipeData) return null;

    const textParts = [];

    // Add recipe name/title
    if (recipeData.name || recipeData.title) {
      textParts.push(recipeData.name || recipeData.title);
    }

    // Add description
    if (recipeData.description) {
      textParts.push(recipeData.description);
    }

    // Add ingredients
    if (recipeData.ingredients && Array.isArray(recipeData.ingredients)) {
      const ingredientText = recipeData.ingredients
        .map(ingredient => {
          if (typeof ingredient === 'string') return ingredient;
          if (ingredient.name) return ingredient.name;
          if (ingredient.ingredient) return ingredient.ingredient;
          return null;
        })
        .filter(Boolean)
        .join(', ');
      
      if (ingredientText) {
        textParts.push(`Ingredients: ${ingredientText}`);
      }
    }

    // Add instructions/steps
    if (recipeData.instructions && Array.isArray(recipeData.instructions)) {
      const instructionText = recipeData.instructions
        .map(instruction => {
          if (typeof instruction === 'string') return instruction;
          if (instruction.step) return instruction.step;
          if (instruction.instruction) return instruction.instruction;
          return null;
        })
        .filter(Boolean)
        .join(' ');
      
      if (instructionText) {
        textParts.push(`Instructions: ${instructionText}`);
      }
    }

    // Add cuisine type
    if (recipeData.cuisine) {
      textParts.push(`Cuisine: ${recipeData.cuisine}`);
    }

    // Add dietary information
    if (recipeData.dietary) {
      const dietaryText = Array.isArray(recipeData.dietary) 
        ? recipeData.dietary.join(', ')
        : recipeData.dietary;
      textParts.push(`Dietary: ${dietaryText}`);
    }

    // Add tags
    if (recipeData.tags && Array.isArray(recipeData.tags)) {
      textParts.push(`Tags: ${recipeData.tags.join(', ')}`);
    }

    const combinedText = textParts.join(' ').trim();
    return combinedText || null;
  } catch (error) {
    console.error('Error generating embedding text:', error);
    return null;
  }
}

/**
 * Generate embedding using Cloudflare AI
 */
export async function generateEmbedding(text, AI) {
  try {
    if (!text || typeof text !== 'string') {
      console.error('Invalid text for embedding generation');
      return null;
    }

    // Truncate text if it's too long (AI models have input limits)
    const maxLength = 4000; // Conservative limit
    const truncatedText = text.length > maxLength 
      ? text.substring(0, maxLength) + '...'
      : text;

    console.log(`Generating embedding for text (${truncatedText.length} chars)`);

    const result = await AI.run('@cf/baai/bge-base-en-v1.5', {
      text: [truncatedText]
    });

    if (result && result.data && Array.isArray(result.data) && result.data.length > 0) {
      const embedding = result.data[0];
      console.log(`Generated embedding with ${embedding.length} dimensions`);
      return embedding;
    } else {
      console.error('Invalid embedding result format:', result);
      return null;
    }
  } catch (error) {
    console.error('Error generating embedding:', error);
    return null;
  }
}

/**
 * Store embedding in Vectorize database
 */
export async function storeEmbedding(recipeId, embedding, recipeData, RECIPE_VECTORS) {
  try {
    if (!embedding || !Array.isArray(embedding)) {
      throw new Error('Invalid embedding data');
    }

    // Prepare metadata for the vector
    const metadata = {
      recipeId,
      timestamp: Date.now(),
      source: 'cloudflare-ai',
      model: 'bge-base-en-v1.5'
    };

    // Add recipe metadata if available
    if (recipeData.name || recipeData.title) {
      metadata.name = recipeData.name || recipeData.title;
    }
    if (recipeData.cuisine) {
      metadata.cuisine = recipeData.cuisine;
    }
    if (recipeData.dietary) {
      metadata.dietary = recipeData.dietary;
    }

    // Store the embedding
    const result = await RECIPE_VECTORS.upsert([
      {
        id: recipeId,
        values: embedding,
        metadata
      }
    ]);

    console.log(`Successfully stored embedding for recipe ${recipeId}`);
    return result;
  } catch (error) {
    console.error(`Error storing embedding for recipe ${recipeId}:`, error);
    throw error;
  }
}