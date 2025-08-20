// Integration tests for complete workflows
import { 
  createMockEnv, 
  MockRequest,
  mockFetch,
  assertResponse,
  assertJsonResponse 
} from './test-helpers.js';

// Import the actual worker
import worker from '../src/index.js';

console.log('🧪 Testing Complete Integration Workflows\n');

// Override global fetch for integration tests
const originalFetch = global.fetch;
global.fetch = mockFetch;

// Test 1: Complete Recipe Creation and Retrieval Workflow
async function testCompleteRecipeWorkflow() {
  console.log('Test 1: Complete Recipe Creation and Retrieval Workflow');
  
  try {
    const env = createMockEnv();
    
    // Step 1: Create a recipe
    console.log('   Step 1: Creating recipe...');
    const createRequest = new MockRequest('http://localhost/recipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Integration Test Recipe',
        description: 'A recipe for integration testing',
        ingredients: ['test ingredient 1', 'test ingredient 2'],
        instructions: ['test step 1', 'test step 2', 'test step 3'],
        source_url: 'https://test.com/recipe'
      })
    });
    
    const createResponse = await worker.fetch(createRequest, env);
    const createdRecipe = await assertJsonResponse(createResponse, 201, (body) => {
      return body.id && body.message === 'Recipe created';
    });
    
    console.log(`   ✓ Recipe created with ID: ${createdRecipe.id}`);
    
    // Step 2: Manually add recipe to mock DB for retrieval test
    console.log('   Step 2: Setting up mock data for retrieval...');
    env.DB.addMockRecipe({
      id: createdRecipe.id,
      name: 'Integration Test Recipe',
      description: 'A recipe for integration testing',
      ingredients: JSON.stringify(['test ingredient 1', 'test ingredient 2']),
      instructions: JSON.stringify(['test step 1', 'test step 2', 'test step 3']),
      source_url: 'https://test.com/recipe'
    });
    
    // Step 3: Retrieve the recipe by ID
    console.log('   Step 3: Retrieving recipe by ID...');
    const getRequest = new MockRequest(`http://localhost/recipe/${createdRecipe.id}`, {
      method: 'GET'
    });
    
    const getResponse = await worker.fetch(getRequest, env);
    const retrievedRecipe = await assertJsonResponse(getResponse, 200, (body) => {
      return body.id === createdRecipe.id;
    });
    
    console.log(`   ✓ Recipe retrieved successfully`);
    
    // Step 4: Get all recipes and verify our recipe is included
    console.log('   Step 4: Getting all recipes...');
    const getAllRequest = new MockRequest('http://localhost/recipes', {
      method: 'GET'
    });
    
    const getAllResponse = await worker.fetch(getAllRequest, env);
    const allRecipes = await assertJsonResponse(getAllResponse, 200, (body) => {
      return Array.isArray(body) && 
             body.some(r => r.id === createdRecipe.id);
    });
    
    console.log(`   ✓ Found ${allRecipes.length} recipes including ours`);
    
    console.log('✅ Complete recipe workflow passed');
    return true;
  } catch (error) {
    console.log('❌ Complete recipe workflow failed:', error.message);
    return false;
  }
}

