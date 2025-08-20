/**
 * Recipe Recommendation Worker
 * Provides recipe recommendations based on location and date using OpenAI models
 */

// Utility function for structured logging
function log(level, message, data = {}, context = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    worker: 'recipe-recommendation-worker',
    ...data,
    ...context
  };
  
  // Use appropriate console method based on level
  switch (level.toLowerCase()) {
    case 'error':
      console.error(JSON.stringify(logEntry));
      break;
    case 'warn':
      console.warn(JSON.stringify(logEntry));
      break;
    case 'info':
      console.log(JSON.stringify(logEntry));
      break;
    case 'debug':
      console.log(JSON.stringify(logEntry));
      break;
    default:
      console.log(JSON.stringify(logEntry));
  }
}

// Generate unique request ID for tracking
function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Metrics collection utility
class MetricsCollector {
  constructor() {
    this.metrics = new Map();
  }

  increment(metric, value = 1, tags = {}) {
    const key = `${metric}:${JSON.stringify(tags)}`;
    const current = this.metrics.get(key) || { count: 0, tags };
    current.count += value;
    this.metrics.set(key, current);
  }

  timing(metric, duration, tags = {}) {
    const key = `${metric}_duration:${JSON.stringify(tags)}`;
    const current = this.metrics.get(key) || { 
      count: 0, 
      total: 0, 
      min: Infinity, 
      max: -Infinity, 
      tags 
    };
    current.count += 1;
    current.total += duration;
    current.min = Math.min(current.min, duration);
    current.max = Math.max(current.max, duration);
    current.avg = current.total / current.count;
    this.metrics.set(key, current);
  }

  getMetrics() {
    const result = {};
    for (const [key, value] of this.metrics.entries()) {
      result[key] = value;
    }
    return result;
  }

  reset() {
    this.metrics.clear();
  }
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
    const { location, date } = body;

    // Validate and log input parameters
    const hasLocation = location && location.trim() !== '';
    const recommendationDate = date || new Date().toISOString().split('T')[0];
    
    log('info', 'Recommendation parameters parsed', {
      requestId,
      hasLocation,
      location: hasLocation ? location : 'not_specified',
      date: recommendationDate
    });

    // Track recommendation request metrics
    metrics.increment('recommendations_requested', 1, {
      hasLocation: String(hasLocation),
      dateProvided: String(!!date)
    });

    // Get recommendations from the recommendation service
    const recommendations = await getRecipeRecommendations(location, recommendationDate, env, requestId);

    const duration = Date.now() - startTime;
    metrics.timing('recommendations_duration', duration);
    
    log('info', 'Recommendations generated successfully', {
      requestId,
      duration: `${duration}ms`,
      categoriesCount: recommendations.recommendations ? Object.keys(recommendations.recommendations).length : 0
    });

    // Send recommendation success analytics
    await sendAnalytics(env, 'recommendations_generated', {
      requestId,
      hasLocation,
      location: hasLocation ? location : null,
      date: recommendationDate,
      duration,
      categoriesCount: recommendations.recommendations ? Object.keys(recommendations.recommendations).length : 0,
      isAIGenerated: !recommendations.isMockData,
      season: recommendations.season
    });

