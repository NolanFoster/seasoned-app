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
        ingredients: recipe.ingredients?.length || 0,
        instructions: recipe.instructions?.length || 0
      });
    } else {
      console.log('No recipe extracted - AI returned null or empty data');
    }
    
    return recipe;
  } catch (error) {
    console.error('Error in GPT recipe extraction:', error);
    throw error;
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

  // If we found recipe content, return it; otherwise return original
  return recipeContent.length > 100 ? recipeContent : html;
}

// Call GPT-OSS-20B model using Cloudflare Workers AI
async function callGPTModel(htmlContent, pageUrl, env) {
  try {
    // Check if we have the AI binding
    if (!env.AI) {
      console.log('AI binding not available, using fallback mock recipe for local development...');
      return getMockRecipe(pageUrl);
    }
    
    console.log('AI binding available, proceeding with AI call...');
    
    const prompt = `You are a recipe extraction expert. Extract a recipe from the following raw HTML content. 

IMPORTANT: You must return ONLY a valid JSON object with NO additional text, markdown formatting, or explanations. The response must be parseable by JSON.parse().

Return this exact JSON structure:
{
  "name": "Recipe name",
  "description": "Brief description of the recipe",
  "ingredients": ["ingredient 1", "ingredient 2", ...],
  "instructions": ["step 1", "step 2", ...],
  "image_url": "URL of the main recipe image if found",
  "source_url": "${pageUrl}",
  "prep_time": "preparation time if available",
  "cook_time": "cooking time if available",
  "servings": "number of servings if available",
  "difficulty": "easy/medium/hard if available"
}

CRITICAL REQUIREMENTS:
- NO markdown code blocks (\`\`\`json)
- NO explanations or reasoning text
- NO trailing commas
- All strings must be properly quoted
- Arrays must be properly closed
- If no recipe is found, return: null

The HTML content contains the full webpage. Focus on extracting clear, actionable ingredients and step-by-step instructions from the recipe content. Ignore navigation, ads, and other non-recipe elements.

IMPORTANT: Look for recipe instructions under various section names including:
- "Instructions" or "Directions"
- "Preparation" (common on Tasty and other sites)
- "Method" or "Steps"
- Any numbered list that appears to be cooking steps

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
    
    // Validate the extracted recipe data
    if (!recipeData.name || !recipeData.ingredients || !recipeData.instructions) {
      console.error('Missing required fields:', {
        hasName: !!recipeData.name,
        hasIngredients: !!recipeData.ingredients,
        hasInstructions: !!recipeData.instructions,
        recipeData: recipeData
      });
      
      // Try to find alternative field names
      const possibleNameFields = ['name', 'title', 'recipe_name', 'recipe_title'];
      const possibleIngredientFields = ['ingredients', 'ingredient_list', 'ingredient'];
      const possibleInstructionFields = ['instructions', 'steps', 'directions', 'method', 'preparation'];
      
      const foundName = possibleNameFields.find(field => recipeData[field]);
      const foundIngredients = possibleIngredientFields.find(field => recipeData[field]);
      const foundInstructions = possibleInstructionFields.find(field => recipeData[field]);
      
      console.log('Alternative field search results:', {
        foundName,
        foundIngredients,
        foundInstructions,
        availableFields: Object.keys(recipeData)
      });
      
      // If we found alternative fields, use them
      if (foundName && foundIngredients && foundInstructions) {
        console.log('Found alternative field names, proceeding with recipe extraction');
        recipeData.name = recipeData[foundName];
        recipeData.ingredients = recipeData[foundIngredients];
        recipeData.instructions = recipeData[foundInstructions];
      } else {
        console.error('Incomplete recipe data - missing required fields after field name mapping');
        console.error('Available fields:', Object.keys(recipeData));
        console.error('Field values:', recipeData);
        throw new Error('Incomplete recipe data extracted - missing name, ingredients, or instructions');
      }
    }

    // Clean up the extracted data
    const cleanedRecipe = {
      name: String(recipeData.name || '').trim(),
      description: String(recipeData.description || '').trim(),
      ingredients: Array.isArray(recipeData.ingredients) 
        ? recipeData.ingredients.map(i => String(i).trim()).filter(i => i.length > 0)
        : (typeof recipeData.ingredients === 'string' 
            ? recipeData.ingredients.split('\n').map(i => i.trim()).filter(i => i.length > 0)
            : []),
      instructions: Array.isArray(recipeData.instructions)
        ? recipeData.instructions.map(i => String(i).trim()).filter(i => i.length > 0)
        : (typeof recipeData.instructions === 'string'
            ? recipeData.instructions.split('\n').map(i => i.trim()).filter(i => i.length > 0)
            : []),
      image_url: String(recipeData.image_url || ''),
      source_url: pageUrl,
      prep_time: String(recipeData.prep_time || ''),
      cook_time: String(recipeData.cook_time || ''),
      servings: String(recipeData.servings || ''),
      difficulty: String(recipeData.difficulty || '')
    };
    
    console.log('Cleaned recipe data:', JSON.stringify(cleanedRecipe, null, 2));

    return cleanedRecipe;
  } catch (error) {
    console.error('Error calling AI model:', error);
    
    // In local development or when AI fails, provide a fallback mock response for testing
    console.log('AI model failed, using fallback mock recipe for local development...');
    return getMockRecipe(pageUrl);
  }
}

// Fallback mock recipe for local development
function getMockRecipe(pageUrl) {
  console.log('Providing fallback mock recipe for local development...');
  return {
    name: "Chef John's Salt-Roasted Chicken (Mock)",
    description: "A simple and delicious salt-roasted chicken recipe that results in juicy, flavorful meat with crispy skin.",
    ingredients: [
      "1 (4 to 5 pound) whole chicken",
      "3 cups kosher salt",
      "1/4 cup olive oil",
      "1 tablespoon black pepper",
      "1 tablespoon dried thyme",
      "1 tablespoon dried rosemary",
      "1 lemon, halved",
      "4 cloves garlic, crushed",
      "1 onion, quartered"
    ],
    instructions: [
      "Preheat oven to 450 degrees F (230 degrees C).",
      "Rinse chicken and pat dry with paper towels.",
      "In a large bowl, mix together kosher salt, black pepper, thyme, and rosemary.",
      "Rub the chicken with olive oil, then generously coat with the salt mixture.",
      "Place lemon halves, garlic, and onion inside the chicken cavity.",
      "Place chicken in a roasting pan and roast for 1 hour and 15 minutes, or until internal temperature reaches 165 degrees F (74 degrees C).",
      "Let chicken rest for 10 minutes before carving and serving."
    ],
    image_url: "https://images.media-allrecipes.com/userphotos/560x315/235171.jpg",
    source_url: pageUrl,
    prep_time: "15 minutes",
    cook_time: "1 hour 15 minutes",
    servings: "6",
    difficulty: "Easy"
  };
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
    
    // Validate the extracted recipe data
    if (!recipeData.name || !recipeData.ingredients || !recipeData.instructions) {
      // Try to find alternative field names
      const possibleNameFields = ['name', 'title', 'recipe_name', 'recipe_title'];
      const possibleIngredientFields = ['ingredients', 'ingredient_list', 'ingredient'];
      const possibleInstructionFields = ['instructions', 'steps', 'directions', 'method', 'preparation'];
      
      const foundName = possibleNameFields.find(field => recipeData[field]);
      const foundIngredients = possibleIngredientFields.find(field => recipeData[field]);
      const foundInstructions = possibleInstructionFields.find(field => recipeData[field]);
      
      // If we found alternative fields, use them
      if (foundName && foundIngredients && foundInstructions) {
        recipeData.name = recipeData[foundName];
        recipeData.ingredients = recipeData[foundIngredients];
        recipeData.instructions = recipeData[foundInstructions];
      } else {
        throw new Error('Incomplete recipe data extracted');
      }
    }

    // Clean up the extracted data
    const cleanedRecipe = {
      name: String(recipeData.name || '').trim(),
      description: String(recipeData.description || '').trim(),
      ingredients: Array.isArray(recipeData.ingredients) 
        ? recipeData.ingredients.map(i => String(i).trim()).filter(i => i.length > 0)
        : (typeof recipeData.ingredients === 'string' 
            ? recipeData.ingredients.split('\n').map(i => i.trim()).filter(i => i.length > 0)
            : []),
      instructions: Array.isArray(recipeData.instructions)
        ? recipeData.instructions.map(i => String(i).trim()).filter(i => i.length > 0)
        : (typeof recipeData.instructions === 'string'
            ? recipeData.instructions.split('\n').map(i => i.trim()).filter(i => i.length > 0)
            : []),
      image_url: String(recipeData.image_url || ''),
      source_url: pageUrl,
      prep_time: String(recipeData.prep_time || ''),
      cook_time: String(recipeData.cook_time || ''),
      servings: String(recipeData.servings || ''),
      difficulty: String(recipeData.difficulty || '')
    };

    return cleanedRecipe;
  } catch (error) {
    console.error('Error extracting recipe from AI response:', error);
    return null;
  }
}

// Export the function for testing
export { extractRecipeFromAIResponse }; 