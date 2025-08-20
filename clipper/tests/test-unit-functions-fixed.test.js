// Import all testable functions from recipe-clipper.js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { extractRecipeFromAIResponse } from '../src/recipe-clipper.js';

console.log('🧪 Running Fixed Unit Tests for Recipe Clipper Functions\n');

let passedTests = 0;
let failedTests = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passedTests++;
  } catch (error) {
    console.log(`❌ ${name}`);
    console.log(`   Error: ${error.message}`);
    failedTests++;
  }
}



// Test extractRecipeFromAIResponse with various scenarios
test('extractRecipeFromAIResponse - handles valid recipe response', () => {
  const response = {
    source: {
      output: [{
        content: [{
          text: JSON.stringify({
            name: 'Test Recipe',
            description: 'A test recipe',
            recipeIngredient: ['ingredient 1', 'ingredient 2'],
            recipeInstructions: ['step 1', 'step 2'],
            image: 'https://example.com/image.jpg'
          })
        }]
      }]
    }
  };
  
  const result = extractRecipeFromAIResponse(response, 'https://example.com');
  expect(result.name).toBe('Test Recipe');
  expect(result.ingredients.length).toBe(2);
  expect(result.instructions.length).toBe(2);
});

test('extractRecipeFromAIResponse - handles null response', () => {
  const response = {
    source: {
      output: [{
        content: [{
          text: 'null'
        }]
      }]
    }
  };
  
  const result = extractRecipeFromAIResponse(response, 'https://example.com');
  expect(result).toBe(null);
});

test('extractRecipeFromAIResponse - handles recipe with time fields', () => {
  const response = {
    source: {
      output: [{
        content: [{
          text: JSON.stringify({
            name: 'Time Test Recipe',
            image: 'https://example.com/image.jpg',
            recipeIngredient: ['salt'],
            recipeInstructions: ['mix'],
            prepTime: 'PT15M',
            cookTime: 'PT30M',
            totalTime: 'PT45M'
          })
        }]
      }]
    }
  };
  
  const result = extractRecipeFromAIResponse(response, 'https://example.com');
  expect(result.prepTime).toBe('PT15M');
  expect(result.cookTime).toBe('PT30M');
  expect(result.totalTime).toBe('PT45M');
});

test('extractRecipeFromAIResponse - handles nutrition data', () => {
  const response = {
    source: {
      output: [{
        content: [{
          text: JSON.stringify({
            name: 'Nutrition Recipe',
            image: 'https://example.com/image.jpg',
            recipeIngredient: ['ingredient'],
            recipeInstructions: ['step'],
            nutrition: {
              calories: '250',
              protein: '10g',
              fat: '5g'
            }
          })
        }]
      }]
    }
  };
  
  const result = extractRecipeFromAIResponse(response, 'https://example.com');
  expect(result.nutrition.calories).toBe('250');
  expect(result.nutrition.proteinContent).toBe('10g');
});

test('extractRecipeFromAIResponse - handles rating data', () => {
  const response = {
    source: {
      output: [{
        content: [{
          text: JSON.stringify({
            name: 'Rated Recipe',
            image: 'https://example.com/image.jpg',
            recipeIngredient: ['ingredient'],
            recipeInstructions: ['step'],
            aggregateRating: {
              ratingValue: 4.5,
              reviewCount: 100
            }
          })
        }]
      }]
    }
  };
  
  const result = extractRecipeFromAIResponse(response, 'https://example.com');
  expect(result.aggregateRating.ratingValue).toBe(4.5);
  expect(result.aggregateRating.reviewCount).toBe(100);
});

test('extractRecipeFromAIResponse - handles video data', () => {
  const response = {
    source: {
      output: [{
        content: [{
          text: JSON.stringify({
            name: 'Video Recipe',
            image: 'https://example.com/image.jpg',
            recipeIngredient: ['ingredient'],
            recipeInstructions: ['step'],
            video: {
              contentUrl: 'https://example.com/video.mp4',
              name: 'Recipe Video'
            }
          })
        }]
      }]
    }
  };
  
  const result = extractRecipeFromAIResponse(response, 'https://example.com');
  expect(result.video.contentUrl).toBe('https://example.com/video.mp4');
});

test('extractRecipeFromAIResponse - handles array image', () => {
  const response = {
    source: {
      output: [{
        content: [{
          text: JSON.stringify({
            name: 'Array Image Recipe',
            image: ['https://example.com/1.jpg', 'https://example.com/2.jpg'],
            recipeIngredient: ['ingredient'],
            recipeInstructions: ['step']
          })
        }]
      }]
    }
  };
  
  const result = extractRecipeFromAIResponse(response, 'https://example.com');
  expect(result.image).toBe('https://example.com/1.jpg');
});

test('extractRecipeFromAIResponse - handles string instructions', () => {
  const response = {
    source: {
      output: [{
        content: [{
          text: JSON.stringify({
            name: 'String Instructions Recipe',
            image: 'https://example.com/image.jpg',
            recipeIngredient: ['ingredient'],
            recipeInstructions: 'Step 1: Mix\nStep 2: Bake'
          })
        }]
      }]
    }
  };
  
  const result = extractRecipeFromAIResponse(response, 'https://example.com');
  expect(Array.isArray(result.instructions)).toBeTruthy();
  expect(result.instructions.length).toBe(2);
});

