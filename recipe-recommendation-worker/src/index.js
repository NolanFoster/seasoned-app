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
  // Check if we have an API key
  if (!env.OPENAI_API_KEY) {
    console.warn('OPENAI_API_KEY not configured, returning mock data');
    return getMockRecommendations(location, date);
  }

  // Format the date for better context
  const dateObj = new Date(date);
  const month = dateObj.toLocaleString('default', { month: 'long' });
  const season = getSeason(dateObj);

  // Create the prompt
  const prompt = `Based on my location (${location}) and the date (${date} - ${month}, ${season}), give me 3 relevant categories each with a list of tags for recipe recommendations. Consider local cuisine, seasonal ingredients, and any holidays or cultural events around this time. Provide the output in JSON format.

Example format:
{
  "recommendations": {
    "Seasonal Favorites": ["pumpkin", "apple", "cinnamon", "warm spices"],
    "Local Specialties": ["seafood", "clam chowder", "lobster roll"],
    "Holiday Treats": ["thanksgiving", "turkey", "stuffing", "cranberry"]
  }
}`;

  try {
    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful culinary assistant that provides recipe recommendations based on location and season. Always respond with valid JSON.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    // Parse the JSON response
    try {
      const parsed = JSON.parse(content);
      return parsed;
    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', content);
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw parseError;
    }
  } catch (error) {
    console.error('OpenAI API error:', error);
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
    note: 'These are mock recommendations. Configure OPENAI_API_KEY for AI-powered suggestions.'
  };
}

// Export functions for testing
export { getRecipeRecommendations, getSeason, getMockRecommendations };