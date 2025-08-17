/**
 * Recipe Recommendation Worker
 * Provides recipe recommendations based on location and date using OpenAI models
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // Enable CORS
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      switch (url.pathname) {
        case '/recommendations':
          if (request.method === 'POST') {
            return await handleRecommendations(request, env, corsHeaders);
          }
          // Method not allowed for non-POST requests
          return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        case '/health':
          return new Response(JSON.stringify({ status: 'healthy' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        default:
          return new Response(JSON.stringify({ error: 'Not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
      }
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};

async function handleRecommendations(request, env, corsHeaders) {
  try {
    // Parse request body
    const body = await request.json();
    const { location, date } = body;

    // Validate input
    if (!location) {
      return new Response(JSON.stringify({ error: 'Location is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use current date if not provided
    const recommendationDate = date || new Date().toISOString().split('T')[0];

    // Get recommendations from the recommendation service
    const recommendations = await getRecipeRecommendations(location, recommendationDate, env);

    return new Response(JSON.stringify(recommendations), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error getting recommendations:', error);
    return new Response(JSON.stringify({ error: 'Failed to get recommendations' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

async function getRecipeRecommendations(location, date, env) {
  // Check if we have AI binding
  if (!env.AI) {
    console.warn('AI binding not configured, returning mock data');
    return getMockRecommendations(location, date);
  }

  // Format the date for better context
  const dateObj = new Date(date);
  const month = dateObj.toLocaleString('default', { month: 'long' });
  const season = getSeason(dateObj);

  // Create a more concise prompt for better performance
  const prompt = `Location: ${location}, Date: ${date} (${month}, ${season})

Generate 3 recipe categories with 4 tags each. Consider local cuisine, seasonal ingredients, and holidays.

Return ONLY this JSON format:
{
  "recommendations": {
    "Seasonal Favorites": ["tag1", "tag2", "tag3", "tag4"],
    "Local Specialties": ["tag1", "tag2", "tag3", "tag4"],
    "Holiday Treats": ["tag1", "tag2", "tag3", "tag4"]
  }
}`;

  try {
    console.log('Calling Cloudflare AI with Llama 3.1 8B model');
    
    // Use faster Llama 3.1 8B model instead of GPT-OSS-20B
    const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      prompt: prompt,
      max_tokens: 256  // Limit tokens for faster response
    });

    console.log('Cloudflare AI response received. Response type:', typeof response);

    if (!response || typeof response !== 'object') {
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
      console.error('Unexpected response structure:', response);
      throw new Error('Could not extract content from AI response');
    }

    console.log('Extracted content:', content);

    // Parse the JSON response
    try {
      // Try to extract JSON from the response if it contains extra text
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        // Add metadata to the response
        return {
          ...parsed,
          location: location,
          date: date,
          season: season
        };
      }
      
      // If the entire response is valid JSON
      const parsed = JSON.parse(content);
      return {
        ...parsed,
        location: location,
        date: date,
        season: season
      };
    } catch (parseError) {
      console.error('Failed to parse AI response:', content);
      throw parseError;
    }
  } catch (error) {
    console.error('Cloudflare AI error:', error);
    // Fallback to mock data
    return getMockRecommendations(location, date);
  }
}

function getSeason(date) {
  const month = date.getMonth();
  if (month >= 2 && month <= 4) return 'Spring';
  if (month >= 5 && month <= 7) return 'Summer';
  if (month >= 8 && month <= 10) return 'Fall';
  return 'Winter';
}

function getMockRecommendations(location, date) {
  // Provide sensible mock data based on date
  const dateObj = new Date(date);
  const month = dateObj.getMonth();
  const season = getSeason(dateObj);

  const seasonalRecommendations = {
    'Spring': {
      'Seasonal Favorites': ['asparagus', 'strawberries', 'peas', 'spring onions', 'fresh herbs'],
      'Light & Fresh': ['salads', 'grilled vegetables', 'citrus', 'mint', 'basil'],
      'Easter Specials': ['lamb', 'eggs', 'hot cross buns', 'carrot cake']
    },
    'Summer': {
      'Seasonal Favorites': ['tomatoes', 'corn', 'zucchini', 'berries', 'stone fruits'],
      'BBQ & Grilling': ['burgers', 'kebabs', 'grilled fish', 'corn on the cob'],
      'Refreshing Dishes': ['gazpacho', 'ice cream', 'cold salads', 'smoothies']
    },
    'Fall': {
      'Seasonal Favorites': ['pumpkin', 'apples', 'squash', 'mushrooms', 'root vegetables'],
      'Comfort Foods': ['soups', 'stews', 'casseroles', 'roasts', 'warm spices'],
      'Harvest Treats': ['apple pie', 'pumpkin bread', 'cider', 'nuts']
    },
    'Winter': {
      'Seasonal Favorites': ['citrus', 'kale', 'brussels sprouts', 'pomegranate', 'cranberries'],
      'Warming Dishes': ['chili', 'hot chocolate', 'mulled wine', 'hearty soups'],
      'Holiday Favorites': ['turkey', 'ham', 'cookies', 'gingerbread', 'eggnog']
    }
  };

  return {
    recommendations: seasonalRecommendations[season],
    location: location,
    date: date,
    season: season,
    note: 'These are mock recommendations. Deploy to Cloudflare Workers for AI-powered suggestions.'
  };
}

// Export functions for testing
export { getRecipeRecommendations, getSeason, getMockRecommendations };