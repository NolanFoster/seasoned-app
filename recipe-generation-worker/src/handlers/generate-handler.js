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
              model: '@cf/meta/llama-4-scout-17b-16e-instruct',
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

  // Define the recipe JSON schema for structured output
  const recipeSchema = {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Creative and descriptive recipe name'
      },
      description: {
        type: 'string',
        description: 'Brief description of the dish, its flavors, and what makes it special'
      },
      ingredients: {
        type: 'array',
        items: {
          type: 'string',
          description: 'Ingredient with precise quantity and measurements'
        },
        description: 'Complete list of ingredients with quantities'
      },
      instructions: {
        type: 'array',
        items: {
          type: 'string',
          description: 'Clear and specific cooking instruction step'
        },
        description: 'Step-by-step cooking instructions'
      },
      prepTime: {
        type: 'string',
        description: 'Preparation time (e.g., \'15 minutes\')'
      },
      cookTime: {
        type: 'string',
        description: 'Cooking time (e.g., \'30 minutes\')'
      },
      totalTime: {
        type: 'string',
        description: 'Total time including prep and cook time'
      },
      servings: {
        type: 'string',
        description: 'Number of servings (e.g., \'4 servings\')'
      },
      difficulty: {
        type: 'string',
        enum: ['Easy', 'Medium', 'Hard'],
        description: 'Difficulty level of the recipe'
      },
      cuisine: {
        type: 'string',
        description: 'Type of cuisine (e.g., \'Italian\', \'Mexican\')'
      },
      dietary: {
        type: 'array',
        items: {
          type: 'string'
        },
        description: 'Dietary restrictions or preferences (e.g., \'vegetarian\', \'gluten-free\')'
      },
      tips: {
        type: 'array',
        items: {
          type: 'string'
        },
        description: 'Helpful cooking tips and variations'
      }
    },
    required: ['name', 'description', 'ingredients', 'instructions', 'prepTime', 'cookTime', 'totalTime', 'servings', 'difficulty']
  };

  // Generate recipe using LLaMA with structured JSON output
  const response = await aiBinding.run('@cf/meta/llama-4-scout-17b-16e-instruct', {
    messages: [
      {
        role: 'system',
        content: 'You are a professional chef, an expert culinary AI specialized in generating high-quality, ' +
          'user-friendly recipes. Your primary goal is to create delicious, practical recipes tailored to user ' +
          'queries, while adhering to best practices for clarity, safety, and inclusivity. Always respond in a ' +
          'friendly, encouraging tone, as if you\'re a seasoned chef sharing kitchen wisdom.' +
          '\n\n### Core Guidelines:' +
          '\n- **Structure Every Recipe Consistently**: Provide complete recipe information including name, description, ' +
          'ingredients with precise measurements, step-by-step instructions, timing, servings, and difficulty level.' +
          '\n- **Prioritize Accuracy and Safety**: Use precise measurements with conversions when helpful ' +
          '(e.g., "1 cup (240ml) flour"). Include food safety notes like proper cooking temperatures ' +
          '(e.g., poultry to 165°F/74°C). All ingredients should be mentioned in the steps and all ingredients ' +
          'mentioned in steps should be in the ingredients list.' +
          '\n- **Tailor to User Needs**: Incorporate preferences such as dietary restrictions, cuisine style, ' +
          'available ingredients, and cooking methods. Make recipes scalable and suggest substitutions for accessibility.' +
          '\n- **Encourage Creativity and Feasibility**: Draw from global cuisines for inspiration, but ensure ' +
          'recipes are realistic for home cooks. Balance flavors scientifically and suggest helpful tips.' +
          '\n- **Inclusivity and Ethics**: Promote sustainable practices and respect cultural origins. ' +
          'Focus on balanced nutrition.' +
          '\n- **Output Format**: You must respond with STRICTLY VALID JSON only. Use double quotes for all strings and property names. ' +
          'Follow the exact schema provided. Do not include any text outside the JSON structure. ' +
          'Do not use JavaScript object syntax - use proper JSON format with double quotes.'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'recipe_generation',
        schema: recipeSchema
      }
    },
    max_tokens: 2048,
    temperature: 0.65
  });

  if (!response || !response.response) {
    throw new Error('Invalid response from LLaMA model');
  }

  // Store LLM response for tracing
  operationData.llmResponse = response.response;

  // Parse the JSON response and flatten any nested structure
  let structuredRecipe = response.response;

  // Handle nested recipe structure (flatten recipe.recipe to just recipe)
  if (structuredRecipe.recipe && typeof structuredRecipe.recipe === 'object') {
    structuredRecipe = structuredRecipe.recipe;
  }

  // Add metadata fields
  structuredRecipe.generatedAt = new Date().toISOString();
  structuredRecipe.sourceIngredients = requestData.ingredients || [];

  // Ensure required fields have fallback values
  if (!structuredRecipe.name) {
    structuredRecipe.name = requestData.recipeName || 'Generated Recipe';
  }
  if (!structuredRecipe.servings) {
    structuredRecipe.servings = requestData.servings || '4 servings';
  }
  if (!structuredRecipe.cuisine) {
    structuredRecipe.cuisine = requestData.cuisine || '';
  }
  if (!structuredRecipe.dietary) {
    structuredRecipe.dietary = requestData.dietary || [];
  }


  // Normalize time formats (PT30M -> "30 minutes")
  if (structuredRecipe.prepTime && structuredRecipe.prepTime.startsWith('PT')) {
    structuredRecipe.prepTime = normalizeISOTime(structuredRecipe.prepTime);
  }
  if (structuredRecipe.cookTime && structuredRecipe.cookTime.startsWith('PT')) {
    structuredRecipe.cookTime = normalizeISOTime(structuredRecipe.cookTime);
  }
  if (structuredRecipe.totalTime && structuredRecipe.totalTime.startsWith('PT')) {
    structuredRecipe.totalTime = normalizeISOTime(structuredRecipe.totalTime);
  }

  // Ensure servings is a string
  if (typeof structuredRecipe.servings === 'number') {
    structuredRecipe.servings = `${structuredRecipe.servings} servings`;
  }

  // Handle dietary considerations field name variations
  if (structuredRecipe.dietaryConsiderations && !structuredRecipe.dietary) {
    structuredRecipe.dietary = Array.isArray(structuredRecipe.dietaryConsiderations)
      ? structuredRecipe.dietaryConsiderations
      : [structuredRecipe.dietaryConsiderations];
    delete structuredRecipe.dietaryConsiderations;
  }

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

  return parts.join('\n');
}

