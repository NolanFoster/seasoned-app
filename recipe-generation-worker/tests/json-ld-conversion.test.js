import { describe, it, expect } from 'vitest';

// Import the conversion function (we'll need to export it from the handler)
// For now, let's test the logic directly

/**
 * Convert recipe object to valid JSON-LD format according to schema.org/Recipe
 */
function convertToJsonLd(recipe) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    'name': recipe.name || 'Generated Recipe',
    'description': recipe.description || '',
    'datePublished': recipe.generatedAt || new Date().toISOString(),
    'author': {
      '@type': 'Organization',
      'name': 'AI Recipe Generator'
    }
  };

  // Add ingredients
  if (recipe.ingredients && Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0) {
    jsonLd.recipeIngredient = recipe.ingredients.map(ingredient => {
      // Clean up ingredient text
      return ingredient.replace(/^\d+\.\s*/, '').trim();
    });
  }

  // Add instructions
  if (recipe.instructions && Array.isArray(recipe.instructions) && recipe.instructions.length > 0) {
    jsonLd.recipeInstructions = recipe.instructions.map((instruction, index) => {
      // Clean up instruction text and ensure proper format
      const cleanInstruction = instruction.replace(/^\d+\.\s*/, '').trim();
      return {
        '@type': 'HowToStep',
        'position': index + 1,
        'text': cleanInstruction
      };
    });
  }

  // Add timing information
  if (recipe.prepTime) {
    jsonLd.prepTime = `PT${parseTimeToISO(recipe.prepTime)}`;
  }
  if (recipe.cookTime) {
    jsonLd.cookTime = `PT${parseTimeToISO(recipe.cookTime)}`;
  }
  if (recipe.totalTime) {
    jsonLd.totalTime = `PT${parseTimeToISO(recipe.totalTime)}`;
  }

  // Add servings/yield
  if (recipe.servings) {
    jsonLd.recipeYield = recipe.servings.toString();
  }

  // Add cuisine and category
  if (recipe.cuisine) {
    jsonLd.recipeCuisine = recipe.cuisine;
  }
  if (recipe.difficulty) {
    jsonLd.recipeCategory = recipe.difficulty;
  }

  // Add dietary information as keywords
  if (recipe.dietary && Array.isArray(recipe.dietary) && recipe.dietary.length > 0) {
    jsonLd.keywords = recipe.dietary.join(', ');
  }

  // Add source ingredients as additional context
  if (recipe.sourceIngredients && Array.isArray(recipe.sourceIngredients) && recipe.sourceIngredients.length > 0) {
    if (!jsonLd.keywords) {
      jsonLd.keywords = '';
    }
    jsonLd.keywords += (jsonLd.keywords ? ', ' : '') + recipe.sourceIngredients.join(', ');
  }

  // Add generation metadata
  if (recipe.generationTime) {
    jsonLd.comment = `Generated in ${recipe.generationTime}ms using AI recipe generation`;
  }

  return jsonLd;
}

/**
 * Parse time string to ISO 8601 duration format
 * Converts "15 minutes", "1 hour", "1 hour 30 minutes" to "15M", "1H", "1H30M"
 */
function parseTimeToISO(timeString) {
  if (!timeString) return '0M';

  const timeStr = timeString.toLowerCase().trim();
  let hours = 0;
  let minutes = 0;

  // Extract hours
  const hourMatch = timeStr.match(/(\d+)\s*hour/);
  if (hourMatch) {
    hours = parseInt(hourMatch[1]);
  }

  // Extract minutes
  const minuteMatch = timeStr.match(/(\d+)\s*minute/);
  if (minuteMatch) {
    minutes = parseInt(minuteMatch[1]);
  }

  // Convert to ISO 8601 duration format
  let result = '';
  if (hours > 0) {
    result += `${hours}H`;
  }
  if (minutes > 0) {
    result += `${minutes}M`;
  }

  return result || '0M';
}

