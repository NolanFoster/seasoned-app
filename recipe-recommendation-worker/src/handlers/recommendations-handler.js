/**
 * Recommendations endpoint handler - processes recipe recommendation requests
 * Now with Cloudflare Cache API support for improved performance
 */

import { log, generateRequestId } from '../../../shared/utility-functions.js';
import { metrics, categorizeError, sendAnalytics } from '../shared-utilities.js';
import { getRecipeRecommendations } from '../recommendation-service.js';

export async function handleRecommendations(request, env, corsHeaders, requestId) {
  const startTime = Date.now();
  
  try {
    log('info', 'Processing recommendations request', { requestId });
    
    // Parse request body
    const body = await request.json();
    const { location, date, limit = 3, aiGenerated = 0 } = body; // Default limit is 3 recipes per category, 0 AI-generated

    // Validate and log input parameters
    const hasLocation = location && location.trim() !== '';
    const recommendationDate = date || new Date().toISOString().split('T')[0];
    const recipesPerCategory = Math.min(Math.max(parseInt(limit) || 3, 1), 10); // Limit between 1-10
    const aiGeneratedCount = Math.min(Math.max(parseInt(aiGenerated) || 0, 0), 10); // AI-generated between 0-10
    
    // Generate cache key based on request parameters
    const cacheKey = new URL(`https://cache.recommendations.com/api/recommendations`);
    cacheKey.searchParams.set('location', hasLocation ? location.toLowerCase().trim() : 'none');
    cacheKey.searchParams.set('date', recommendationDate);
    cacheKey.searchParams.set('limit', recipesPerCategory.toString());
    cacheKey.searchParams.set('aiGenerated', aiGeneratedCount.toString());
    
    // Try to get cached response
    const cache = caches.default;
    const cachedResponse = await cache.match(cacheKey);
    
    if (cachedResponse) {
      // Found in cache - return cached response
      const cachedData = await cachedResponse.json();
      const duration = Date.now() - startTime;
      
      log('info', 'Returning cached recommendations', {
        requestId,
        duration: `${duration}ms`,
        cacheKey: cacheKey.toString(),
        cachedAt: cachedResponse.headers.get('X-Cached-At')
      });
      
      metrics.increment('recommendations_cache_hit', 1);
      metrics.timing('recommendations_cache_duration', duration);
      
      // Send cache hit analytics
      await sendAnalytics(env, 'recommendations_cache_hit', {
        requestId,
        hasLocation,
        location: hasLocation ? location : null,
        date: recommendationDate,
        duration,
        recipesPerCategory,
        aiGeneratedCount
      });
      
      // Return cached response with updated headers
      return new Response(JSON.stringify({
        ...cachedData,
        requestId,
        processingTime: `${duration}ms`,
        cached: true,
        cachedAt: cachedResponse.headers.get('X-Cached-At')
      }), {
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600', // 1 hour
          'X-Cache': 'HIT'
        },
      });
    }
    
    log('info', 'Recommendation parameters parsed', {
      requestId,
      hasLocation,
      location: hasLocation ? location : 'not_specified',
      date: recommendationDate,
      recipesPerCategory,
      aiGeneratedCount
    });

    // Track recommendation request metrics
    metrics.increment('recommendations_requested', 1, {
      hasLocation: String(hasLocation),
      dateProvided: String(!!date),
      limitProvided: String(!!limit),
      aiGeneratedRequested: String(aiGeneratedCount > 0)
    });

    // Get recommendations from the recommendation service
    const recommendations = await getRecipeRecommendations(location, recommendationDate, recipesPerCategory, aiGeneratedCount, env, requestId);

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
      aiGeneratedCount,
      totalRecipes: recommendations.recommendations ? 
        Object.values(recommendations.recommendations).reduce((sum, recipes) => sum + recipes.length, 0) : 0,
      isAIGenerated: !recommendations.isMockData,
      season: recommendations.season
    });

    // Cache the successful response
    const responseData = {
      ...recommendations,
      requestId,
      processingTime: `${duration}ms`,
      recipesPerCategory,
      aiGeneratedCount
    };
    
    const responseToCache = new Response(JSON.stringify(responseData), {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600', // 1 hour cache
        'X-Cached-At': new Date().toISOString()
      },
    });
    
    // Store in cache asynchronously (don't wait for it)
    const cachePromise = cache.put(cacheKey, responseToCache.clone());
    
    log('info', 'Caching recommendations response', {
      requestId,
      cacheKey: cacheKey.toString(),
      ttl: '3600s'
    });
    
    metrics.increment('recommendations_cache_write', 1);
    
    // Don't wait for cache write to complete, but log any errors
    cachePromise.catch(error => {
      log('error', 'Failed to cache recommendations', {
        requestId,
        cacheKey: cacheKey.toString(),
        error: error.message
      });
      metrics.increment('recommendations_cache_write_error', 1);
    });
    
    // Return response with cache headers
    return new Response(JSON.stringify(responseData), {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600', // 1 hour
        'X-Cache': 'MISS'
      },
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
