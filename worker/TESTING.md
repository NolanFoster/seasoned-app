# Recipe Clipper Testing Guide

This directory contains comprehensive tests for the recipe clipper functionality, specifically designed to test against the Cloudflare AI response structure.

## Test Files

### 1. `test-recipe-clipper.js` - Comprehensive Tests
Tests various scenarios including:
- Valid recipe responses
- Alternative field names (title, ingredient_list, steps)
- String-based ingredients/instructions that need to be split
- Edge cases and error handling

### 2. `test-null-response.js` - Null Response Tests
Specifically tests the null response scenario from the user's example:
- Tests the exact response structure from truncated HTML
- Tests various null-like responses
- Tests edge cases with malformed responses

### 3. `test-allrecipes.js` - AllRecipes Specific Tests
Tests specifically designed for AllRecipes recipes:
- Tests against the Chef John's Salt-Roasted Chicken recipe
- Validates AllRecipes recipe structure and data
- Tests various response formats from AllRecipes
- Recipe data validation and field mapping

### 4. `run-tests.js` - Test Runner
Runs all test suites in sequence for complete coverage.

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Specific Test Suites
```bash
# Comprehensive tests only
npm run test:comprehensive

# Null response tests only
npm run test:null

# AllRecipes specific tests only
npm run test:allrecipes
```

### Run Tests Directly
```bash
# Run all tests
node run-tests.js

# Run specific test files
node test-recipe-clipper.js
node test-null-response.js
node test-allrecipes.js
```

## Test Scenarios Covered

### ✅ Valid Recipe Extraction
- Complete recipe with all required fields
- Recipe with alternative field names
- Recipe with string-based arrays that need splitting

### ✅ Null Response Handling
- AI returns `null` when HTML is truncated
- AI returns `"null"` string
- AI returns empty object `{}`
- AI returns object with null values

### ✅ AllRecipes Specific Tests
- Complete recipe extraction from AllRecipes
- Alternative field name handling (title, ingredient_list, steps)
- String-based ingredients/instructions splitting
- Minimal recipe data validation
- Recipe structure validation
- AllRecipes URL and image validation

### ✅ Edge Cases
- Missing response structure
- Empty arrays
- Malformed JSON
- Missing content

### ✅ Error Handling
- Invalid JSON responses
- Malformed response structures
- Missing required fields

## Example Test Output

```
🧪 Running AllRecipes Recipe Clipper Tests

Testing against: https://www.allrecipes.com/recipe/235171/chef-johns-salt-roasted-chicken/

Test 1: AllRecipes - Chef John's Salt-Roasted Chicken - Complete Recipe
Description: Complete recipe extraction from AllRecipes with all fields populated
✅ PASSED

📊 AllRecipes Test Results: 6 passed, 0 failed
🎉 All AllRecipes tests passed!
```

## Key Test Case: AllRecipes Recipe

The AllRecipes tests specifically validate against the Chef John's Salt-Roasted Chicken recipe:

**Recipe Details:**
- **Name**: Chef John's Salt-Roasted Chicken
- **Source**: https://www.allrecipes.com/recipe/235171/chef-johns-salt-roasted-chicken/
- **Ingredients**: 9 ingredients including whole chicken, kosher salt, olive oil, herbs, lemon, garlic, and onion
- **Instructions**: 7 detailed cooking steps
- **Cooking Time**: 1 hour 15 minutes
- **Servings**: 6 people
- **Difficulty**: Easy

This test ensures that the recipe clipper can properly extract and format AllRecipes content with:
- Proper field mapping
- Array handling
- Time and serving information
- Image URL validation
- Source URL preservation

## Adding New Tests

To add new test cases:

1. **Add to `testCases` array** in `test-recipe-clipper.js` for general scenarios
2. **Add to specific test functions** in `test-null-response.js` for edge cases
3. **Add to `allRecipesTestCases` array** in `test-allrecipes.js` for AllRecipes specific scenarios
4. **Follow the existing pattern**:
   ```javascript
   {
     name: "Test description",
     response: mockResponseObject,
     expected: expectedResult,
     description: "Detailed explanation"
   }
   ```

## Test Dependencies

The tests require the `extractRecipeFromAIResponse` function to be exported from `./src/recipe-clipper.js`. Make sure this function is properly exported:

```javascript
export { extractRecipeFromAIResponse };
```

## Troubleshooting

### Common Issues

1. **Module not found**: Ensure `extractRecipeFromAIResponse` is exported
2. **Test failures**: Check that the expected results match the actual function behavior
3. **JSON parsing errors**: Verify the mock response structures are valid

### Debug Mode

Add console.log statements in the test files to debug specific test cases:

```javascript
console.log('Response structure:', JSON.stringify(testCase.response, null, 2));
console.log('Function result:', result);
```

## Test Coverage

These tests cover:
- ✅ Response parsing from Cloudflare AI
- ✅ JSON extraction and cleaning
- ✅ Field validation and mapping
- ✅ Error handling and edge cases
- ✅ Null response scenarios
- ✅ Alternative field name handling
- ✅ Data type conversion and cleaning
- ✅ AllRecipes specific recipe structure
- ✅ Recipe data validation
- ✅ URL and image validation
- ✅ Cooking time and servings validation

The test suite ensures the recipe clipper is robust and handles all the scenarios we've encountered in production, with special focus on AllRecipes content extraction. 