describe('JSON-LD Conversion', () => {
  it('should convert a basic recipe to valid JSON-LD', () => {
    const recipe = {
      name: 'Chocolate Chip Cookies',
      description: 'Delicious homemade chocolate chip cookies',
      ingredients: ['2 cups flour', '1 cup sugar', '1/2 cup butter'],
      instructions: ['1. Mix ingredients', '2. Bake at 350F', '3. Cool and serve'],
      prepTime: '15 minutes',
      cookTime: '12 minutes',
      totalTime: '27 minutes',
      servings: '24',
      difficulty: 'Easy',
      cuisine: 'American',
      dietary: ['vegetarian'],
      generatedAt: '2024-01-15T10:30:00Z',
      generationTime: 1500
    };

    const jsonLd = convertToJsonLd(recipe);

    expect(jsonLd).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      'name': 'Chocolate Chip Cookies',
      'description': 'Delicious homemade chocolate chip cookies',
      'datePublished': '2024-01-15T10:30:00Z',
      'author': {
        '@type': 'Organization',
        'name': 'AI Recipe Generator'
      },
      'recipeIngredient': ['2 cups flour', '1 cup sugar', '1/2 cup butter'],
      'recipeInstructions': [
        {
          '@type': 'HowToStep',
          'position': 1,
          'text': 'Mix ingredients'
        },
        {
          '@type': 'HowToStep',
          'position': 2,
          'text': 'Bake at 350F'
        },
        {
          '@type': 'HowToStep',
          'position': 3,
          'text': 'Cool and serve'
        }
      ],
      'prepTime': 'PT15M',
      'cookTime': 'PT12M',
      'totalTime': 'PT27M',
      'recipeYield': '24',
      'recipeCuisine': 'American',
      'recipeCategory': 'Easy',
      'keywords': 'vegetarian',
      'comment': 'Generated in 1500ms using AI recipe generation'
    });
  });

  it('should handle recipes with numbered ingredients and instructions', () => {
    const recipe = {
      name: 'Pasta Carbonara',
      ingredients: ['1. 1 lb spaghetti', '2. 4 eggs', '3. 1/2 cup parmesan'],
      instructions: ['1. Boil pasta', '2. Beat eggs', '3. Combine and serve'],
      prepTime: '10 minutes',
      cookTime: '20 minutes',
      servings: '4'
    };

    const jsonLd = convertToJsonLd(recipe);

    expect(jsonLd.recipeIngredient).toEqual(['1 lb spaghetti', '4 eggs', '1/2 cup parmesan']);
    expect(jsonLd.recipeInstructions[0].text).toBe('Boil pasta');
    expect(jsonLd.recipeInstructions[1].text).toBe('Beat eggs');
    expect(jsonLd.recipeInstructions[2].text).toBe('Combine and serve');
  });

  it('should handle time parsing correctly', () => {
    expect(parseTimeToISO('15 minutes')).toBe('15M');
    expect(parseTimeToISO('1 hour')).toBe('1H');
    expect(parseTimeToISO('1 hour 30 minutes')).toBe('1H30M');
    expect(parseTimeToISO('2 hours 45 minutes')).toBe('2H45M');
    expect(parseTimeToISO('')).toBe('0M');
    expect(parseTimeToISO(null)).toBe('0M');
  });

  it('should handle recipes with source ingredients', () => {
    const recipe = {
      name: 'Quick Stir Fry',
      ingredients: ['2 tbsp oil', '1 lb chicken', '2 cups vegetables'],
      instructions: ['1. Heat oil', '2. Cook chicken', '3. Add vegetables'],
      sourceIngredients: ['chicken', 'vegetables', 'soy sauce'],
      dietary: ['gluten-free']
    };

    const jsonLd = convertToJsonLd(recipe);

    expect(jsonLd.keywords).toBe('gluten-free, chicken, vegetables, soy sauce');
  });

  it('should handle minimal recipe data', () => {
    const recipe = {
      name: 'Simple Recipe'
    };

    const jsonLd = convertToJsonLd(recipe);

    expect(jsonLd).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      'name': 'Simple Recipe',
      'description': '',
      'datePublished': expect.any(String),
      'author': {
        '@type': 'Organization',
        'name': 'AI Recipe Generator'
      }
    });
  });

  it('should validate JSON-LD structure', () => {
    const recipe = {
      name: 'Test Recipe',
      ingredients: ['ingredient 1', 'ingredient 2'],
      instructions: ['step 1', 'step 2']
    };

    const jsonLd = convertToJsonLd(recipe);

    // Check required schema.org Recipe properties
    expect(jsonLd['@context']).toBe('https://schema.org');
    expect(jsonLd['@type']).toBe('Recipe');
    expect(jsonLd.name).toBeDefined();
    expect(jsonLd.author['@type']).toBe('Organization');

    // Check instruction structure
    expect(jsonLd.recipeInstructions).toHaveLength(2);
    expect(jsonLd.recipeInstructions[0]['@type']).toBe('HowToStep');
    expect(jsonLd.recipeInstructions[0].position).toBe(1);
    expect(jsonLd.recipeInstructions[0].text).toBeDefined();
  });
});
