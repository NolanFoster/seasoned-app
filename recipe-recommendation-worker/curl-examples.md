# cURL Examples for Recipe Names Endpoint

## Basic Usage

### Get recipe names for Italian and Asian cuisine (default limit: 5)
```bash
curl -X POST http://localhost:8787/recipe-names \
  -H "Content-Type: application/json" \
  -d '{
    "categories": ["Italian Cuisine", "Asian Fusion"]
  }'
```

### Get recipe names with custom limit (3 per category)
```bash
curl -X POST http://localhost:8787/recipe-names \
  -H "Content-Type: application/json" \
  -d '{
    "categories": ["Comfort Food", "Desserts"],
    "limit": 3
  }'
```

### Get recipe names for single category with high limit
```bash
curl -X POST http://localhost:8787/recipe-names \
  -H "Content-Type: application/json" \
  -d '{
    "categories": ["Healthy Options"],
    "limit": 10
  }'
```

## Error Cases

### Missing categories (should return 400)
```bash
curl -X POST http://localhost:8787/recipe-names \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Empty categories array (should return 400)
```bash
curl -X POST http://localhost:8787/recipe-names \
  -H "Content-Type: application/json" \
  -d '{
    "categories": []
  }'
```

### Wrong HTTP method (should return 405)
```bash
curl -X GET http://localhost:8787/recipe-names
```

## Production Examples

### Using the deployed worker
```bash
curl -X POST https://recipe-recommendation-worker.nolanfoster.workers.dev/recipe-names \
  -H "Content-Type: application/json" \
  -d '{
    "categories": ["Quick Meals", "Desserts"],
    "limit": 4
  }'
```

### Using staging environment
```bash
curl -X POST https://staging-recipe-recommendation-worker.nolanfoster.workers.dev/recipe-names \
  -H "Content-Type: application/json" \
  -d '{
    "categories": ["Italian Cuisine"],
    "limit": 6
  }'
```

## Expected Response Format

The endpoint returns a JSON response with this structure:

```json
{
  "recipeNames": {
    "Category Name": [
      "Recipe Name 1",
      "Recipe Name 2",
      "Recipe Name 3"
    ]
  },
  "requestId": "req_1234567890_abc123",
  "processingTime": "245ms",
  "recipesPerCategory": 3,
  "categories": ["Category Name"]
}
```

## Notes

- **Categories**: Array of strings, required
- **Limit**: Optional integer, defaults to 5, max 20
- **Method**: POST only
- **Content-Type**: application/json required
- **AI Fallback**: Falls back to mock data if AI is unavailable
- **Rate Limiting**: Subject to Cloudflare Workers AI rate limits