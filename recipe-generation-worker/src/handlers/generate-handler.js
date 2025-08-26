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
      console.log('Running in local dev mode - returning mock response');
      const mockRecipe = {
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
      };

      return new Response(JSON.stringify({
        success: true,
        recipe: mockRecipe,
        jsonLd: convertToJsonLd(mockRecipe),
        environment: env.ENVIRONMENT || 'development'
      }), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    // Generate recipe using embedding similarity search and LLaMA
    const generatedRecipe = await generateRecipeWithAI(requestBody, env);

    return new Response(JSON.stringify({
      success: true,
      recipe: generatedRecipe,
      jsonLd: convertToJsonLd(generatedRecipe),
      environment: env.ENVIRONMENT || 'development'
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Error processing recipe generation request:', error);
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
 * Generate recipe using embedding similarity search and LLaMA model
 */
async function generateRecipeWithAI(requestData, env) {
  const startTime = Date.now();
  
  try {
    // Step 1: Create query text from ingredients and preferences
    const queryText = buildQueryText(requestData);
    console.log('Generated query text:', queryText.substring(0, 200) + '...');

    // Step 2: Generate embedding for the query
    const queryEmbedding = await generateQueryEmbedding(queryText, env.AI);
    if (!queryEmbedding) {
      throw new Error('Failed to generate query embedding');
    }

    // Step 3: Search for similar recipes using vectorize and fetch full data
    const similarRecipes = await findSimilarRecipes(queryEmbedding, env.RECIPE_VECTORS, env.RECIPE_STORAGE);
    console.log(`Found ${similarRecipes.length} similar recipes`);

    // Step 4: Generate new recipe using LLaMA with context from similar recipes
    const generatedRecipe = await generateRecipeWithLLaMA(requestData, similarRecipes, env.AI);
    
    const duration = Date.now() - startTime;
    console.log(`Recipe generation completed in ${duration}ms`);

    return {
      ...generatedRecipe,
      generationTime: duration,
      similarRecipesFound: similarRecipes.length
    };

  } catch (error) {
    console.error('Error in generateRecipeWithAI:', error);
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
    const response = await aiBinding.run('@cf/baai/bge-base-en-v1.5', {
      text: text
    });

    if (response && response.data && Array.isArray(response.data[0])) {
      return response.data[0];
    }

    console.error('Invalid embedding response:', response);
    return null;
  } catch (error) {
    console.error('Error generating query embedding:', error);
    return null;
  }
}

/**
 * Find similar recipes using vectorize similarity search and fetch full recipe data
 */
async function findSimilarRecipes(queryEmbedding, vectorStorage, kvStorage) {
  try {
    const result = await vectorStorage.query(queryEmbedding, {
      topK: 5, // Get top 5 most similar recipes
      returnMetadata: true
    });

    if (!result.matches) {
      return [];
    }

    // Fetch full recipe data from KV storage for each match
    const fullRecipes = [];
    for (const match of result.matches) {
      try {
        const recipeResult = await getRecipeFromKV({ RECIPE_STORAGE: kvStorage }, match.id);
        if (recipeResult.success && recipeResult.recipe) {
          fullRecipes.push({
            id: match.id,
            score: match.score,
            metadata: match.metadata,
            fullRecipe: recipeResult.recipe
          });
        }
      } catch (error) {
        console.warn(`Failed to fetch full recipe for ${match.id}:`, error);
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

  } catch (error) {
    console.error('Error finding similar recipes:', error);
    return [];
  }
}

/**
 * Generate recipe using LLaMA model with context from similar recipes
 */
async function generateRecipeWithLLaMA(requestData, similarRecipes, aiBinding) {
  try {
    // Build context from similar recipes
    const contexts = similarRecipes.length > 0 
      ? buildRecipeContext(similarRecipes) 
      : [];

    // Create prompt for LLaMA
    const prompt = buildLLaMAPrompt(requestData, contexts);

    // Generate recipe using LLaMA
    const response = await aiBinding.run('@cf/meta/llama-3-8b-instruct', {
      messages: [
        {
          role: 'system',
          content: 'You are a professional chef and recipe developer. Create detailed, practical recipes that are easy to follow. Always include ingredients with measurements, step-by-step instructions, cooking times, and serving information. Format your response as a structured recipe.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 1024,
      temperature: 0.7
    });

    if (!response || !response.response) {
      throw new Error('Invalid response from LLaMA model');
    }

    // Parse and structure the generated recipe
    const structuredRecipe = parseGeneratedRecipe(response.response, requestData);

    return structuredRecipe;

  } catch (error) {
    console.error('Error generating recipe with LLaMA:', error);
    throw error;
  }
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
  
  return prompt;
}

/**
 * Parse generated recipe text into structured format
 */
function parseGeneratedRecipe(recipeText, originalRequest) {
  // Basic parsing - this could be enhanced with more sophisticated NLP
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

    // Try to identify the recipe name (usually first line or contains 'recipe' or title indicators)
    if ((lowerLine.includes('recipe') || lowerLine.includes('title')) && recipe.name === 'Generated Recipe') {
      recipe.name = trimmedLine.replace(/^(recipe:?|title:?|name:?)/i, '').trim();
      continue;
    }

    // Identify sections
    if (lowerLine.includes('ingredient')) {
      currentSection = 'ingredients';
      continue;
    } else if (lowerLine.includes('instruction') || lowerLine.includes('method') || lowerLine.includes('steps')) {
      currentSection = 'instructions';
      continue;
    } else if (lowerLine.includes('prep time') || lowerLine.includes('preparation')) {
      recipe.prepTime = extractTime(trimmedLine);
      continue;
    } else if (lowerLine.includes('cook time') || lowerLine.includes('cooking time')) {
      recipe.cookTime = extractTime(trimmedLine);
      continue;
    } else if (lowerLine.includes('total time')) {
      recipe.totalTime = extractTime(trimmedLine);
      continue;
    } else if (lowerLine.includes('serves') || lowerLine.includes('serving')) {
      recipe.servings = extractServings(trimmedLine);
      continue;
    }

    // Add content to current section
    if (currentSection === 'ingredients' && trimmedLine && !lowerLine.includes('ingredient')) {
      // Clean up ingredient line
      const ingredient = trimmedLine.replace(/^[-•*]\s*/, '').replace(/^\d+\.\s*/, '');
      if (ingredient) {
        recipe.ingredients.push(ingredient);
      }
    } else if (currentSection === 'instructions' && trimmedLine && !lowerLine.includes('instruction')) {
      // Clean up instruction line
      const instruction = trimmedLine.replace(/^[-•*]\s*/, '').replace(/^\d+\.\s*/, '');
      if (instruction) {
        recipe.instructions.push(`${instructionStep}. ${instruction}`);
        instructionStep++;
      }
    } else if (currentSection === 'unknown' && trimmedLine && !recipe.description) {
      // Use first substantial line as description if no section identified yet
      recipe.description = trimmedLine;
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
      return !lower.includes('ingredient') && 
             !lower.includes('instruction') && 
             !lower.includes('time') && 
             !lower.includes('serves') &&
             line.trim().length > 10;
    });
    
    remainingLines.forEach((line, index) => {
      recipe.instructions.push(`${index + 1}. ${line.trim()}`);
    });
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

/**
 * Extract servings from text (e.g., "Serves 4 people" -> "4")
 */
function extractServings(text) {
  const servingMatch = text.match(/(\d+)/);
  return servingMatch ? servingMatch[1] : '';
}

/**
 * Convert recipe object to valid JSON-LD format according to schema.org/Recipe
 */
function convertToJsonLd(recipe) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Recipe",
    "name": recipe.name || "Generated Recipe",
    "description": recipe.description || "",
    "datePublished": recipe.generatedAt || new Date().toISOString(),
    "author": {
      "@type": "Organization",
      "name": "AI Recipe Generator"
    }
  };

  // Add ingredients
  if (recipe.ingredients && Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0) {
    jsonLd.recipeIngredient = recipe.ingredients.map(ingredient => {
      // Clean up ingredient text
      return ingredient.replace(/^\d+\.\s*/, '').trim();
    });
  }

  // Add instructions
  if (recipe.instructions && Array.isArray(recipe.instructions) && recipe.instructions.length > 0) {
    jsonLd.recipeInstructions = recipe.instructions.map((instruction, index) => {
      // Clean up instruction text and ensure proper format
      const cleanInstruction = instruction.replace(/^\d+\.\s*/, '').trim();
      return {
        "@type": "HowToStep",
        "position": index + 1,
        "text": cleanInstruction
      };
    });
  }

  // Add timing information
  if (recipe.prepTime) {
    jsonLd.prepTime = `PT${parseTimeToISO(recipe.prepTime)}`;
  }
  if (recipe.cookTime) {
    jsonLd.cookTime = `PT${parseTimeToISO(recipe.cookTime)}`;
  }
  if (recipe.totalTime) {
    jsonLd.totalTime = `PT${parseTimeToISO(recipe.totalTime)}`;
  }

  // Add servings/yield
  if (recipe.servings) {
    jsonLd.recipeYield = recipe.servings.toString();
  }

  // Add cuisine and category
  if (recipe.cuisine) {
    jsonLd.recipeCuisine = recipe.cuisine;
  }
  if (recipe.difficulty) {
    jsonLd.recipeCategory = recipe.difficulty;
  }

  // Add dietary information as keywords
  if (recipe.dietary && Array.isArray(recipe.dietary) && recipe.dietary.length > 0) {
    jsonLd.keywords = recipe.dietary.join(', ');
  }

  // Add source ingredients as additional context
  if (recipe.sourceIngredients && Array.isArray(recipe.sourceIngredients) && recipe.sourceIngredients.length > 0) {
    if (!jsonLd.keywords) {
      jsonLd.keywords = '';
    }
    jsonLd.keywords += (jsonLd.keywords ? ', ' : '') + recipe.sourceIngredients.join(', ');
  }

  // Add generation metadata
  if (recipe.generationTime) {
    jsonLd.comment = `Generated in ${recipe.generationTime}ms using AI recipe generation`;
  }

  return jsonLd;
}

/**
 * Parse time string to ISO 8601 duration format
 * Converts "15 minutes", "1 hour", "1 hour 30 minutes" to "15M", "1H", "1H30M"
 */
function parseTimeToISO(timeString) {
  if (!timeString) return "0M";
  
  const timeStr = timeString.toLowerCase().trim();
  let hours = 0;
  let minutes = 0;

  // Extract hours
  const hourMatch = timeStr.match(/(\d+)\s*hour/);
  if (hourMatch) {
    hours = parseInt(hourMatch[1]);
  }

  // Extract minutes
  const minuteMatch = timeStr.match(/(\d+)\s*minute/);
  if (minuteMatch) {
    minutes = parseInt(minuteMatch[1]);
  }

  // Convert to ISO 8601 duration format
  let result = "";
  if (hours > 0) {
    result += `${hours}H`;
  }
  if (minutes > 0) {
    result += `${minutes}M`;
  }

  return result || "0M";
}
