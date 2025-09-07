/**
 * Recommendation Service - Core business logic for recipe recommendations
 */

import { log } from '../../shared/utility-functions.js';
import { metrics, sendAnalytics } from './shared-utilities.js';
import { getRecipeFromKV as getRecipeFromKVShared } from '../../shared/kv-storage.js';

// Holiday detection utility
function getUpcomingHoliday(date) {
  const dateObj = new Date(date);
  const month = dateObj.getMonth();
  const day = dateObj.getDate();
  
  // Check if a holiday is within 7 days
  const holidays = [
    { month: 0, day: 1, name: "New Year's Day", range: 7 },
    { month: 1, day: 14, name: "Valentine's Day", range: 7 },
    { month: 3, day: 1, name: "Easter", range: 7 }, // Approximate
    { month: 6, day: 4, name: "Independence Day", range: 7 },
    { month: 9, day: 31, name: "Halloween", range: 7 },
    { month: 10, day: 28, name: "Thanksgiving", range: 7 }, // 4th Thursday, approximate
    { month: 11, day: 25, name: "Christmas", range: 7 }
  ];
  
  for (const holiday of holidays) {
    const holidayDate = new Date(dateObj.getFullYear(), holiday.month, holiday.day);
    const daysDiff = Math.abs((dateObj - holidayDate) / (1000 * 60 * 60 * 24));
    
    if (daysDiff <= holiday.range) {
      return holiday.name;
    }
  }
  
  return null;
}

// Contextual category selection
function getContextualCategory(season, date, hasLocation) {
  const month = new Date(date).getMonth();
  
  // If no location, suggest practical categories
  if (!hasLocation) {
    const noLocationCategories = [
      "Easy Weeknight Dinners",
      "Meal Prep Favorites",
      "30-Minute Meals",
      "One-Pot Wonders",
      "Budget-Friendly Eats"
    ];
    return noLocationCategories[month % noLocationCategories.length];
  }
  
  // Context-based categories when no holiday
  const contextCategories = {
    'Spring': [
      "Light & Fresh Dishes",
      "Garden-Fresh Recipes",
      "Picnic Perfect",
      "Brunch Favorites"
    ],
    'Summer': [
      "No-Cook Meals",
      "Refreshing Salads",
      "Tropical Flavors",
      "Farmers Market Finds"
    ],
    'Fall': [
      "Cozy Comfort Foods",
      "Harvest Celebrations",
      "Slow Cooker Favorites",
      "Warming Soups & Stews"
    ],
    'Winter': [
      "Hearty One-Pot Meals",
      "Baking Projects",
      "Hot Drinks & Treats",
      "Indoor Comfort Foods"
    ]
  };
  
  const seasonCategories = contextCategories[season];
  return seasonCategories[month % seasonCategories.length];
}

