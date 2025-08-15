# Recipe Scraper

A Cloudflare Worker that scrapes recipe data from URLs using JSON-LD structured data. This worker efficiently extracts recipe information without full DOM parsing using Cloudflare's HTMLRewriter API.

## Features

- **Efficient HTML Parsing**: Uses Cloudflare's native HTMLRewriter for fast, streaming HTML processing
- **JSON-LD Extraction**: Extracts and validates Recipe schema from `<script type="application/ld+json">` tags
- **Schema.org Compliance**: Validates against [schema.org/Recipe](https://schema.org/Recipe) standards
- **Batch Processing**: Supports both single URL and batch URL processing
- **Data Normalization**: Normalizes ingredients and instructions into consistent arrays
- **Unique ID Generation**: Creates SHA-256 hash-based IDs for each recipe URL
- **Flexible Type Recognition**: Handles various Recipe type formats (`Recipe`, `schema:Recipe`, `https://schema.org/Recipe`)

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure your Cloudflare account in `wrangler.toml`:
```toml
account_id = "your-account-id"
```

3. Run locally:
```bash
npm run dev
```

4. Deploy to Cloudflare:
```bash
npm run deploy
```

## API Endpoints

### `/scrape` - Scrape Recipe Data

#### GET Request (Single URL)
```bash
curl "https://your-worker.workers.dev/scrape?url=https://example.com/recipe"
```

#### POST Request (Batch URLs)
```bash
curl -X POST "https://your-worker.workers.dev/scrape" \
  -H "Content-Type: application/json" \
  -d '{
    "urls": [
      "https://example.com/recipe1",
      "https://example.com/recipe2"
    ]
  }'
```

#### Response Format
```json
{
  "results": [
    {
      "success": true,
      "url": "https://example.com/recipe",
      "data": {
        "id": "sha256-hash-of-url",
        "name": "Recipe Name",
        "description": "Recipe description",
        "url": "https://example.com/recipe",
        "image": "https://example.com/image.jpg",
        "author": "Author Name",
        "datePublished": "2024-01-01",
        "prepTime": "PT15M",
        "cookTime": "PT30M",
        "totalTime": "PT45M",
        "recipeYield": "4 servings",
        "recipeCategory": "Main Course",
        "recipeCuisine": "Italian",
        "keywords": "pasta, italian, easy",
        "ingredients": [
          "1 cup flour",
          "2 eggs"
        ],
        "instructions": [
          "Mix ingredients",
          "Cook for 30 minutes"
        ],
        "nutrition": {},
        "aggregateRating": {}
      }
    }
  ],
  "summary": {
    "total": 1,
    "successful": 1,
    "failed": 0
  }
}
```

### `/health` - Health Check
```bash
curl "https://your-worker.workers.dev/health"
```

Response:
```json
{
  "status": "healthy",
  "service": "recipe-scraper"
}
```

## Data Processing

### Supported Recipe Fields

The worker extracts and normalizes the following Recipe schema fields:

- `name` - Recipe title
- `description` - Recipe description
- `image` - Main recipe image URL
- `author` - Recipe author (name extracted if object)
- `datePublished` - Publication date
- `prepTime` - Preparation time (ISO 8601 duration)
- `cookTime` - Cooking time (ISO 8601 duration)
- `totalTime` - Total time (ISO 8601 duration)
- `recipeYield` - Number of servings
- `recipeCategory` - Recipe category
- `recipeCuisine` - Cuisine type
- `keywords` - Recipe keywords
- `ingredients` - Array of ingredient strings
- `instructions` - Array of instruction steps
- `nutrition` - Nutrition information object
- `aggregateRating` - Rating information object

### Data Normalization

1. **Ingredients**: Converted to array of strings, extracting text from various formats
2. **Instructions**: Converted to array of strings, handling HowToStep and HowToSection formats
3. **Unique ID**: SHA-256 hash of the recipe URL for consistent identification

### Schema.org Validation

The worker validates JSON-LD data to ensure it conforms to [schema.org/Recipe](https://schema.org/Recipe) standards:

1. **Type Recognition**: Accepts various Recipe type formats:
   - `"@type": "Recipe"`
   - `"@type": "schema:Recipe"`
   - `"@type": "https://schema.org/Recipe"`
   - `"@type": "http://schema.org/Recipe"`
   - Arrays containing any of the above

2. **Context Validation**: Checks for proper schema.org context:
   - `"@context": "https://schema.org"`
   - `"@context": "http://schema.org"`
   - Complex contexts with `@vocab` referencing schema.org

3. **Structure Support**:
   - Direct Recipe objects
   - Recipe objects within `@graph` arrays
   - Nested Recipe structures

## Error Handling

Failed scrapes return error information:
```json
{
  "success": false,
  "url": "https://example.com/not-a-recipe",
  "error": "No valid Recipe JSON-LD found"
}
```

## Development

### Local Testing
```bash
# Start local development server
npm run dev

# Test single URL
curl "http://localhost:8787/scrape?url=https://www.allrecipes.com/recipe/123"

# Test batch URLs
curl -X POST "http://localhost:8787/scrape" \
  -H "Content-Type: application/json" \
  -d '{"urls": ["url1", "url2"]}'
```

### Deployment
```bash
# Deploy to Cloudflare Workers
npm run deploy

# View logs
npm run tail
```

## Extending the Worker

### Adding Database Storage

Uncomment and configure in `wrangler.toml`:

```toml
# For KV storage
[[kv_namespaces]]
binding = "RECIPE_CACHE"
id = "your-kv-namespace-id"

# For Durable Objects
[[durable_objects.bindings]]
name = "RECIPE_STORAGE"
class_name = "RecipeStorage"
```

### Adding Microdata/RDFa Support

The worker can be extended to support other structured data formats:
1. Add new HTMLRewriter handlers for microdata attributes
2. Create parsers for RDFa vocabulary
3. Merge with existing JSON-LD extraction logic

## License

MIT