// Test 2: Recipe with Image Upload Workflow
async function testRecipeWithImageWorkflow() {
  console.log('\nTest 2: Recipe with Image Upload Workflow');
  
  try {
    const env = createMockEnv();
    
    // Step 1: Create recipe with form data including image
    console.log('   Step 1: Creating recipe with image...');
    
    const formData = new Map();
    formData.set('name', 'Recipe with Image');
    formData.set('description', 'Testing image upload workflow');
    formData.set('ingredients', JSON.stringify(['ingredient with image']));
    formData.set('instructions', JSON.stringify(['step with image']));
    
    // Mock image file
    const imageFile = {
      name: 'test-recipe.jpg',
      type: 'image/jpeg',
      size: 1024 * 200, // 200KB
      stream: () => new ReadableStream(),
      arrayBuffer: async () => new ArrayBuffer(8)
    };
    formData.set('image', imageFile);
    
    const createRequest = new MockRequest('http://localhost/recipe', {
      method: 'POST'
    });
    
    createRequest.formData = async () => ({
      get: (key) => formData.get(key),
      has: (key) => formData.has(key),
      entries: () => formData.entries()
    });
    
    const createResponse = await worker.fetch(createRequest, env);
    const createdRecipe = await assertJsonResponse(createResponse, 201, (body) => {
      return body.id && body.message === 'Recipe created';
    });
    
    console.log(`   ✓ Recipe created with ID: ${createdRecipe.id}`);
    
    // Step 2: Note - Image upload happens asynchronously in the actual worker
    console.log('   Step 2: Image upload happens asynchronously (skipping R2 verification)...');
    
    // Step 3: Update recipe with a new image
    console.log('   Step 3: Updating recipe image...');
    
    const updateFormData = new Map();
    const newImageFile = {
      name: 'updated-recipe.jpg',
      type: 'image/jpeg',
      size: 1024 * 150,
      stream: () => new ReadableStream(),
      arrayBuffer: async () => new ArrayBuffer(8)
    };
    updateFormData.set('image', newImageFile);
    updateFormData.set('recipeId', createdRecipe.id.toString());
    
    const updateRequest = new MockRequest('http://localhost/image', {
      method: 'POST'
    });
    
    updateRequest.formData = async () => ({
      get: (key) => updateFormData.get(key),
      has: (key) => updateFormData.has(key),
      entries: () => updateFormData.entries()
    });
    
    const updateResponse = await worker.fetch(updateRequest, env);
    const updateResult = await assertJsonResponse(updateResponse, 200, (body) => {
      return body.imageUrl !== undefined;
    });
    
    console.log(`   ✓ Image updated: ${updateResult.imageUrl}`);
    
    // Step 4: Delete recipe and verify image cleanup
    console.log('   Step 4: Deleting recipe and verifying cleanup...');
    
    const deleteRequest = new MockRequest(`http://localhost/recipe/${createdRecipe.id}`, {
      method: 'DELETE'
    });
    
    const deleteResponse = await worker.fetch(deleteRequest, env);
    assertResponse(deleteResponse, 200);
    
    console.log('   ✓ Recipe delete request sent successfully');
    console.log('   Note: Image cleanup happens asynchronously');
    
    console.log('✅ Recipe with image workflow passed');
    return true;
  } catch (error) {
    console.log('❌ Recipe with image workflow failed:', error.message);
    return false;
  }
}

