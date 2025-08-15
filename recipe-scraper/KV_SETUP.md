# KV Database Setup for Recipe Scraper

This guide explains how to set up and use the KV (Key-Value) database functionality in the recipe-scraper worker.

## Overview

The recipe-scraper now supports storing scraped recipes in Cloudflare's KV database using the URL hash as the key. This provides:

- **Persistent storage** of scraped recipes
- **Fast retrieval** by recipe ID (hashed URL)
- **Batch operations** for multiple recipes
- **CRUD operations** (Create, Read, Update, Delete)

## Setup Instructions

### 1. Prerequisites

- Cloudflare account with Workers enabled
- Wrangler CLI installed and authenticated
- Recipe-scraper worker code

### 2. Create KV Namespace

Run the automated setup script:

```bash
npm run setup-kv
```

This script will:
- Create a production KV namespace
- Create a preview KV namespace for development
- Update `wrangler.toml` with the correct namespace IDs

### 3. Manual Setup (Alternative)

If the automated script doesn't work, you can set up manually:

```bash
# Create production namespace
npx wrangler kv namespace create "RECIPE_STORAGE"

# Create preview namespace
npx wrangler kv namespace create "RECIPE_STORAGE" --preview
```

Then manually update `wrangler.toml` with the returned IDs.

### 4. Deploy the Worker

```bash
npm run deploy
```

## API Endpoints

### Scrape and Store Recipe

**GET** `/scrape?url=<recipe-url>&save=true`

Scrapes a recipe and optionally saves it to KV storage.

```bash
curl "https://your-worker.workers.dev/scrape?url=https://example.com/recipe&save=true"
```

**POST** `/scrape`

Scrapes multiple recipes with JSON body:

```json
{
  "urls": ["https://example.com/recipe1", "https://example.com/recipe2"],
  "save": true
}
```

### Retrieve Recipe

**GET** `/recipes?id=<recipe-id>`

Retrieves a specific recipe by its ID (hashed URL).

```bash
curl "https://your-worker.workers.dev/recipes?id=<hashed-url-id>"
```

### List All Recipes

**GET** `/recipes?limit=50&cursor=<cursor>`

Lists all stored recipes with pagination support.

```bash
curl "https://your-worker.workers.dev/recipes?limit=10"
```

### Delete Recipe

**DELETE** `/recipes?id=<recipe-id>`

Deletes a specific recipe by its ID.

```bash
curl -X DELETE "https://your-worker.workers.dev/recipes?id=<hashed-url-id>"
```

### Health Check

**GET** `/health`

Returns service status and available features.

```bash
curl "https://your-worker.workers.dev/health"
```

## Data Structure

Each recipe stored in KV has the following structure:

```json
{
  "id": "sha256-hash-of-url",
  "url": "https://example.com/recipe",
  "data": {
    "name": "Recipe Name",
    "description": "Recipe description",
    "ingredients": ["ingredient 1", "ingredient 2"],
    "instructions": ["step 1", "step 2"],
    "cookTime": "30 minutes",
    "prepTime": "15 minutes",
    "totalTime": "45 minutes",
    "servings": 4,
    "nutrition": {...},
    "image": "https://example.com/image.jpg"
  },
  "scrapedAt": "2024-01-01T12:00:00.000Z",
  "version": "1.0"
}
```

## Testing

### Local Development

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Run the KV test script:
   ```bash
   npm run test-kv
   ```

### Production Testing

Update the `WORKER_URL` in `test-kv.js` to your deployed worker URL and run:

```bash
npm run test-kv
```

## Key Features

### URL Hashing

Recipes are stored using SHA-256 hash of the source URL as the key:

```javascript
// Example: URL -> Hash
"https://example.com/recipe" -> "a1b2c3d4e5f6..."
```

This ensures:
- **Unique keys** for each recipe
- **Consistent retrieval** by URL
- **No collisions** between different recipes

### Error Handling

The API includes comprehensive error handling:

- **400 Bad Request**: Missing parameters or invalid input
- **404 Not Found**: Recipe not found in KV
- **500 Internal Server Error**: KV operation failures

### Pagination

Recipe listing supports pagination for large datasets:

- `limit`: Number of recipes per page (default: 50, max: 1000)
- `cursor`: Pagination cursor for next page

## Troubleshooting

### Common Issues

1. **KV namespace not found**
   - Ensure `wrangler.toml` has correct namespace IDs
   - Run `npx wrangler kv namespace list` to verify

2. **Permission errors**
   - Check that your account has KV access
   - Verify Wrangler authentication: `npx wrangler whoami`

3. **Worker deployment fails**
   - Check `wrangler.toml` syntax
   - Verify namespace IDs are valid

### Debug Commands

```bash
# List KV namespaces
npx wrangler kv namespace list

# View KV data (development)
npx wrangler kv key get --binding=RECIPE_STORAGE <key>

# List KV keys
npx wrangler kv key list --binding=RECIPE_STORAGE

# View worker logs
npm run tail
```

## Performance Considerations

- **KV read operations**: ~1ms latency
- **KV write operations**: ~10ms latency
- **Storage limits**: 25GB per namespace
- **Key size**: 512 bytes max
- **Value size**: 25MB max

## Security

- All data is encrypted at rest
- Access controlled by Cloudflare account permissions
- No sensitive data should be stored in recipe content
- Consider implementing rate limiting for production use

## Next Steps

1. **Rate Limiting**: Implement rate limiting for production use
2. **Caching**: Add caching layer for frequently accessed recipes
3. **Search**: Implement full-text search across stored recipes
4. **Analytics**: Track scraping and storage metrics
5. **Backup**: Set up regular backups of KV data
