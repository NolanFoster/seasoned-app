/**
 * Recipe Recommendation Worker
 * Provides recipe recommendations based on location and date using OpenAI models
 * Now integrated with recipe fetching to return actual recipes instead of just tags
 */

import { log as baseLog, generateRequestId } from '../../shared/utility-functions.js';
import { MetricsCollector } from '../../shared/metrics-collector.js';

// Wrapper to automatically add worker context
function log(level, message, data = {}, context = {}) {
  return baseLog(level, message, data, { worker: 'recipe-recommendation-worker', ...context });
}

// Global metrics collector
const metrics = new MetricsCollector();

// Analytics utility for Cloudflare Analytics Engine
async function sendAnalytics(env, event, data = {}) {
  try {
    if (env.ANALYTICS) {
      const analyticsData = {
        timestamp: Date.now(),
        event,
        ...data
      };
      
      await env.ANALYTICS.writeDataPoint(analyticsData);
      log('debug', 'Analytics event sent', { event, data: analyticsData });
    }
  } catch (error) {
    // Don't fail the request if analytics fails
    log('warn', 'Failed to send analytics', { 
      event, 
      error: error.message 
    });
  }
}

// Error categorization utility
function categorizeError(error, context = {}) {
  let category = 'unknown';
  let severity = 'error';
  
  if (error.name === 'TypeError' || error.name === 'ReferenceError') {
    category = 'code_error';
    severity = 'error';
  } else if (error.message?.includes('AI') || error.message?.includes('model')) {
    category = 'ai_service_error';
    severity = 'error';
  } else if (error.message?.includes('network') || error.message?.includes('fetch')) {
    category = 'network_error';
    severity = 'warn';
  } else if (error.message?.includes('parse') || error.message?.includes('JSON')) {
    category = 'parsing_error';
    severity = 'warn';
  } else if (error.message?.includes('timeout')) {
    category = 'timeout_error';
    severity = 'warn';
  }

  return { category, severity };
}