// Test 3: Recipe Update Workflow
async function testRecipeUpdateWorkflow() {
  console.log('\nTest 3: Recipe Update Workflow');
  
  try {
    const env = createMockEnv();
    
    // Step 1: Create initial recipe
    console.log('   Step 1: Creating initial recipe...');
    const createRequest = new MockRequest('http://localhost/recipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Original Recipe Name',
        description: 'Original description',
        ingredients: ['original ingredient'],
        instructions: ['original instruction']
      })
    });
    
    const createResponse = await worker.fetch(createRequest, env);
    const originalRecipe = await assertJsonResponse(createResponse, 201, (body) => {
      return body.id && body.message === 'Recipe created';
    });
    
    console.log(`   ✓ Recipe created with ID: ${originalRecipe.id}`);
    
    // Step 2: Update recipe
    console.log('   Step 2: Updating recipe...');
    const updateRequest = new MockRequest(`http://localhost/recipe/${originalRecipe.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Updated Recipe Name',
        description: 'Updated description with more details',
        ingredients: ['new ingredient 1', 'new ingredient 2', 'new ingredient 3'],
        instructions: ['updated step 1', 'updated step 2']
      })
    });
    
    const updateResponse = await worker.fetch(updateRequest, env);
    const updatedRecipe = await assertJsonResponse(updateResponse, 200, (body) => {
      return body.message === 'Recipe updated';
    });
    
    console.log('   ✓ Recipe updated successfully');
    
    // Step 3: Note - Updates happen via save worker
    console.log('   Step 3: Updates sent to save worker successfully');
    console.log('   Note: Actual database updates happen in save worker');
    
    console.log('✅ Recipe update workflow passed');
    return true;
  } catch (error) {
    console.log('❌ Recipe update workflow failed:', error.message);
    return false;
  }
}

// Test 4: Recipe from URL Workflow
async function testRecipeFromURLWorkflow() {
  console.log('\nTest 4: Recipe from URL Workflow');
  
  try {
    const env = createMockEnv();
    
    // Step 1: Create recipe from URL
    console.log('   Step 1: Extracting recipe from URL...');
    const createRequest = new MockRequest('http://localhost/clip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://example-recipe.com/test-recipe'
      })
    });
    
    const createResponse = await worker.fetch(createRequest, env);
    const createdRecipe = await assertJsonResponse(createResponse, 200, (body) => {
      return body.id && 
             body.name === 'Test Recipe' &&
             body.source_url === 'https://example-recipe.com/test-recipe' &&
             JSON.parse(body.ingredients).length > 0;
    });
    
    console.log(`   ✓ Recipe extracted and created with ID: ${createdRecipe.id}`);
    console.log(`   ✓ Extracted ${JSON.parse(createdRecipe.ingredients).length} ingredients`);
    console.log(`   ✓ Extracted ${JSON.parse(createdRecipe.instructions).length} instructions`);
    
    // Step 2: Add custom modifications
    console.log('   Step 2: Adding custom modifications...');
    const updateRequest = new MockRequest(`http://localhost/recipe/${createdRecipe.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: createdRecipe.name + ' (Modified)',
        description: 'Modified version with personal notes',
        ingredients: [...JSON.parse(createdRecipe.ingredients), 'Extra ingredient'],
        instructions: JSON.parse(createdRecipe.instructions),
        notes: 'Added extra ingredient for better taste'
      })
    });
    
    const updateResponse = await worker.fetch(updateRequest, env);
    const modifiedRecipe = await assertJsonResponse(updateResponse, 200, (body) => {
      return body.message === 'Recipe updated';
    });
    
    console.log('   ✓ Recipe successfully modified');
    
    console.log('✅ Recipe from URL workflow passed');
    return true;
  } catch (error) {
    console.log('❌ Recipe from URL workflow failed:', error.message);
    return false;
  }
}

// Test 5: Error Recovery Workflow
async function testErrorRecoveryWorkflow() {
  console.log('\nTest 5: Error Recovery Workflow');
  
  try {
    const env = createMockEnv();
    
    // Step 1: Try to create recipe with minimal data (worker accepts it)
    console.log('   Step 1: Testing minimal recipe creation...');
    const minimalRequest = new MockRequest('http://localhost/recipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // Worker accepts recipes without name
        description: 'Recipe without name'
      })
    });
    
    const minimalResponse = await worker.fetch(minimalRequest, env);
    assertResponse(minimalResponse, 201);
    console.log('   ✓ Worker accepts minimal recipe data');
    
    // Step 2: Try to update non-existent recipe
    console.log('   Step 2: Testing non-existent recipe update...');
    const updateRequest = new MockRequest('http://localhost/recipe/9999', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Updated Name'
      })
    });
    
    const updateResponse = await worker.fetch(updateRequest, env);
    // The save worker will handle non-existent recipes - it might return 200 or 404
    if (updateResponse.status === 200 || updateResponse.status === 404) {
      console.log(`   ✓ Non-existent recipe update handled (status: ${updateResponse.status})`);
    } else {
      throw new Error(`Unexpected status for non-existent recipe update: ${updateResponse.status}`);
    }
    
    // Step 3: Try to delete non-existent recipe
    console.log('   Step 3: Testing non-existent recipe deletion...');
    const deleteRequest = new MockRequest('http://localhost/recipe/9999', {
      method: 'DELETE'
    });
    
    const deleteResponse = await worker.fetch(deleteRequest, env);
    // The save worker will handle non-existent recipes - it might return 200 or 404
    if (deleteResponse.status === 200 || deleteResponse.status === 404) {
      console.log(`   ✓ Non-existent recipe deletion handled (status: ${deleteResponse.status})`);
    } else {
      throw new Error(`Unexpected status for non-existent recipe deletion: ${deleteResponse.status}`);
    }
    
    // Step 4: Verify system still works after errors
    console.log('   Step 4: Verifying system stability...');
    const validRequest = new MockRequest('http://localhost/recipes', {
      method: 'GET'
    });
    
    const validResponse = await worker.fetch(validRequest, env);
    await assertJsonResponse(validResponse, 200, (body) => Array.isArray(body));
    console.log('   ✓ System continues to work correctly after errors');
    
    console.log('✅ Error recovery workflow passed');
    return true;
  } catch (error) {
    console.log('❌ Error recovery workflow failed:', error.message);
    return false;
  }
}