// Main recommendation function
export async function getRecipeRecommendations(location, date, recipesPerCategory, aiGeneratedCount, env, requestId) {
  const startTime = Date.now();
  
  // Check if we have AI binding
  if (!env.AI) {
    log('error', 'AI binding not configured', { requestId });
    metrics.increment('ai_binding_missing', 1, { reason: 'no_binding' });
    throw new Error('AI binding not configured - cannot generate recommendations');
  }

  // Format the date for better context
  const dateObj = new Date(date);
  const month = dateObj.toLocaleString('default', { month: 'long' });
  const season = getSeason(dateObj);
  
  // Determine context dynamically
  const hasLocation = location && location.trim() !== '';
  const upcomingHoliday = getUpcomingHoliday(date);
  
  // Create enhanced prompt with more context
  const locationContext = hasLocation ? `Location: ${location}` : 'Location: Not specified';
  const promptContext = hasLocation ? 
    'Consider local cuisine, regional ingredients, and specialties specific to this area.' : 
    'Focus on practical, accessible recipes that work anywhere.';
  
  // Build dynamic prompt based on context
  let basePrompt = `Generate ${recipesPerCategory} recipe recommendations for each category. ${promptContext}`;
  
  if (upcomingHoliday) {
    basePrompt += ` It's near ${upcomingHoliday}, so include holiday-appropriate recipes.`;
  } else {
    basePrompt += ` It's ${season} in ${month}, so focus on seasonal ingredients and ${season.toLowerCase()}-appropriate dishes.`;
  }
  
  const prompt = `${basePrompt}

${locationContext}
Date: ${date}
Season: ${season}
Month: ${month}

Please provide 3 categories of recipes, each with ${recipesPerCategory} specific dish recommendations. Format your response as a JSON object with this structure:
{
  "category1": ["dish1", "dish2", "dish3"],
  "category2": ["dish4", "dish5", "dish6"],
  "category3": ["dish7", "dish8", "dish9"]
}

Make the categories relevant to the season, location, and context. Be specific with dish names.`;

  const aiStartTime = Date.now();
  
  try {
    log('debug', 'Sending request to Cloudflare AI', {
      requestId,
      model: '@cf/meta/llama-3.1-8b-instruct',
      hasLocation,
      season,
      month,
      upcomingHoliday: !!upcomingHoliday,
      recipesPerCategory
    });
    
    metrics.increment('ai_requests', 1, { 
      model: '@cf/meta/llama-3.1-8b-instruct',
      hasLocation: (!!location).toString(),
      season
    });

    const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      prompt,
      max_tokens: 1000
    });

    const aiDuration = Date.now() - aiStartTime;
    metrics.timing('ai_request_duration', aiDuration, { model: '@cf/meta/llama-3.1-8b-instruct' });
    
    log('info', 'Cloudflare AI response received', { 
      requestId,
      duration: `${aiDuration}ms`,
      responseType: typeof response,
      hasResponse: !!response
    });

    // Validate response structure
    if (!response || typeof response !== 'object') {
      metrics.increment('ai_errors', 1, { 
        type: 'invalid_response',
        model: '@cf/meta/llama-3.1-8b-instruct' 
      });
      throw new Error('Invalid response from Cloudflare AI');
    }

    // Extract content from response
    let content;
    if (response.response) {
      content = response.response;
    } else if (response.content) {
      content = response.content;
    } else if (typeof response === 'string') {
      content = response;
    } else {
      log('warn', 'Unexpected AI response structure', {
        requestId,
        responseKeys: Object.keys(response),
        responseType: typeof response
      });
      metrics.increment('ai_errors', 1, { 
        type: 'unexpected_structure',
        model: '@cf/meta/llama-3.1-8b-instruct' 
      });
      throw new Error('Unexpected response structure from Cloudflare AI');
    }

    // Parse the JSON response
    const parseStartTime = Date.now();
    let categoryRecommendations;
    
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        // Handle both direct category structure and wrapped in 'recommendations'
        categoryRecommendations = parsed.recommendations || parsed;
      } else {
        const parsed = JSON.parse(content);
        categoryRecommendations = parsed.recommendations || parsed;
      }
      
      const parseDuration = Date.now() - parseStartTime;
      metrics.timing('ai_response_parse_duration', parseDuration);
      metrics.increment('ai_success', 1, { 
        model: '@cf/meta/llama-3.1-8b-instruct',
        hasLocation: (!!location).toString(),
        season
      });
      
      log('info', 'AI response parsed successfully', {
        requestId,
        parseDuration: `${parseDuration}ms`,
        categories: Object.keys(categoryRecommendations),
        totalDishes: Object.values(categoryRecommendations).reduce((sum, dishes) => sum + dishes.length, 0)
      });
    } catch (parseError) {
      metrics.increment('ai_errors', 1, { 
        type: 'parse_error',
        model: '@cf/meta/llama-3.1-8b-instruct' 
      });
      throw new Error(`Could not parse AI response: ${parseError.message}`);
    }

    // Enhance recommendations with actual recipes
    const enhancedRecommendations = await enhanceRecommendationsWithRecipes(
      categoryRecommendations, 
      recipesPerCategory, 
      env, 
      requestId
    );

    // Generate additional AI recipes per category if requested
    if (aiGeneratedCount > 0) {
      const aiGeneratedPerCategory = await generateAIOnlyRecipesPerCategory(
        location, 
        date, 
        aiGeneratedCount,
        Object.keys(enhancedRecommendations),
        env, 
        requestId
      );
      
      // Merge AI-generated recipe names into existing categories
      Object.keys(enhancedRecommendations).forEach(category => {
        if (aiGeneratedPerCategory[category]) {
          // Add AI-generated recipe names as simple strings
          enhancedRecommendations[category].push(...aiGeneratedPerCategory[category]);
        }
      });
    }

    const duration = Date.now() - startTime;
    
    log('info', 'Recommendations generated successfully', {
      requestId,
      duration: `${duration}ms`,
      aiDuration: `${aiDuration}ms`,
      categories: Object.keys(enhancedRecommendations).length,
      totalRecipes: Object.values(enhancedRecommendations).reduce((sum, recipes) => sum + recipes.length, 0),
      aiGeneratedCount: aiGeneratedCount,
      season,
      hasLocation,
      upcomingHoliday: !!upcomingHoliday
    });

    return {
      recommendations: enhancedRecommendations,
      location: location || null,
      date,
      season,
      aiModel: '@cf/meta/llama-3.1-8b-instruct',
      processingMetrics: {
        totalDuration: duration,
        aiDuration,
        parseDuration: Date.now() - parseStartTime
      }
    };
  } catch (error) {
    const modelName = '@cf/meta/llama-3.1-8b-instruct'; // Define modelName for error handling
    
    metrics.increment('ai_request_errors', 1, { 
      reason: 'ai_error',
      model: modelName || 'unknown'
    });
    
    log('error', 'Cloudflare AI request failed', {
      requestId,
      error: error.message,
      model: modelName,
      duration: `${Date.now() - aiStartTime}ms`,
      season,
      hasLocation
    });
    
    await sendAnalytics(env, 'ai_recommendation_error', {
      requestId,
      error: error.message,
      model: modelName,
      season,
      hasLocation,
      duration: Date.now() - aiStartTime
    });
    
    throw new Error(`AI request failed: ${error.message}`);
  }
}