export default {
  async fetch(request, env) {
    const requestId = generateRequestId();
    const startTime = Date.now();
    const url = new URL(request.url);
    const userAgent = request.headers.get('User-Agent') || 'unknown';
    const cfCountry = request.cf?.country || 'unknown';
    const cfRay = request.headers.get('CF-Ray') || 'unknown';
    
    // Log incoming request
    log('info', 'Request received', {
      requestId,
      method: request.method,
      path: url.pathname,
      userAgent,
      country: cfCountry,
      cfRay,
      query: Object.fromEntries(url.searchParams.entries())
    });

    // Increment request counter
    metrics.increment('requests_total', 1, { 
      method: request.method, 
      path: url.pathname,
      country: cfCountry
    });
    
    // Enable CORS
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Request-ID',
      'X-Request-ID': requestId,
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      metrics.increment('requests_preflight', 1);
      log('debug', 'CORS preflight request', { requestId });
      return new Response(null, { headers: corsHeaders });
    }

    try {
      let response;
      let routeHandled = false;

      switch (url.pathname) {
        case '/recommendations':
          if (request.method === 'POST') {
            response = await handleRecommendations(request, env, corsHeaders, requestId);
            routeHandled = true;
          } else {
            // Method not allowed for non-POST requests
            response = new Response(JSON.stringify({ error: 'Method not allowed' }), {
              status: 405,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
            routeHandled = true;
          }
          break;
        case '/health':
          response = await handleHealth(env, corsHeaders, requestId);
          routeHandled = true;
          break;
        case '/metrics':
          response = await handleMetrics(corsHeaders, requestId);
          routeHandled = true;
          break;
        default:
          response = new Response(JSON.stringify({ error: 'Not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
          break;
      }

      const duration = Date.now() - startTime;
      
      // Record response metrics
      metrics.timing('request_duration', duration, { 
        method: request.method, 
        path: url.pathname,
        status: response.status.toString(),
        country: cfCountry
      });
      
      metrics.increment('responses_total', 1, { 
        status: response.status.toString(),
        path: url.pathname,
        method: request.method
      });

      // Log successful response
      log('info', 'Request completed', {
        requestId,
        method: request.method,
        path: url.pathname,
        status: response.status,
        duration: `${duration}ms`,
        country: cfCountry,
        routeHandled
      });

      // Send analytics for successful requests
      await sendAnalytics(env, 'request_completed', {
        requestId,
        method: request.method,
        path: url.pathname,
        status: response.status,
        duration,
        country: cfCountry,
        userAgent: userAgent.substring(0, 100), // Truncate for analytics
        routeHandled
      });

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      const { category, severity } = categorizeError(error);
      
      // Record error metrics
      metrics.increment('errors_total', 1, { 
        category,
        severity,
        path: url.pathname,
        method: request.method
      });
      
      metrics.timing('request_duration', duration, { 
        method: request.method, 
        path: url.pathname,
        status: '500',
        error: true
      });

      // Log error with full context
      log('error', 'Worker error', {
        requestId,
        method: request.method,
        path: url.pathname,
        error: error.message,
        stack: error.stack,
        category,
        severity,
        duration: `${duration}ms`,
        country: cfCountry
      });

      // Send error analytics
      await sendAnalytics(env, 'request_error', {
        requestId,
        method: request.method,
        path: url.pathname,
        error: error.message.substring(0, 200), // Truncate for analytics
        category,
        severity,
        duration,
        country: cfCountry,
        userAgent: userAgent.substring(0, 100)
      });

      return new Response(JSON.stringify({ 
        error: 'Internal server error',
        requestId 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};

async function handleRecommendations(request, env, corsHeaders, requestId) {
  const startTime = Date.now();
  
  try {
    log('info', 'Processing recommendations request', { requestId });
    
    // Parse request body
    const body = await request.json();
    const { location, date, limit = 3 } = body; // Default limit is 3 recipes per category

    // Validate and log input parameters
    const hasLocation = location && location.trim() !== '';
    const recommendationDate = date || new Date().toISOString().split('T')[0];
    const recipesPerCategory = Math.min(Math.max(parseInt(limit) || 3, 1), 10); // Limit between 1-10
    
    log('info', 'Recommendation parameters parsed', {
      requestId,
      hasLocation,
      location: hasLocation ? location : 'not_specified',
      date: recommendationDate,
      recipesPerCategory
    });

    // Track recommendation request metrics
    metrics.increment('recommendations_requested', 1, {
      hasLocation: String(hasLocation),
      dateProvided: String(!!date),
      limitProvided: String(!!limit)
    });

    // Get recommendations from the recommendation service
    const recommendations = await getRecipeRecommendations(location, recommendationDate, recipesPerCategory, env, requestId);

    const duration = Date.now() - startTime;
    metrics.timing('recommendations_duration', duration);
    
    log('info', 'Recommendations generated successfully', {
      requestId,
      duration: `${duration}ms`,
      categoriesCount: recommendations.recommendations ? Object.keys(recommendations.recommendations).length : 0,
      totalRecipes: recommendations.recommendations ? 
        Object.values(recommendations.recommendations).reduce((sum, recipes) => sum + recipes.length, 0) : 0
    });

    // Send recommendation success analytics
    await sendAnalytics(env, 'recommendations_generated', {
      requestId,
      hasLocation,
      location: hasLocation ? location : null,
      date: recommendationDate,
      duration,
      categoriesCount: recommendations.recommendations ? Object.keys(recommendations.recommendations).length : 0,
      recipesPerCategory,
      totalRecipes: recommendations.recommendations ? 
        Object.values(recommendations.recommendations).reduce((sum, recipes) => sum + recipes.length, 0) : 0,
      isAIGenerated: !recommendations.isMockData,
      season: recommendations.season
    });

    return new Response(JSON.stringify({
      ...recommendations,
      requestId,
      processingTime: `${duration}ms`,
      recipesPerCategory
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const { category, severity } = categorizeError(error);
    
    metrics.increment('recommendations_errors', 1, { category, severity });
    metrics.timing('recommendations_duration', duration, { error: true });
    
    log('error', 'Error getting recommendations', {
      requestId,
      error: error.message,
      stack: error.stack,
      category,
      severity,
      duration: `${duration}ms`
    });

    return new Response(JSON.stringify({ 
      error: 'Failed to get recommendations',
      requestId,
      category
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

// Enhanced health check endpoint with diagnostics
async function handleHealth(env, corsHeaders, requestId) {
  const startTime = Date.now();
  
  try {
    log('debug', 'Health check requested', { requestId });
    
    // Test AI binding availability
    const aiAvailable = !!env.AI;
    let aiStatus = 'not_configured';
    
    if (aiAvailable) {
      try {
        // Simple test to verify AI binding works
        await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
          prompt: 'Say "OK"',
          max_tokens: 5
        });
        aiStatus = 'healthy';
      } catch (error) {
        aiStatus = 'error';
        log('warn', 'AI health check failed', { requestId, error: error.message });
      }
    }

    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      requestId,
      services: {
        ai: aiStatus
      },
      metrics: {
        uptime: Date.now() - startTime,
        totalRequests: Array.from(metrics.metrics.keys())
          .filter(key => key.startsWith('requests_total'))
          .reduce((sum, key) => sum + (metrics.metrics.get(key)?.count || 0), 0)
      }
    };

    const duration = Date.now() - startTime;
    metrics.increment('health_checks', 1);
    metrics.timing('health_check_duration', duration);
    
    log('info', 'Health check completed', {
      requestId,
      duration: `${duration}ms`,
      aiStatus
    });

    return new Response(JSON.stringify(health), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    
    log('error', 'Health check failed', {
      requestId,
      error: error.message,
      duration: `${duration}ms`
    });

    return new Response(JSON.stringify({ 
      status: 'unhealthy',
      error: error.message,
      requestId
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

// Metrics endpoint for observability
async function handleMetrics(corsHeaders, requestId) {
  try {
    log('debug', 'Metrics requested', { requestId });
    
    const metricsData = {
      timestamp: new Date().toISOString(),
      requestId,
      metrics: metrics.getMetrics(),
      summary: {
        totalMetrics: metrics.metrics.size,
        uptime: Date.now()
      }
    };

    metrics.increment('metrics_requests', 1);
    
    return new Response(JSON.stringify(metricsData, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    log('error', 'Error retrieving metrics', {
      requestId,
      error: error.message
    });

    return new Response(JSON.stringify({ 
      error: 'Failed to retrieve metrics',
      requestId
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

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

async function getRecipeRecommendations(location, date, recipesPerCategory, env, requestId) {
  const startTime = Date.now();
  
  // Check if we have AI binding
  if (!env.AI) {
    log('warn', 'AI binding not configured, falling back to mock data', { requestId });
    metrics.increment('ai_fallback_to_mock', 1, { reason: 'no_binding' });
    return getMockRecommendations(location, date, recipesPerCategory, requestId);
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
  
  const holidayContext = upcomingHoliday ? 
    `There's ${upcomingHoliday} coming up within a week. Consider festive and celebratory dishes.` : 
    `The weather is typical for ${season.toLowerCase()}.`;

  const prompt = `${locationContext}, Date: ${date} (${month}, ${season})
${holidayContext} ${promptContext}

Based on the context above, generate 3 creative and contextually appropriate recipe category names with ${recipesPerCategory} specific food/dish recommendations for each category. 

Guidelines for category names:
- Category 1: Should focus on seasonal ingredients and dishes perfect for ${season.toLowerCase()}
- Category 2: Should be ${hasLocation ? 'related to local/regional specialties or cuisine styles' : 'focused on practical everyday recipes (e.g., quick meals, meal prep, budget-friendly)'}
- Category 3: Should be ${upcomingHoliday ? 'themed around ' + upcomingHoliday + ' celebrations' : 'weather/mood appropriate for the current time'}

Make the category names creative, descriptive, and appetizing. For example:
- Instead of "Summer Favorites", try "Sun-Kissed Summer Delights" 
- Instead of "Local Specialties", try specific regional names like "California Coastal Cuisine" or "Southern Comfort Classics"
- Instead of "Holiday Treats", try festive names like "Thanksgiving Harvest Table" or "Easter Brunch Bliss"

Return ONLY this JSON format with creative category names and actual food/dish names:
{
  "recommendations": {
    "Creative Category Name 1": ["specific dish 1", "specific dish 2", "specific dish 3", "specific dish 4"],
    "Creative Category Name 2": ["specific dish 1", "specific dish 2", "specific dish 3", "specific dish 4"],
    "Creative Category Name 3": ["specific dish 1", "specific dish 2", "specific dish 3", "specific dish 4"]
  }
}`;

  try {
    const aiStartTime = Date.now();
    const modelName = '@cf/meta/llama-3.1-8b-instruct';
    
    log('info', 'Calling Cloudflare AI', { 
      requestId, 
      model: modelName,
      promptLength: prompt.length,
      location: location || 'not_specified',
      season
    });
    
    metrics.increment('ai_requests', 1, { 
      model: modelName,
      hasLocation: (!!location).toString(),
      season
    });
    
    // Use faster Llama 3.1 8B model instead of GPT-OSS-20B
    const response = await env.AI.run(modelName, {
      prompt: prompt,
      max_tokens: 512  // Increased to accommodate creative category names and detailed responses
    });

    const aiDuration = Date.now() - aiStartTime;
    metrics.timing('ai_request_duration', aiDuration, { model: modelName });
    
    log('info', 'Cloudflare AI response received', { 
      requestId,
      model: modelName,
      responseType: typeof response,
      aiDuration: `${aiDuration}ms`
    });

    if (!response || typeof response !== 'object') {
      metrics.increment('ai_errors', 1, { 
        type: 'invalid_response',
        model: modelName 
      });
      throw new Error('Invalid response from Cloudflare AI');
    }

    // Extract the text content from the response
    let content;
    if (response.response) {
      content = response.response;
    } else if (response.result) {
      content = response.result;
    } else if (response.text) {
      content = response.text;
    } else if (typeof response === 'string') {
      content = response;
    } else {
      log('error', 'Unexpected AI response structure', { 
        requestId, 
        responseKeys: Object.keys(response),
        responseType: typeof response
      });
      metrics.increment('ai_errors', 1, { 
        type: 'unexpected_structure',
        model: modelName 
      });
      throw new Error('Could not extract content from AI response');
    }

    log('debug', 'AI content extracted', { 
      requestId, 
      contentLength: content?.length || 0,
      contentPreview: content?.substring(0, 100) + '...'
    });

    // Parse the JSON response
    try {
      const parseStartTime = Date.now();
      let parsed;
      
      // Try to extract JSON from the response if it contains extra text
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
        log('debug', 'JSON extracted from AI response', { 
          requestId,
          extractedLength: jsonMatch[0].length 
        });
      } else {
        // If the entire response is valid JSON
        parsed = JSON.parse(content);
        log('debug', 'Full AI response parsed as JSON', { requestId });
      }

      const parseDuration = Date.now() - parseStartTime;
      metrics.timing('ai_response_parse_duration', parseDuration);
      metrics.increment('ai_success', 1, { 
        model: modelName,
        hasLocation: (!!location).toString(),
        season
      });

      const totalDuration = Date.now() - startTime;
      
      log('info', 'AI recommendations generated successfully', {
        requestId,
        totalDuration: `${totalDuration}ms`,
        aiDuration: `${aiDuration}ms`,
        parseDuration: `${parseDuration}ms`,
        categoriesGenerated: parsed.recommendations ? Object.keys(parsed.recommendations).length : 0
      });

      // Send AI success analytics
      await sendAnalytics(env, 'ai_recommendation_success', {
        requestId,
        model: modelName,
        totalDuration,
        aiDuration,
        parseDuration,
        hasLocation: (!!location).toString(),
        location: location || null,
        season,
        categoriesGenerated: parsed.recommendations ? Object.keys(parsed.recommendations).length : 0,
        promptLength: prompt.length
      });

      // Now fetch actual recipes for each category
      const enhancedRecommendations = await enhanceRecommendationsWithRecipes(
        parsed.recommendations, 
        recipesPerCategory, 
        env, 
        requestId
      );

      // Add metadata to the response
      return {
        recommendations: enhancedRecommendations,
        location: location,
        date: date,
        season: season,
        aiModel: modelName,
        processingMetrics: {
          totalDuration: `${totalDuration}ms`,
          aiDuration: `${aiDuration}ms`,
          parseDuration: `${parseDuration}ms`
        }
      };
    } catch (parseError) {
      metrics.increment('ai_errors', 1, { 
        type: 'parse_error',
        model: modelName 
      });
      
      log('error', 'Failed to parse AI response', {
        requestId,
        error: parseError.message,
        content: content?.substring(0, 500) + '...',
        contentLength: content?.length
      });
      
      throw parseError;
    }
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    const { category, severity } = categorizeError(error);
    const modelName = '@cf/meta/llama-3.1-8b-instruct'; // Define modelName for error handling
    
    metrics.increment('ai_fallback_to_mock', 1, { 
      reason: category,
      model: modelName || 'unknown'
    });
    
    log('error', 'Cloudflare AI error, falling back to mock data', {
      requestId,
      error: error.message,
      category,
      severity,
      totalDuration: `${totalDuration}ms`,
      location: location || 'not_specified'
    });

    // Send AI error analytics
    await sendAnalytics(env, 'ai_recommendation_error', {
      requestId,
      model: modelName || 'unknown',
      error: error.message.substring(0, 200),
      category,
      severity,
      totalDuration,
      hasLocation: (!!location).toString(),
      location: location || null,
      season,
      fallbackToMock: true
    });
    
    // Fallback to mock data
    return getMockRecommendations(location, date, recipesPerCategory, requestId);
  }
}

// Enhanced function to fetch actual recipes for each category
async function enhanceRecommendationsWithRecipes(categoryRecommendations, recipesPerCategory, env, requestId) {
  const startTime = Date.now();
  const enhancedRecommendations = {};
  
  try {
    log('info', 'Enhancing recommendations with actual recipes', {
      requestId,
      categoriesCount: Object.keys(categoryRecommendations).length,
      recipesPerCategory
    });

    // Process each category in parallel for better performance
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
          requestedCount: recipesPerCategory,
          actualCount: recipes.length
        });
        
        return { categoryName, recipeCount: recipes.length };
      } catch (error) {
        log('warn', 'Failed to enhance category with recipes, using dish names', {
          requestId,
          category: categoryName,
          error: error.message
        });
        
        // Fallback to dish names if recipe fetching fails
        enhancedRecommendations[categoryName] = dishNames.slice(0, recipesPerCategory).map(dish => ({
          name: dish,
          type: 'dish_suggestion',
          fallback: true
        }));
        
        return { categoryName, recipeCount: dishNames.length, fallback: true };
      }
    });

    const results = await Promise.all(categoryPromises);
    const duration = Date.now() - startTime;
    
    metrics.timing('recipe_enhancement_duration', duration);
    metrics.increment('categories_enhanced', results.length);
    
    log('info', 'Recommendations enhanced successfully', {
      requestId,
      duration: `${duration}ms`,
      categoriesProcessed: results.length,
      totalRecipes: Object.values(enhancedRecommendations).reduce((sum, recipes) => sum + recipes.length, 0)
    });

    return enhancedRecommendations;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    log('error', 'Failed to enhance recommendations with recipes', {
      requestId,
      error: error.message,
      duration: `${duration}ms`
    });
    
    metrics.increment('recipe_enhancement_errors', 1);
    
    // Return original dish names as fallback
    Object.entries(categoryRecommendations).forEach(([categoryName, dishNames]) => {
      enhancedRecommendations[categoryName] = dishNames.slice(0, recipesPerCategory).map(dish => ({
        name: dish,
        type: 'dish_suggestion',
        fallback: true
      }));
    });
    
    return enhancedRecommendations;
  }
}

// Function to search for recipes by category and dish names
async function searchRecipeByCategory(categoryName, dishNames, limit, env, requestId) {
  const startTime = Date.now();
  
  try {
    // Try to search for recipes using the search database if available
    if (env.SEARCH_DB_URL) {
      log('debug', 'Searching for recipes using search database', {
        requestId,
        category: categoryName,
        searchTerms: dishNames.slice(0, 3).join(', '), // Use first 3 dish names for search
        limit
      });

      // Search for recipes using the category name and dish names
      const searchTerms = [categoryName, ...dishNames.slice(0, 3)].join(' ');
      const searchUrl = `${env.SEARCH_DB_URL}/api/search?q=${encodeURIComponent(searchTerms)}&type=RECIPE&limit=${limit}`;
      
      const response = await fetch(searchUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': requestId
        }
      });

      if (response.ok) {
        const searchResults = await response.json();
        
        if (searchResults.nodes && searchResults.nodes.length > 0) {
          const recipes = searchResults.nodes.slice(0, limit).map(node => ({
            id: node.id,
            name: node.properties.name || 'Unknown Recipe',
            description: node.properties.description || '',
            ingredients: node.properties.ingredients || [],
            instructions: node.properties.instructions || [],
            image_url: node.properties.image_url || null,
            source_url: node.properties.source_url || null,
            type: 'recipe',
            source: 'search_database'
          }));
          
          const duration = Date.now() - startTime;
          metrics.timing('recipe_search_duration', duration, { source: 'search_database' });
          metrics.increment('recipes_found_via_search', recipes.length);
          
          log('info', 'Recipes found via search database', {
            requestId,
            category: categoryName,
            found: recipes.length,
            requested: limit,
            duration: `${duration}ms`
          });
          
          return recipes;
        }
      }
    }

    // Fallback: search for recipes using the recipe save worker if available
    if (env.RECIPE_SAVE_WORKER_URL) {
      log('debug', 'Searching for recipes using recipe save worker', {
        requestId,
        category: categoryName,
        limit
      });

      try {
        const searchUrl = `${env.RECIPE_SAVE_WORKER_URL}/recipes/search?q=${encodeURIComponent(categoryName)}&limit=${limit}`;
        const response = await fetch(searchUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': requestId
          }
        });

        if (response.ok) {
          const searchResults = await response.json();
          
          if (searchResults.recipes && searchResults.recipes.length > 0) {
            const recipes = searchResults.recipes.slice(0, limit).map(recipe => ({
              id: recipe.id,
              name: recipe.name,
              description: recipe.description || '',
              ingredients: recipe.ingredients || [],
              instructions: recipe.instructions || [],
              image_url: recipe.image_url || null,
              source_url: recipe.source_url || null,
              type: 'recipe',
              source: 'recipe_save_worker'
            }));
            
            const duration = Date.now() - startTime;
            metrics.timing('recipe_search_duration', duration, { source: 'recipe_save_worker' });
            metrics.increment('recipes_found_via_save_worker', recipes.length);
            
            log('info', 'Recipes found via recipe save worker', {
              requestId,
              category: categoryName,
              found: recipes.length,
              requested: limit,
              duration: `${duration}ms`
            });
            
            return recipes;
          }
        }
      } catch (error) {
        log('warn', 'Recipe save worker search failed', {
          requestId,
          category: categoryName,
          error: error.message
        });
      }
    }

    // Final fallback: return enhanced dish names with mock recipe structure
    log('debug', 'No recipes found, returning enhanced dish names', {
      requestId,
      category: categoryName
    });
    
    const enhancedDishes = dishNames.slice(0, limit).map((dish, index) => ({
      id: `dish_${categoryName.toLowerCase().replace(/\s+/g, '_')}_${index}`,
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
      id: `fallback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: dish,
      type: 'dish_suggestion',
      source: 'fallback',
      fallback: true
    }));
  }
}

function getSeason(date) {
  const month = date.getMonth();
  if (month >= 2 && month <= 4) return 'Spring';
  if (month >= 5 && month <= 7) return 'Summer';
  if (month >= 8 && month <= 10) return 'Fall';
  return 'Winter';
}

function getMockRecommendations(location, date, recipesPerCategory, requestId) {
  const startTime = Date.now();
  
  log('info', 'Generating mock recommendations', { 
    requestId,
    location: location || 'not_specified',
    date,
    recipesPerCategory
  });
  
  // Handle edge cases for location
  const hasLocation = location && location.trim() !== '';
  const trimmedLocation = hasLocation ? location.trim() : null;
  
  // Handle edge cases for recipesPerCategory
  const actualLimit = Math.max(1, Math.min(recipesPerCategory || 3, 10));
  
  // Provide sensible mock data based on date
  let dateObj;
  try {
    dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) {
      // Invalid date, use current date
      dateObj = new Date();
    }
  } catch (error) {
    // Invalid date, use current date
    dateObj = new Date();
  }
  
  const month = dateObj.getMonth();
  const season = getSeason(dateObj);
  
  // Determine if we have location and if it's PNW
  const isPNW = hasLocation && (trimmedLocation.includes('Seattle') || trimmedLocation.includes('Portland') || 
                 trimmedLocation.includes('Washington') || trimmedLocation.includes('Oregon') || 
                 trimmedLocation.includes('PNW') || trimmedLocation.includes('Pacific'));
  
  // Check for upcoming holiday
  const upcomingHoliday = getUpcomingHoliday(date);
  
  log('debug', 'Mock recommendations context', {
    requestId,
    hasLocation,
    trimmedLocation,
    isPNW,
    upcomingHoliday,
    season,
    date: dateObj.toISOString()
  });

  const seasonalRecommendations = {
    'Spring': {
      'Garden-Fresh Spring Delights': ['asparagus risotto', 'strawberry spinach salad', 'pea soup', 'spring onion tart'],
      'Bright & Breezy Brunch': ['lemon ricotta pancakes', 'herb frittata', 'citrus salad', 'basil pesto pasta'],
      'Easter Celebration Feast': ['honey glazed lamb', 'deviled eggs', 'hot cross buns', 'carrot cake']
    },
    'Summer': {
      'Sun-Kissed Summer Harvest': ['heirloom tomato salad', 'grilled corn salad', 'zucchini fritters', 'berry cobbler'],
      'Backyard BBQ Classics': ['smoky beef burgers', 'chicken kebabs', 'grilled salmon', 'elote corn'],
      'Cool & Refreshing Treats': ['watermelon gazpacho', 'homemade ice cream', 'cucumber salad', 'fruit smoothies']
    },
    'Fall': {
      'Autumn Harvest Bounty': ['pumpkin risotto', 'apple cider chicken', 'butternut squash soup', 'mushroom wellington'],
      'Cozy Fireside Comfort': ['beef stew', 'chicken pot pie', 'shepherd\'s pie', 'spiced apple cider'],
      'Halloween & Harvest Festival': ['pumpkin pie', 'apple crisp', 'spiced nuts', 'caramel apples']
    },
    'Winter': {
      'Winter Citrus Celebration': ['orange glazed duck', 'kale caesar salad', 'roasted brussels sprouts', 'pomegranate salad'],
      'Hearth & Home Warmers': ['beef chili', 'hot chocolate', 'mulled wine', 'French onion soup'],
      'Holiday Magic Menu': ['roast turkey', 'honey glazed ham', 'gingerbread cookies', 'eggnog cheesecake']
    }
  };

  // Build recommendations object dynamically
  let recommendations = {};
  
  // First category: Seasonal - use the first category from seasonalRecommendations
  const seasonalCategoryName = Object.keys(seasonalRecommendations[season])[0];
  const seasonalDishes = seasonalRecommendations[season][seasonalCategoryName];
  recommendations[seasonalCategoryName] = seasonalDishes.slice(0, actualLimit).map((dish, index) => ({
    id: `seasonal_${season.toLowerCase()}_${index}`,
    name: dish,
    description: `A delicious ${dish.toLowerCase()} perfect for ${season.toLowerCase()}`,
    ingredients: [`Fresh seasonal ingredients for ${dish.toLowerCase()}`],
    instructions: [`Prepare ${dish.toLowerCase()} according to your favorite recipe`],
    image_url: null,
    source_url: null,
    type: 'dish_suggestion',
    source: 'mock_seasonal',
    fallback: true
  }));
  
  // Second category: Location-based or practical
  if (!hasLocation) {
    // No location - provide practical everyday recipes
    const practicalCategory = getContextualCategory(season, date, false);
    const practicalRecipes = {
      "Easy Weeknight Dinners": ['pasta primavera', 'stir-fry', 'sheet pan chicken', 'tacos'],
      "Meal Prep Favorites": ['grain bowls', 'overnight oats', 'mason jar salads', 'burritos'],
      "30-Minute Meals": ['quick curry', 'pan-seared fish', 'vegetable fried rice', 'quesadillas'],
      "One-Pot Wonders": ['jambalaya', 'risotto', 'chili', 'pasta bake'],
      "Budget-Friendly Eats": ['bean soup', 'egg fried rice', 'lentil curry', 'vegetable pasta']
    };
    const practicalDishes = practicalRecipes[practicalCategory] || 
      ['simple pasta', 'rice bowls', 'sandwiches', 'salads'];
    
    recommendations[practicalCategory] = practicalDishes.slice(0, actualLimit).map((dish, index) => ({
      id: `practical_${index}`,
      name: dish,
      description: `A practical and delicious ${dish.toLowerCase()} for everyday cooking`,
      ingredients: [`Essential ingredients for ${dish.toLowerCase()}`],
      instructions: [`Cook ${dish.toLowerCase()} using your preferred method`],
      image_url: null,
      source_url: null,
      type: 'dish_suggestion',
      source: 'mock_practical',
      fallback: true
    }));
  } else if (isPNW) {
    const pnwDishes = ['cedar plank salmon', 'dungeness crab cakes', 'grilled oysters', 'chanterelle risotto'];
    recommendations['Pacific Northwest Coastal Cuisine'] = pnwDishes.slice(0, actualLimit).map((dish, index) => ({
      id: `pnw_${index}`,
      name: dish,
      description: `A Pacific Northwest specialty: ${dish.toLowerCase()}`,
      ingredients: [`Fresh local ingredients for ${dish.toLowerCase()}`],
      instructions: [`Prepare ${dish.toLowerCase()} using traditional PNW methods`],
      image_url: null,
      source_url: null,
      type: 'dish_suggestion',
      source: 'mock_pnw',
      fallback: true
    }));
  } else {
    // Generic local specialties with creative name based on location
    const locationName = trimmedLocation.split(',')[0].trim(); // Get first part of location
    const localDishes = ['farmers market salad', 'artisan bread', 'local cheese plate', 'seasonal vegetable tart'];
    recommendations[`${locationName} Local Favorites`] = localDishes.slice(0, actualLimit).map((dish, index) => ({
      id: `local_${locationName.toLowerCase().replace(/\s+/g, '_')}_${index}`,
      name: dish,
      description: `A local favorite from ${locationName}: ${dish.toLowerCase()}`,
      ingredients: [`Fresh local ingredients for ${dish.toLowerCase()}`],
      instructions: [`Prepare ${dish.toLowerCase()} using local techniques`],
      image_url: null,
      source_url: null,
      type: 'dish_suggestion',
      source: 'mock_local',
      fallback: true
    }));
  }
  
  // Third category: Holiday or contextual
  if (upcomingHoliday) {
    const holidayRecipes = {
      "Christmas": ['turkey', 'ham', 'cookies', 'gingerbread', 'eggnog'],
      "Thanksgiving": ['turkey', 'stuffing', 'pumpkin pie', 'cranberry sauce', 'sweet potatoes'],
      "Halloween": ['pumpkin soup', 'candy apples', 'spider cookies', 'witch fingers'],
      "Independence Day": ['BBQ ribs', 'flag cake', 'watermelon salad', 'corn salad'],
      "Easter": ['lamb', 'deviled eggs', 'hot cross buns', 'carrot cake'],
      "Valentine's Day": ['chocolate fondue', 'red velvet cake', 'strawberry desserts', 'romantic dinner'],
      "New Year's Day": ['black-eyed peas', 'champagne cocktails', 'appetizers', 'brunch dishes']
    };
    // Create more creative holiday category names
    const holidayNames = {
      "Christmas": "Christmas Magic Menu",
      "Thanksgiving": "Thanksgiving Harvest Table",
      "Halloween": "Spooky Halloween Delights",
      "Independence Day": "Fourth of July Celebration",
      "Easter": "Easter Brunch Bliss",
      "Valentine's Day": "Romantic Valentine Feast",
      "New Year's Day": "New Year Fresh Start"
    };
    const holidayName = holidayNames[upcomingHoliday] || `${upcomingHoliday} Celebration`;
    // Try to get recipes for the exact holiday name first, then try without "'s Day"
    const holidayDishes = holidayRecipes[upcomingHoliday] || 
      holidayRecipes[upcomingHoliday.replace("'s Day", "")] ||
      ['festive cookies', 'celebration cake', 'party appetizers', 'special drinks'];
    
    recommendations[holidayName] = holidayDishes.slice(0, actualLimit).map((dish, index) => ({
      id: `holiday_${upcomingHoliday.toLowerCase().replace(/\s+/g, '_')}_${index}`,
      name: dish,
      description: `A festive ${dish.toLowerCase()} perfect for ${upcomingHoliday}`,
      ingredients: [`Celebratory ingredients for ${dish.toLowerCase()}`],
      instructions: [`Prepare ${dish.toLowerCase()} with holiday spirit`],
      image_url: null,
      source_url: null,
      type: 'dish_suggestion',
      source: 'mock_holiday',
      fallback: true
    }));
  } else {
    // No holiday - use contextual category
    // Make sure we don't duplicate the second category if no location
    const contextCategory = getContextualCategory(season, date, true); // Always pass true to get weather-based categories
    const contextRecipes = {
      "Cozy Comfort Foods": ['mac and cheese', 'pot roast', 'chicken soup', 'shepherds pie'],
      "Refreshing Salads": ['greek salad', 'quinoa salad', 'fruit salad', 'caesar salad'],
      "No-Cook Meals": ['cold sandwiches', 'salad bowls', 'overnight oats', 'smoothie bowls'],
      "Hearty One-Pot Meals": ['beef stew', 'cassoulet', 'paella', 'pot pie'],
      "Light & Fresh Dishes": ['ceviche', 'spring rolls', 'poke bowls', 'gazpacho'],
      "Warming Soups & Stews": ['minestrone', 'french onion soup', 'beef stew', 'lentil soup'],
      "Garden-Fresh Recipes": ['caprese salad', 'ratatouille', 'herb-crusted fish', 'veggie wraps'],
      "Picnic Perfect": ['pasta salad', 'sandwich wraps', 'fruit kabobs', 'deviled eggs'],
      "Brunch Favorites": ['frittata', 'pancakes', 'avocado toast', 'breakfast burrito'],
      "Tropical Flavors": ['fish tacos', 'mango salsa', 'coconut rice', 'tropical smoothie'],
      "Farmers Market Finds": ['vegetable tart', 'fresh salsa', 'grilled vegetables', 'berry cobbler'],
      "Harvest Celebrations": ['stuffed squash', 'apple crisp', 'root vegetable gratin', 'pumpkin soup'],
      "Slow Cooker Favorites": ['pot roast', 'chicken stew', 'pulled pork', 'vegetable curry'],
      "Baking Projects": ['sourdough bread', 'cinnamon rolls', 'pie', 'cookies'],
      "Hot Drinks & Treats": ['hot chocolate', 'mulled cider', 'chai latte', 'warm cookies'],
      "Indoor Comfort Foods": ['lasagna', 'shepherd\'s pie', 'baked ziti', 'stuffed peppers']
    };
    
    // Get appropriate recipes for the context category
    const contextDishes = contextRecipes[contextCategory] || 
      seasonalRecommendations[season][Object.keys(seasonalRecommendations[season])[2]] ||
      ['seasonal soup', 'comfort dish', 'family favorite', 'easy dinner'];
    
    // Ensure contextCategory is defined before using it
    if (contextCategory) {
      recommendations[contextCategory] = contextDishes.slice(0, actualLimit).map((dish, index) => ({
        id: `context_${contextCategory.toLowerCase().replace(/\s+/g, '_')}_${index}`,
        name: dish,
        description: `A perfect ${dish.toLowerCase()} for ${contextCategory.toLowerCase()}`,
        ingredients: [`Quality ingredients for ${dish.toLowerCase()}`],
        instructions: [`Prepare ${dish.toLowerCase()} with care and attention`],
        image_url: null,
        source_url: null,
        type: 'dish_suggestion',
        source: 'mock_context',
        fallback: true
      }));
    } else {
      // Fallback if contextCategory is undefined
      const fallbackDishes = ['seasonal soup', 'comfort dish', 'family favorite', 'easy dinner'];
      recommendations['Seasonal Comfort'] = fallbackDishes.slice(0, actualLimit).map((dish, index) => ({
        id: `fallback_${index}`,
        name: dish,
        description: `A delicious ${dish.toLowerCase()} for any season`,
        ingredients: [`Quality ingredients for ${dish.toLowerCase()}`],
        instructions: [`Prepare ${dish.toLowerCase()} with care and attention`],
        image_url: null,
        source_url: null,
        type: 'dish_suggestion',
        source: 'mock_fallback',
        fallback: true
      }));
    }
  }

  const duration = Date.now() - startTime;
  metrics.timing('mock_generation_duration', duration);
  metrics.increment('mock_recommendations_generated', 1, {
    hasLocation: String(hasLocation),
    season,
    isPNW: String(isPNW),
    recipesPerCategory: actualLimit
  });

  log('info', 'Mock recommendations generated', {
    requestId,
    duration: `${duration}ms`,
    categoriesGenerated: Object.keys(recommendations).length,
    hasLocation,
    season,
    recipesPerCategory: actualLimit,
    totalRecipes: Object.values(recommendations).reduce((sum, recipes) => sum + recipes.length, 0),
    categories: Object.keys(recommendations)
  });

  return {
    recommendations: recommendations,
    location: hasLocation ? location : 'Not specified',
    date: date,
    season: season,
    isMockData: true,
    processingMetrics: {
      totalDuration: `${duration}ms`
    },
    note: 'These are mock recommendations. Deploy to Cloudflare Workers for AI-powered suggestions with actual recipe data.'
  };
}

// Export functions for testing
export { 
  getRecipeRecommendations, 
  getSeason, 
  getMockRecommendations, 
  enhanceRecommendationsWithRecipes, 
  searchRecipeByCategory 
};