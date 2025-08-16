// Import all testable functions from recipe-clipper.js
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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
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
  assert(result.name === 'Test Recipe', 'Should extract recipe name');
  assert(result.ingredients.length === 2, 'Should extract ingredients');
  assert(result.instructions.length === 2, 'Should extract instructions');
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
  assert(result === null, 'Should return null for null response');
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
  assert(result.prepTime === 'PT15M', 'Should preserve prep time');
  assert(result.cookTime === 'PT30M', 'Should preserve cook time');
  assert(result.totalTime === 'PT45M', 'Should preserve total time');
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
  assert(result.nutrition.calories === '250', 'Should extract calories');
  assert(result.nutrition.proteinContent === '10g', 'Should map protein to proteinContent');
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
  assert(result.aggregateRating.ratingValue === 4.5, 'Should extract rating value');
  assert(result.aggregateRating.reviewCount === 100, 'Should extract review count');
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
  assert(result.video.contentUrl === 'https://example.com/video.mp4', 'Should extract video URL');
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
  assert(result.image === 'https://example.com/1.jpg', 'Should use first image from array');
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
  assert(Array.isArray(result.instructions), 'Should convert string to array');
  assert(result.instructions.length === 2, 'Should split by newlines');
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
  assert(result.author === 'Chef John', 'Should extract name from author object');
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
  assert(result.name === 'Minimal Recipe', 'Should have name');
  assert(result.description === '', 'Should have empty description');
  assert(result.author === '', 'Should have empty author');
  assert(result.prepTime === '', 'Should have empty prep time');
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
  assert(result.instructions.length === 3, 'Should handle mixed instruction formats');
  assert(result.recipeInstructions.length === 3, 'Should format as HowToStep objects');
  assert(result.recipeInstructions[0]['@type'] === 'HowToStep', 'Should have HowToStep type');
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
  assert(result === null, 'Should return null for invalid JSON');
});

test('extractRecipeFromAIResponse - handles empty response', () => {
  const response = {};
  
  const result = extractRecipeFromAIResponse(response, 'https://example.com');
  assert(result === null, 'Should return null for empty response');
});

test('extractRecipeFromAIResponse - handles missing content', () => {
  const response = {
    source: {
      output: []
    }
  };
  
  const result = extractRecipeFromAIResponse(response, 'https://example.com');
  assert(result === null, 'Should return null for missing content');
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
  assert(result.name === 'Alternative Recipe', 'Should map title to name');
  assert(result.image === 'https://example.com/image.jpg', 'Should map image_url to image');
  assert(result.ingredients.length === 2, 'Should map ingredients array');
  assert(result.instructions.length === 2, 'Should map instructions array');
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
  assert(result === null, 'Should return null when missing required fields');
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
  assert(result.recipeYield === '4 servings', 'Should use first yield from array');
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
console.log('📊 Fixed Unit Test Summary:');
console.log(`   ✅ Passed: ${passedTests}`);
console.log(`   ❌ Failed: ${failedTests}`);
console.log(`   📁 Total: ${passedTests + failedTests}`);

if (failedTests === 0) {
  console.log('\n🎉 All fixed unit tests passed!');
  process.exit(0);
} else {
  console.log('\n⚠️  Some fixed unit tests failed.');
  process.exit(1);
}