// Generate AI-only recipes (not enhanced with search results)
export async function generateAIOnlyRecipes(location, date, count, env, requestId) {
  const startTime = Date.now();
  
  try {
    log('info', 'Generating AI-only recipes', {
      requestId,
      count,
      hasLocation: !!location
    });

    // Format the date for better context
    const dateObj = new Date(date);
    const month = dateObj.toLocaleString('default', { month: 'long' });
    const season = getSeason(dateObj);
    
    // Determine context dynamically
    const hasLocation = location && location.trim() !== '';
    const upcomingHoliday = getUpcomingHoliday(date);
    
    // Create enhanced prompt for AI-only recipes
    const locationContext = hasLocation ? `Location: ${location}` : 'Location: Not specified';
    const promptContext = hasLocation ? 
      'Consider local cuisine, regional ingredients, and specialties specific to this area.' : 
      'Focus on practical, accessible recipes that work anywhere.';
    
    // Build dynamic prompt for AI-only recipes
    let basePrompt = `Generate ${count} creative and unique recipe recommendations. ${promptContext}`;
    
    if (upcomingHoliday) {
      basePrompt += ` It's near ${upcomingHoliday}, so include holiday-appropriate recipes.`;
    } else {
      basePrompt += ` It's ${season} in ${month}, so focus on seasonal ingredients and ${season.toLowerCase()}-appropriate dishes.`;
    }
    
    const prompt = `${basePrompt}

${locationContext}
Date: ${date}
Season: ${season}
Month: ${month}

Please provide ${count} specific dish recommendations. Format your response as a JSON array with this structure:
["dish1", "dish2", "dish3", ...]

Make the dishes creative, unique, and specific. Be descriptive with dish names.`;

    const aiStartTime = Date.now();
    
    log('debug', 'Sending AI-only recipe request to Cloudflare AI', {
      requestId,
      model: '@cf/meta/llama-3.1-8b-instruct',
      hasLocation,
      season,
      month,
      upcomingHoliday: !!upcomingHoliday,
      count
    });
    
    metrics.increment('ai_only_requests', 1, { 
      model: '@cf/meta/llama-3.1-8b-instruct',
      hasLocation: (!!location).toString(),
      season
    });

    const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      prompt,
      max_tokens: 1000
    });

    const aiDuration = Date.now() - aiStartTime;
    metrics.timing('ai_only_request_duration', aiDuration, { model: '@cf/meta/llama-3.1-8b-instruct' });
    
    log('info', 'AI-only recipe response received', { 
      requestId,
      duration: `${aiDuration}ms`,
      responseType: typeof response,
      hasResponse: !!response
    });

    // Validate response structure
    if (!response) {
      metrics.increment('ai_only_errors', 1, { 
        type: 'invalid_response',
        model: '@cf/meta/llama-3.1-8b-instruct' 
      });
      throw new Error('Invalid response from Cloudflare AI');
    }

    // Extract content from response
    let content;
    if (response.response) {
      content = response.response;
    } else if (response.content) {
      content = response.content;
    } else if (typeof response === 'string') {
      content = response;
    } else {
      log('warn', 'Unexpected AI-only response structure', {
        requestId,
        responseKeys: Object.keys(response),
        responseType: typeof response
      });
      metrics.increment('ai_only_errors', 1, { 
        type: 'unexpected_structure',
        model: '@cf/meta/llama-3.1-8b-instruct' 
      });
      throw new Error('Unexpected response structure from Cloudflare AI');
    }

    // Parse the JSON response
    const parseStartTime = Date.now();
    let aiRecipes;
    
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        aiRecipes = JSON.parse(jsonMatch[0]);
      } else {
        // Try to parse the content directly
        try {
          aiRecipes = JSON.parse(content);
        } catch (directParseError) {
          // If direct parsing fails, try to extract array from the content
          const arrayMatch = content.match(/\[.*\]/);
          if (arrayMatch) {
            aiRecipes = JSON.parse(arrayMatch[0]);
          } else {
            throw directParseError;
          }
        }
      }
      
      // Ensure it's an array
      if (!Array.isArray(aiRecipes)) {
        throw new Error('Response is not an array');
      }
      
      const parseDuration = Date.now() - parseStartTime;
      metrics.timing('ai_only_response_parse_duration', parseDuration);
      metrics.increment('ai_only_success', 1, { 
        model: '@cf/meta/llama-3.1-8b-instruct',
        hasLocation: (!!location).toString(),
        season
      });
      
      log('info', 'AI-only recipes parsed successfully', {
        requestId,
        parseDuration: `${parseDuration}ms`,
        recipesCount: aiRecipes.length
      });

      // Convert to recipe objects with proper structure
      const formattedRecipes = aiRecipes.slice(0, count).map((dish, index) => ({
        id: `ai_only_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: dish,
        description: `A creative ${dish.toLowerCase()} perfect for ${season.toLowerCase()} cooking`,
        yield: '4 servings',
        prepTime: '15 minutes',
        cookTime: '30 minutes',
        image_url: null,
        source_url: null,
        type: 'ai_generated_recipe',
        source: 'ai_only_generation',
        aiGenerated: true,
        season,
        month,
        location: location || null
      }));

      const duration = Date.now() - startTime;
      
      log('info', 'AI-only recipes generated successfully', {
        requestId,
        duration: `${duration}ms`,
        aiDuration: `${aiDuration}ms`,
        requested: count,
        generated: formattedRecipes.length,
        season,
        hasLocation,
        upcomingHoliday: !!upcomingHoliday
      });

      return formattedRecipes;
      
    } catch (parseError) {
      metrics.increment('ai_only_errors', 1, { 
        type: 'parse_error',
        model: '@cf/meta/llama-3.1-8b-instruct' 
      });
      throw new Error(`Could not parse AI-only response: ${parseError.message}`);
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    
    log('error', 'AI-only recipe generation failed', {
      requestId,
      error: error.message,
      duration: `${duration}ms`,
      count
    });
    
    metrics.increment('ai_only_request_errors', 1, { 
      reason: 'ai_error',
      model: '@cf/meta/llama-3.1-8b-instruct'
    });
    
    // Return empty array on error
    return [];
  }
}

export async function generateAIOnlyRecipesPerCategory(location, date, totalCount, categories, env, requestId) {
  const startTime = Date.now();
  
  try {
    log('info', 'Generating AI-only recipes per category', {
      requestId,
      totalCount,
      categories: categories.length,
      hasLocation: !!location
    });

    // Format the date for better context
    const dateObj = new Date(date);
    const month = dateObj.toLocaleString('default', { month: 'long' });
    const season = getSeason(dateObj);
    
    // Determine context dynamically
    const hasLocation = location && location.trim() !== '';
    const upcomingHoliday = getUpcomingHoliday(date);
    
    // Use totalCount as recipes per category (user wants this many per category)
    const recipesPerCategory = totalCount;
    
    // Create enhanced prompt for AI-only recipes per category
    const locationContext = hasLocation ? `Location: ${location}` : 'Location: Not specified';
    const promptContext = hasLocation ? 
      'Consider local cuisine, regional ingredients, and specialties specific to this area.' : 
      'Focus on practical, accessible recipes that work anywhere.';
    
    // Build dynamic prompt for AI-only recipes per category
    let basePrompt = `Generate ${recipesPerCategory} creative and unique recipe recommendations for each of these categories: ${categories.join(', ')}. ${promptContext}`;
    
    if (upcomingHoliday) {
      basePrompt += ` It's near ${upcomingHoliday}, so include holiday-appropriate recipes.`;
    } else {
      basePrompt += ` It's ${season} in ${month}, so focus on seasonal ingredients and ${season.toLowerCase()}-appropriate dishes.`;
    }
    
    const prompt = `${basePrompt}

${locationContext}
Date: ${date}
Season: ${season}
Month: ${month}

Please provide ${recipesPerCategory} specific dish recommendations for each category. Format your response as a JSON object with this structure:
{
  "${categories[0]}": ["dish1", "dish2", ...],
  "${categories[1]}": ["dish1", "dish2", ...],
  ...
}

Make the dishes creative, unique, and specific to each category. Be descriptive with dish names.`;

    const aiStartTime = Date.now();
    
    log('debug', 'Sending AI-only per-category recipe request to Cloudflare AI', {
      requestId,
      model: '@cf/meta/llama-3.1-8b-instruct',
      hasLocation,
      season,
      month,
      upcomingHoliday: !!upcomingHoliday,
      totalCount,
      recipesPerCategory
    });
    
    metrics.increment('ai_only_requests', 1, { 
      model: '@cf/meta/llama-3.1-8b-instruct',
      hasLocation: (!!location).toString(),
      season
    });

    const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      prompt,
      max_tokens: 1500
    });

    const aiDuration = Date.now() - aiStartTime;
    metrics.timing('ai_only_request_duration', aiDuration, { model: '@cf/meta/llama-3.1-8b-instruct' });
    
    log('info', 'AI-only per-category recipe response received', { 
      requestId,
      duration: `${aiDuration}ms`,
      responseType: typeof response,
      hasResponse: !!response
    });

    // Validate response structure
    if (!response) {
      metrics.increment('ai_only_errors', 1, { 
        type: 'invalid_response',
        model: '@cf/meta/llama-3.1-8b-instruct' 
      });
      throw new Error('Invalid response from Cloudflare AI');
    }

    // Extract content from response
    let content;
    if (response.response) {
      content = response.response;
    } else if (response.content) {
      content = response.content;
    } else if (typeof response === 'string') {
      content = response;
    } else {
      log('warn', 'Unexpected AI-only per-category response structure', {
        requestId,
        responseKeys: Object.keys(response),
        responseType: typeof response
      });
      metrics.increment('ai_only_errors', 1, { 
        type: 'unexpected_structure',
        model: '@cf/meta/llama-3.1-8b-instruct' 
      });
      throw new Error('Unexpected response structure from Cloudflare AI');
    }

    // Parse the JSON response
    const parseStartTime = Date.now();
    let aiRecipesByCategory;
    
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        aiRecipesByCategory = JSON.parse(jsonMatch[0]);
      } else {
        // Try to parse the content directly
        try {
          aiRecipesByCategory = JSON.parse(content);
        } catch (directParseError) {
          // If direct parsing fails, try to extract object from the content
          const objectMatch = content.match(/\{.*\}/);
          if (objectMatch) {
            aiRecipesByCategory = JSON.parse(objectMatch[0]);
          } else {
            throw directParseError;
          }
        }
      }
      
      // Ensure it's an object
      if (typeof aiRecipesByCategory !== 'object' || Array.isArray(aiRecipesByCategory)) {
        throw new Error('Response is not an object');
      }
      
      const parseDuration = Date.now() - parseStartTime;
      metrics.timing('ai_only_response_parse_duration', parseDuration);
      metrics.increment('ai_only_success', 1, { 
        model: '@cf/meta/llama-3.1-8b-instruct',
        hasLocation: (!!location).toString(),
        season
      });
      
      log('info', 'AI-only per-category recipes parsed successfully', {
        requestId,
        parseDuration: `${parseDuration}ms`,
        categories: Object.keys(aiRecipesByCategory),
        totalRecipes: Object.values(aiRecipesByCategory).reduce((sum, recipes) => sum + recipes.length, 0)
      });

      // Return recipe objects with source: "ai_generated" for each category
      const formattedRecipesByCategory = {};
      
      Object.entries(aiRecipesByCategory).forEach(([category, dishes]) => {
        if (Array.isArray(dishes)) {
          formattedRecipesByCategory[category] = dishes.slice(0, recipesPerCategory).map(dish => {
            // Handle both string dish names and object structures
            let dishName = 'Unknown Recipe';
            
            if (typeof dish === 'string') {
              dishName = dish;
            } else if (dish && typeof dish === 'object') {
              // Handle nested structure: dish.name.name
              if (dish.name && dish.name.name) {
                dishName = dish.name.name;
              }
              // Handle direct structure: dish.name
              else if (dish.name && typeof dish.name === 'string') {
                dishName = dish.name;
              }
              // Handle other object structures
              else if (dish.name) {
                dishName = String(dish.name);
              }
            }
            
            return {
              name: dishName,
              source: "ai_generated"
            };
          });
        }
      });

      const duration = Date.now() - startTime;
      
      log('info', 'AI-only per-category recipes generated successfully', {
        requestId,
        duration: `${duration}ms`,
        aiDuration: `${aiDuration}ms`,
        requested: totalCount,
        generated: Object.values(formattedRecipesByCategory).reduce((sum, recipes) => sum + recipes.length, 0),
        season,
        hasLocation,
        upcomingHoliday: !!upcomingHoliday
      });

      return formattedRecipesByCategory;
      
    } catch (parseError) {
      metrics.increment('ai_only_errors', 1, { 
        type: 'parse_error',
        model: '@cf/meta/llama-3.1-8b-instruct' 
      });
      throw new Error(`Could not parse AI-only per-category response: ${parseError.message}`);
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    
    log('error', 'AI-only per-category recipe generation failed', {
      requestId,
      error: error.message,
      duration: `${duration}ms`,
      totalCount
    });
    
    metrics.increment('ai_only_request_errors', 1, { 
      reason: 'ai_error',
      model: '@cf/meta/llama-3.1-8b-instruct'
    });
    
    // Return empty object on error
    return {};
  }
}

