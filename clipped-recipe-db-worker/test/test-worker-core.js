// Test core worker functionality with actual source code
import { 
  createMockEnv, 
  MockRequest, 
  MockResponse,
  mockFetch,
  assertResponse,
  assertJsonResponse 
} from './test-helpers.js';

// Import the actual worker
import worker from '../src/index.js';

console.log('🧪 Testing Worker Core Functionality\n');

// Override global fetch for save worker calls
const originalFetch = global.fetch;
global.fetch = mockFetch;

// Test 1: Health Check Endpoint
async function testHealthEndpoint() {
  console.log('Test 1: Health Check Endpoint');
  
  try {
    const env = createMockEnv();
    const request = new MockRequest('http://localhost/health', { method: 'GET' });
    
    const response = await worker.fetch(request, env);
    const healthData = await assertJsonResponse(response, 200, (body) => {
      return (body.status === 'HEALTHY' || body.status === 'DEGRADED') &&
             body.checks &&
             body.checks.database &&
             body.checks.r2 &&
             body.timestamp;
    });
    
    console.log('✅ Health check endpoint passed');
    console.log(`   Status: ${healthData.status}`);
    console.log(`   Database: ${healthData.checks.database.status}`);
    console.log(`   R2 Storage: ${healthData.checks.r2.status}`);
    return true;
  } catch (error) {
    console.log('❌ Health check endpoint failed:', error.message);
    return false;
  }
}

// Test 2: CORS Preflight Handling
async function testCORSPreflight() {
  console.log('\nTest 2: CORS Preflight Handling');
  
  try {
    const env = createMockEnv();
    const request = new MockRequest('http://localhost/recipe', { 
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://localhost:3000',
        'Access-Control-Request-Method': 'POST'
      }
    });
    
    const response = await worker.fetch(request, env);
    assertResponse(response, 200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    
    console.log('✅ CORS preflight handling passed');
    return true;
  } catch (error) {
    console.log('❌ CORS preflight handling failed:', error.message);
    return false;
  }
}

// Test 3: Get All Recipes
async function testGetAllRecipes() {
  console.log('\nTest 3: Get All Recipes Endpoint');
  
  try {
    const env = createMockEnv();
    
    // Add mock recipes
    env.DB.addMockRecipe({
      name: 'Chocolate Cake',
      description: 'Delicious chocolate cake',
      ingredients: JSON.stringify(['flour', 'sugar', 'cocoa']),
      instructions: JSON.stringify(['Mix ingredients', 'Bake at 350°F']),
      image_url: 'https://example.com/cake.jpg',
      source_url: 'https://example.com/recipe/cake'
    });
    
    env.DB.addMockRecipe({
      name: 'Apple Pie',
      description: 'Classic apple pie',
      ingredients: JSON.stringify(['apples', 'flour', 'butter']),
      instructions: JSON.stringify(['Make crust', 'Add filling', 'Bake']),
      image_url: 'https://example.com/pie.jpg',
      source_url: 'https://example.com/recipe/pie'
    });
    
    const request = new MockRequest('http://localhost/recipes', { method: 'GET' });
    const response = await worker.fetch(request, env);
    
    const recipes = await assertJsonResponse(response, 200, (body) => {
      return Array.isArray(body) && body.length === 2;
    });
    
    console.log('✅ Get all recipes endpoint passed');
    console.log(`   Found ${recipes.length} recipes`);
    console.log(`   First recipe: ${recipes[0].name}`);
    return true;
  } catch (error) {
    console.log('❌ Get all recipes endpoint failed:', error.message);
    return false;
  }
}

// Test 4: Get Recipe by ID
async function testGetRecipeById() {
  console.log('\nTest 4: Get Recipe by ID Endpoint');
  
  try {
    const env = createMockEnv();
    
    // Add a mock recipe
    env.DB.addMockRecipe({
      id: 1,
      name: 'Test Recipe',
      description: 'A test recipe',
      ingredients: JSON.stringify(['ingredient 1', 'ingredient 2']),
      instructions: JSON.stringify(['step 1', 'step 2']),
      image_url: 'https://example.com/test.jpg',
      source_url: 'https://example.com/recipe/test'
    });
    
    // Test existing recipe
    const request = new MockRequest('http://localhost/recipe/1', { method: 'GET' });
    const response = await worker.fetch(request, env);
    
    const recipe = await assertJsonResponse(response, 200, (body) => {
      return body.id === 1 && body.name === 'Test Recipe';
    });
    
    console.log('✅ Get recipe by ID (existing) passed');
    console.log(`   Recipe: ${recipe.name}`);
    
    // Test non-existing recipe
    const request404 = new MockRequest('http://localhost/recipe/999', { method: 'GET' });
    const response404 = await worker.fetch(request404, env);
    
    assertResponse(response404, 404);
    console.log('✅ Get recipe by ID (not found) passed');
    
    return true;
  } catch (error) {
    console.log('❌ Get recipe by ID endpoint failed:', error.message);
    return false;
  }
}

