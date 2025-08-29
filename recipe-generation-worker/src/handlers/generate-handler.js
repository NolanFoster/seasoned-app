import { OpikClient } from '../opik-client.js';
import { getRecipeFromKV } from '../../../shared/kv-storage.js';

/**
 * Recipe generation endpoint handler - processes recipe generation requests
 */
export async function handleGenerate(request, env, corsHeaders) {
  try {
    // Parse the request body
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return new Response(JSON.stringify({
        error: 'Content-Type must be application/json'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    const requestBody = await request.json();

    // Validate required fields - either recipeName or ingredients must be provided
    if (!requestBody.recipeName &&
        (!requestBody.ingredients || !Array.isArray(requestBody.ingredients) || requestBody.ingredients.length === 0)) {
      return new Response(JSON.stringify({
        error: 'Either recipeName or ingredients field is required. ingredients must be a non-empty array if provided.'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    // Check if we're in a local development environment without AI access
    if (!env.AI || !env.RECIPE_VECTORS) {
      // Running in local dev mode - returning mock response
      return new Response(JSON.stringify({
        success: true,
        recipe: {
          name: `Mock Recipe for: ${requestBody.recipeName || requestBody.ingredients?.join(', ') || 'Unknown'}`,
          description: 'This is a mock recipe generated for local testing',
          ingredients: ['2 cups mock ingredient 1', '1 lb mock ingredient 2', '1 tbsp mock seasoning'],
          instructions: ['1. Prepare mock ingredients', '2. Cook according to mock method', '3. Serve hot'],
          prepTime: '15 minutes',
          cookTime: '20 minutes',
          totalTime: '35 minutes',
          servings: requestBody.servings || '4',
          difficulty: 'Easy',
          cuisine: requestBody.cuisine || 'Mock Cuisine',
          dietary: requestBody.dietary || [],
          generatedAt: new Date().toISOString(),
          sourceIngredients: requestBody.ingredients || [],
          generationTime: 0,
          similarRecipesFound: 0,
          mockMode: true
        },
        environment: env.ENVIRONMENT || 'development'
      }), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    // Generate recipe using AI (Opik if available, otherwise LLaMA)
    const generatedRecipe = await generateRecipeWithAI(requestBody, env);

    return new Response(JSON.stringify({
      success: true,
      recipe: generatedRecipe,
      environment: env.ENVIRONMENT || 'development'
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    // Error processing recipe generation request
    return new Response(JSON.stringify({
      error: 'Failed to process recipe generation request',
      details: error.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
}

/**
 * Generate recipe using AI - original LLaMA implementation with Opik tracing
 */
async function generateRecipeWithAI(requestData, env) {
  const startTime = Date.now();

  // Create Opik client with API key from environment
  const opikClient = new OpikClient(env.OPIK_API_KEY, 'recipe-generation');

  // Data collection for tracing
  const operationData = {
    input: { requestData: requestData },
    queryText: null,
    queryEmbedding: null,
    similarRecipes: null,
    generatedRecipe: null,
    llmResponse: null,
    prompt: null,
    // Timing data
    traceStartTime: new Date().toISOString(),
    queryStartTime: null,
    queryEndTime: null,
    embeddingStartTime: null,
    embeddingEndTime: null,
    searchStartTime: null,
    searchEndTime: null,
    llmStartTime: null,
    llmEndTime: null
  };

  try {
    // Starting recipe generation with AI

    // Step 1: Create query text from ingredients and preferences
    operationData.queryStartTime = new Date().toISOString();
    const queryText = buildQueryText(requestData);
    operationData.queryText = queryText;
    operationData.queryEndTime = new Date().toISOString();
    // Generated query text: ${queryText.substring(0, 200)}...

    // Step 2: Generate embedding for the query
    operationData.embeddingStartTime = new Date().toISOString();
    const queryEmbedding = await generateQueryEmbedding(queryText, env.AI);
    if (!queryEmbedding) {
      throw new Error('Failed to generate query embedding');
    }
    operationData.queryEmbedding = queryEmbedding;
    operationData.embeddingEndTime = new Date().toISOString();

    // Step 3: Search for similar recipes using vectorize and fetch full data
    operationData.searchStartTime = new Date().toISOString();
    const similarRecipes = await findSimilarRecipes(queryEmbedding, env.RECIPE_VECTORS, env);
    // Found ${similarRecipes.length} similar recipes
    operationData.similarRecipes = similarRecipes;
    operationData.searchEndTime = new Date().toISOString();

    // Step 4: Generate new recipe using LLaMA with context from similar recipes
    operationData.llmStartTime = new Date().toISOString();
    const generatedRecipe = await generateRecipeWithLLaMA(requestData, similarRecipes, env.AI, operationData);
    operationData.llmEndTime = new Date().toISOString();

    const duration = Date.now() - startTime;
    // Recipe generation completed in ${duration}ms

    // Create Opik trace and spans with complete data
    if (env.OPIK_API_KEY && opikClient.isHealthy()) {
      // Creating Opik trace with complete operation data

      // Create main trace with actual timing
      const trace = opikClient.createTrace('Recipe Generation',
        { requestData: requestData },
        {
          recipe: generatedRecipe,
          generationTime: duration,
          generationMethod: 'llama-ai'
        },
        {
          similarRecipesFound: similarRecipes.length,
          queryTextLength: queryText.length,
          embeddingDimensions: queryEmbedding ? queryEmbedding.length : 0,
          duration: duration
        },
        operationData.traceStartTime,
        new Date().toISOString()
      );

      if (trace) {
        // Helper function to calculate duration between timestamps
        const calculateDuration = (startTime, endTime) => {
          return new Date(endTime) - new Date(startTime);
        };

        // Create spans for each operation with actual timing
        const queryDuration = calculateDuration(operationData.queryStartTime, operationData.queryEndTime);
        const querySpan = opikClient.createSpan(trace, 'Query Text Generation', 'tool',
          { requestData: requestData },
          { queryText: queryText, embedding: queryEmbedding },
          {
            metadata: {
              queryLength: queryText.length,
              embeddingDimensions: queryEmbedding ? queryEmbedding.length : 0
            },
            duration: queryDuration
          },
          operationData.queryStartTime,
          operationData.queryEndTime
        );
        if (querySpan) opikClient.endSpan(querySpan);

        const embeddingDuration = calculateDuration(operationData.embeddingStartTime, operationData.embeddingEndTime);
        const embeddingSpan = opikClient.createSpan(trace, 'Query Embedding Generation', 'tool',
          { text: queryText },
          { embedding: queryEmbedding },
          {
            model: 'bge-small-en-v1.5',
            provider: 'cloudflare',
            metadata: {
              textLength: queryText.length,
              embeddingDimensions: queryEmbedding ? queryEmbedding.length : 0
            },
            duration: embeddingDuration
          },
          operationData.embeddingStartTime,
          operationData.embeddingEndTime
        );
        if (embeddingSpan) opikClient.endSpan(embeddingSpan);

        const searchDuration = calculateDuration(operationData.searchStartTime, operationData.searchEndTime);
        const searchSpan = opikClient.createSpan(trace, 'Similarity Search', 'tool',
          { queryEmbedding: queryEmbedding },
          { similarRecipes: similarRecipes, count: similarRecipes.length },
          {
            metadata: {
              embeddingDimensions: queryEmbedding ? queryEmbedding.length : 0,
              resultsFound: similarRecipes.length
            },
            duration: searchDuration
          },
          operationData.searchStartTime,
          operationData.searchEndTime
        );
        if (searchSpan) opikClient.endSpan(searchSpan);

        if (operationData.llmResponse && operationData.prompt) {
          const llmDuration = calculateDuration(operationData.llmStartTime, operationData.llmEndTime);
          const llmSpan = opikClient.createSpan(trace, 'LLaMA Recipe Generation', 'llm',
            { prompt: operationData.prompt },
            { response: operationData.llmResponse, structuredRecipe: generatedRecipe },
            {
              model: 'llama-3-8b-instruct',
              provider: 'cloudflare',
              metadata: {
                similarRecipesCount: similarRecipes.length,
                promptLength: operationData.prompt.length,
                responseLength: operationData.llmResponse.length
              },
              duration: llmDuration
            },
            operationData.llmStartTime,
            operationData.llmEndTime
          );
          if (llmSpan) opikClient.endSpan(llmSpan);
        }

        // End trace and flush
        opikClient.endTrace(trace);
        await opikClient.flush();
      }
    }

    return {
      ...generatedRecipe,
      generationTime: duration,
      similarRecipesFound: similarRecipes.length,
      generationMethod: 'llama-ai'
    };

  } catch (error) {
    // Error in generateRecipeWithAI

    // Create error trace if tracing is enabled
    if (env.OPIK_API_KEY && opikClient.isHealthy()) {
      const errorTrace = opikClient.createTrace('Recipe Generation Error',
        { requestData: requestData },
        { error: error.message },
        {
          errorType: error.name || 'Error',
          timestamp: new Date().toISOString()
        }
      );
      if (errorTrace) {
        opikClient.endTrace(errorTrace, error);
        await opikClient.flush();
      }
    }

    throw error;
  }
}

/**
 * Build query text from request data for embedding generation
 */
function buildQueryText(requestData) {
  // If recipe name is provided, use it as the primary query
  if (requestData.recipeName) {
    return requestData.recipeName;
  }

  // Otherwise, build from ingredients and preferences (legacy support)
  const parts = [];

  // Add ingredients
  if (requestData.ingredients && requestData.ingredients.length > 0) {
    parts.push(`Ingredients: ${requestData.ingredients.join(', ')}`);
  }

  // Add cuisine preference
  if (requestData.cuisine) {
    parts.push(`Cuisine: ${requestData.cuisine}`);
  }

  // Add dietary restrictions
  if (requestData.dietary && requestData.dietary.length > 0) {
    parts.push(`Dietary restrictions: ${requestData.dietary.join(', ')}`);
  }

  // Add meal type
  if (requestData.mealType) {
    parts.push(`Meal type: ${requestData.mealType}`);
  }

  // Add cooking method
  if (requestData.cookingMethod) {
    parts.push(`Cooking method: ${requestData.cookingMethod}`);
  }

  // Add servings
  if (requestData.servings) {
    parts.push(`Servings: ${requestData.servings}`);
  }

  // Add time constraint
  if (requestData.maxCookTime) {
    parts.push(`Maximum cook time: ${requestData.maxCookTime} minutes`);
  }

  return parts.join('. ');
}

/**
 * Generate embedding for query text
 */
async function generateQueryEmbedding(text, aiBinding) {
  try {
    const response = await aiBinding.run('@cf/baai/bge-small-en-v1.5', {
      text: text
    });

    if (response && response.data && Array.isArray(response.data[0])) {
      return response.data[0];
    }

    // Invalid embedding response
    return null;
  } catch {
    // Error generating query embedding
    return null;
  }
}

/**
 * Find similar recipes using vectorize similarity search and fetch full recipe data
 */
async function findSimilarRecipes(queryEmbedding, vectorStorage, env) {
  try {
    const result = await vectorStorage.query(queryEmbedding, {
      topK: 7,
      returnMetadata: true
    });

    if (!result.matches) {
      return [];
    }

    // Fetch full recipe data from KV storage for each match
    const fullRecipes = [];
    for (const match of result.matches) {
      try {
        // Get full recipe data from KV storage using the recipe ID
        const recipeResult = await getRecipeFromKV(env, match.id);

        if (recipeResult.success && recipeResult.recipe) {
          fullRecipes.push({
            id: match.id,
            score: match.score,
            metadata: match.metadata,
            fullRecipe: recipeResult.recipe
          });
        }
      } catch {
        // Failed to fetch full recipe for ${match.id}
        // Still include the match with metadata only
        fullRecipes.push({
          id: match.id,
          score: match.score,
          metadata: match.metadata,
          fullRecipe: null
        });
      }
    }

    return fullRecipes;

  } catch {
    // Error finding similar recipes
    return [];
  }
}

/**
 * Generate recipe using LLaMA model with context from similar recipes
 */

async function generateRecipeWithLLaMA(requestData, similarRecipes, aiBinding, operationData) {
  // Build context from similar recipes
  const contexts = similarRecipes.length > 0
    ? buildRecipeContext(similarRecipes)
    : [];

  // Create prompt for LLaMA
  const prompt = buildLLaMAPrompt(requestData, contexts);
  operationData.prompt = prompt;

  // Generate recipe using LLaMA
  const response = await aiBinding.run('@cf/meta/llama-3.1-8b-instruct', {
    messages: [
      {
        role: 'system',
        content: 'You are a professional chef and recipe developer. Create detailed, practical recipes that are easy to follow. Always include ingredients with measurements, step-by-step instructions and cooking times. Format your response as a structured recipe with inspiring descriptions and a touch of creativity.'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    max_tokens: 1024,
    temperature: 0.65
  });

  if (!response || !response.response) {
    throw new Error('Invalid response from LLaMA model');
  }

  // Store LLM response for tracing
  operationData.llmResponse = response.response;

  // Parse and structure the generated recipe
  const structuredRecipe = parseGeneratedRecipe(response.response, requestData);

  return structuredRecipe;
}

/**
 * Build context string from similar recipes with full recipe data
 */
function buildRecipeContext(similarRecipes) {
  if (similarRecipes.length === 0) {
    return '';
  }

  const contexts = [];

  similarRecipes.slice(0, 3).forEach((recipe) => {
    if (recipe.fullRecipe) {
      const recipeData = recipe.fullRecipe.data || recipe.fullRecipe;
      const recipeContext = formatFullRecipeContext(recipeData);
      if (recipeContext) {
        contexts.push(recipeContext);
      }
    } else if (recipe.metadata) {
      // Fallback to metadata if full recipe not available
      contexts.push(`${recipe.metadata.title || 'Recipe'}: ${recipe.metadata.description || 'No description'}`);
    }
  });

  return contexts;
}

/**
 * Format a full recipe into context string
 */
function formatFullRecipeContext(recipeData) {
  const parts = [];

  // Recipe name
  if (recipeData.name || recipeData.title) {
    parts.push(`Recipe: ${recipeData.name || recipeData.title}`);
  }

  // Description
  if (recipeData.description) {
    parts.push(`Description: ${recipeData.description}`);
  }

  // Ingredients
  if (recipeData.ingredients && Array.isArray(recipeData.ingredients)) {
    const ingredients = recipeData.ingredients
      .map(ing => typeof ing === 'string' ? ing : ing.text || ing.name || '')
      .filter(ing => ing.trim())
      .slice(0, 10) // Limit ingredients to avoid too long context
      .join(', ');
    if (ingredients) {
      parts.push(`Ingredients: ${ingredients}`);
    }
  }

  // Instructions (first few steps)
  if (recipeData.instructions && Array.isArray(recipeData.instructions)) {
    const instructions = recipeData.instructions
      .map(inst => typeof inst === 'string' ? inst : inst.text || '')
      .filter(inst => inst.trim())
      .slice(0, 5) // Limit to first 5 steps
      .join('. ');
    if (instructions) {
      parts.push(`Instructions: ${instructions}`);
    }
  }

  // Times and servings
  if (recipeData.prepTime) parts.push(`Prep time: ${recipeData.prepTime}`);
  if (recipeData.cookTime) parts.push(`Cook time: ${recipeData.cookTime}`);
  if (recipeData.recipeYield || recipeData.yield) {
    parts.push(`Serves: ${recipeData.recipeYield || recipeData.yield}`);
  }

  return parts.join('\n');
}

/**
 * Build prompt for LLaMA model using the new format
 */
function buildLLaMAPrompt(requestData, contexts) {
  let prompt = '';

  // Add context recipes if available
  if (contexts && contexts.length > 0) {
    prompt += `Based on these recipes:\n${contexts.join('\n\n')}\n\n`;
  }

  // Generate recipe query
  let query = '';
  if (requestData.recipeName) {
    query = requestData.recipeName;
  } else {
    // Build query from ingredients and preferences
    const queryParts = [];
    if (requestData.ingredients && requestData.ingredients.length > 0) {
      queryParts.push(requestData.ingredients.join(', '));
    }
    if (requestData.cuisine) {
      queryParts.push(`${requestData.cuisine} style`);
    }
    if (requestData.mealType) {
      queryParts.push(requestData.mealType);
    }
    query = queryParts.join(' ') || 'recipe';
  }

  prompt += `Generate a full recipe for: ${query}`;

  // Add any specific requirements
  const requirements = [];
  if (requestData.dietary && requestData.dietary.length > 0) {
    requirements.push(`dietary requirements: ${requestData.dietary.join(', ')}`);
  }
  if (requestData.servings) {
    requirements.push(`serves ${requestData.servings}`);
  }
  if (requestData.maxCookTime) {
    requirements.push(`maximum cook time: ${requestData.maxCookTime} minutes`);
  }
  if (requestData.cookingMethod) {
    requirements.push(`cooking method: ${requestData.cookingMethod}`);
  }

  if (requirements.length > 0) {
    prompt += `\n\nRequirements: ${requirements.join(', ')}`;
  }

  // Add recipe template structure
  prompt += `\n\nPlease format your response using this exact structure:

Name: [Creative and descriptive recipe name]

Description: [Brief description of the dish, its flavors, and what makes it special]

Ingredients:
- [Ingredient 1 with quantity]
- [Ingredient 2 with quantity]
- [Continue with all ingredients]

Instructions:
1. [Step 1 - clear and specific]
2. [Step 2 - clear and specific]
3. [Continue with numbered steps]

Prep Time: [X minutes]
Cook Time: [X minutes]

Total Time: [Prep + Cook time]`;

  return prompt;
}

/**
 * Parse generated recipe text into structured format
 *
 * Expected template format:
 * Name: [Recipe name]
 * Description: [Description]
 * Ingredients:
 * - [Ingredient 1]
 * - [Ingredient 2]
 * Instructions:
 * 1. [Step 1]
 * 2. [Step 2]
 * Prep Time: [X minutes]
 * Cook Time: [X minutes]
 * Total Time: [X minutes]
 */
function parseGeneratedRecipe(recipeText, originalRequest) {
  // Parse according to the defined template structure
  const lines = recipeText.split('\n').filter(line => line.trim());

  const recipe = {
    name: 'Generated Recipe',
    description: '',
    ingredients: [],
    instructions: [],
    prepTime: '',
    cookTime: '',
    totalTime: '',
    servings: originalRequest.servings || '',
    difficulty: 'Medium',
    cuisine: originalRequest.cuisine || '',
    dietary: originalRequest.dietary || [],
    generatedAt: new Date().toISOString(),
    sourceIngredients: originalRequest.ingredients
  };

  let currentSection = 'unknown';
  let instructionStep = 1;

  for (const line of lines) {
    const trimmedLine = line.trim();
    const lowerLine = trimmedLine.toLowerCase();

    // Parse recipe name according to template format
    if (lowerLine.startsWith('name:') && recipe.name === 'Generated Recipe') {
      let extractedName = trimmedLine.replace(/^name:\s*/i, '').trim();

      // Limit name length and clean it up
      if (extractedName.length > 100) {
        // If first sentence or first 50 characters
        const firstSentence = extractedName.split('.')[0];
        extractedName = firstSentence.length <= 50 ? firstSentence : extractedName.substring(0, 50);
      }

      // Remove quotes and extra formatting
      extractedName = extractedName.replace(/^["']|["']$/g, '').trim();

      // Only use if it looks like a reasonable recipe name (not empty, not too generic)
      if (extractedName && extractedName.length > 3 && !extractedName.toLowerCase().includes('recipe for')) {
        recipe.name = extractedName;
      }
      continue;
    }

    // Parse description according to template format
    if (lowerLine.startsWith('description:') && !recipe.description) {
      recipe.description = trimmedLine.replace(/^description:\s*/i, '').trim();
      continue;
    }

    // Identify sections according to template format
    if (lowerLine.startsWith('ingredients:')) {
      currentSection = 'ingredients';
      continue;
    } else if (lowerLine.startsWith('instructions:')) {
      currentSection = 'instructions';
      continue;
    } else if (lowerLine.startsWith('prep time:') || lowerLine.startsWith('preparation time:')) {
      recipe.prepTime = extractTime(trimmedLine);
      continue;
    } else if (lowerLine.startsWith('cook time:') || lowerLine.startsWith('cooking time:')) {
      recipe.cookTime = extractTime(trimmedLine);
      continue;
    } else if (lowerLine.startsWith('total time:')) {
      recipe.totalTime = extractTime(trimmedLine);
      continue;
    }

    // Add content to current section according to template format
    if (currentSection === 'ingredients' && trimmedLine && !lowerLine.startsWith('ingredients:')) {
      // Clean up ingredient line - expect format: "- [Ingredient with quantity]"
      const ingredient = trimmedLine.replace(/^[-•*]\s*/, '').replace(/^\d+\.\s*/, '');
      if (ingredient && !lowerLine.includes('ingredient')) {
        recipe.ingredients.push(ingredient);
      }
    } else if (currentSection === 'instructions' && trimmedLine && !lowerLine.startsWith('instructions:')) {
      // Clean up instruction line - expect format: "1. [Step description]"
      const instruction = trimmedLine.replace(/^[-•*]\s*/, '').replace(/^\d+\.\s*/, '');
      if (instruction && !lowerLine.includes('instruction')) {
        recipe.instructions.push(`${instructionStep}. ${instruction}`);
        instructionStep++;
      }
    }
  }

  // Fallback: if no ingredients found, try to extract from any line containing measurements
  if (recipe.ingredients.length === 0) {
    const measurementPattern = /\d+(\.\d+)?\s*(cup|cups|tbsp|tsp|pound|pounds|lb|lbs|oz|ounce|ounces|gram|grams|g|ml|liter|liters)/i;
    for (const line of lines) {
      if (measurementPattern.test(line)) {
        const ingredient = line.trim().replace(/^[-•*]\s*/, '').replace(/^\d+\.\s*/, '');
        recipe.ingredients.push(ingredient);
      }
    }
  }

  // Fallback: if no instructions found, use remaining lines
  if (recipe.instructions.length === 0) {
    const remainingLines = lines.filter(line => {
      const lower = line.toLowerCase();
      return !lower.startsWith('name:') &&
             !lower.startsWith('description:') &&
             !lower.startsWith('ingredients:') &&
             !lower.startsWith('instructions:') &&
             !lower.startsWith('prep time:') &&
             !lower.startsWith('cook time:') &&
             !lower.startsWith('total time:') &&
             line.trim().length > 10;
    });

    remainingLines.forEach((line, index) => {
      recipe.instructions.push(`${index + 1}. ${line.trim()}`);
    });
  }

  // Handle recipe name logic with prompt fallback
  const promptedName = originalRequest.recipeName;

  // Check if extracted name looks like a description (very long, multiple sentences, or starts with descriptive phrases)
  const extractedNameLooksLikeDescription = recipe.name !== 'Generated Recipe' && (
    recipe.name.length > 120 ||
    (recipe.name.includes('.') && recipe.name.length > 60) || // Only if long AND has periods
    recipe.name.toLowerCase().startsWith('this ') ||
    recipe.name.toLowerCase().startsWith('a delicious ') ||
    recipe.name.toLowerCase().startsWith('an amazing ') ||
    recipe.name.toLowerCase().startsWith('the perfect ') ||
    (recipe.name.includes(' and ') && recipe.name.includes(' with ') && recipe.name.length > 50) // Complex descriptive phrases
  );

  if (extractedNameLooksLikeDescription) {
    // Move the extracted "name" to description if no description is set
    if (!recipe.description) {
      recipe.description = recipe.name;
    }
    // Use prompted name or fallback
    recipe.name = promptedName || 'Generated Recipe';
  } else if (recipe.name === 'Generated Recipe') {
    // No good name extracted, try prompted name first
    if (promptedName) {
      recipe.name = promptedName;
    } else {
      // Final fallback: use first meaningful line that doesn't match template headers
      for (const line of lines.slice(0, 3)) {
        const trimmedLine = line.trim();
        if (trimmedLine.length > 5 &&
            trimmedLine.length <= 60 &&
            !trimmedLine.toLowerCase().startsWith('name:') &&
            !trimmedLine.toLowerCase().startsWith('description:') &&
            !trimmedLine.toLowerCase().startsWith('ingredients:') &&
            !trimmedLine.toLowerCase().startsWith('instructions:') &&
            !trimmedLine.toLowerCase().startsWith('prep time:') &&
            !trimmedLine.toLowerCase().startsWith('cook time:') &&
            !trimmedLine.toLowerCase().startsWith('total time:') &&
            !trimmedLine.includes(':')) {
          recipe.name = trimmedLine;
          break;
        }
      }
    }
  }

  // If we still have default name and there's a prompted name, use it
  if (recipe.name === 'Generated Recipe' && promptedName) {
    recipe.name = promptedName;
  }

  return recipe;
}

/**
 * Extract time from text (e.g., "Prep time: 15 minutes" -> "15 minutes")
 */
function extractTime(text) {
  const timeMatch = text.match(/(\d+(?:\.\d+)?)\s*(minute|minutes|min|hour|hours|hr)/i);
  return timeMatch ? `${timeMatch[1]} ${timeMatch[2]}` : '';
}


