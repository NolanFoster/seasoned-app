# Recipe App Shared Library

This directory contains shared utilities and functions used across multiple workers in the recipe app.

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

## Testing

The shared library functions are tested indirectly through the worker tests. To test the library directly:

```javascript
import { generateRecipeId } from './kv-storage.js';

// Test ID generation
const id = await generateRecipeId('https://example.com/recipe');
console.log('Generated ID:', id);
```