/**
 * Build prompt for LLaMA model using the structured JSON format
 */
function buildLLaMAPrompt(requestData, contexts) {
  let prompt = '';

  // Add context recipes if available
  if (contexts && contexts.length > 0) {
    prompt += `Based on these similar recipes for inspiration:\n${contexts.join('\n\n')}\n\n`;
  }

  // Generate recipe query
  let query = '';
  if (requestData.recipeName) {
    query = requestData.recipeName;
  } else {
    // Build query from ingredients and preferences
    const queryParts = [];
    if (requestData.ingredients && requestData.ingredients.length > 0) {
      queryParts.push(`using ingredients: ${requestData.ingredients.join(', ')}`);
    }
    if (requestData.cuisine) {
      queryParts.push(`${requestData.cuisine} cuisine`);
    }
    if (requestData.mealType) {
      queryParts.push(`${requestData.mealType} meal`);
    }
    query = queryParts.join(', ') || 'a delicious recipe';
  }

  prompt += `Create a complete recipe ${query}.`;

  // Add any specific requirements
  const requirements = [];
  if (requestData.dietary && requestData.dietary.length > 0) {
    requirements.push(`must be ${requestData.dietary.join(' and ')}`);
  }
  if (requestData.servings) {
    requirements.push(`serves ${requestData.servings} people`);
  }
  if (requestData.maxCookTime) {
    requirements.push(`total cooking time under ${requestData.maxCookTime} minutes`);
  }
  if (requestData.cookingMethod) {
    requirements.push(`using ${requestData.cookingMethod} cooking method`);
  }

  if (requirements.length > 0) {
    prompt += `\n\nSpecific requirements: ${requirements.join(', ')}.`;
  }

  // Add instructions for JSON output
  prompt += `\n\nProvide a complete recipe with:
- A creative and descriptive name
- A brief description highlighting the dish's appeal
- Complete ingredients list with precise measurements
- Clear step-by-step cooking instructions
- Accurate prep time, cook time, and total time
- Number of servings
- Difficulty level (Easy, Medium, or Hard)
- Cuisine type
- Any dietary considerations
- Helpful cooking tips and variations

Make the recipe practical for home cooks with commonly available ingredients. Include food safety notes where appropriate and provide measurement conversions when helpful.`;

  return prompt;
}

/**
 * Normalize ISO 8601 duration format (PT30M) to readable format ("30 minutes")
 */
function normalizeISOTime(isoTime) {
  if (!isoTime || !isoTime.startsWith('PT')) {
    return isoTime;
  }

  const match = isoTime.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) {
    return isoTime;
  }

  const hours = parseInt(match[1] || 0);
  const minutes = parseInt(match[2] || 0);

  if (hours > 0 && minutes > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''} ${minutes} minute${minutes > 1 ? 's' : ''}`;
  } else if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''}`;
  } else if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  }

  return isoTime;
}
