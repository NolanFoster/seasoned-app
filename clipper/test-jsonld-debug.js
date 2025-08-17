/**
 * Debug script to test JSON-LD extraction specifically
 */

const TEST_HTML = `<!DOCTYPE html>
<html>
<head>
  <script type="application/ld+json" class="yoast-schema-graph">
  {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": "https://whatscookingamerica.net/bksalpiccata.htm",
        "name": "Baked Salmon Piccata Recipe | What's Cooking America"
      },
      {
        "@type": "ImageObject",
        "@id": "https://whatscookingamerica.net/bksalpiccata.htm#primaryimage",
        "url": "https://whatscookingamerica.net/wp-content/uploads/2015/03/SalmonPiccata5.jpg",
        "contentUrl": "https://whatscookingamerica.net/wp-content/uploads/2015/03/SalmonPiccata5.jpg"
      },
      {
        "@type": "Recipe",
        "name": "Baked Salmon Piccata Recipe:",
        "author": {"@type": "Person", "name": "What's Cooking America"},
        "description": "A delicious salmon recipe",
        "datePublished": "2015-06-21T01:36:00+00:00",
        "recipeYield": ["4", "4 servings"],
        "prepTime": "PT15M",
        "cookTime": "PT15M",
        "totalTime": "PT30M",
        "recipeIngredient": [
          "4 salmon steaks, 1-inch thick",
          "All-purpose flour (for dredging)",
          "1/4 cup plus 3 tablespoons butter, (divided)"
        ],
        "recipeInstructions": [
          {
            "@type": "HowToStep",
            "text": "Preheat oven to 400 degrees F. Wash salmon steaks, pat dry, and roll in flour."
          },
          {
            "@type": "HowToStep",
            "text": "In a large ovenproof frying pan, heat 1/4 cup butter until it melts."
          }
        ],
        "recipeCategory": ["Main Course"],
        "recipeCuisine": ["Italian"],
        "keywords": "Baked Salmon Piccata Recipe",
        "image": {"@id": "https://whatscookingamerica.net/bksalpiccata.htm#primaryimage"}
      }
    ]
  }
  </script>
</head>
<body>
  <h1>Test Recipe</h1>
</body>
</html>`;

