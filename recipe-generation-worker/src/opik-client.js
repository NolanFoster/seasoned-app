/**
 * Opik AI Client for Recipe Generation
 * Integrates with Opik AI service using the official Opik SDK
 */

import { Opik } from 'opik';

/**
 * Optik AI Client class using the official Opik SDK
 */
export class OpikClient {
  constructor(apiKey = null, workspaceName = 'recipe-generation-worker') {
    this.apiKey = apiKey;
    this.workspaceName = workspaceName;
    this.client = null;

    if (this.apiKey) {
      this.initializeClient();
    }
  }

  /**
   * Initialize the Opik client
   */
  initializeClient() {
    if (!this.apiKey) {
      throw new Error('API key is required to initialize Opik client');
    }

    this.client = new Opik({
      apiKey: this.apiKey,
      apiUrl: 'https://www.comet.com/opik/api',
      projectName: 'recipe-generation-worker',
      workspaceName: this.workspaceName
    });
  }

  /**
   * Set API key from environment variable
   * @param {string} envApiKey - API key from environment
   */
  setApiKey(envApiKey) {
    if (envApiKey) {
      this.apiKey = envApiKey;
      this.initializeClient();
    }
  }

  /**
   * Generate a recipe using Optik AI with Cloudflare Workers AI
   * @param {Object} requestData - Recipe generation request data
   * @param {string[]} requestData.ingredients - List of ingredients
   * @param {string} requestData.cuisine - Cuisine type
   * @param {string[]} requestData.dietary - Dietary restrictions
   * @param {string} requestData.mealType - Type of meal
   * @param {string} requestData.cookingMethod - Preferred cooking method
   * @param {number} requestData.servings - Number of servings
   * @param {number} requestData.maxCookTime - Maximum cooking time in minutes
   * @param {Object} env - Cloudflare Workers environment with AI binding
   * @returns {Promise<Object>} Generated recipe
   */
  async generateRecipe(requestData, env) {
    try {
      if (!this.client) {
        throw new Error('Opik client not initialized. Please set API key first.');
      }

      if (!env.AI) {
        throw new Error('Cloudflare Workers AI binding not available');
      }

      const startTime = Date.now();

      // Build the recipe generation prompt
      const prompt = this.buildRecipePrompt(requestData);

      // Start tracing with Opik
      const trace = this.client.trace({
        name: 'Recipe Generation',
        input: {
          prompt: prompt,
          requestData: requestData
        }
      });

      // Create a span for the LLM call
      const llmSpan = trace.span({
        name: 'LLM Recipe Generation',
        type: 'llm',
        input: {
          prompt: prompt,
          model: '@cf/meta/llama-3.1-8b-instruct'
        }
      });

      // Generate recipe using Cloudflare Workers AI
      const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        prompt: prompt,
        max_tokens: 1500,
        temperature: 0.7
      });

      // End the LLM span
      llmSpan.end({
        output: {
          response: response,
          generationTime: Date.now() - startTime
        }
      });

      // Parse the generated recipe
      const parsedRecipe = this.parseGeneratedRecipe(response, requestData);

      // End the trace
      trace.end({
        output: {
          recipe: parsedRecipe,
          totalGenerationTime: Date.now() - startTime
        }
      });

      // Flush the trace data
      await this.client.flush();

