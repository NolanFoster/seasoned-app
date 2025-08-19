# Recipe App Shared Library

This directory contains shared utilities and functions used across multiple workers in the recipe app.

## Utility Functions

The `utility-functions.js` module provides common utility functions used across the application.

### Functions

#### `formatDuration(duration)`
Converts ISO 8601 duration strings to human-readable format.

**Parameters:**
- `duration` (string): ISO 8601 duration string (e.g., "PT1H30M")

**Returns:** Human-readable duration string (e.g., "1 h 30 m")

**Examples:**
```javascript
import { formatDuration } from '../shared/utility-functions.js';

formatDuration('PT1H30M');  // "1 h 30 m"
formatDuration('PT45M');     // "45 m"
formatDuration('PT2H');      // "2 h"
formatDuration('1 hour 30 minutes'); // "1 hour 30 minutes" (returns as-is)
```

#### `isValidUrl(string)`
Validates if a string is a valid URL.

**Parameters:**
- `string` (string): String to validate as URL

**Returns:** Boolean indicating if the string is a valid URL

**Examples:**
```javascript
import { isValidUrl } from '../shared/utility-functions.js';

isValidUrl('https://example.com');     // true
isValidUrl('http://example.com');      // true
isValidUrl('www.example.com');         // true
isValidUrl('example.com');             // true
isValidUrl('not-a-url');               // false
```

### Usage

```javascript
import { formatDuration, isValidUrl } from '../shared/utility-functions.js';

// Format recipe cooking time
const cookingTime = formatDuration(recipe.cookTime);

// Validate user input URL
if (isValidUrl(userInput)) {
  // Process valid URL
}
```

## KV Storage Library

The `kv-storage.js` module provides a complete set of functions for managing recipe data in Cloudflare KV storage.

### Features

- **Compression**: Automatic gzip compression/decompression for efficient storage
- **Backward Compatibility**: Handles both compressed and uncompressed data formats
- **Error Handling**: Comprehensive error handling with detailed logging
- **Metadata Support**: Functions for retrieving recipe metadata without full data
- **Pagination**: Support for listing recipes with cursor-based pagination

### Functions

#### Core Functions

- `generateRecipeId(url)` - Generate a unique SHA-256 hash ID from a URL
- `saveRecipeToKV(env, recipeId, recipeData)` - Save recipe data to KV storage
- `getRecipeFromKV(env, recipeId)` - Retrieve recipe data from KV storage
- `deleteRecipeFromKV(env, recipeId)` - Delete recipe from KV storage

#### Utility Functions

- `listRecipesFromKV(env, cursor, limit)` - List recipes with pagination
- `recipeExistsInKV(env, recipeId)` - Check if recipe exists without loading data
- `getRecipeMetadata(env, recipeId)` - Get recipe metadata without full data

#### Compression Functions

- `compressData(data)` - Compress data using gzip and encode as base64
- `decompressData(compressedBase64)` - Decompress base64-encoded gzip data

### Usage

```javascript
import { 
  generateRecipeId, 
  saveRecipeToKV, 
  getRecipeFromKV 
} from '../shared/kv-storage.js';

// Generate ID for a recipe URL
const recipeId = await generateRecipeId('https://example.com/recipe');

// Save recipe data
const saveResult = await saveRecipeToKV(env, recipeId, {
  url: 'https://example.com/recipe',
  data: recipeData
});

// Retrieve recipe data
const getResult = await getRecipeFromKV(env, recipeId);
if (getResult.success) {
  const recipe = getResult.recipe;
  console.log('Recipe:', recipe.data.name);
}
```

### Data Format

Recipes are stored in the following format:

```javascript
{
  id: "sha256-hash-of-url",
  url: "https://example.com/recipe",
  data: {
    name: "Recipe Name",
    ingredients: ["ingredient 1", "ingredient 2"],
    instructions: ["step 1", "step 2"],
    // ... other recipe fields
  },
  scrapedAt: "2024-01-01T12:00:00.000Z",
  version: "1.1"
}
```

### Error Handling

All functions return objects with a `success` boolean and either:
- `success: true` with the requested data
- `success: false` with an `error` message

### Compression

Data is automatically compressed using gzip compression to reduce storage costs. The library handles:
- Automatic compression when saving
- Automatic decompression when reading
- Backward compatibility with uncompressed data
- Error handling for corrupted data

### Performance Considerations

- **Compression**: Reduces storage costs by ~70-80%
- **Metadata Queries**: Use `getRecipeMetadata()` for listing without loading full data
- **Batch Operations**: Use `listRecipesFromKV()` with pagination for large datasets
- **Existence Checks**: Use `recipeExistsInKV()` for quick existence checks

## Workers Using This Library

- **recipe-clipper**: Uses KV functions for caching extracted recipes
- **recipe-scraper**: Uses KV functions for storing scraped recipes

## Configuration

Both workers must have the same KV namespace binding:

```toml
[[kv_namespaces]]
binding = "RECIPE_STORAGE"
id = "dd001c20659a4d6982f6d650abcac880"
preview_id = "3f8a3b17db9e4f8ea3eae83d864ad518"
```

## Development

To add new functions to the shared library:

1. Add the function to `kv-storage.js`
2. Export it using `export function functionName()`
3. Import it in the workers that need it
4. Update this README with documentation

## Nutrition Calculator

The `nutrition-calculator.js` module provides functionality to calculate nutritional facts for recipes using the USDA FoodData Central API.

### Functions

#### `calculateNutritionalFacts(ingredients, apiKey, servings)`
Calculates nutritional information for a list of ingredients.

**Parameters:**
- `ingredients` (Array): Array of ingredient objects with `name`, `quantity`, and `unit` properties
- `apiKey` (string): USDA FoodData Central API key
- `servings` (number, optional): Number of servings the recipe makes (default: 1)

**Returns:** Promise resolving to an object with nutrition information in recipe schema format

**Examples:**
```javascript
import { calculateNutritionalFacts } from '../shared/nutrition-calculator.js';

const ingredients = [
  { name: 'apple', quantity: 1, unit: 'medium' },
  { name: 'banana', quantity: 1, unit: 'large' },
  { name: 'oats', quantity: 0.5, unit: 'cup' },
  { name: 'milk', quantity: 1, unit: 'cup' }
];

// Calculate nutrition for the recipe (serves 2)
const result = await calculateNutritionalFacts(ingredients, env.FDC_API_KEY, 2);

if (result.success) {
  console.log('Nutrition per serving:', result.nutrition);
  // Result includes: calories, proteinContent, fatContent, carbohydrateContent, etc.
} else {
  console.error('Error:', result.error);
}
```

#### `validateIngredients(ingredients)`
Validates the format of an ingredients array.

**Parameters:**
- `ingredients` (Array): Array of ingredients to validate

**Returns:** Object with `valid` boolean and `errors` array

**Examples:**
```javascript
import { validateIngredients } from '../shared/nutrition-calculator.js';

const validation = validateIngredients(ingredients);
if (!validation.valid) {
  console.error('Validation errors:', validation.errors);
}
```

#### `getSupportedUnits()`
Returns lists of supported measurement units.

**Returns:** Object containing arrays of supported units by type (weight, volume, count)

**Examples:**
```javascript
import { getSupportedUnits } from '../shared/nutrition-calculator.js';

const units = getSupportedUnits();
console.log('Weight units:', units.weight); // ['g', 'kg', 'oz', 'lb', ...]
console.log('Volume units:', units.volume); // ['ml', 'l', 'cup', 'tbsp', ...]
console.log('Count units:', units.count);   // ['small', 'medium', 'large', ...]
```

### Advanced Usage

For more control, you can use the exported classes directly:

```javascript
import { 
  USDANutritionClient, 
  UnitConverter, 
  NutritionAggregator 
} from '../shared/nutrition-calculator.js';

// Direct API access
const client = new USDANutritionClient(apiKey);
const searchResults = await client.searchFood('apple');

// Unit conversion
const gramsFromCup = UnitConverter.convertToGrams(1, 'cup', 1.0);

// Nutrition aggregation
const aggregator = new NutritionAggregator();
const totals = aggregator.aggregateNutrition([nutrition1, nutrition2]);
```

### Environment Setup

The nutrition calculator requires a USDA FoodData Central API key. Set this as an environment variable in your Cloudflare Worker:

**Using wrangler.toml:**
```toml
[vars]
FDC_API_KEY = "your-api-key-here"
```

**Using Cloudflare Dashboard:**
1. Navigate to Workers & Pages → Your Worker → Settings
2. Under Variables and Secrets, add `FDC_API_KEY`
3. Set the value to your USDA API key

### Supported Units

The nutrition calculator supports automatic unit conversion for:

- **Weight units:** grams (g), kilograms (kg), ounces (oz), pounds (lb)
- **Volume units:** milliliters (ml), liters (l), cups, tablespoons (tbsp), teaspoons (tsp), fluid ounces (fl oz), pints, quarts, gallons
- **Count units:** small, medium, large, piece, item, serving

### Schema Format

The nutrition data is returned in Recipe schema format compatible with the existing recipe structure:

```json
{
  "@type": "NutritionInformation",
  "calories": "250Cal",
  "proteinContent": "8.5g",
  "fatContent": "12.3g",
  "carbohydrateContent": "28.7g",
  "fiberContent": "4.2g",
  "sugarContent": "15.1g",
  "sodiumContent": "180mg",
  "cholesterolContent": "25mg",
  "saturatedFatContent": "3.2g",
  "transFatContent": "0g",
  "unsaturatedFatContent": "8.1g",
  "servingSize": "2"
}
```

## Testing

The shared library includes comprehensive tests. Run them with:

```bash
# Test all shared library functions
npm run test:all

# Test nutrition calculator specifically
npm run test:nutrition

# Test with real API (requires FDC_API_KEY environment variable)
FDC_API_KEY=your-key npm run test:nutrition
```

Individual function testing:

```javascript
import { generateRecipeId } from './kv-storage.js';
import { calculateNutritionalFacts } from './nutrition-calculator.js';

// Test ID generation
const id = await generateRecipeId('https://example.com/recipe');
console.log('Generated ID:', id);

// Test nutrition calculation
const result = await calculateNutritionalFacts(ingredients, apiKey);
console.log('Nutrition result:', result);
```