// Enhanced recommendations with actual recipes
export async function enhanceRecommendationsWithRecipes(categoryRecommendations, recipesPerCategory, env, requestId) {
  const startTime = Date.now();
  
  try {
    log('info', 'Enhancing recommendations with recipes', {
      requestId,
      categories: Object.keys(categoryRecommendations).length,
      recipesPerCategory
    });

    // Process each category in parallel for better performance
    const enhancedRecommendations = {};
    const categoryPromises = Object.entries(categoryRecommendations).map(async ([categoryName, dishNames]) => {
      try {
        // Search for recipes based on the category and dish names
        const recipes = await searchRecipeByCategory(
          categoryName, 
          dishNames, 
          recipesPerCategory, 
          env, 
          requestId
        );
        
        enhancedRecommendations[categoryName] = recipes;
        
        log('debug', 'Category enhanced with recipes', {
          requestId,
          category: categoryName,
          originalDishes: dishNames.length,
          foundRecipes: recipes.length
        });
        
        return { category: categoryName, recipes };
      } catch (error) {
        log('warn', 'Failed to enhance category with recipes', {
          requestId,
          category: categoryName,
          error: error.message
        });
        
        // Fall back to original dish names
        enhancedRecommendations[categoryName] = dishNames.map((dish, index) => ({
          id: `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: dish,
          description: `A delicious ${dish.toLowerCase()} perfect for ${categoryName.toLowerCase()}`,
          yield: '4 servings',
          prepTime: '15 minutes',
          cookTime: '30 minutes',
          image_url: null,
          source_url: null,
          type: 'dish_suggestion',
          source: 'ai_category_generation',
          fallback: true
        }));
        
        return { category: categoryName, recipes: enhancedRecommendations[categoryName] };
      }
    });

    const results = await Promise.all(categoryPromises);
    
    const duration = Date.now() - startTime;
    
    metrics.timing('recipe_enhancement_duration', duration);
    metrics.increment('categories_enhanced', results.length);
    
    log('info', 'Recommendations enhanced successfully', {
      requestId,
      duration: `${duration}ms`,
      categories: results.length,
      totalRecipes: results.reduce((sum, result) => sum + result.recipes.length, 0)
    });
    
    return enhancedRecommendations;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    log('error', 'Failed to enhance recommendations', {
      requestId,
      error: error.message,
      duration: `${duration}ms`
    });
    
    metrics.increment('recipe_enhancement_errors', 1);
    
    // Return original dish names as fallback
    return Object.fromEntries(
      Object.entries(categoryRecommendations).map(([category, dishes]) => [
        category,
        dishes.map((dish, index) => ({
          id: `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: dish,
          description: `A delicious ${dish.toLowerCase()} perfect for ${category.toLowerCase()}`,
          yield: '4 servings',
          prepTime: '15 minutes',
          cookTime: '30 minutes',
          image_url: null,
          source_url: null,
          type: 'dish_suggestion',
          source: 'ai_category_generation',
          fallback: true
        }))
      ])
    );
  }
}

