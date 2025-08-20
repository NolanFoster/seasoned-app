// Test worker endpoints with actual source code implementation
import { 
  createMockEnv, 
  MockRequest,
  mockFetch,
  assertResponse,
  assertJsonResponse 
} from './test-helpers.js';

// Import the actual worker
import worker from '../src/index.js';

console.log('🧪 Testing Worker Endpoints\n');

// Override global fetch for recipe extraction tests
const originalFetch = global.fetch;
global.fetch = mockFetch;

// Test 1: Recipe Creation with All Fields
async function testCompleteRecipeCreation() {
  console.log('Test 1: Complete Recipe Creation');
  
  try {
    const env = createMockEnv();
    
    const newRecipe = {
      name: 'Chocolate Chip Cookies',
      description: 'Classic homemade cookies',
      ingredients: ['2 cups flour', '1 cup butter', '1 cup chocolate chips'],
      instructions: ['Cream butter and sugar', 'Add dry ingredients', 'Fold in chocolate chips', 'Bake at 375°F'],
      source_url: 'https://example.com/cookies',
      image_url: 'https://example.com/cookies.jpg'
    };
    
    const request = new MockRequest('http://localhost/recipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newRecipe)
    });
    
    const response = await worker.fetch(request, env);
    const createdRecipe = await assertJsonResponse(response, 201, (body) => {
      return body.id && 
             body.name === newRecipe.name &&
             body.description === newRecipe.description &&
             JSON.parse(body.ingredients).length === 3 &&
             JSON.parse(body.instructions).length === 4;
    });
    
    console.log('✅ Complete recipe creation passed');
    console.log(`   Recipe ID: ${createdRecipe.id}`);
    console.log(`   Ingredients count: ${JSON.parse(createdRecipe.ingredients).length}`);
    console.log(`   Instructions count: ${JSON.parse(createdRecipe.instructions).length}`);
    
    return true;
  } catch (error) {
    console.log('❌ Complete recipe creation failed:', error.message);
    return false;
  }
}

// Test 2: Recipe Creation from URL
async function testRecipeFromURL() {
  console.log('\nTest 2: Recipe Creation from URL');
  
  try {
    const env = createMockEnv();
    
    const request = new MockRequest('http://localhost/recipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://example-recipe.com/test-recipe'
      })
    });
    
    const response = await worker.fetch(request, env);
    const createdRecipe = await assertJsonResponse(response, 201, (body) => {
      return body.id && 
             body.name === 'Test Recipe' &&
             body.source_url === 'https://example-recipe.com/test-recipe' &&
             JSON.parse(body.ingredients).length === 3;
    });
    
    console.log('✅ Recipe from URL creation passed');
    console.log(`   Recipe name: ${createdRecipe.name}`);
    console.log(`   Source URL: ${createdRecipe.source_url}`);
    console.log(`   Extracted ingredients: ${JSON.parse(createdRecipe.ingredients).length}`);
    
    return true;
  } catch (error) {
    console.log('❌ Recipe from URL creation failed:', error.message);
    return false;
  }
}

// Test 3: Recipe Creation with Image Upload
async function testRecipeWithImageUpload() {
  console.log('\nTest 3: Recipe Creation with Image Upload');
  
  try {
    const env = createMockEnv();
    
    // Create form data with image
    const formData = new Map();
    formData.set('name', 'Pizza Margherita');
    formData.set('description', 'Classic Italian pizza');
    formData.set('ingredients', JSON.stringify(['dough', 'tomato sauce', 'mozzarella', 'basil']));
    formData.set('instructions', JSON.stringify(['Make dough', 'Add toppings', 'Bake in hot oven']));
    
    // Mock image file
    const imageFile = {
      name: 'pizza.jpg',
      type: 'image/jpeg',
      size: 1024 * 100, // 100KB
      stream: () => new ReadableStream(),
      arrayBuffer: async () => new ArrayBuffer(8)
    };
    formData.set('image', imageFile);
    
    const request = new MockRequest('http://localhost/recipe', {
      method: 'POST'
    });
    
    // Override formData method
    request.formData = async () => ({
      get: (key) => formData.get(key),
      has: (key) => formData.has(key),
      entries: () => formData.entries()
    });
    
    const response = await worker.fetch(request, env);
    const createdRecipe = await assertJsonResponse(response, 201, (body) => {
      return body.id && 
             body.name === 'Pizza Margherita' &&
             body.image_url && body.image_url.includes('recipe-1-');
    });
    
    console.log('✅ Recipe with image upload passed');
    console.log(`   Recipe ID: ${createdRecipe.id}`);
    console.log(`   Image URL: ${createdRecipe.image_url}`);
    
    // Verify image was uploaded to R2
    const uploadedImages = await env.R2_BUCKET.list({ prefix: 'recipe-1-' });
    if (uploadedImages.objects.length === 0) {
      throw new Error('Image was not uploaded to R2');
    }
    
    return true;
  } catch (error) {
    console.log('❌ Recipe with image upload failed:', error.message);
    return false;
  }
}