test('extractRecipeFromAIResponse - handles object author', () => {
  const response = {
    source: {
      output: [{
        content: [{
          text: JSON.stringify({
            name: 'Author Object Recipe',
            image: 'https://example.com/image.jpg',
            recipeIngredient: ['ingredient'],
            recipeInstructions: ['step'],
            author: { name: 'Chef John', '@type': 'Person' }
          })
        }]
      }]
    }
  };
  
  const result = extractRecipeFromAIResponse(response, 'https://example.com');
  expect(result.author).toBe('Chef John');
});

test('extractRecipeFromAIResponse - handles missing optional fields', () => {
  const response = {
    source: {
      output: [{
        content: [{
          text: JSON.stringify({
            name: 'Minimal Recipe',
            image: 'https://example.com/image.jpg',
            recipeIngredient: ['ingredient'],
            recipeInstructions: ['step']
          })
        }]
      }]
    }
  };
  
  const result = extractRecipeFromAIResponse(response, 'https://example.com');
  expect(result.name).toBe('Minimal Recipe');
  expect(result.description).toBe('');
  expect(result.author).toBe('');
  expect(result.prepTime).toBe('');
});

test('extractRecipeFromAIResponse - handles complex instructions', () => {
  const response = {
    source: {
      output: [{
        content: [{
          text: JSON.stringify({
            name: 'Complex Instructions Recipe',
            image: 'https://example.com/image.jpg',
            recipeIngredient: ['ingredient'],
            recipeInstructions: [
              { '@type': 'HowToStep', text: 'Step 1' },
              { name: 'Step 2', '@type': 'HowToStep' },
              'Step 3'
            ]
          })
        }]
      }]
    }
  };
  
  const result = extractRecipeFromAIResponse(response, 'https://example.com');
  expect(result.instructions.length).toBe(3);
  expect(result.recipeInstructions.length).toBe(3);
  expect(result.recipeInstructions[0]['@type']).toBe('HowToStep');
});

test('extractRecipeFromAIResponse - handles error gracefully', () => {
  const response = {
    source: {
      output: [{
        content: [{
          text: '{ invalid json'
        }]
      }]
    }
  };
  
  const result = extractRecipeFromAIResponse(response, 'https://example.com');
  expect(result).toBe(null);
});

test('extractRecipeFromAIResponse - handles empty response', () => {
  const response = {};
  
  const result = extractRecipeFromAIResponse(response, 'https://example.com');
  expect(result).toBe(null);
});

test('extractRecipeFromAIResponse - handles missing content', () => {
  const response = {
    source: {
      output: []
    }
  };
  
  const result = extractRecipeFromAIResponse(response, 'https://example.com');
  expect(result).toBe(null);
});

test('extractRecipeFromAIResponse - handles alternative field names', () => {
  const response = {
    source: {
      output: [{
        content: [{
          text: JSON.stringify({
            title: 'Alternative Recipe',  // 'title' instead of 'name'
            image_url: 'https://example.com/image.jpg',  // 'image_url' instead of 'image'
            ingredients: ['ingredient 1', 'ingredient 2'],  // 'ingredients' instead of 'recipeIngredient'
            instructions: ['step 1', 'step 2']  // 'instructions' instead of 'recipeInstructions'
          })
        }]
      }]
    }
  };
  
  const result = extractRecipeFromAIResponse(response, 'https://example.com');
  expect(result.name).toBe('Alternative Recipe');
  expect(result.image).toBe('https://example.com/image.jpg');
  expect(result.ingredients.length).toBe(2);
  expect(result.instructions.length).toBe(2);
});

test('extractRecipeFromAIResponse - validates required fields', () => {
  const response = {
    source: {
      output: [{
        content: [{
          text: JSON.stringify({
            name: 'Incomplete Recipe',
            // Missing image and ingredients
            recipeInstructions: ['step']
          })
        }]
      }]
    }
  };
  
  const result = extractRecipeFromAIResponse(response, 'https://example.com');
  expect(result).toBe(null);
});

test('extractRecipeFromAIResponse - handles yield variations', () => {
  const response = {
    source: {
      output: [{
        content: [{
          text: JSON.stringify({
            name: 'Yield Recipe',
            image: 'https://example.com/image.jpg',
            recipeIngredient: ['ingredient'],
            recipeInstructions: ['step'],
            recipeYield: ['4 servings', '8 portions'],
            servings: '4-8'  // Alternative field
          })
        }]
      }]
    }
  };
  
  const result = extractRecipeFromAIResponse(response, 'https://example.com');
  expect(result.recipeYield).toBe('4 servings');
});

test('extractRecipeFromAIResponse - handles keywords variations', () => {
  const response = {
    source: {
      output: [{
        content: [{
          text: JSON.stringify({
            name: 'Keywords Recipe',
            image: 'https://example.com/image.jpg',
            recipeIngredient: ['ingredient'],
            recipeInstructions: ['step'],
            keywords: ['easy', 'quick', 'healthy'],
            tags: 'dinner, weeknight'  // Alternative field
          })
        }]
      }]
    }
  };
  
  const result = extractRecipeFromAIResponse(response, 'https://example.com');
  assert(result.keywords === 'easy, quick, healthy', 'Should join keywords array');
});

// Summary
console.log('\n' + '='.repeat(50));