    return new Response(JSON.stringify({
      ...recommendations,
      requestId,
      processingTime: `${duration}ms`
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

async function getRecipeRecommendations(location, date, env, requestId) {
  const startTime = Date.now();
  
  // Check if we have AI binding
  if (!env.AI) {
    log('warn', 'AI binding not configured, falling back to mock data', { requestId });
    metrics.increment('ai_fallback_to_mock', 1, { reason: 'no_binding' });
    return getMockRecommendations(location, date, requestId);
  }

  // Format the date for better context
  const dateObj = new Date(date);
  const month = dateObj.toLocaleString('default', { month: 'long' });
  const season = getSeason(dateObj);
  
  // Determine categories dynamically
  const hasLocation = location && location.trim() !== '';
  const isPNW = hasLocation && (location.includes('Pacific') || location.includes('PNW') || 
                location.includes('Seattle') || location.includes('Portland') || 
                location.includes('Washington') || location.includes('Oregon'));
  
  const upcomingHoliday = getUpcomingHoliday(date);
  
  // Build category names
  const category1 = `${season} Favorites`;
  const category2 = hasLocation ? 
    (isPNW ? 'PNW Specialties' : 'Local Specialties') : 
    getContextualCategory(season, date, false);
  const category3 = upcomingHoliday ? 
    `${upcomingHoliday} Treats` : 
    getContextualCategory(season, date, hasLocation);

  // Create enhanced prompt with more context
  const locationContext = hasLocation ? `Location: ${location}` : 'Location: Not specified';
  const promptContext = hasLocation ? 
    'Consider local cuisine and regional ingredients.' : 
    'Focus on practical, accessible recipes that work anywhere.';
  
  const holidayContext = upcomingHoliday ? 
    `There's ${upcomingHoliday} coming up within a week.` : 
    `The weather is typical for ${season.toLowerCase()}.`;

  const prompt = `${locationContext}, Date: ${date} (${month}, ${season})
${holidayContext} ${promptContext}

Generate 3 recipe categories with 4 food/dish tags each:
1. "${category1}" - seasonal ingredients and dishes perfect for ${season.toLowerCase()}
2. "${category2}" - ${hasLocation ? 'regional specialties and local favorites' : 'practical everyday recipes'}
3. "${category3}" - ${upcomingHoliday ? 'festive treats and celebration foods' : 'recipes that match the mood and weather'}

Return ONLY this JSON format with actual food/dish names (not "tag1", "tag2"):
{
  "recommendations": {
    "${category1}": ["dish1", "dish2", "dish3", "dish4"],
    "${category2}": ["dish1", "dish2", "dish3", "dish4"],
    "${category3}": ["dish1", "dish2", "dish3", "dish4"]
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
      max_tokens: 256  // Limit tokens for faster response
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

      // Add metadata to the response
      return {
        ...parsed,
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
    return getMockRecommendations(location, date, requestId);
  }
}

function getSeason(date) {
  const month = date.getMonth();
  if (month >= 2 && month <= 4) return 'Spring';
  if (month >= 5 && month <= 7) return 'Summer';
  if (month >= 8 && month <= 10) return 'Fall';
  return 'Winter';
}

function getMockRecommendations(location, date, requestId) {
  const startTime = Date.now();
  
  log('info', 'Generating mock recommendations', { 
    requestId,
    location: location || 'not_specified',
    date 
  });
  
  // Provide sensible mock data based on date
  const dateObj = new Date(date);
  const month = dateObj.getMonth();
  const season = getSeason(dateObj);
  
  // Determine if we have location and if it's PNW
  const hasLocation = location && location.trim() !== '';
  const isPNW = hasLocation && (location.includes('Seattle') || location.includes('Portland') || 
                 location.includes('Washington') || location.includes('Oregon') || 
                 location.includes('PNW') || location.includes('Pacific'));
  
  // Check for upcoming holiday
  const upcomingHoliday = getUpcomingHoliday(date);

  const seasonalRecommendations = {
    'Spring': {
      'Spring Favorites': ['asparagus', 'strawberries', 'peas', 'spring onions', 'fresh herbs'],
      'Light & Fresh': ['salads', 'grilled vegetables', 'citrus', 'mint', 'basil'],
      'Easter Specials': ['lamb', 'eggs', 'hot cross buns', 'carrot cake']
    },
    'Summer': {
      'Summer Favorites': ['tomatoes', 'corn', 'zucchini', 'berries', 'stone fruits'],
      'BBQ & Grilling': ['burgers', 'kebabs', 'grilled fish', 'corn on the cob'],
      'Refreshing Dishes': ['gazpacho', 'ice cream', 'cold salads', 'smoothies']
    },
    'Fall': {
      'Fall Favorites': ['pumpkin', 'apples', 'squash', 'mushrooms', 'root vegetables'],
      'Comfort Foods': ['soups', 'stews', 'casseroles', 'roasts', 'warm spices'],
      'Halloween & Thanksgiving Treats': ['apple pie', 'pumpkin bread', 'cider', 'nuts']
    },
    'Winter': {
      'Winter Favorites': ['citrus', 'kale', 'brussels sprouts', 'pomegranate', 'cranberries'],
      'Warming Dishes': ['chili', 'hot chocolate', 'mulled wine', 'hearty soups'],
      'Christmas & New Year Favorites': ['turkey', 'ham', 'cookies', 'gingerbread', 'eggnog']
    }
  };

  // Build recommendations object dynamically
  let recommendations = {};
  
  // First category: Seasonal Favorites
  recommendations[`${season} Favorites`] = seasonalRecommendations[season][`${season} Favorites`];
  
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
    recommendations[practicalCategory] = practicalRecipes[practicalCategory] || 
      ['simple pasta', 'rice bowls', 'sandwiches', 'salads'];
  } else if (isPNW) {
    recommendations['PNW Specialties'] = ['salmon', 'dungeness crab', 'oysters', 'chanterelle mushrooms', 'blackberries'];
  } else {
    // Generic local specialties
    recommendations['Local Specialties'] = ['farmers market finds', 'regional bread', 'local cheese', 'seasonal produce'];
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
    const holidayName = `${upcomingHoliday} Treats`;
    recommendations[holidayName] = holidayRecipes[upcomingHoliday.replace("'s Day", "")] || 
      ['festive cookies', 'celebration cake', 'party appetizers', 'special drinks'];
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
    recommendations[contextCategory] = contextRecipes[contextCategory] || 
      seasonalRecommendations[season][Object.keys(seasonalRecommendations[season])[2]] ||
      ['seasonal soup', 'comfort dish', 'family favorite', 'easy dinner'];
  }

  const duration = Date.now() - startTime;
  metrics.timing('mock_generation_duration', duration);
      metrics.increment('mock_recommendations_generated', 1, {
      hasLocation: String(hasLocation),
      season,
      isPNW: String(isPNW)
    });

  log('info', 'Mock recommendations generated', {
    requestId,
    duration: `${duration}ms`,
    categoriesGenerated: Object.keys(recommendations).length,
    hasLocation,
    season
  });

  return {
    recommendations: recommendations,
    location: location || 'Not specified',
    date: date,
    season: season,
    isMockData: true,
    processingMetrics: {
      totalDuration: `${duration}ms`
    },
    note: 'These are mock recommendations. Deploy to Cloudflare Workers for AI-powered suggestions.'
  };
}

// Export functions for testing
export { getRecipeRecommendations, getSeason, getMockRecommendations };