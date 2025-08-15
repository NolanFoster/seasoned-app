# Recipe Clipper KV Integration

The recipe clipper has been updated to include KV storage functionality, providing caching capabilities and improved performance.

## Features Added

### 1. Automatic Caching
- **First Request**: When a recipe URL is clipped for the first time, the recipe is extracted and automatically saved to KV storage
- **Subsequent Requests**: If the same URL is requested again, the cached version is returned immediately without re-processing
- **Performance**: Cached responses are much faster and don't consume AI tokens

### 2. KV Storage Integration
- Uses the same KV namespace as the recipe scraper worker
- Compressed storage using gzip compression to save space
- Automatic handling of both compressed and uncompressed data formats

### 3. New Endpoints

#### `POST /clip`
Enhanced clipping endpoint that now:
- Checks KV cache first
- Returns cached version if available
- Extracts and saves new recipes if not cached
- Includes metadata about caching status

**Response includes:**
- `cached`: Boolean indicating if response came from cache
- `recipeId`: Unique hash ID for the recipe
- `savedToKV`: Boolean indicating if save to KV was successful
- `scrapedAt`: Timestamp when recipe was originally scraped (for cached responses)

#### `GET /cached?url=<recipe-url>`
Direct access to cached recipes without triggering extraction.

**Response:**
- Recipe data if found in cache
- 404 error if not found

#### `DELETE /cached?url=<recipe-url>`
Clears a specific recipe from the cache.

**Response:**
- Success message with recipe ID
- 404 error if recipe not found in cache

#### `GET /health`
Enhanced health check that includes:
- Service status
- Available features
- Endpoint documentation

## Configuration

### KV Namespace Binding
The clipper now requires the same KV namespace as the recipe scraper:

```toml
[[kv_namespaces]]
binding = "RECIPE_STORAGE"
id = "dd001c20659a4d6982f6d650abcac880"
preview_id = "3f8a3b17db9e4f8ea3eae83d864ad518"
```

### Environment Variables
No additional environment variables are required beyond the existing AI binding.

## Usage Examples

### Basic Clipping (with caching)
```bash
curl -X POST https://your-clipper-worker.workers.dev/clip \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.allrecipes.com/recipe/example"}'
```

### Check if Recipe is Cached
```bash
curl "https://your-clipper-worker.workers.dev/cached?url=https://www.allrecipes.com/recipe/example"
```

### Clear Recipe from Cache
```bash
curl -X DELETE "https://your-clipper-worker.workers.dev/cached?url=https://www.allrecipes.com/recipe/example"
```

### Health Check
```bash
curl "https://your-clipper-worker.workers.dev/health"
```

## Response Format

### Successful Clip Response
```json
{
  "name": "Recipe Name",
  "ingredients": ["ingredient 1", "ingredient 2"],
  "instructions": ["step 1", "step 2"],
  "cached": false,
  "recipeId": "abc123...",
  "savedToKV": true
}
```

### Cached Response
```json
{
  "name": "Recipe Name",
  "ingredients": ["ingredient 1", "ingredient 2"],
  "instructions": ["step 1", "step 2"],
  "cached": true,
  "recipeId": "abc123...",
  "scrapedAt": "2024-01-01T12:00:00.000Z"
}
```

## Benefits

1. **Performance**: Cached responses are returned instantly
2. **Cost Savings**: Reduces AI token usage for repeated requests
3. **Reliability**: Cached recipes are available even if the original site is down
4. **Consistency**: Same recipe data returned for identical URLs
5. **Storage Efficiency**: Compressed storage reduces KV usage

## Testing

Use the provided test script to verify KV integration:

```bash
node test-kv-integration.js
```

Make sure to update the `CLIPPER_URL` in the test script to match your deployed worker URL.

## Migration Notes

- Existing clipper functionality remains unchanged
- New caching behavior is transparent to clients
- All existing API responses are backward compatible
- Additional metadata fields are optional and can be ignored by clients

## Troubleshooting

### KV Storage Not Available
If you see errors about KV storage not being available:
1. Ensure the KV namespace is properly configured in `wrangler.toml`
2. Verify the KV namespace ID is correct
3. Check that the worker has the necessary permissions

### Cache Not Working
If caching doesn't seem to work:
1. Check the worker logs for KV-related errors
2. Verify the recipe ID generation is consistent
3. Test the `/cached` endpoint directly

### Performance Issues
If you experience performance issues:
1. Monitor KV storage usage
2. Consider implementing cache expiration
3. Check for large recipe data that might exceed KV limits