// Test 4: Update Recipe
async function testUpdateRecipe() {
  console.log('\nTest 4: Update Recipe');
  
  try {
    const env = createMockEnv();
    
    // First create a recipe
    env.DB.addMockRecipe({
      id: 1,
      name: 'Original Recipe',
      description: 'Original description',
      ingredients: JSON.stringify(['ingredient 1']),
      instructions: JSON.stringify(['step 1'])
    });
    
    const updateData = {
      name: 'Updated Recipe',
      description: 'Updated description',
      ingredients: ['new ingredient 1', 'new ingredient 2'],
      instructions: ['new step 1', 'new step 2', 'new step 3']
    };
    
    const request = new MockRequest('http://localhost/recipe/1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updateData)
    });
    
    const response = await worker.fetch(request, env);
    const updatedRecipe = await assertJsonResponse(response, 200, (body) => {
      return body.id === 1 &&
             body.name === updateData.name &&
             body.description === updateData.description;
    });
    
    console.log('✅ Update recipe passed');
    console.log(`   Updated name: ${updatedRecipe.name}`);
    console.log(`   New ingredients count: ${JSON.parse(updatedRecipe.ingredients).length}`);
    
    return true;
  } catch (error) {
    console.log('❌ Update recipe failed:', error.message);
    return false;
  }
}

// Test 5: Delete Recipe
async function testDeleteRecipe() {
  console.log('\nTest 5: Delete Recipe');
  
  try {
    const env = createMockEnv();
    
    // Add a recipe to delete
    env.DB.addMockRecipe({
      id: 1,
      name: 'Recipe to Delete',
      description: 'This will be deleted',
      image_url: 'https://test-images.example.com/recipe-1-abc123.jpg'
    });
    
    // Also add a mock image in R2
    await env.R2_BUCKET.put('recipe-1-abc123.jpg', new ArrayBuffer(8));
    
    const request = new MockRequest('http://localhost/recipe/1', {
      method: 'DELETE'
    });
    
    const response = await worker.fetch(request, env);
    assertResponse(response, 200);
    
    const result = await response.json();
    if (!result.message || !result.message.includes('deleted successfully')) {
      throw new Error('Delete response missing success message');
    }
    
    // Verify recipe was deleted from database
    if (env.DB.recipes.length !== 0) {
      throw new Error('Recipe was not deleted from database');
    }
    
    // Verify image was deleted from R2
    const remainingImages = await env.R2_BUCKET.list({ prefix: 'recipe-1-' });
    if (remainingImages.objects.length !== 0) {
      throw new Error('Image was not deleted from R2');
    }
    
    console.log('✅ Delete recipe passed');
    console.log('   Recipe and associated image deleted successfully');
    
    return true;
  } catch (error) {
    console.log('❌ Delete recipe failed:', error.message);
    return false;
  }
}