// Mock the functions we need
function extractRecipeFromJsonLd(html) {
  try {
    // Find all script tags with type="application/ld+json"
    const jsonLdMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    
    if (!jsonLdMatches || jsonLdMatches.length === 0) {
      console.log('No JSON-LD scripts found in HTML');
      return null;
    }
    
    console.log(`Found ${jsonLdMatches.length} JSON-LD script(s)`);
    
    for (const match of jsonLdMatches) {
      try {
        // Extract the JSON content from the script tag
        const jsonContent = match.replace(/<script[^>]*type=["']application\/ld\+json["'][^>]*>/i, '')
                                 .replace(/<\/script>/i, '')
                                 .trim();
        
        if (!jsonContent) continue;
        
        console.log('Parsing JSON-LD content (first 200 chars):', jsonContent.substring(0, 200) + '...');
        
        // Parse the JSON
        const jsonLd = JSON.parse(jsonContent);
        
        console.log('JSON-LD parsed successfully, structure:', {
          hasType: !!jsonLd['@type'],
          type: jsonLd['@type'],
          hasGraph: !!jsonLd['@graph'],
          graphLength: jsonLd['@graph']?.length || 0
        });
        
        // Check if it's a Recipe or contains a Recipe
        const recipe = findRecipeInJsonLd(jsonLd);
        
        if (recipe) {
          console.log('Found Recipe in JSON-LD! Recipe structure:', {
            name: recipe.name,
            hasIngredients: !!recipe.recipeIngredient,
            ingredientCount: recipe.recipeIngredient?.length || 0,
            hasInstructions: !!recipe.recipeInstructions,
            instructionCount: recipe.recipeInstructions?.length || 0,
            image: recipe.image
          });
          
          // Resolve references in the recipe using the full JSON-LD context
          const resolvedRecipe = resolveJsonLdReferences(recipe, jsonLd);
          
          console.log('Resolved recipe:', {
            name: resolvedRecipe.name,
            image: resolvedRecipe.image,
            ingredientCount: resolvedRecipe.recipeIngredient?.length || 0,
            instructionCount: resolvedRecipe.recipeInstructions?.length || 0
          });
          
          return resolvedRecipe;
        }
      } catch (parseError) {
        console.error('Error parsing JSON-LD:', parseError);
        // Continue to next JSON-LD script
      }
    }
    
    console.log('No Recipe found in JSON-LD scripts');
    return null;
  } catch (error) {
    console.error('Error extracting JSON-LD:', error);
    return null;
  }
}

// Resolve JSON-LD references by looking up objects by their @id
function resolveJsonLdReferences(recipe, fullJsonLd) {
  try {
    const resolved = { ...recipe };
    
    // If the recipe has a @graph, we can resolve references from it
    if (fullJsonLd['@graph'] && Array.isArray(fullJsonLd['@graph'])) {
      const graph = fullJsonLd['@graph'];
      
      // Resolve image reference
      if (recipe.image && typeof recipe.image === 'object' && recipe.image['@id']) {
        const imageId = recipe.image['@id'];
        console.log('Looking for image with ID:', imageId);
        const imageObject = graph.find(item => item['@id'] === imageId);
        console.log('Found image object:', imageObject);
        if (imageObject && imageObject.url) {
          resolved.image = imageObject.url;
          console.log('Resolved image to URL:', resolved.image);
        } else if (imageObject && imageObject.contentUrl) {
          resolved.image = imageObject.contentUrl;
          console.log('Resolved image to contentUrl:', resolved.image);
        }
      }
      
      // Resolve author reference
      if (recipe.author && typeof recipe.author === 'object' && recipe.author['@id']) {
        const authorId = recipe.author['@id'];
        const authorObject = graph.find(item => item['@id'] === authorId);
        if (authorObject && authorObject.name) {
          resolved.author = authorObject.name;
        }
      }
    }
    
    return resolved;
  } catch (error) {
    console.error('Error resolving JSON-LD references:', error);
    return recipe;
  }
}

// Find Recipe object in JSON-LD data (handles nested structures)
function findRecipeInJsonLd(jsonLd) {
  // Direct Recipe object
  if (jsonLd['@type'] === 'Recipe' || 
      (Array.isArray(jsonLd['@type']) && jsonLd['@type'].includes('Recipe'))) {
    console.log('Found direct Recipe object');
    return jsonLd;
  }
  
  // Check if it's an array of objects
  if (Array.isArray(jsonLd)) {
    console.log('Checking array of objects, length:', jsonLd.length);
    for (let i = 0; i < jsonLd.length; i++) {
      const item = jsonLd[i];
      console.log(`Checking array item ${i}, type:`, item['@type']);
      const recipe = findRecipeInJsonLd(item);
      if (recipe) return recipe;
    }
  }
  
  // Check if it's a graph (most common case for Yoast SEO)
  if (jsonLd['@graph'] && Array.isArray(jsonLd['@graph'])) {
    console.log('Checking @graph array, length:', jsonLd['@graph'].length);
    for (let i = 0; i < jsonLd['@graph'].length; i++) {
      const item = jsonLd['@graph'][i];
      console.log(`Checking graph item ${i}, type:`, item['@type']);
      if (item['@type'] === 'Recipe' || 
          (Array.isArray(item['@type']) && item['@type'].includes('Recipe'))) {
        console.log('Found Recipe in @graph array!');
        return item;
      }
      // Also check nested objects within graph items
      if (typeof item === 'object' && item !== null) {
        const nestedRecipe = findRecipeInJsonLd(item);
        if (nestedRecipe) return nestedRecipe;
      }
    }
  }
  
  // Check nested objects
  if (typeof jsonLd === 'object' && jsonLd !== null) {
    for (const key of Object.keys(jsonLd)) {
      if (typeof jsonLd[key] === 'object' && jsonLd[key] !== null) {
        const recipe = findRecipeInJsonLd(jsonLd[key]);
        if (recipe) return recipe;
      }
    }
  }
  
  return null;
}

// Test the JSON-LD extraction
console.log('🧪 Testing JSON-LD extraction with mock HTML\n');
const extractedRecipe = extractRecipeFromJsonLd(TEST_HTML);

if (extractedRecipe) {
  console.log('\n✅ Recipe extracted successfully!');
  console.log('Final recipe:', {
    name: extractedRecipe.name,
    image: extractedRecipe.image,
    ingredientCount: extractedRecipe.recipeIngredient?.length || 0,
    instructionCount: extractedRecipe.recipeInstructions?.length || 0
  });
} else {
  console.log('\n❌ No recipe extracted');
}