      return parsedRecipe;

    } catch (error) {
      console.error('Error generating recipe with Opik:', error);
      throw new Error(`Failed to generate recipe with Opik: ${error.message}`);
    }
  }

  /**
   * Build recipe generation prompt from request data
   * @param {Object} requestData - Recipe generation request data
   * @returns {string} Formatted prompt for recipe generation
   */
  buildRecipePrompt(requestData) {
    const parts = [];

    if (requestData.ingredients && requestData.ingredients.length > 0) {
      parts.push(`Ingredients available: ${requestData.ingredients.join(', ')}`);
    }

    if (requestData.cuisine) {
      parts.push(`Cuisine style: ${requestData.cuisine}`);
    }

    if (requestData.dietary && requestData.dietary.length > 0) {
      parts.push(`Dietary restrictions: ${requestData.dietary.join(', ')}`);
    }

    if (requestData.mealType) {
      parts.push(`Meal type: ${requestData.mealType}`);
    }

    if (requestData.cookingMethod) {
      parts.push(`Preferred cooking method: ${requestData.cookingMethod}`);
    }

    if (requestData.servings) {
      parts.push(`Number of servings: ${requestData.servings}`);
    }

    if (requestData.maxCookTime) {
      parts.push(`Maximum cooking time: ${requestData.maxCookTime} minutes`);
    }

    const basePrompt = parts.length > 0
      ? `Please create a delicious recipe based on the following requirements:\n\n${parts.join('\n')}`
      : 'Please create a delicious and creative recipe';

    return `${basePrompt}

You are an expert chef and recipe developer. Create a detailed, practical recipe that is easy to follow.

Please provide the recipe in the following structured format:

Recipe Name: [Name of the recipe]
Description: [Brief description of the dish]
Ingredients: [List ingredients with measurements, one per line starting with -]
Instructions: [Step-by-step instructions, numbered]
Prep Time: [Preparation time]
Cook Time: [Cooking time]
Total Time: [Total time]
Servings: [Number of servings]
Difficulty: [Easy/Medium/Hard]
Cuisine: [Cuisine type]
Dietary: [Dietary tags like vegetarian, vegan, gluten-free, etc.]

Make sure the recipe is:
- Balanced and flavorful
- Safe to prepare
- Accessible to home cooks
- Includes precise measurements
- Has clear, actionable instructions`;
  }

  /**
   * Parse generated recipe text into structured format
   * @param {string} generatedText - Raw generated text from AI model
   * @param {Object} requestData - Original request data
   * @returns {Object} Structured recipe object
   */
  parseGeneratedRecipe(generatedText, requestData) {
    try {
      // Extract recipe components using regex patterns
      const nameMatch = generatedText.match(/Recipe Name[:\s]*(.+?)(?=\n|$)/i);
      const descriptionMatch = generatedText.match(/Description[:\s]*(.+?)(?=\n|$)/i);
      const ingredientsMatch = generatedText.match(/Ingredients[:\s]*([\s\S]*?)(?=\n\s*\n|\nInstructions|\n- Instructions|$)/i);
      const instructionsMatch = generatedText.match(/Instructions[:\s]*([\s\S]*?)(?=\n\s*\n|\nPrep Time|\n- Prep Time|$)/i);
      const prepTimeMatch = generatedText.match(/Prep Time[:\s]*(.+?)(?=\n|$)/i);
      const cookTimeMatch = generatedText.match(/Cook Time[:\s]*(.+?)(?=\n|$)/i);
      const totalTimeMatch = generatedText.match(/Total Time[:\s]*(.+?)(?=\n|$)/i);
      const servingsMatch = generatedText.match(/Servings[:\s]*(.+?)(?=\n|$)/i);
      const difficultyMatch = generatedText.match(/Difficulty[:\s]*(.+?)(?=\n|$)/i);
      const cuisineMatch = generatedText.match(/Cuisine[:\s]*(.+?)(?=\n|$)/i);
      const dietaryMatch = generatedText.match(/Dietary[:\s]*([\s\S]*?)(?=\n\s*\n|$)/i);

      // Parse ingredients into array
      let ingredients = [];
      if (ingredientsMatch) {
        const ingredientsText = ingredientsMatch[1].trim();
        ingredients = ingredientsText
          .split('\n')
          .map(line => line.trim())
          .filter(line => line && (line.startsWith('-') || line.startsWith('•') || line.match(/^\d/)))
          .map(line => line.replace(/^[-•]\s*/, '').trim());
      }

      // Parse instructions into array
      let instructions = [];
      if (instructionsMatch) {
        const instructionsText = instructionsMatch[1].trim();
        instructions = instructionsText
          .split('\n')
          .map(line => line.trim())
          .filter(line => line && (line.match(/^\d+\./) || line.startsWith('-') || line.startsWith('•')))
          .map(line => line.replace(/^\d+\.\s*/, '').replace(/^[-•]\s*/, '').trim());
      }

      // Parse dietary tags
      let dietary = [];
      if (dietaryMatch) {
        const dietaryText = dietaryMatch[1].trim();
        dietary = dietaryText
          .split(',')
          .map(tag => tag.trim())
          .filter(tag => tag);
      }

      // Check if parsing was successful or if we're missing critical fields
      const isParsingComplete = nameMatch && ingredients.length > 0 && instructions.length > 0;

      return {
        name: nameMatch ? nameMatch[1].trim() : 'Generated Recipe',
        description: descriptionMatch ? descriptionMatch[1].trim() : 'A delicious recipe generated by Optik AI',
        ingredients: ingredients.length > 0 ? ingredients : requestData.ingredients || ['Ingredients to be determined'],
        instructions: instructions.length > 0 ? instructions : ['Instructions to be determined'],
        prepTime: prepTimeMatch ? prepTimeMatch[1].trim() : 'To be determined',
        cookTime: cookTimeMatch ? cookTimeMatch[1].trim() : 'To be determined',
        totalTime: totalTimeMatch ? totalTimeMatch[1].trim() : 'To be determined',
        servings: servingsMatch ? servingsMatch[1].trim() : requestData.servings || '4',
        difficulty: difficultyMatch ? difficultyMatch[1].trim() : 'Medium',
        cuisine: cuisineMatch ? cuisineMatch[1].trim() : requestData.cuisine || 'International',
        dietary: dietary.length > 0 ? dietary : requestData.dietary || [],
        generatedAt: new Date().toISOString(),
        sourceIngredients: requestData.ingredients || [],
        generationTime: 0,
        similarRecipesFound: 0,
        optikGenerated: true,
        source: 'optik-ai',
        rawResponse: isParsingComplete ? undefined : generatedText
      };
    } catch (error) {
      console.error('Error parsing generated recipe:', error);
      // Fallback to basic structure
      return {
        name: 'Recipe Generated by Optik AI',
        description: 'A recipe was generated but parsing failed. Please check the raw response.',
        ingredients: requestData.ingredients || ['Ingredients to be determined'],
        instructions: ['Instructions to be determined'],
        prepTime: 'To be determined',
        cookTime: 'To be determined',
        totalTime: 'To be determined',
        servings: requestData.servings || '4',
        difficulty: 'Medium',
        cuisine: requestData.cuisine || 'International',
        dietary: requestData.dietary || [],
        generatedAt: new Date().toISOString(),
        sourceIngredients: requestData.ingredients || [],
        generationTime: 0,
        similarRecipesFound: 0,
        optikGenerated: true,
        source: 'optik-ai',
        rawResponse: generatedText
      };
    }
  }

  /**
   * Generate recipe embedding using Cloudflare Workers AI (if needed)
   * @param {string} text - Text to embed
   * @param {Object} env - Cloudflare Workers environment with AI binding
   * @returns {Promise<Array<number>>} Embedding vector
   */
  async generateEmbedding(text, env) {
    try {
      if (!env.AI) {
        throw new Error('Cloudflare Workers AI binding not available');
      }

      const response = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
        text: text
      });

      if (response && response.data && Array.isArray(response.data[0])) {
        return response.data[0];
      }

      throw new Error('Invalid embedding response format');

    } catch (error) {
      console.error('Error generating embedding:', error);
      throw new Error(`Failed to generate embedding: ${error.message}`);
    }
  }
}

/**
 * Create and configure Opik client
 * @param {string} apiKey - Optional API key override
 * @param {string} workspaceName - Optional workspace name
 * @returns {OpikClient} Configured Opik client
 */
export function createOpikClient(apiKey = null, workspaceName = 'recipe-generation-worker') {
  return new OpikClient(apiKey, workspaceName);
}

/**
 * Default Opik client instance
 */
export const opikClient = createOpikClient();