// Test 6: Image Upload Endpoint
async function testImageUploadEndpoint() {
  console.log('\nTest 6: Image Upload Endpoint');
  
  try {
    const env = createMockEnv();
    
    // Add a recipe to attach image to
    env.DB.addMockRecipe({
      id: 1,
      name: 'Recipe for Image',
      description: 'Needs an image'
    });
    
    // Create form data with image
    const formData = new Map();
    const imageFile = {
      name: 'recipe-image.jpg',
      type: 'image/jpeg',
      size: 1024 * 50, // 50KB
      stream: () => new ReadableStream(),
      arrayBuffer: async () => new ArrayBuffer(8)
    };
    formData.set('image', imageFile);
    formData.set('recipeId', '1');
    
    const request = new MockRequest('http://localhost/image', {
      method: 'POST'
    });
    
    // Override formData method
    request.formData = async () => ({
      get: (key) => formData.get(key),
      has: (key) => formData.has(key),
      entries: () => formData.entries()
    });
    
    const response = await worker.fetch(request, env);
    const result = await assertJsonResponse(response, 200, (body) => {
      return body.imageUrl && body.imageUrl.includes('recipe-1-');
    });
    
    console.log('✅ Image upload endpoint passed');
    console.log(`   Image URL: ${result.imageUrl}`);
    
    // Verify recipe was updated with image URL
    const updatedRecipe = env.DB.recipes.find(r => r.id === 1);
    if (!updatedRecipe.image_url) {
      throw new Error('Recipe was not updated with image URL');
    }
    
    return true;
  } catch (error) {
    console.log('❌ Image upload endpoint failed:', error.message);
    return false;
  }
}

// Test 7: Error Handling - Invalid JSON
async function testInvalidJSON() {
  console.log('\nTest 7: Invalid JSON Handling');
  
  try {
    const env = createMockEnv();
    
    const request = new MockRequest('http://localhost/recipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'invalid json {{'
    });
    
    const response = await worker.fetch(request, env);
    assertResponse(response, 400);
    
    const error = await response.json();
    if (!error.error || !error.error.toLowerCase().includes('json')) {
      throw new Error('Expected JSON parse error message');
    }
    
    console.log('✅ Invalid JSON handling passed');
    console.log(`   Error message: ${error.error}`);
    
    return true;
  } catch (error) {
    console.log('❌ Invalid JSON handling failed:', error.message);
    return false;
  }
}

// Test 8: Recipe Search/Filter
async function testRecipeSearch() {
  console.log('\nTest 8: Recipe Search (if implemented)');
  
  try {
    const env = createMockEnv();
    
    // Add recipes with different names
    env.DB.addMockRecipe({
      name: 'Chocolate Cake',
      description: 'Rich chocolate dessert'
    });
    env.DB.addMockRecipe({
      name: 'Vanilla Cake',
      description: 'Light vanilla dessert'
    });
    env.DB.addMockRecipe({
      name: 'Chocolate Cookies',
      description: 'Crunchy chocolate treats'
    });
    
    // Test search functionality if implemented
    const request = new MockRequest('http://localhost/recipes?search=chocolate', {
      method: 'GET'
    });
    
    const response = await worker.fetch(request, env);
    
    // If search is not implemented, it should return all recipes
    const recipes = await assertJsonResponse(response, 200, (body) => {
      return Array.isArray(body);
    });
    
    console.log('✅ Recipe search endpoint tested');
    console.log(`   Total recipes returned: ${recipes.length}`);
    
    return true;
  } catch (error) {
    console.log('❌ Recipe search failed:', error.message);
    return false;
  }
}

// Test 9: 404 Not Found
async function test404NotFound() {
  console.log('\nTest 9: 404 Not Found Handling');
  
  try {
    const env = createMockEnv();
    
    const request = new MockRequest('http://localhost/invalid-endpoint', {
      method: 'GET'
    });
    
    const response = await worker.fetch(request, env);
    assertResponse(response, 404);
    
    console.log('✅ 404 Not Found handling passed');
    
    return true;
  } catch (error) {
    console.log('❌ 404 Not Found handling failed:', error.message);
    return false;
  }
}

// Run all endpoint tests
async function runEndpointTests() {
  console.log('🚀 Starting Worker Endpoint Tests\n');
  
  const tests = [
    testCompleteRecipeCreation,
    testRecipeFromURL,
    testRecipeWithImageUpload,
    testUpdateRecipe,
    testDeleteRecipe,
    testImageUploadEndpoint,
    testInvalidJSON,
    testRecipeSearch,
    test404NotFound
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    try {
      const result = await test();
      if (result) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      console.log(`❌ Test failed with error:`, error.message);
      console.error(error.stack);
      failed++;
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Results:');
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📁 Total: ${tests.length}`);
  
  if (failed === 0) {
    console.log('\n🎉 All endpoint tests passed!');
  } else {
    console.log('\n⚠️  Some tests failed. Please check the output above.');
  }
  
  // Restore original fetch
  global.fetch = originalFetch;
  
  return { passed, failed, total: tests.length };
}

// Export for use in test runner
export { runEndpointTests };

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runEndpointTests();
}