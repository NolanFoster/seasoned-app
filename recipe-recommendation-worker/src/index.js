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

    // Location is now optional - we'll provide general recommendations if not specified
    
    // Use provided date or current date
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

  return {
    recommendations: recommendations,
    location: location || 'Not specified',
    date: date,
    season: season,
    note: 'These are mock recommendations. Deploy to Cloudflare Workers for AI-powered suggestions.'
  };
}

// Export functions for testing
export { getRecipeRecommendations, getSeason, getMockRecommendations };