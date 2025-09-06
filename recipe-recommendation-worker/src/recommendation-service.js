/**
 * Recommendation Service - Core business logic for recipe recommendations
 */

import { log } from '../../shared/utility-functions.js';
import { metrics, sendAnalytics } from './shared-utilities.js';

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
export async function getRecipeRecommendations(location, date, recipesPerCategory, env, requestId) {
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

    const duration = Date.now() - startTime;
    
    log('info', 'Recommendations generated successfully', {
      requestId,
      duration: `${duration}ms`,
      aiDuration: `${aiDuration}ms`,
      categories: Object.keys(enhancedRecommendations).length,
      totalRecipes: Object.values(enhancedRecommendations).reduce((sum, recipes) => sum + recipes.length, 0),
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
          ingredients: [`Fresh ingredients for ${dish.toLowerCase()}`],
          instructions: [`Prepare ${dish.toLowerCase()} according to your favorite recipe`],
          image_url: null,
          source_url: null,
          type: 'dish_suggestion',
          source: 'ai_generated',
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
          ingredients: [`Fresh ingredients for ${dish.toLowerCase()}`],
          instructions: [`Prepare ${dish.toLowerCase()} according to your favorite recipe`],
          image_url: null,
          source_url: null,
          type: 'dish_suggestion',
          source: 'ai_generated',
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
            const recipes = searchResults.results.slice(0, limit).map(node => {
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
                ingredientsValue: properties.ingredients,
                instructionsValue: properties.instructions,
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
                ingredients: properties.ingredients || [],
                instructions: properties.instructions || [],
                image_url: properties.imageUrl || properties.image_url || null,
                source_url: properties.url || properties.source_url || null,
                type: 'recipe',
                source: 'smart_search_database'
              };
            });
            
            const duration = Date.now() - startTime;
            metrics.timing('recipe_search_duration', duration, { source: 'smart_search_database' });
            metrics.increment('recipes_found_via_smart_search', recipes.length);
            metrics.increment(`smart_search_strategy_${searchResults.strategy || 'unknown'}`, 1);
            if (searchResults.similarityScore) {
              metrics.increment('smart_search_similarity_score', Math.round(searchResults.similarityScore * 100));
            }
            
            log('info', 'Recipes found via smart-search database service binding', {
              requestId,
              category: categoryName,
              found: recipes.length,
              requested: limit,
              duration: `${duration}ms`,
              source: 'smart_search_database',
              strategy: searchResults.strategy || 'unknown',
              similarityScore: searchResults.similarityScore || 0
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
      ingredients: [`Fresh ingredients for ${dish.toLowerCase()}`],
      instructions: [`Prepare ${dish.toLowerCase()} according to your favorite recipe`],
      image_url: null,
      source_url: null,
      type: 'dish_suggestion',
      source: 'ai_generated',
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
      source: 'ai_generated',
      fallback: true
    }));
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