// Extract meaningful cooking terms from dish names and categories
export function extractCookingTerms(categoryName, dishNames) {
  // Common cooking ingredients and terms that are likely to be in recipe database
  const meaningfulTerms = new Set();
  
  // Basic ingredient keywords that are likely to be in recipes
  const basicIngredients = [
    'tomato', 'tomatoes', 'chicken', 'beef', 'pork', 'fish', 'salmon', 'shrimp', 'crab', 'seafood',
    'pasta', 'rice', 'quinoa', 'bread', 'cheese', 'egg', 'eggs',
    'onion', 'garlic', 'basil', 'oregano', 'thyme', 'rosemary', 'mint', 'parsley', 'sage',
    'lemon', 'lime', 'apple', 'berry', 'berries', 'strawberry', 'blueberry', 'cranberry',
    'mushroom', 'spinach', 'lettuce', 'carrot', 'potato', 'sweet', 'leek', 'celery',
    'avocado', 'coconut', 'almond', 'walnut', 'peanut', 'cashew', 'pistachio',
    'chocolate', 'vanilla', 'cinnamon', 'ginger', 'nutmeg', 'clove', 'cardamom',
    'olive', 'butter', 'cream', 'milk', 'yogurt', 'sour', 'mayo', 'mustard',
    'soy', 'sesame', 'ginger', 'chili', 'pepper', 'salt', 'sugar', 'honey',
    'flour', 'corn', 'wheat', 'oats', 'barley', 'lentil', 'bean', 'chickpea',
    'meal', 'name', 'simple', 'special', 'drink'
  ];
  
  // Cooking method keywords
  const cookingMethods = [
    'grilled', 'roasted', 'baked', 'fried', 'steamed', 'boiled', 'sautéed', 'braised',
    'marinated', 'seasoned', 'spiced', 'herbed', 'glazed', 'caramelized', 'crispy',
    'tender', 'juicy', 'creamy', 'smooth', 'chunky', 'fresh', 'raw', 'cooked'
  ];
  
  // Combine all keywords
  const allKeywords = [...basicIngredients, ...cookingMethods];
  
  // Check category name for meaningful terms
  const categoryLower = categoryName.toLowerCase();
  for (const keyword of allKeywords) {
    if (categoryLower.includes(keyword)) {
      meaningfulTerms.add(keyword);
    }
  }
  
  // Check dish names for meaningful terms
  for (const dish of dishNames) {
    const dishLower = dish.toLowerCase();
    
    // Extract individual words from dish names (split by non-alphanumeric characters)
    const words = dishLower.split(/[^a-z0-9]+/).filter(word => word.length > 2);
    
    // Check each word against our meaningful terms
    for (const word of words) {
      if (allKeywords.includes(word)) {
        meaningfulTerms.add(word);
      }
    }
    
    // Also check for exact keyword matches in the full dish name
    for (const keyword of allKeywords) {
      if (dishLower.includes(keyword)) {
        meaningfulTerms.add(keyword);
      }
    }
  }
  
  // Convert to array and filter out very short terms
  const searchTerms = Array.from(meaningfulTerms).filter(term => term.length > 2);
  
  // If no meaningful terms found, fall back to returning the dish names
  if (searchTerms.length === 0) {
    log('debug', 'No meaningful terms found, falling back to dish names', {
      category: categoryName,
      dishNames,
      fallbackTerms: dishNames
    });
    return dishNames;
  }
  
  log('debug', 'Extracted cooking terms', {
    category: categoryName,
    dishNames,
    extractedTerms: searchTerms,
    totalTerms: searchTerms.length
  });
  
  return searchTerms;
}

