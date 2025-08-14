// Recipe Clipper Worker using Cloudflare Workers AI with GPT-4o-mini model
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
              // Clip recipe from URL using GPT-OSS-20B
      if (pathname === '/clip' && request.method === 'POST') {
        const body = await request.json();
        const pageUrl = body.url;
        
        if (!pageUrl) {
          return new Response('URL is required', { 
            status: 400,
            headers: corsHeaders
          });
        }
        
        try {
          const recipe = await extractRecipeWithGPT(pageUrl, env);
          if (!recipe) {
            return new Response('No recipe could be extracted', { 
              status: 404,
              headers: corsHeaders
            });
          }
          
          return new Response(JSON.stringify(recipe), { 
            status: 200, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } catch (e) {
          console.error('Recipe extraction error:', e);
          return new Response('Error extracting recipe: ' + e.message, { 
            status: 500,
            headers: corsHeaders
          });
        }
      }

      // Health check endpoint
      if (pathname === '/health' && request.method === 'GET') {
        return new Response(JSON.stringify({ status: 'healthy', service: 'recipe-clipper' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response('Not Found', { 
        status: 404,
        headers: corsHeaders
      });
    } catch (error) {
      console.error('Recipe Clipper Error:', error);
      return new Response('Internal Server Error', { 
        status: 500,
        headers: corsHeaders
      });
    }
  }
};

// Extract recipe using GPT-OSS-20B model
async function extractRecipeWithGPT(pageUrl, env) {
  try {
    console.log('Fetching content from:', pageUrl);
    
    // Fetch the webpage content
    const response = await fetch(pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const html = await response.text();
    console.log('HTML fetched, length:', html.length);
    
    // Clean HTML content for GPT processing - optimized for token reduction
    const cleanedHtml = cleanHtmlForGPT(html);
    console.log('Cleaned HTML length:', cleanedHtml.length);
    
    // Call GPT-OSS-20B model to extract recipe (pass raw HTML)
    const recipe = await callGPTModel(cleanedHtml, pageUrl, env);
    
    if (recipe) {
      console.log('Recipe extracted successfully with GPT:', {
        name: recipe.name,
        ingredients: recipe.recipeIngredient?.length || 0,
        instructions: recipe.recipeInstructions?.length || 0
      });
      
      // Check if instructions were extracted properly
      if (!recipe.recipeInstructions || recipe.recipeInstructions.length === 0) {
        console.log('AI model failed to extract instructions, trying HTML fallback...');
        const fallbackInstructions = extractInstructionsFromHTML(html);
        if (fallbackInstructions && fallbackInstructions.length > 0) {
          console.log('Fallback HTML extraction found instructions:', fallbackInstructions.length);
          recipe.recipeInstructions = fallbackInstructions.map(instruction => ({
            "@type": "HowToStep",
            text: instruction
          }));
          // Also update backward compatibility fields
          recipe.instructions = fallbackInstructions;
        }
      }
      
      // Try to extract additional fields from HTML if AI didn't get them
      if (!recipe.description || recipe.description.length < 10) {
        const extractedDescription = extractDescriptionFromHTML(html);
        if (extractedDescription) {
          recipe.description = extractedDescription;
        }
      }
      
      if (!recipe.author || recipe.author.length < 2) {
        const extractedAuthor = extractAuthorFromHTML(html);
        if (extractedAuthor) {
          recipe.author = extractedAuthor;
        }
      }
      
      if (!recipe.datePublished || recipe.datePublished.length < 5) {
        const extractedDate = extractDateFromHTML(html);
        if (extractedDate) {
          recipe.datePublished = extractedDate;
        }
      }
      
      if (!recipe.recipeYield || recipe.recipeYield.length < 3) {
        const extractedYield = extractYieldFromHTML(html);
        if (extractedYield) {
          recipe.recipeYield = extractedYield;
        }
      }
      
      if (!recipe.recipeCategory || recipe.recipeCategory.length < 3) {
        const extractedCategory = extractCategoryFromHTML(html);
        if (extractedCategory) {
          recipe.recipeCategory = extractedCategory;
        }
      }
      
      if (!recipe.recipeCuisine || recipe.recipeCuisine.length < 3) {
        const extractedCuisine = extractCuisineFromHTML(html);
        if (extractedCuisine) {
          recipe.recipeCuisine = extractedCuisine;
        }
      }
      
      if (!recipe.prepTime || recipe.prepTime.length < 3) {
        const extractedPrepTime = extractPrepTimeFromHTML(html);
        if (extractedPrepTime) {
          recipe.prepTime = extractedPrepTime;
        }
      }
      
      if (!recipe.cookTime || recipe.cookTime.length < 3) {
        const extractedCookTime = extractCookTimeFromHTML(html);
        if (extractedCookTime) {
          recipe.cookTime = extractedCookTime;
        }
      }
      
      if (!recipe.totalTime || recipe.totalTime.length < 3) {
        const extractedTotalTime = extractTotalTimeFromHTML(html);
        if (extractedTotalTime) {
          recipe.totalTime = extractedTotalTime;
        }
      }
      
      if (!recipe.keywords || recipe.keywords.length < 5) {
        const extractedKeywords = extractKeywordsFromHTML(html);
        if (extractedKeywords) {
          recipe.keywords = extractedKeywords;
        }
      }
      
      // Try to extract nutrition information if not present
      if (!recipe.nutrition || !recipe.nutrition.calories) {
        const extractedNutrition = extractNutritionFromHTML(html);
        if (extractedNutrition) {
          recipe.nutrition = extractedNutrition;
        }
      }
      
      // Try to extract rating information if not present
      if (!recipe.aggregateRating || !recipe.aggregateRating.ratingValue) {
        const extractedRating = extractRatingFromHTML(html);
        if (extractedRating) {
          recipe.aggregateRating = extractedRating;
        }
      }
      
      // Try to extract video information if not present
      if (!recipe.video || !recipe.video.contentUrl) {
        const extractedVideo = extractVideoFromHTML(html);
        if (extractedVideo) {
          recipe.video = extractedVideo;
        }
      }
    } else {
      console.log('No recipe extracted - AI returned null or empty data');
    }
    
    return recipe;
  } catch (error) {
    console.error('Error in GPT recipe extraction:', error);
    throw error;
  }
}

// Enhanced HTML extraction functions for additional recipe fields

// Extract description from HTML
function extractDescriptionFromHTML(html) {
  try {
    // Look for meta description
    const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i);
    if (metaDescMatch) {
      return metaDescMatch[1].trim();
    }
    
    // Look for og:description
    const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["'][^>]*>/i);
    if (ogDescMatch) {
      return ogDescMatch[1].trim();
    }
    
    // Look for recipe description in content
    const descPatterns = [
      /<p[^>]*class="[^"]*description[^"]*"[^>]*>([^<]+)<\/p>/i,
      /<div[^>]*class="[^"]*description[^"]*"[^>]*>([^<]+)<\/div>/i,
      /<span[^>]*class="[^"]*description[^"]*"[^>]*>([^<]+)<\/span>/i
    ];
    
    for (const pattern of descPatterns) {
      const match = html.match(pattern);
      if (match && match[1].trim().length > 20) {
        return match[1].trim();
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting description:', error);
    return null;
  }
}

// Extract author from HTML
function extractAuthorFromHTML(html) {
  try {
    // Look for meta author
    const metaAuthorMatch = html.match(/<meta[^>]*name=["']author["'][^>]*content=["']([^"']+)["'][^>]*>/i);
    if (metaAuthorMatch) {
      return metaAuthorMatch[1].trim();
    }
    
    // Look for og:author
    const ogAuthorMatch = html.match(/<meta[^>]*property=["']og:author["'][^>]*content=["']([^"']+)["'][^>]*>/i);
    if (ogAuthorMatch) {
      return ogAuthorMatch[1].trim();
    }
    
    // Look for author in byline patterns
    const authorPatterns = [
      /<span[^>]*class="[^"]*author[^"]*"[^>]*>([^<]+)<\/span>/i,
      /<div[^>]*class="[^"]*author[^"]*"[^>]*>([^<]+)<\/div>/i,
      /<p[^>]*class="[^"]*author[^"]*"[^>]*>([^<]+)<\/p>/i,
      /by\s+([^<,]+)/i,
      /author[:\s]+([^<,]+)/i
    ];
    
    for (const pattern of authorPatterns) {
      const match = html.match(pattern);
      if (match && match[1].trim().length > 2 && match[1].trim().length < 50) {
        return match[1].trim();
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting author:', error);
    return null;
  }
}

// Extract publication date from HTML
function extractDateFromHTML(html) {
  try {
    // Look for meta publication date
    const metaDateMatch = html.match(/<meta[^>]*property=["'](?:og:published_time|article:published_time)["'][^>]*content=["']([^"']+)["'][^>]*>/i);
    if (metaDateMatch) {
      const dateStr = metaDateMatch[1].trim();
      // Try to parse and format as YYYY-MM-DD
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
    }
    
    // Look for date in text patterns
    const datePatterns = [
      /published\s+(?:on\s+)?([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
      /updated\s+(?:on\s+)?([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
      /date[:\s]+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i
    ];
    
    for (const pattern of datePatterns) {
      const match = html.match(pattern);
      if (match) {
        const dateStr = match[1].trim();
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0];
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting date:', error);
    return null;
  }
}

// Extract recipe yield (servings) from HTML
function extractYieldFromHTML(html) {
  try {
    const yieldPatterns = [
      /serves?\s+(\d+(?:\s*-\s*\d+)?(?:\s*people?)?)/i,
      /yield[:\s]+(\d+(?:\s*-\s*\d+)?(?:\s*people?)?)/i,
      /servings?[:\s]+(\d+(?:\s*-\s*\d+)?(?:\s*people?)?)/i,
      /makes?\s+(\d+(?:\s*-\s*\d+)?(?:\s*people?)?)/i,
      /(\d+(?:\s*-\s*\d+)?)\s*servings?/i,
      /(\d+(?:\s*-\s*\d+)?)\s*people?/i
    ];
    
    for (const pattern of yieldPatterns) {
      const match = html.match(pattern);
      if (match && match[1].trim().length > 0) {
        return match[1].trim();
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting yield:', error);
    return null;
  }
}

// Extract recipe category from HTML
function extractCategoryFromHTML(html) {
  try {
    const categoryPatterns = [
      /<span[^>]*class="[^"]*category[^"]*"[^>]*>([^<]+)<\/span>/i,
      /<div[^>]*class="[^"]*category[^"]*"[^>]*>([^<]+)<\/div>/i,
      /category[:\s]+([^<,]+)/i,
      /type[:\s]+([^<,]+)/i
    ];
    
    for (const pattern of categoryPatterns) {
      const match = html.match(pattern);
      if (match && match[1].trim().length > 2 && match[1].trim().length < 30) {
        return match[1].trim();
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting category:', error);
    return null;
  }
}

// Extract recipe cuisine from HTML
function extractCuisineFromHTML(html) {
  try {
    const cuisinePatterns = [
      /<span[^>]*class="[^"]*cuisine[^"]*"[^>]*>([^<]+)<\/span>/i,
      /<div[^>]*class="[^"]*cuisine[^"]*"[^>]*>([^<]+)<\/div>/i,
      /cuisine[:\s]+([^<,]+)/i,
      /style[:\s]+([^<,]+)/i
    ];
    
    for (const pattern of cuisinePatterns) {
      const match = html.match(pattern);
      if (match && match[1].trim().length > 2 && match[1].trim().length < 30) {
        return match[1].trim();
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting cuisine:', error);
    return null;
  }
}

// Extract prep time from HTML
function extractPrepTimeFromHTML(html) {
  try {
    const prepTimePatterns = [
      /prep(?:aration)?\s+time[:\s]+([^<,]+)/i,
      /prep[:\s]+([^<,]+)/i,
      /preparation[:\s]+([^<,]+)/i
    ];
    
    for (const pattern of prepTimePatterns) {
      const match = html.match(pattern);
      if (match && match[1].trim().length > 0) {
        const timeStr = match[1].trim();
        return convertTimeToISO8601(timeStr);
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting prep time:', error);
    return null;
  }
}

// Extract cook time from HTML
function extractCookTimeFromHTML(html) {
  try {
    const cookTimePatterns = [
      /cook(?:ing)?\s+time[:\s]+([^<,]+)/i,
      /cook[:\s]+([^<,]+)/i,
      /cooking[:\s]+([^<,]+)/i
    ];
    
    for (const pattern of cookTimePatterns) {
      const match = html.match(pattern);
      if (match && match[1].trim().length > 0) {
        const timeStr = match[1].trim();
        return convertTimeToISO8601(timeStr);
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting cook time:', error);
    return null;
  }
}

// Extract total time from HTML
function extractTotalTimeFromHTML(html) {
  try {
    const totalTimePatterns = [
      /total\s+time[:\s]+([^<,]+)/i,
      /total[:\s]+([^<,]+)/i,
      /time[:\s]+([^<,]+)/i
    ];
    
    for (const pattern of totalTimePatterns) {
      const match = html.match(pattern);
      if (match && match[1].trim().length > 0) {
        const timeStr = match[1].trim();
        return convertTimeToISO8601(timeStr);
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting total time:', error);
    return null;
  }
}

// Convert time string to ISO 8601 format
function convertTimeToISO8601(timeStr) {
  try {
    const lowerTime = timeStr.toLowerCase();
    
    // Handle "X minutes" format
    const minutesMatch = lowerTime.match(/(\d+)\s*minutes?/);
    if (minutesMatch) {
      return `PT${minutesMatch[1]}M`;
    }
    
    // Handle "X hours" format
    const hoursMatch = lowerTime.match(/(\d+)\s*hours?/);
    if (hoursMatch) {
      return `PT${hoursMatch[1]}H`;
    }
    
    // Handle "X hours Y minutes" format
    const hoursMinutesMatch = lowerTime.match(/(\d+)\s*hours?\s+(\d+)\s*minutes?/);
    if (hoursMinutesMatch) {
      return `PT${hoursMinutesMatch[1]}H${hoursMinutesMatch[2]}M`;
    }
    
    // Handle "X hr Y min" format
    const hrMinMatch = lowerTime.match(/(\d+)\s*hr\s+(\d+)\s*min/);
    if (hrMinMatch) {
      return `PT${hrMinMatch[1]}H${hrMinMatch[2]}M`;
    }
    
    // Return original if no pattern matches
    return timeStr;
  } catch (error) {
    console.error('Error converting time to ISO 8601:', error);
    return timeStr;
  }
}

// Extract keywords from HTML
function extractKeywordsFromHTML(html) {
  try {
    // Look for meta keywords
    const metaKeywordsMatch = html.match(/<meta[^>]*name=["']keywords["'][^>]*content=["']([^"']+)["'][^>]*>/i);
    if (metaKeywordsMatch) {
      return metaKeywordsMatch[1].trim();
    }
    
    // Look for og:keywords
    const ogKeywordsMatch = html.match(/<meta[^>]*property=["']og:keywords["'][^>]*content=["']([^"']+)["'][^>]*>/i);
    if (ogKeywordsMatch) {
      return ogKeywordsMatch[1].trim();
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting keywords:', error);
    return null;
  }
}

// Extract nutrition information from HTML
function extractNutritionFromHTML(html) {
  try {
    const nutrition = {};
    
    // Look for calories
    const caloriesMatch = html.match(/(\d+)\s*calories?/i);
    if (caloriesMatch) {
      nutrition.calories = `${caloriesMatch[1]} calories`;
    }
    
    // Look for protein
    const proteinMatch = html.match(/(\d+(?:\.\d+)?)\s*g?\s*protein/i);
    if (proteinMatch) {
      nutrition.proteinContent = `${proteinMatch[1]}g`;
    }
    
    // Look for fat
    const fatMatch = html.match(/(\d+(?:\.\d+)?)\s*g?\s*fat/i);
    if (fatMatch) {
      nutrition.fatContent = `${fatMatch[1]}g`;
    }
    
    // Look for carbohydrates
    const carbMatch = html.match(/(\d+(?:\.\d+)?)\s*g?\s*(?:carbohydrates?|carbs?)/i);
    if (carbMatch) {
      nutrition.carbohydrateContent = `${carbMatch[1]}g`;
    }
    
    // Look for fiber
    const fiberMatch = html.match(/(\d+(?:\.\d+)?)\s*g?\s*fiber/i);
    if (fiberMatch) {
      nutrition.fiberContent = `${fiberMatch[1]}g`;
    }
    
    // Look for sugar
    const sugarMatch = html.match(/(\d+(?:\.\d+)?)\s*g?\s*sugar/i);
    if (sugarMatch) {
      nutrition.sugarContent = `${sugarMatch[1]}g`;
    }
    
    // Look for sodium
    const sodiumMatch = html.match(/(\d+(?:\.\d+)?)\s*mg?\s*sodium/i);
    if (sodiumMatch) {
      nutrition.sodiumContent = `${sodiumMatch[1]}mg`;
    }
    
    // Look for cholesterol
    const cholesterolMatch = html.match(/(\d+(?:\.\d+)?)\s*mg?\s*cholesterol/i);
    if (cholesterolMatch) {
      nutrition.cholesterolContent = `${cholesterolMatch[1]}mg`;
    }
    
    // Only return if we found some nutrition data
    if (Object.keys(nutrition).length > 0) {
      return {
        "@type": "NutritionInformation",
        ...nutrition
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting nutrition:', error);
    return null;
  }
}

// Extract rating information from HTML
function extractRatingFromHTML(html) {
  try {
    const rating = {};
    
    // Look for rating value
    const ratingValueMatch = html.match(/(\d+(?:\.\d+)?)\s*out\s*of\s*5/i);
    if (ratingValueMatch) {
      rating.ratingValue = parseFloat(ratingValueMatch[1]);
    }
    
    // Look for rating count
    const ratingCountMatch = html.match(/(\d+)\s*ratings?/i);
    if (ratingCountMatch) {
      rating.ratingCount = parseInt(ratingCountMatch[1]);
    }
    
    // Look for review count
    const reviewCountMatch = html.match(/(\d+)\s*reviews?/i);
    if (reviewCountMatch) {
      rating.reviewCount = parseInt(reviewCountMatch[1]);
    }
    
    // Only return if we found some rating data
    if (Object.keys(rating).length > 0) {
      return {
        "@type": "AggregateRating",
        ...rating
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting rating:', error);
    return null;
  }
}

// Extract video information from HTML
function extractVideoFromHTML(html) {
  try {
    const video = {};
    
    // Look for video URL
    const videoUrlMatch = html.match(/<video[^>]*src=["']([^"']+)["'][^>]*>/i) ||
                          html.match(/<iframe[^>]*src=["']([^"']+)["'][^>]*>/i);
    if (videoUrlMatch) {
      video.contentUrl = videoUrlMatch[1];
    }
    
    // Look for video title
    const videoTitleMatch = html.match(/<video[^>]*title=["']([^"']+)["'][^>]*>/i);
    if (videoTitleMatch) {
      video.name = videoTitleMatch[1];
    }
    
    // Only return if we found video data
    if (video.contentUrl) {
      return {
        "@type": "VideoObject",
        ...video
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting video:', error);
    return null;
  }
}

// Fallback function to extract instructions from HTML when AI model fails
function extractInstructionsFromHTML(html) {
  try {
    console.log('Attempting fallback HTML instruction extraction...');
    
    // Try multiple patterns to find recipe instructions
    const patterns = [
      // Look for numbered lists (common in recipes)
      /<ol[^>]*>([\s\S]*?)<\/ol>/gi,
      // Look for unordered lists
      /<ul[^>]*>([\s\S]*?)<\/ul>/gi,
      // Look for paragraphs that might contain steps
      /<p[^>]*>([^<]+(?:step|instruction|direction|method)[^<]*)<\/p>/gi,
      // Look for divs with instruction-related classes
      /<div[^>]*class="[^"]*(?:instruction|direction|step|method)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
      // Look for sections with instruction-related content
      /<section[^>]*>([\s\S]*?(?:instruction|direction|step|method)[\s\S]*?)<\/section>/gi
    ];
    
    let instructions = [];
    
    for (const pattern of patterns) {
      const matches = html.match(pattern);
      if (matches) {
        for (const match of matches) {
          // Extract text content from HTML
          const textContent = match.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
          
          // Split by common delimiters
          const potentialSteps = textContent.split(/(?:\.|;|,|\n|•|\*|\-)/);
          
          for (const step of potentialSteps) {
            const cleanStep = step.trim();
            // Filter out steps that are too short or too long, or contain unwanted content
            if (cleanStep.length > 10 && 
                cleanStep.length < 300 && 
                !cleanStep.toLowerCase().includes('privacy') &&
                !cleanStep.toLowerCase().includes('cookie') &&
                !cleanStep.toLowerCase().includes('terms') &&
                !cleanStep.toLowerCase().includes('©') &&
                !cleanStep.toLowerCase().includes('advertisement') &&
                !cleanStep.toLowerCase().includes('weeknight dinners') &&
                !cleanStep.toLowerCase().includes('work lunches') &&
                !cleanStep.toLowerCase().includes('holiday cooking') &&
                !cleanStep.toLowerCase().includes('budget recipes') &&
                !cleanStep.toLowerCase().includes('family dinners') &&
                !cleanStep.toLowerCase().includes('plant-based') &&
                !cleanStep.toLowerCase().includes('shop all') &&
                !cleanStep.toLowerCase().includes('download here') &&
                !cleanStep.toLowerCase().includes('related recipes') &&
                !cleanStep.toLowerCase().includes('close') &&
                !cleanStep.toLowerCase().includes('submenu') &&
                !cleanStep.toLowerCase().includes('featured') &&
                !cleanStep.toLowerCase().includes('cookware') &&
                !cleanStep.toLowerCase().includes('share via') &&
                !cleanStep.toLowerCase().includes('print') &&
                !cleanStep.toLowerCase().includes('inspired by') &&
                (cleanStep.toLowerCase().includes('step') || 
                 cleanStep.toLowerCase().includes('mix') ||
                 cleanStep.toLowerCase().includes('add') ||
                 cleanStep.toLowerCase().includes('bake') ||
                 cleanStep.toLowerCase().includes('cook') ||
                 cleanStep.toLowerCase().includes('preheat') ||
                 cleanStep.toLowerCase().includes('whisk') ||
                 cleanStep.toLowerCase().includes('fold') ||
                 cleanStep.toLowerCase().includes('chill') ||
                 cleanStep.toLowerCase().includes('cool') ||
                 cleanStep.toLowerCase().includes('sift') ||
                 cleanStep.toLowerCase().includes('line') ||
                 cleanStep.toLowerCase().includes('scoop') ||
                 cleanStep.toLowerCase().includes('spread') ||
                 cleanStep.toLowerCase().includes('remove') ||
                 cleanStep.toLowerCase().includes('serve'))) {
              instructions.push(cleanStep);
            }
          }
        }
      }
    }
    
    // If we still don't have instructions, try a more aggressive approach
    if (instructions.length === 0) {
      console.log('Standard patterns failed, trying aggressive HTML parsing...');
      
      // Look for any content that looks like cooking instructions
      const allText = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
      const sentences = allText.split(/[.!?]+/);
      
      for (const sentence of sentences) {
        const cleanSentence = sentence.trim();
        if (cleanSentence.length > 20 && 
            cleanSentence.length < 200 &&
            (cleanSentence.toLowerCase().includes('bowl') ||
             cleanSentence.toLowerCase().includes('mix') ||
             cleanSentence.toLowerCase().includes('add') ||
             cleanSentence.toLowerCase().includes('bake') ||
             cleanSentence.toLowerCase().includes('cook') ||
             cleanSentence.toLowerCase().includes('preheat') ||
             cleanSentence.toLowerCase().includes('whisk') ||
             cleanSentence.toLowerCase().includes('fold') ||
             cleanSentence.toLowerCase().includes('chill') ||
             cleanSentence.toLowerCase().includes('cool') ||
             cleanSentence.toLowerCase().includes('oven') ||
             cleanSentence.toLowerCase().includes('sheet') ||
             cleanSentence.toLowerCase().includes('minutes') ||
             cleanSentence.toLowerCase().includes('degrees'))) {
          instructions.push(cleanSentence);
        }
      }
    }
    
    // Clean up the instructions - remove duplicates and filter out navigation text
    instructions = [...new Set(instructions)]
      .filter(instruction => {
        const lower = instruction.toLowerCase();
        // Filter out navigation and non-recipe content
        return !lower.includes('weeknight dinners') &&
               !lower.includes('work lunches') &&
               !lower.includes('holiday cooking') &&
               !lower.includes('budget recipes') &&
               !lower.includes('family dinners') &&
               !lower.includes('plant-based') &&
               !lower.includes('shop all') &&
               !lower.includes('download here') &&
               !lower.includes('related recipes') &&
               !lower.includes('close') &&
               !lower.includes('submenu') &&
               !lower.includes('featured') &&
               !lower.includes('cookware') &&
               !lower.includes('share via') &&
               !lower.includes('print') &&
               !lower.includes('inspired by') &&
               !lower.includes('tasty logo') &&
               !lower.includes('buzzfeed logo') &&
               !lower.includes('search') &&
               !lower.includes('menu') &&
               !lower.includes('newsletter') &&
               !lower.includes('follow') &&
               !lower.includes('advertise') &&
               !lower.includes('feedback') &&
               !lower.includes('community') &&
               !lower.includes('privacy') &&
               !lower.includes('terms') &&
               !lower.includes('accessibility') &&
               !lower.includes('values') &&
               instruction.length > 10 &&
               instruction.length < 200;
      })
      .slice(0, 15); // Limit to 15 clean instructions
    
    console.log('Fallback HTML extraction found instructions:', instructions.length);
    return instructions;
    
  } catch (error) {
    console.error('Error in fallback HTML instruction extraction:', error);
    return [];
  }
}

// Clean up common JSON formatting issues
function cleanJsonContent(jsonString) {
  try {
    // Remove any trailing commas before closing braces/brackets
    let cleaned = jsonString
      .replace(/,(\s*[}\]])/g, '$1')
      .replace(/,(\s*})/g, '$1');
    
    // Fix common quote issues
    cleaned = cleaned
      .replace(/[\u201C\u201D]/g, '"')  // Replace smart quotes
      .replace(/[\u2018\u2019]/g, "'"); // Replace smart apostrophes
    
    // Try to find and fix unterminated strings by looking for unescaped quotes
    const lines = cleaned.split('\n');
    const fixedLines = lines.map(line => {
      // Count quotes in the line
      const quoteCount = (line.match(/"/g) || []).length;
      if (quoteCount % 2 === 1) {
        // Odd number of quotes, likely unterminated string
        // Add a quote at the end if it looks like it's missing
        if (line.trim().endsWith(',')) {
          return line.trim().slice(0, -1) + '",';
        } else if (!line.trim().endsWith('"')) {
          return line + '"';
        }
      }
      return line;
    });
    
    cleaned = fixedLines.join('\n');
    
    console.log('Cleaned JSON content (first 300 chars):', cleaned.substring(0, 300) + '...');
    return cleaned;
  } catch (error) {
    console.error('Error cleaning JSON:', error);
    return jsonString; // Return original if cleaning fails
  }
}

// Clean HTML content for GPT processing - optimized for token reduction
function cleanHtmlForGPT(html) {
  // Remove script tags, style tags, and other non-content elements
  let cleanHtml = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
    .replace(/<canvas\b[^<]*(?:(?!<\/canvas>)<[^<]*)*<\/canvas>/gi, '')
    .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/<applet\b[^<]*(?:(?!<\/applet>)<[^<]*)*<\/applet>/gi, '');

  // Remove navigation, header, footer, and sidebar content
  cleanHtml = cleanHtml
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
    .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, '')
    .replace(/<menu\b[^<]*(?:(?!<\/menu>)<[^<]*)*<\/menu>/gi, '');

  // Remove common navigation and footer content by class/id patterns
  cleanHtml = cleanHtml
    .replace(/<div[^>]*class\s*=\s*["'][^"']*(?:nav|menu|footer|header|sidebar|breadcrumb|pagination|social|share|comment|ad|banner|promo)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/<ul[^>]*class\s*=\s*["'][^"']*(?:nav|menu|breadcrumb|pagination)[^"']*["'][^>]*>[\s\S]*?<\/ul>/gi, '')
    .replace(/<section[^>]*class\s*=\s*["'][^"']*(?:nav|menu|footer|header|sidebar|ad|banner|promo)[^"']*["'][^>]*>[\s\S]*?<\/section>/gi, '');

  // Remove common ad and promotional content
  cleanHtml = cleanHtml
    .replace(/<div[^>]*id\s*=\s*["'][^"']*(?:ad|banner|promo|sponsor|commercial)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/<div[^>]*class\s*=\s*["'][^"']*(?:ad|banner|promo|sponsor|commercial)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '');

  // Remove social media widgets and sharing buttons
  cleanHtml = cleanHtml
    .replace(/<div[^>]*class\s*=\s*["'][^"']*(?:social|share|facebook|twitter|instagram|pinterest)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/<a[^>]*class\s*=\s*["'][^"']*(?:social|share|facebook|twitter|instagram|pinterest)[^"']*["'][^>]*>[\s\S]*?<\/a>/gi, '');

  // Remove comment sections
  cleanHtml = cleanHtml
    .replace(/<div[^>]*class\s*=\s*["'][^"']*(?:comment|review|rating)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/<section[^>]*class\s*=\s*["'][^"']*(?:comment|review|rating)[^"']*["'][^>]*>[\s\S]*?<\/section>/gi, '');

  // Remove excessive whitespace and normalize
  cleanHtml = cleanHtml
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .replace(/\s+</g, '<')
    .replace(/>\s+/g, '>')
    .trim();

  // Remove HTML comments
  cleanHtml = cleanHtml.replace(/<!--[\s\S]*?-->/g, '');

  // Remove empty tags
  cleanHtml = cleanHtml.replace(/<[^\/>][^>]*><\/[^>]*>/g, '');

  // Try to extract recipe-specific content first before limiting length
  const recipeContent = extractRecipeContent(cleanHtml);
  if (recipeContent && recipeContent.length > 0) {
    console.log('Found recipe-specific content, length:', recipeContent.length);
    cleanHtml = recipeContent;
  }

  // Limit length to avoid token limits - more conservative approach
  if (cleanHtml.length > 15000) {
    console.log('HTML too long, truncating from', cleanHtml.length, 'to 15000 characters');
    cleanHtml = cleanHtml.substring(0, 15000) + '...';
  }

  return cleanHtml;
}

// Extract recipe-specific content to prioritize important parts
function extractRecipeContent(html) {
  // Look for common recipe content patterns
  const recipeSelectors = [
    // AllRecipes specific
    '[class*="recipe-content"]',
    '[class*="ingredients"]',
    '[class*="instructions"]',
    '[class*="directions"]',
    '[class*="method"]',
    '[class*="steps"]',
    // Generic recipe patterns
    '[class*="recipe"]',
    '[class*="cooking"]',
    '[class*="preparation"]',
    // Common recipe containers
    'main',
    'article',
    '.content',
    '.main-content',
    '.recipe-container'
  ];

  let recipeContent = '';
  
  // Try to find recipe-specific content
  for (const selector of recipeSelectors) {
    try {
      // Simple regex-based extraction for common patterns
      if (selector.includes('ingredients')) {
        const match = html.match(/<[^>]*ingredients?[^>]*>[\s\S]*?<\/[^>]*>/gi);
        if (match) recipeContent += match.join(' ') + ' ';
      }
      if (selector.includes('instructions') || selector.includes('directions')) {
        const match = html.match(/<[^>]*instructions?[^>]*>[\s\S]*?<\/[^>]*>/gi) || 
                     html.match(/<[^>]*directions?[^>]*>[\s\S]*?<\/[^>]*>/gi);
        if (match) recipeContent += match.join(' ') + ' ';
      }
      if (selector.includes('preparation')) {
        // Specifically look for "preparation" sections (like Tasty uses)
        const match = html.match(/<[^>]*preparation[^>]*>[\s\S]*?<\/[^>]*>/gi);
        if (match) recipeContent += match.join(' ') + ' ';
      }
      if (selector.includes('recipe')) {
        const match = html.match(/<[^>]*recipe[^>]*>[\s\S]*?<\/[^>]*>/gi);
        if (match) recipeContent += match.join(' ') + ' ';
      }
    } catch (e) {
      // Continue if regex fails
      continue;
    }
  }

  // Special handling for Tasty's specific format
  // Look for numbered preparation steps that might not be in obvious containers
  const tastyPreparationMatch = html.match(/(?:<h[1-6][^>]*>.*?preparation.*?<\/h[1-6]>[\s\S]*?)(?:<ol[^>]*>[\s\S]*?<\/ol>|<ul[^>]*>[\s\S]*?<\/ul>)/gi);
  if (tastyPreparationMatch) {
    recipeContent += tastyPreparationMatch.join(' ') + ' ';
  }

  // Enhanced: Look for nutrition information sections
  const nutritionMatch = html.match(/<[^>]*nutrition[^>]*>[\s\S]*?<\/[^>]*>/gi);
  if (nutritionMatch) {
    recipeContent += nutritionMatch.join(' ') + ' ';
  }

  // Enhanced: Look for time information sections
  const timeMatch = html.match(/<[^>]*time[^>]*>[\s\S]*?<\/[^>]*>/gi);
  if (timeMatch) {
    recipeContent += timeMatch.join(' ') + ' ';
  }

  // Enhanced: Look for serving/yield information
  const yieldMatch = html.match(/<[^>]*serving[^>]*>[\s\S]*?<\/[^>]*>/gi) || 
                     html.match(/<[^>]*yield[^>]*>[\s\S]*?<\/[^>]*>/gi);
  if (yieldMatch) {
    recipeContent += yieldMatch.join(' ') + ' ';
  }

  // Enhanced: Look for author and date information
  const authorMatch = html.match(/<[^>]*author[^>]*>[\s\S]*?<\/[^>]*>/gi) ||
                      html.match(/<[^>]*byline[^>]*>[\s\S]*?<\/[^>]*>/gi);
  if (authorMatch) {
    recipeContent += authorMatch.join(' ') + ' ';
  }

  // Enhanced: Look for category and cuisine information
  const categoryMatch = html.match(/<[^>]*category[^>]*>[\s\S]*?<\/[^>]*>/gi) ||
                        html.match(/<[^>]*cuisine[^>]*>[\s\S]*?<\/[^>]*>/gi);
  if (categoryMatch) {
    recipeContent += categoryMatch.join(' ') + ' ';
  }

  // Enhanced: Look for rating and review information
  const ratingMatch = html.match(/<[^>]*rating[^>]*>[\s\S]*?<\/[^>]*>/gi) ||
                      html.match(/<[^>]*review[^>]*>[\s\S]*?<\/[^>]*>/gi);
  if (ratingMatch) {
    recipeContent += ratingMatch.join(' ') + ' ';
  }

  // If we found recipe content, return it; otherwise return original
  return recipeContent.length > 100 ? recipeContent : html;
}

// Call GPT-OSS-20B model using Cloudflare Workers AI
async function callGPTModel(htmlContent, pageUrl, env) {
  try {
    // Check if we have the AI binding
    if (!env.AI) {
      console.log('AI binding not available, cannot extract recipe without AI model');
      throw new Error('AI binding not available - recipe extraction requires Cloudflare Workers AI');
    }
    
    console.log('AI binding available, proceeding with AI call...');
    
    const prompt = `You are a recipe extraction expert. Extract a recipe from the following raw HTML content and format it according to Google's Recipe structured data schema.

IMPORTANT: You must return ONLY a valid JSON object with NO additional text, markdown formatting, or explanations. The response must be parseable by JSON.parse().

Return this exact JSON structure matching Google's Recipe schema:
{
  "name": "Recipe name",
  "image": "URL of the main recipe image (REQUIRED)",
  "description": "Brief description of the recipe",
  "author": "Author name if available",
  "datePublished": "Publication date in ISO format (YYYY-MM-DD) if available",
  "prepTime": "Preparation time in ISO 8601 format (e.g., PT15M for 15 minutes, PT1H for 1 hour)",
  "cookTime": "Cooking time in ISO 8601 format (e.g., PT30M for 30 minutes, PT2H for 2 hours)",
  "totalTime": "Total time in ISO 8601 format if available",
  "recipeYield": "Number of servings (e.g., '4 servings', '6 people')",
  "recipeCategory": "Recipe category (e.g., 'Main Course', 'Dessert', 'Appetizer')",
  "recipeCuisine": "Cuisine type (e.g., 'Italian', 'Mexican', 'Asian')",
  "keywords": "Comma-separated keywords",
  "recipeIngredient": ["ingredient 1", "ingredient 2", ...],
  "recipeInstructions": [
    {
      "@type": "HowToStep",
      "text": "step 1 description"
    },
    {
      "@type": "HowToStep", 
      "text": "step 2 description"
    }
  ],
  "nutrition": {
    "@type": "NutritionInformation",
    "calories": "calories per serving",
    "proteinContent": "protein amount",
    "fatContent": "fat amount",
    "carbohydrateContent": "carbohydrate amount",
    "fiberContent": "fiber amount",
    "sugarContent": "sugar amount",
    "sodiumContent": "sodium amount",
    "cholesterolContent": "cholesterol amount",
    "saturatedFatContent": "saturated fat amount",
    "transFatContent": "trans fat amount",
    "unsaturatedFatContent": "unsaturated fat amount",
    "servingSize": "serving size description"
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "average rating (1-5)",
    "ratingCount": "number of ratings",
    "reviewCount": "number of reviews"
  },
  "video": {
    "@type": "VideoObject",
    "name": "video title if available",
    "description": "video description if available",
    "contentUrl": "video URL if available"
  }
}

CRITICAL REQUIREMENTS:
- NO markdown code blocks (\`\`\`json)
- NO explanations or reasoning text
- NO trailing commas
- All strings must be properly quoted
- Arrays must be properly closed
- If no recipe is found, return: null
- Use ISO 8601 duration format for times (PT15M = 15 minutes, PT1H30M = 1 hour 30 minutes)
- Follow Google's Recipe schema exactly for field names
- Extract EVERY possible field from the HTML content
- Look for nutrition information in tables, lists, or text
- Look for ratings and reviews in the page
- Look for video content and metadata
- Look for author information in bylines, credits, or meta tags
- Look for publication dates in meta tags, headers, or text
- Look for recipe categories and cuisine types in navigation, breadcrumbs, or text
- Look for serving sizes in ingredient lists, headers, or text
- Look for keywords in meta tags, titles, or surrounding text

The HTML content contains the full webpage. Focus on extracting clear, actionable ingredients and step-by-step instructions from the recipe content. Ignore navigation, ads, and other non-recipe elements.

IMPORTANT: Look for recipe instructions under various section names including:
- "Instructions" or "Directions"
- "Preparation" (common on Tasty and other sites)
- "Method" or "Steps"
- Any numbered list that appears to be cooking steps

IMPORTANT: Look for nutrition information in:
- Nutrition facts tables
- Ingredient lists with nutritional values
- Text mentioning calories, protein, fat, etc.
- Meta tags with nutrition data

IMPORTANT: Look for time information in:
- "Prep time", "Cook time", "Total time" sections
- Text mentioning minutes, hours, or cooking duration
- Meta tags with time data

IMPORTANT: Look for author information in:
- Byline sections
- "By [Author]" text
- Meta tags with author data
- Footer credits

IMPORTANT: Look for publication dates in:
- Meta tags (og:published_time, article:published_time)
- Date stamps in headers or text
- "Published on" or "Updated on" text

HTML Content:
${htmlContent}`;

    console.log('Calling Cloudflare AI with prompt length:', prompt.length);
    
    // Use Cloudflare Workers AI binding
    const response = await env.AI.run('@cf/openai/gpt-oss-20b', {
      instructions: 'You are a recipe extraction expert. Extract recipes from HTML content and return clean JSON.',
      input: prompt
    });

    console.log('Cloudflare AI response received. Response type:', typeof response);
    console.log('Response keys:', Object.keys(response || {}));

    if (!response || typeof response !== 'object') {
      throw new Error('Invalid response from Cloudflare AI - expected object but got: ' + typeof response);
    }

    // Extract the text content from the response structure
    let content;
    try {
      console.log('Response structure analysis:', {
        hasSource: !!response.source,
        hasOutput: !!(response.output),
        outputLength: response.output?.length || 0,
        output0Content: !!(response.output?.[0]?.content),
        output0ContentLength: response.output?.[0]?.content?.length || 0,
        output0Content0Text: !!(response.output?.[0]?.content?.[0]?.text),
        output1Content: !!(response.output?.[1]?.content),
        output1ContentLength: response.output?.[1]?.content?.length || 0,
        output1Content0Text: !!(response.output?.[1]?.content?.[0]?.text)
      });
      
      // The response structure has the content in response.output array
      // The last message (output[1]) contains the actual recipe JSON
      if (response.output && response.output.length >= 2 && 
          response.output[1] && response.output[1].content && 
          response.output[1].content[0] && response.output[1].content[0].text) {
        content = response.output[1].content[0].text;
        console.log('Successfully extracted content from last message (output[1])');
        console.log('Content length:', content.length);
        console.log('Content preview (first 500 chars):', content.substring(0, 500) + '...');
        console.log('Content preview (last 500 chars):', '...' + content.substring(Math.max(0, content.length - 500)));
      } else if (response.output && response.output.length >= 1 && 
                 response.output[0] && response.output[0].content && 
                 response.output[0].content[0] && response.output[0].content[0].text) {
        // Fallback to first message if second doesn't exist
        content = response.output[0].content[0].text;
        console.log('Using first message content as fallback');
        console.log('Content length:', content.length);
        console.log('Content preview (first 500 chars):', content.substring(0, 500) + '...');
        console.log('Content preview (last 500 chars):', '...' + content.substring(Math.max(0, content.length - 500)));
      } else {
        // Fallback: try to find any text content in the response
        const responseStr = JSON.stringify(response);
        console.log('Response structure not as expected, using fallback. Full response:', responseStr);
        content = responseStr;
      }
    } catch (extractError) {
      console.error('Failed to extract content from AI response:', extractError);
      console.log('Full response object:', JSON.stringify(response, null, 2));
      throw new Error('Failed to extract content from AI response structure');
    }

    if (!content || typeof content !== 'string') {
      throw new Error('No text content found in AI response. Content type: ' + typeof content);
    }

    content = content.trim();
    console.log('Final content length:', content.length);
    
    // Try to extract JSON from the response
    let recipeData;
    console.log('Attempting to extract JSON from content. Content preview:', content.substring(0, 500) + '...');
    
    try {
      // Since we're forcing the AI to return valid JSON, try parsing the entire content first
      console.log('Attempting to parse entire content as JSON (AI should return valid JSON)...');
      try {
        recipeData = JSON.parse(content);
        console.log('Successfully parsed entire content as JSON');
      } catch (directParseError) {
        console.log('Direct JSON parse failed, trying extraction methods...');
        console.log('Parse error:', directParseError.message);
        
        // First, try to extract JSON from markdown code blocks
        const codeBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
        if (codeBlockMatch) {
          console.log('Found code block match, extracting JSON...');
          const jsonContent = codeBlockMatch[1];
          console.log('JSON content from code block (first 200 chars):', jsonContent.substring(0, 200) + '...');
          console.log('JSON content length:', jsonContent.length);
          
          // Try to clean up common JSON issues before parsing
          const cleanedJson = cleanJsonContent(jsonContent);
          recipeData = JSON.parse(cleanedJson);
        } else {
          // Look for JSON in the response (non-greedy match)
          const jsonMatch = content.match(/\{[\s\S]*?\}/);
          if (jsonMatch) {
            console.log('Found JSON match, extracting...');
            const jsonContent = jsonMatch[0];
            console.log('JSON content from regex match (first 200 chars):', jsonContent.substring(0, 200) + '...');
            console.log('JSON content length:', jsonContent.length);
            
            // Try to clean up common JSON issues before parsing
            const cleanedJson = cleanJsonContent(jsonContent);
            recipeData = JSON.parse(cleanedJson);
          } else {
            // If no JSON found, try to parse the entire content
            console.log('No JSON pattern found, attempting to parse entire content...');
            const cleanedJson = cleanJsonContent(content);
            recipeData = JSON.parse(cleanedJson);
          }
        }
      }
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError);
      console.log('Raw AI response content:', content);
      console.log('Content length:', content.length);
      console.log('Content type:', typeof content);
      
      // Try to find the problematic area around the error position
      if (parseError.message.includes('position')) {
        const positionMatch = parseError.message.match(/position (\d+)/);
        if (positionMatch) {
          const position = parseInt(positionMatch[1]);
          const start = Math.max(0, position - 100);
          const end = Math.min(content.length, position + 100);
          console.log('Problem area around position', position, ':', content.substring(start, end));
        }
      }
      
      throw new Error('Failed to parse recipe data from AI response: ' + parseError.message);
    }

    // Debug: Log what we extracted
    console.log('Extracted recipe data:', JSON.stringify(recipeData, null, 2));
    console.log('Recipe data type:', typeof recipeData);
    console.log('Recipe data keys:', Object.keys(recipeData || {}));
    
    // Check if we got null (no recipe found)
    if (recipeData === null || recipeData === 'null') {
      console.log('AI returned null - no recipe found');
      return null;
    }
    
    // Check if we got an empty object or invalid data
    if (typeof recipeData !== 'object' || Object.keys(recipeData).length === 0) {
      console.log('AI returned empty or invalid data - no recipe found');
      return null;
    }
    
    // Validate the extracted recipe data according to Google Recipe schema
    if (!recipeData.name || !recipeData.image || !recipeData.recipeIngredient || !recipeData.recipeInstructions) {
      console.error('Missing required fields for Google Recipe schema:', {
        hasName: !!recipeData.name,
        hasImage: !!recipeData.image,
        hasRecipeIngredient: !!recipeData.recipeIngredient,
        hasRecipeInstructions: !!recipeData.recipeInstructions,
        recipeData: recipeData
      });
      
      // Try to find alternative field names for backward compatibility
      const possibleNameFields = ['name', 'title', 'recipe_name', 'recipe_title'];
      const possibleImageFields = ['image', 'image_url', 'photo', 'picture'];
      const possibleIngredientFields = ['recipeIngredient', 'ingredients', 'ingredient_list', 'ingredient'];
      const possibleInstructionFields = ['recipeInstructions', 'instructions', 'steps', 'directions', 'method', 'preparation'];
      
      const foundName = possibleNameFields.find(field => recipeData[field]);
      const foundImage = possibleImageFields.find(field => recipeData[field]);
      const foundIngredients = possibleIngredientFields.find(field => recipeData[field]);
      const foundInstructions = possibleInstructionFields.find(field => recipeData[field]);
      
      console.log('Alternative field search results:', {
        foundName,
        foundImage,
        foundIngredients,
        foundInstructions,
        availableFields: Object.keys(recipeData)
      });
      
      // If we found alternative fields, use them
      if (foundName && foundImage && foundIngredients && foundInstructions) {
        console.log('Found alternative field names, proceeding with recipe extraction');
        recipeData.name = recipeData[foundName];
        recipeData.image = recipeData[foundImage];
        recipeData.recipeIngredient = recipeData[foundIngredients];
        recipeData.recipeInstructions = recipeData[foundInstructions];
      } else {
        console.error('Incomplete recipe data - missing required fields after field name mapping');
        console.error('Available fields:', Object.keys(recipeData));
        console.error('Field values:', recipeData);
        throw new Error('Incomplete recipe data extracted - missing name, image, recipeIngredient, or recipeInstructions');
      }
    }

    // Clean up the extracted data according to Google Recipe schema
    const cleanedRecipe = {
      // Required fields
      name: String(recipeData.name || '').trim(),
      image: String(recipeData.image || '').trim(),
      
      // Recommended fields
      description: String(recipeData.description || '').trim(),
      author: String(recipeData.author || '').trim(),
      datePublished: String(recipeData.datePublished || '').trim(),
      prepTime: String(recipeData.prepTime || '').trim(),
      cookTime: String(recipeData.cookTime || '').trim(),
      totalTime: String(recipeData.totalTime || '').trim(),
      recipeYield: String(recipeData.recipeYield || '').trim(),
      recipeCategory: String(recipeData.recipeCategory || '').trim(),
      recipeCuisine: String(recipeData.recipeCuisine || '').trim(),
      keywords: String(recipeData.keywords || '').trim(),
      
      // Recipe content
      recipeIngredient: Array.isArray(recipeData.recipeIngredient) 
        ? recipeData.recipeIngredient.map(i => String(i).trim()).filter(i => i.length > 0)
        : (typeof recipeData.recipeIngredient === 'string' 
            ? recipeData.recipeIngredient.split('\n').map(i => i.trim()).filter(i => i.length > 0)
            : []),
      recipeInstructions: Array.isArray(recipeData.recipeInstructions)
        ? recipeData.recipeInstructions.map(step => {
            if (typeof step === 'string') {
              return { "@type": "HowToStep", text: step.trim() };
            } else if (step && typeof step === 'object' && step.text) {
              return { "@type": "HowToStep", text: String(step.text).trim() };
            }
            return null;
          }).filter(step => step && step.text.length > 0)
        : (typeof recipeData.recipeInstructions === 'string'
            ? recipeData.recipeInstructions.split('\n').map(step => ({ 
                "@type": "HowToStep", 
                text: step.trim() 
              })).filter(step => step.text.length > 0)
            : []),
      
      // Nutrition information
      nutrition: recipeData.nutrition && typeof recipeData.nutrition === 'object' ? {
        "@type": "NutritionInformation",
        calories: String(recipeData.nutrition.calories || '').trim(),
        proteinContent: String(recipeData.nutrition.proteinContent || '').trim(),
        fatContent: String(recipeData.nutrition.fatContent || '').trim(),
        carbohydrateContent: String(recipeData.nutrition.carbohydrateContent || '').trim(),
        fiberContent: String(recipeData.nutrition.fiberContent || '').trim(),
        sugarContent: String(recipeData.nutrition.sugarContent || '').trim(),
        sodiumContent: String(recipeData.nutrition.sodiumContent || '').trim(),
        cholesterolContent: String(recipeData.nutrition.cholesterolContent || '').trim(),
        saturatedFatContent: String(recipeData.nutrition.saturatedFatContent || '').trim(),
        transFatContent: String(recipeData.nutrition.transFatContent || '').trim(),
        unsaturatedFatContent: String(recipeData.nutrition.unsaturatedFatContent || '').trim(),
        servingSize: String(recipeData.nutrition.servingSize || '').trim()
      } : null,
      
      // Rating information
      aggregateRating: recipeData.aggregateRating && typeof recipeData.aggregateRating === 'object' ? {
        "@type": "AggregateRating",
        ratingValue: parseFloat(recipeData.aggregateRating.ratingValue) || null,
        ratingCount: parseInt(recipeData.aggregateRating.ratingCount) || null,
        reviewCount: parseInt(recipeData.aggregateRating.reviewCount) || null
      } : null,
      
      // Video information
      video: recipeData.video && typeof recipeData.video === 'object' ? {
        "@type": "VideoObject",
        name: String(recipeData.video.name || '').trim(),
        description: String(recipeData.video.description || '').trim(),
        contentUrl: String(recipeData.video.contentUrl || '').trim()
      } : null,
      
      // Additional fields
      source_url: pageUrl,
      
      // Backward compatibility fields for frontend
      ingredients: Array.isArray(recipeData.recipeIngredient) 
        ? recipeData.recipeIngredient.map(i => String(i).trim()).filter(i => i.length > 0)
        : (typeof recipeData.recipeIngredient === 'string' 
            ? recipeData.recipeIngredient.split('\n').map(i => i.trim()).filter(i => i.length > 0)
            : []),
      instructions: Array.isArray(recipeData.recipeInstructions)
        ? recipeData.recipeInstructions.map(step => {
            if (typeof step === 'string') {
              return step.trim();
            } else if (step && typeof step === 'object' && step.text) {
              return String(step.text).trim();
            }
            return '';
          }).filter(step => step.length > 0)
        : (typeof recipeData.recipeInstructions === 'string'
            ? recipeData.recipeInstructions.split('\n').map(step => step.trim()).filter(step => step.length > 0)
            : []),
      image_url: String(recipeData.image || '').trim()
    };
    
    console.log('Cleaned recipe data:', JSON.stringify(cleanedRecipe, null, 2));

    return cleanedRecipe;
  } catch (error) {
    console.error('Error calling AI model:', error);
    
    // Re-throw the error instead of providing a mock recipe
    throw new Error('AI model failed to extract recipe: ' + error.message);
  }
}



// Extract recipe data from AI response (for testing)
function extractRecipeFromAIResponse(response, pageUrl) {
  try {
    if (!response || typeof response !== 'object') {
      throw new Error('Invalid response object');
    }

    // Extract the text content from the response structure
    let content;
    try {
      // The response structure has the content nested in response.source.output[0].content[0].text
      if (response.source && response.source.output && response.source.output[0] && 
          response.source.output[0].content && response.source.output[0].content[0] && 
          response.source.output[0].content[0].text) {
        content = response.source.output[0].content[0].text;
      } else {
        // Fallback: try to find any text content in the response
        const responseStr = JSON.stringify(response);
        content = responseStr;
      }
    } catch (extractError) {
      throw new Error('Failed to extract content from AI response structure');
    }

    if (!content || typeof content !== 'string') {
      throw new Error('No text content found in AI response');
    }

    content = content.trim();
    
    // Try to extract JSON from the response
    let recipeData;
    
    try {
      // Since we're forcing the AI to return valid JSON, try parsing the entire content first
      try {
        recipeData = JSON.parse(content);
      } catch (directParseError) {
        // First, try to extract JSON from markdown code blocks
        const codeBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
        if (codeBlockMatch) {
          const jsonContent = codeBlockMatch[1];
          const cleanedJson = cleanJsonContent(jsonContent);
          recipeData = JSON.parse(cleanedJson);
        } else {
          // Look for JSON in the response (non-greedy match)
          const jsonMatch = content.match(/\{[\s\S]*?\}/);
          if (jsonMatch) {
            const jsonContent = jsonMatch[0];
            const cleanedJson = cleanJsonContent(jsonContent);
            recipeData = JSON.parse(cleanedJson);
          } else {
            // If no JSON found, try to parse the entire content
            const cleanedJson = cleanJsonContent(content);
            recipeData = JSON.parse(cleanedJson);
          }
        }
      }
    } catch (parseError) {
      throw new Error('Failed to parse recipe data from AI response');
    }

    // Check if we got null (no recipe found)
    if (recipeData === null || recipeData === 'null') {
      return null;
    }
    
    // Check if we got an empty object or invalid data
    if (typeof recipeData !== 'object' || Object.keys(recipeData).length === 0) {
      return null;
    }
    
    // Validate the extracted recipe data according to Google Recipe schema
    if (!recipeData.name || !recipeData.image || !recipeData.recipeIngredient || !recipeData.recipeInstructions) {
      // Try to find alternative field names for backward compatibility
      const possibleNameFields = ['name', 'title', 'recipe_name', 'recipe_title'];
      const possibleImageFields = ['image', 'image_url', 'photo', 'picture'];
      const possibleIngredientFields = ['recipeIngredient', 'ingredients', 'ingredient_list', 'ingredient'];
      const possibleInstructionFields = ['recipeInstructions', 'instructions', 'steps', 'directions', 'method', 'preparation'];
      
      const foundName = possibleNameFields.find(field => recipeData[field]);
      const foundImage = possibleImageFields.find(field => recipeData[field]);
      const foundIngredients = possibleIngredientFields.find(field => recipeData[field]);
      const foundInstructions = possibleInstructionFields.find(field => recipeData[field]);
      
      // If we found alternative fields, use them
      if (foundName && foundImage && foundIngredients && foundInstructions) {
        recipeData.name = recipeData[foundName];
        recipeData.image = recipeData[foundImage];
        recipeData.recipeIngredient = recipeData[foundIngredients];
        recipeData.recipeInstructions = recipeData[foundInstructions];
      } else {
        throw new Error('Incomplete recipe data extracted - missing name, image, recipeIngredient, or recipeInstructions');
      }
    }

    // Clean up the extracted data according to Google Recipe schema
    const cleanedRecipe = {
      // Required fields
      name: String(recipeData.name || '').trim(),
      image: String(recipeData.image || '').trim(),
      
      // Recommended fields
      description: String(recipeData.description || '').trim(),
      author: String(recipeData.author || '').trim(),
      datePublished: String(recipeData.datePublished || '').trim(),
      prepTime: String(recipeData.prepTime || '').trim(),
      cookTime: String(recipeData.cookTime || '').trim(),
      totalTime: String(recipeData.totalTime || '').trim(),
      recipeYield: String(recipeData.recipeYield || '').trim(),
      recipeCategory: String(recipeData.recipeCategory || '').trim(),
      recipeCuisine: String(recipeData.recipeCuisine || '').trim(),
      keywords: String(recipeData.keywords || '').trim(),
      
      // Recipe content
      recipeIngredient: Array.isArray(recipeData.recipeIngredient) 
        ? recipeData.recipeIngredient.map(i => String(i).trim()).filter(i => i.length > 0)
        : (typeof recipeData.recipeIngredient === 'string' 
            ? recipeData.recipeIngredient.split('\n').map(i => i.trim()).filter(i => i.length > 0)
            : []),
      recipeInstructions: Array.isArray(recipeData.recipeInstructions)
        ? recipeData.recipeInstructions.map(step => {
            if (typeof step === 'string') {
              return { "@type": "HowToStep", text: step.trim() };
            } else if (step && typeof step === 'object' && step.text) {
              return { "@type": "HowToStep", text: String(step.text).trim() };
            }
            return null;
          }).filter(step => step && step.text.length > 0)
        : (typeof recipeData.recipeInstructions === 'string'
            ? recipeData.recipeInstructions.split('\n').map(step => ({ 
                "@type": "HowToStep", 
                text: step.trim() 
              })).filter(step => step.text.length > 0)
            : []),
      
      // Nutrition information
      nutrition: recipeData.nutrition && typeof recipeData.nutrition === 'object' ? {
        "@type": "NutritionInformation",
        calories: String(recipeData.nutrition.calories || '').trim(),
        proteinContent: String(recipeData.nutrition.proteinContent || '').trim(),
        fatContent: String(recipeData.nutrition.fatContent || '').trim(),
        carbohydrateContent: String(recipeData.nutrition.carbohydrateContent || '').trim(),
        fiberContent: String(recipeData.nutrition.fiberContent || '').trim(),
        sugarContent: String(recipeData.nutrition.sugarContent || '').trim(),
        sodiumContent: String(recipeData.nutrition.sodiumContent || '').trim(),
        cholesterolContent: String(recipeData.nutrition.cholesterolContent || '').trim(),
        saturatedFatContent: String(recipeData.nutrition.saturatedFatContent || '').trim(),
        transFatContent: String(recipeData.nutrition.transFatContent || '').trim(),
        unsaturatedFatContent: String(recipeData.nutrition.unsaturatedFatContent || '').trim(),
        servingSize: String(recipeData.nutrition.servingSize || '').trim()
      } : null,
      
      // Rating information
      aggregateRating: recipeData.aggregateRating && typeof recipeData.aggregateRating === 'object' ? {
        "@type": "AggregateRating",
        ratingValue: parseFloat(recipeData.aggregateRating.ratingValue) || null,
        ratingCount: parseInt(recipeData.aggregateRating.ratingCount) || null,
        reviewCount: parseInt(recipeData.aggregateRating.reviewCount) || null
      } : null,
      
      // Video information
      video: recipeData.video && typeof recipeData.video === 'object' ? {
        "@type": "VideoObject",
        name: String(recipeData.video.name || '').trim(),
        description: String(recipeData.video.description || '').trim(),
        contentUrl: String(recipeData.video.contentUrl || '').trim()
      } : null,
      
      // Additional fields
      source_url: pageUrl,
      
      // Backward compatibility fields for frontend
      ingredients: Array.isArray(recipeData.recipeIngredient) 
        ? recipeData.recipeIngredient.map(i => String(i).trim()).filter(i => i.length > 0)
        : (typeof recipeData.recipeIngredient === 'string' 
            ? recipeData.recipeIngredient.split('\n').map(i => i.trim()).filter(i => i.length > 0)
            : []),
      instructions: Array.isArray(recipeData.recipeInstructions)
        ? recipeData.recipeInstructions.map(step => {
            if (typeof step === 'string') {
              return step.trim();
            } else if (step && typeof step === 'object' && step.text) {
              return String(step.text).trim();
            }
            return '';
          }).filter(step => step.length > 0)
        : (typeof recipeData.recipeInstructions === 'string'
            ? recipeData.recipeInstructions.split('\n').map(step => step.trim()).filter(step => step.length > 0)
            : []),
      image_url: String(recipeData.image || '').trim()
    };

    return cleanedRecipe;
  } catch (error) {
    console.error('Error extracting recipe from AI response:', error);
    return null;
  }
}

// Export the function for testing
export { extractRecipeFromAIResponse }; 