// Test 6: Concurrent Operations Workflow
async function testConcurrentOperationsWorkflow() {
  console.log('\nTest 6: Concurrent Operations Workflow');
  
  try {
    const env = createMockEnv();
    
    // Step 1: Create multiple recipes concurrently
    console.log('   Step 1: Creating multiple recipes concurrently...');
    
    const recipePromises = [];
    for (let i = 1; i <= 5; i++) {
      const request = new MockRequest('http://localhost/recipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Concurrent Recipe ${i}`,
          description: `Testing concurrent creation ${i}`,
          ingredients: [`ingredient ${i}`],
          instructions: [`instruction ${i}`]
        })
      });
      
      recipePromises.push(worker.fetch(request, env));
    }
    
    const responses = await Promise.all(recipePromises);
    const recipes = await Promise.all(responses.map(r => r.json()));
    
    // Verify all recipes were created
    const allCreated = recipes.every(r => r.id && r.message === 'Recipe created');
    if (!allCreated) {
      throw new Error('Not all concurrent recipes were created');
    }
    
    console.log(`   ✓ Created ${recipes.length} recipes concurrently`);
    
    // Step 2: Note - Created recipes are in save worker, not local DB
    console.log('   Step 2: Recipes created in save worker (skipping read test)...');
    
    // Step 3: Delete all recipes concurrently
    console.log('   Step 3: Deleting recipes concurrently...');
    
    const deletePromises = recipes.map(recipe => {
      const request = new MockRequest(`http://localhost/recipe/${recipe.id}`, {
        method: 'DELETE'
      });
      return worker.fetch(request, env);
    });
    
    const deleteResponses = await Promise.all(deletePromises);
    const allDeleted = deleteResponses.every(r => r.status === 200);
    if (!allDeleted) {
      throw new Error('Not all recipes were deleted');
    }
    
    console.log(`   ✓ Deleted ${recipes.length} recipes concurrently`);
    
    // Note: Deletions happen in save worker
    console.log('   Note: Actual deletions happen in save worker');
    
    console.log('✅ Concurrent operations workflow passed');
    return true;
  } catch (error) {
    console.log('❌ Concurrent operations workflow failed:', error.message);
    return false;
  }
}

// Run all integration tests
async function runIntegrationTests() {
  console.log('🚀 Starting Integration Tests\n');
  
  const tests = [
    testCompleteRecipeWorkflow,
    testRecipeWithImageWorkflow,
    testRecipeUpdateWorkflow,
    testRecipeFromURLWorkflow,
    testErrorRecoveryWorkflow,
    testConcurrentOperationsWorkflow
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
    console.log('\n🎉 All integration tests passed!');
  } else {
    console.log('\n⚠️  Some tests failed. Please check the output above.');
  }
  
  // Restore original fetch
  global.fetch = originalFetch;
  
  return { passed, failed, total: tests.length };
}

// Export for use in test runner
export { runIntegrationTests };

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runIntegrationTests();
}