// Search for recipes by category
export async function searchRecipeByCategory(categoryName, dishNames, limit, env, requestId) {
  const startTime = Date.now();
  
  try {
    // Try to search for recipes using the search database service binding if available
    if (env.SEARCH_WORKER) {
      log('debug', 'Using search database service binding', {
        requestId,
        category: categoryName,
        hasSearchWorker: !!env.SEARCH_WORKER
      });
      // Extract meaningful cooking terms instead of using creative category names
      const cookingTerms = extractCookingTerms(categoryName, dishNames);
      
      // If we have meaningful cooking terms, use them; otherwise fall back to dish names only
      const searchTerms = cookingTerms.length > 0 ? cookingTerms : dishNames;
      
      log('debug', 'Searching for recipes using smart-search database service binding', {
        requestId,
        category: categoryName,
        originalDishNames: dishNames,
        extractedCookingTerms: cookingTerms,
        searchTerms: searchTerms,
        limit
      });
      
      try {
        // Create the search URL with proper parameters for service binding
        const searchParams = new URLSearchParams();
        searchParams.set('tags', searchTerms.join(','));
        searchParams.set('type', 'recipe');
        searchParams.set('limit', limit.toString());
        
        const searchUrl = `/api/smart-search?${searchParams.toString()}`;
        
        log('debug', 'Smart-search service binding query details', {
          requestId,
          category: categoryName,
          dishCount: dishNames.length,
          cookingTermsExtracted: cookingTerms.length,
          finalSearchTerms: searchTerms,
          searchUrl: searchUrl,
          hasSearchWorker: !!env.SEARCH_WORKER,
          searchWorkerType: typeof env.SEARCH_WORKER
        });
        
        // Try using the service binding with a Request object instead of direct fetch
        const request = new Request(`https://dummy.com${searchUrl}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          }
        });
        
        // Use the service binding to call the search worker
        const response = await env.SEARCH_WORKER.fetch(request);
        
        log('debug', 'Service binding response received', {
          requestId,
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          headers: Object.fromEntries(response.headers.entries())
        });

        if (response.ok) {
          const searchResults = await response.json();
          
          log('debug', 'Search results received from service binding', {
            requestId,
            hasResults: !!searchResults.results,
            resultsCount: searchResults.results?.length || 0,
            strategy: searchResults.strategy,
            similarityScore: searchResults.similarityScore,
            fullResponse: JSON.stringify(searchResults, null, 2)
          });
          
          if (searchResults.results && searchResults.results.length > 0) {
            // First, extract basic recipe data from search results
            const searchRecipes = searchResults.results.slice(0, limit).map(node => {
              // Extract properties from the node
              const properties = node.properties || {};
              
              // Log the raw node data for debugging
              log('debug', 'Processing search result node', {
                requestId,
                nodeId: node.id,
                hasProperties: !!properties,
                propertyKeys: Object.keys(properties),
                titleValue: properties.title,
                nameValue: properties.name,
                descriptionValue: properties.description,
                yieldValue: properties.servings || properties.recipeYield,
                prepTimeValue: properties.prepTime,
                cookTimeValue: properties.cookTime,
                urlValue: properties.url,
                imageUrlValue: properties.imageUrl,
                fullProperties: JSON.stringify(properties, null, 2)
              });
              
              // Try multiple possible name fields, handling empty strings
              let recipeName = (properties.title && properties.title.trim()) || 
                              (properties.name && properties.name.trim()) || 
                              (properties.recipeName && properties.recipeName.trim()) ||
                              (properties.recipeTitle && properties.recipeTitle.trim());
              
              // If no name found, try to extract from URL
              if (!recipeName && properties.url) {
                try {
                  const url = new URL(properties.url);
                  const pathParts = url.pathname.split('/').filter(part => part.length > 0);
                  if (pathParts.length > 0) {
                    // Take the last part of the URL path and format it nicely
                    const lastPart = pathParts[pathParts.length - 1];
                    recipeName = lastPart
                      .split('-')
                      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                      .join(' ');
                  }
                } catch (e) {
                  // URL parsing failed, continue with fallback
                }
              }
              
              // Final fallback
              if (!recipeName) {
                recipeName = 'Unknown Recipe';
              }
              
              return {
                id: node.id,
                name: recipeName,
                description: properties.description || '',
                yield: properties.servings || properties.recipeYield || null,
                prepTime: properties.prepTime || null,
                cookTime: properties.cookTime || null,
                image_url: properties.imageUrl || properties.image_url || null,
                source_url: properties.url || properties.source_url || null,
                type: 'recipe',
                source: 'smart_search_database'
              };
            });
            
            // Extract recipe IDs for KV lookup
            const recipeIds = searchRecipes.map(recipe => recipe.id);
            
            // Query KV storage for additional recipe details
            const kvRecipes = await getRecipesFromKV(recipeIds, env, requestId);
            
            // Merge search results with KV data
            const recipes = mergeSearchResultsWithKV(searchRecipes, kvRecipes, requestId);
            
            const duration = Date.now() - startTime;
            metrics.timing('recipe_search_duration', duration, { source: 'smart_search_database' });
            metrics.increment('recipes_found_via_smart_search', recipes.length);
            metrics.increment(`smart_search_strategy_${searchResults.strategy || 'unknown'}`, 1);
            if (searchResults.similarityScore) {
              metrics.increment('smart_search_similarity_score', Math.round(searchResults.similarityScore * 100));
            }
            
            const kvEnrichedCount = recipes.filter(r => r.kvEnriched).length;
            
            log('info', 'Recipes found via smart-search database service binding with KV enrichment', {
              requestId,
              category: categoryName,
              found: recipes.length,
              requested: limit,
              duration: `${duration}ms`,
              source: 'smart_search_database_kv_enriched',
              strategy: searchResults.strategy || 'unknown',
              similarityScore: searchResults.similarityScore || 0,
              kvEnriched: kvEnrichedCount,
              kvEnrichmentRate: recipes.length > 0 ? (kvEnrichedCount / recipes.length * 100).toFixed(1) + '%' : '0%'
            });
            
            return recipes;
          }
        } else {
          // Log error details for failed service binding request
          const errorText = await response.text();
          log('warn', 'Smart-search service binding request failed', {
            requestId,
            category: categoryName,
            status: response.status,
            statusText: response.statusText,
            errorResponse: errorText.substring(0, 500),
            searchTerms,
            limit,
            searchUrl: searchUrl
          });
          
          metrics.increment('smart_search_service_binding_errors', 1, { 
            status: response.status.toString(),
            category: categoryName 
          });
        }
      } catch (error) {
        log('warn', 'Smart-search service binding error', {
          requestId,
          category: categoryName,
          error: error.message,
          searchTerms,
          limit
        });
        
        metrics.increment('smart_search_service_binding_errors', 1, { 
          type: 'exception',
          category: categoryName 
        });
      }
    }




    // Final fallback: return enhanced dish names with mock recipe structure
    log('debug', 'No recipes found, returning enhanced dish names', {
      requestId,
      category: categoryName
    });
    
    const enhancedDishes = dishNames.slice(0, limit).map((dish, index) => ({
      id: `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: dish,
      description: `A delicious ${dish.toLowerCase()} perfect for ${categoryName.toLowerCase()}`,
      yield: '4 servings',
      prepTime: '15 minutes',
      cookTime: '30 minutes',
      image_url: null,
      source_url: null,
      type: 'dish_suggestion',
      source: 'ai_category_generation',
      fallback: true
    }));
    
    const duration = Date.now() - startTime;
    metrics.timing('recipe_search_duration', duration, { source: 'fallback' });
    metrics.increment('recipes_fallback_to_dishes', enhancedDishes.length);
    
    return enhancedDishes;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    log('error', 'Recipe search failed completely', {
      requestId,
      category: categoryName,
      error: error.message,
      duration: `${duration}ms`
    });
    
    metrics.increment('recipe_search_errors', 1);
    
    // Return basic dish names as final fallback
    return dishNames.slice(0, limit).map(dish => ({
      id: `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: dish,
      type: 'dish_suggestion',
      source: 'ai_category_generation',
      fallback: true
    }));
  }
}

// Query KV storage for recipe details by ID using shared library
export async function getRecipeFromKV(recipeId, env, requestId) {
  const startTime = Date.now();
  
  try {
    if (!env.RECIPE_STORAGE) {
      log('warn', 'KV binding not available for recipe storage', { requestId, recipeId });
      return null;
    }
    
    log('debug', 'Querying KV for recipe details using shared library', { requestId, recipeId });
    
    const result = await getRecipeFromKVShared(env, recipeId);
    
    if (!result.success) {
      log('debug', 'Recipe not found in KV storage', { 
        requestId, 
        recipeId, 
        error: result.error 
      });
      return null;
    }
    
    const recipe = result.recipe;
    const duration = Date.now() - startTime;
    
    log('debug', 'Recipe retrieved from KV storage using shared library', {
      requestId,
      recipeId,
      duration: `${duration}ms`,
      hasName: !!recipe.data?.name,
      hasDescription: !!recipe.data?.description,
      hasIngredients: !!recipe.data?.ingredients,
      hasInstructions: !!recipe.data?.instructions,
      recipeVersion: recipe.version,
      scrapedAt: recipe.scrapedAt
    });
    
    metrics.timing('kv_recipe_query_duration', duration);
    metrics.increment('kv_recipe_queries_success', 1);
    
    // Return the recipe data in the expected format
    return recipe.data || recipe;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    log('error', 'Failed to query KV for recipe using shared library', {
      requestId,
      recipeId,
      error: error.message,
      duration: `${duration}ms`
    });
    
    metrics.timing('kv_recipe_query_duration', duration);
    metrics.increment('kv_recipe_queries_error', 1);
    
    return null;
  }
}

// Merge search results with KV data, prioritizing KV data for missing fields
export function mergeSearchResultsWithKV(searchResults, kvRecipes, requestId) {
  const startTime = Date.now();
  
  try {
    const mergedResults = searchResults.map(searchResult => {
      const recipeId = searchResult.id;
      const kvRecipe = kvRecipes[recipeId];
      
      if (!kvRecipe) {
        // No KV data available, return search result as-is
        return {
          ...searchResult,
          source: 'search_database_only',
          kvEnriched: false
        };
      }
      
      // Merge data, prioritizing KV data for missing or incomplete fields
      const mergedRecipe = {
        id: recipeId,
        name: searchResult.name || kvRecipe.name || 'Unknown Recipe',
        description: searchResult.description || kvRecipe.description || '',
        yield: searchResult.yield || kvRecipe.yield || kvRecipe.servings || null,
        prepTime: searchResult.prepTime || kvRecipe.prepTime || kvRecipe.prepTimeMinutes || null,
        cookTime: searchResult.cookTime || kvRecipe.cookTime || kvRecipe.cookTimeMinutes || null,
        image_url: searchResult.image_url || kvRecipe.image_url || kvRecipe.image || null,
        source_url: searchResult.source_url || kvRecipe.source_url || kvRecipe.url || null,
        type: 'recipe',
        source: 'search_database_kv_enriched',
        kvEnriched: true,
        
        // Additional fields from KV that might not be in search results
        ingredients: kvRecipe.ingredients || null,
        instructions: kvRecipe.instructions || null,
        nutrition: kvRecipe.nutrition || null,
        tags: kvRecipe.tags || null,
        cuisine: kvRecipe.cuisine || null,
        difficulty: kvRecipe.difficulty || null,
        totalTime: kvRecipe.totalTime || kvRecipe.totalTimeMinutes || null,
        
        // Keep original search result data for reference
        searchData: {
          name: searchResult.name,
          description: searchResult.description,
          yield: searchResult.yield,
          prepTime: searchResult.prepTime,
          cookTime: searchResult.cookTime,
          image_url: searchResult.image_url,
          source_url: searchResult.source_url
        }
      };
      
      return mergedRecipe;
    });
    
    const duration = Date.now() - startTime;
    const enrichedCount = mergedResults.filter(r => r.kvEnriched).length;
    
    log('debug', 'Search results merged with KV data', {
      requestId,
      totalResults: mergedResults.length,
      enrichedCount,
      duration: `${duration}ms`
    });
    
    metrics.timing('search_kv_merge_duration', duration);
    metrics.increment('search_results_merged', mergedResults.length);
    metrics.increment('search_results_kv_enriched', enrichedCount);
    
    return mergedResults;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    log('error', 'Failed to merge search results with KV data', {
      requestId,
      error: error.message,
      duration: `${duration}ms`
    });
    
    metrics.timing('search_kv_merge_duration', duration);
    metrics.increment('search_kv_merge_errors', 1);
    
    // Return original search results as fallback
    return searchResults.map(result => ({
      ...result,
      source: 'search_database_only',
      kvEnriched: false
    }));
  }
}

// Query multiple recipes from KV storage in parallel using shared library
export async function getRecipesFromKV(recipeIds, env, requestId) {
  const startTime = Date.now();
  
  try {
    if (!env.RECIPE_STORAGE || !recipeIds || recipeIds.length === 0) {
      log('debug', 'No KV binding or recipe IDs provided', { 
        requestId, 
        hasKV: !!env.RECIPE_STORAGE,
        recipeCount: recipeIds?.length || 0 
      });
      return {};
    }
    
    log('debug', 'Querying KV for multiple recipes using shared library', { 
      requestId, 
      recipeCount: recipeIds.length,
      recipeIds: recipeIds.slice(0, 5) // Log first 5 IDs for debugging
    });
    
    // Query all recipes in parallel using the shared library
    const kvPromises = recipeIds.map(async (recipeId) => {
      try {
        const result = await getRecipeFromKVShared(env, recipeId);
        if (result.success) {
          // Return the recipe data in the expected format
          const recipe = result.recipe.data || result.recipe;
          return { id: recipeId, recipe };
        }
        return { id: recipeId, recipe: null };
      } catch (error) {
        log('warn', 'Failed to retrieve recipe from KV using shared library', {
          requestId,
          recipeId,
          error: error.message
        });
        return { id: recipeId, recipe: null };
      }
    });
    
    const results = await Promise.all(kvPromises);
    
    // Convert to a map for easy lookup
    const recipeMap = {};
    let successCount = 0;
    
    for (const result of results) {
      if (result.recipe) {
        recipeMap[result.id] = result.recipe;
        successCount++;
      }
    }
    
    const duration = Date.now() - startTime;
    
    log('info', 'KV batch query completed using shared library', {
      requestId,
      requested: recipeIds.length,
      found: successCount,
      duration: `${duration}ms`
    });
    
    metrics.timing('kv_batch_recipe_query_duration', duration);
    metrics.increment('kv_batch_recipe_queries', 1);
    metrics.increment('kv_recipes_found', successCount);
    
    return recipeMap;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    log('error', 'Failed to query KV for multiple recipes using shared library', {
      requestId,
      recipeCount: recipeIds?.length || 0,
      error: error.message,
      duration: `${duration}ms`
    });
    
    metrics.timing('kv_batch_recipe_query_duration', duration);
    metrics.increment('kv_batch_recipe_queries_error', 1);
    
    return {};
  }
}

// Season detection utility
export function getSeason(date) {
  const month = date.getMonth();
  if (month >= 2 && month <= 4) return 'Spring';
  if (month >= 5 && month <= 7) return 'Summer';
  if (month >= 8 && month <= 10) return 'Fall';
  return 'Winter';
}