// Test 5: Create Recipe
async function testCreateRecipe() {
  console.log('\nTest 5: Create Recipe Endpoint');
  
  try {
    const env = createMockEnv();
    
    const newRecipe = {
      name: 'New Test Recipe',
      description: 'A newly created recipe',
      ingredients: ['flour', 'eggs', 'milk'],
      instructions: ['Mix all ingredients', 'Cook until done'],
      source_url: 'https://example.com/new-recipe'
    };
    
    const request = new MockRequest('http://localhost/recipe', { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newRecipe)
    });
    
    const response = await worker.fetch(request, env);
    const createdRecipe = await assertJsonResponse(response, 201, (body) => {
      return body.id && body.message === 'Recipe created';
    });
    
    console.log('✅ Create recipe endpoint passed');
    console.log(`   Created recipe ID: ${createdRecipe.id}`);
    console.log(`   Message: ${createdRecipe.message}`);
    
    return true;
  } catch (error) {
    console.log('❌ Create recipe endpoint failed:', error.message);
    return false;
  }
}

// Test 6: Invalid Request Handling
async function testInvalidRequests() {
  console.log('\nTest 6: Invalid Request Handling');
  
  try {
    const env = createMockEnv();
    
    // Test with invalid JSON
    const request = new MockRequest('http://localhost/recipe', { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'invalid json {'
    });
    
    const response = await worker.fetch(request, env);
    assertResponse(response, 500);
    
    const errorBody = await response.json();
    if (!errorBody.error || !errorBody.details.toLowerCase().includes('json')) {
      throw new Error('Expected JSON parse error message');
    }
    
    console.log('✅ Invalid request handling passed');
    console.log('   Correctly rejected invalid JSON');
    
    return true;
  } catch (error) {
    console.log('❌ Invalid request handling failed:', error.message);
    return false;
  }
}

// Test 7: Database Error Handling
async function testDatabaseErrorHandling() {
  console.log('\nTest 7: Database Error Handling');
  
  try {
    const env = createMockEnv();
    
    // Override prepare to simulate database error
    const originalPrepare = env.DB.prepare;
    env.DB.prepare = () => {
      throw new Error('Database connection failed');
    };
    
    const request = new MockRequest('http://localhost/recipes', { method: 'GET' });
    const response = await worker.fetch(request, env);
    
    assertResponse(response, 500);
    const errorText = await response.text();
    
    if (!errorText.includes('Internal Server Error')) {
      throw new Error('Expected internal server error message');
    }
    
    // Restore original method
    env.DB.prepare = originalPrepare;
    
    console.log('✅ Database error handling passed');
    console.log('   Error properly caught and returned');
    
    return true;
  } catch (error) {
    console.log('❌ Database error handling failed:', error.message);
    return false;
  }
}

// Test 8: Recipe with Limit Parameter
async function testRecipesWithLimit() {
  console.log('\nTest 8: Get Recipes with Limit Parameter');
  
  try {
    const env = createMockEnv();
    
    // Add multiple mock recipes
    for (let i = 1; i <= 5; i++) {
      env.DB.addMockRecipe({
        name: `Recipe ${i}`,
        description: `Description ${i}`,
        ingredients: [`ingredient ${i}`],
        instructions: [`instruction ${i}`]
      });
    }
    
    const request = new MockRequest('http://localhost/recipes?limit=3', { method: 'GET' });
    const response = await worker.fetch(request, env);
    
    const recipes = await assertJsonResponse(response, 200, (body) => {
      // Check that it's an array with max 3 items (due to limit)
      return Array.isArray(body) && body.length === 3;
    });
    
    console.log('✅ Get recipes with limit passed');
    console.log(`   Requested limit: 3`);
    console.log(`   Returned recipes: ${recipes.length}`);
    
    return true;
  } catch (error) {
    console.log('❌ Get recipes with limit failed:', error.message);
    return false;
  }
}

// Run all tests
async function runWorkerCoreTests() {
  console.log('🚀 Starting Worker Core Tests\n');
  
  const tests = [
    testHealthEndpoint,
    testCORSPreflight,
    testGetAllRecipes,
    testGetRecipeById,
    testCreateRecipe,
    testInvalidRequests,
    testDatabaseErrorHandling,
    testRecipesWithLimit
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
    console.log('\n🎉 All worker core tests passed!');
  } else {
    console.log('\n⚠️  Some tests failed. Please check the output above.');
  }
  
  // Restore original fetch
  global.fetch = originalFetch;
  
  return { passed, failed, total: tests.length };
}

// Export for use in test runner
export { runWorkerCoreTests };

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runWorkerCoreTests();
}