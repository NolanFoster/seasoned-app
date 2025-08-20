# Clipped Recipe DB Worker Tests

This directory contains comprehensive tests for the Clipped Recipe DB Worker, completely rewritten to use the actual source code instead of mocks.

## Test Structure

### 1. **test-helpers.js**
Contains mock implementations and utilities for testing Cloudflare Workers:
- `MockD1Database` - Simulates Cloudflare D1 database operations
- `MockR2Bucket` - Simulates Cloudflare R2 storage operations
- `MockRequest` / `MockResponse` - HTTP request/response mocks
- Assertion utilities for validating responses

### 2. **test-worker-core.js**
Tests core worker functionality:
- Health check endpoint
- CORS preflight handling
- Basic CRUD operations for recipes
- Database error handling
- Request validation

### 3. **test-worker-endpoints.js**
Tests all API endpoints with real worker implementation:
- Recipe creation (JSON and form data)
- Recipe retrieval (single and list)
- Recipe updates
- Recipe deletion
- Image upload functionality
- Error handling for various edge cases

### 4. **test-recipe-extraction.js**
Tests recipe extraction from URLs:
- JSON-LD structured data parsing
- Microdata parsing
- Multiple recipe format handling
- Error cases (404, invalid JSON, no recipe data)

### 5. **test-integration.js**
End-to-end integration tests:
- Complete recipe lifecycle (create, read, update, delete)
- Recipe with image workflow
- Recipe extraction and modification workflow
- Error recovery scenarios
- Concurrent operations handling

## Running Tests

### Run all tests:
```bash
npm test
# or
node test/run-tests.js
```

### Run specific test suites:
```bash
# Core functionality tests only
node test/run-tests.js --core

# Endpoint tests only
node test/run-tests.js --endpoints

# Recipe extraction tests only
node test/run-tests.js --extraction

# Integration tests only
node test/run-tests.js --integration
```

### Run individual test files:
```bash
node test/test-worker-core.js
node test/test-worker-endpoints.js
node test/test-recipe-extraction.js
node test/test-integration.js
```

## Test Coverage

The tests cover:
- ✅ All API endpoints (GET, POST, PUT, DELETE)
- ✅ Recipe CRUD operations
- ✅ Image upload and management
- ✅ Recipe extraction from URLs
- ✅ Error handling and edge cases
- ✅ CORS configuration
- ✅ Database operations
- ✅ R2 storage operations
- ✅ Concurrent request handling

## Key Features

1. **Real Source Code Testing**: All tests import and test the actual `src/index.js` worker implementation
2. **Comprehensive Mocking**: Full mocks for Cloudflare D1 and R2 services
3. **Integration Testing**: End-to-end workflows that test multiple features together
4. **Error Scenarios**: Extensive testing of error cases and recovery
5. **Detailed Output**: Clear test results with helpful debugging information

## Adding New Tests

To add new tests:

1. Choose the appropriate test file based on what you're testing
2. Use the mock utilities from `test-helpers.js`
3. Import the worker from `../src/index.js`
4. Follow the existing test patterns
5. Ensure your test returns `true` for success, `false` for failure
6. Add your test function to the appropriate test suite array

Example:
```javascript
async function testNewFeature() {
  console.log('\nTest X: New Feature');
  
  try {
    const env = createMockEnv();
    const request = new MockRequest('http://localhost/new-endpoint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: 'test' })
    });
    
    const response = await worker.fetch(request, env);
    await assertJsonResponse(response, 200, (body) => {
      return body.success === true;
    });
    
    console.log('✅ New feature test passed');
    return true;
  } catch (error) {
    console.log('❌ New feature test failed:', error.message);
    return false;
  }
}
```

## Debugging Tests

If tests fail:

1. Check the detailed error output in the console
2. Look for the specific test that failed
3. Review the assertion that failed
4. Check if the worker implementation changed
5. Verify mock data matches expected format
6. Use `console.log` to debug intermediate values

## Coverage

To run tests with coverage:
```bash
npm run test:coverage
```

This will generate a coverage report showing which parts of the source code are tested.