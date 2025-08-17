# Recipe Save Worker

A Cloudflare Worker with Durable Objects for atomic recipe saves to KV store with automatic search database synchronization and image processing.

## Overview

This worker provides a robust, atomic way to save recipes to Cloudflare KV storage while ensuring data consistency and automatic synchronization with the search database. It uses Durable Objects to guarantee write atomicity and prevent race conditions. Additionally, it automatically downloads and stores recipe images in R2 storage.

## Features

- **Atomic Operations**: Uses Durable Objects to ensure writes are atomic and consistent
- **Search Database Sync**: Automatically updates the search database when recipes are saved, updated, or deleted
- **Image Processing**: Downloads external images and stores them in R2, replacing URLs with CDN-hosted versions
- **Data Compression**: Compresses recipe data before storage to optimize KV usage
- **Batch Operations**: Supports batch processing of multiple recipe operations
- **Operation Status Tracking**: Tracks the status of each operation for monitoring and debugging
- **Version Control**: Maintains version numbers for recipes to track updates
- **Graceful Error Handling**: Continues with KV operations even if search sync or image download fails

## Architecture

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│   Client App    │────▶│  Recipe Save Worker  │────▶│   KV Storage    │
└─────────────────┘     └──────────────────────┘     └─────────────────┘
                                    │                          
                                    │                          
                        ┌───────────▼──────────┐              
                        │   Durable Object     │              
                        │   (RecipeSaver)      │              
                        └───────────┬──────────┘              
                                    │                          
                        ┌───────────┴──────────┐     ┌─────────────────┐
                        │  Search Database     │     │   R2 Storage    │
                        │      Worker          │     │  (Images)       │
                        └──────────────────────┘     └─────────────────┘
```

## API Endpoints

### Health Check
```http
GET /health
```
Returns the worker's health status.

### Recipe Save
```http
POST /recipe/save
Content-Type: application/json

{
  "recipe": {
    "url": "https://example.com/recipe",
    "title": "Recipe Title",
    "description": "Recipe description",
    "ingredients": ["ingredient1", "ingredient2"],
    "instructions": ["step1", "step2"],
    "prepTime": "15 minutes",
    "cookTime": "30 minutes",
    "servings": "4",
    "cuisine": "Italian",
    "tags": ["tag1", "tag2"],
    "imageUrl": "https://example.com/image.jpg",
    "images": ["https://example.com/step1.jpg", "https://example.com/step2.jpg"],
    "author": "Author Name"
  },
  "options": {
    "overwrite": false  // Set to true to overwrite existing recipe
  }
}
```

### Recipe Update
```http
PUT /recipe/update
Content-Type: application/json

{
  "recipeId": "recipe-id-hash",
  "updates": {
    "title": "Updated Title",
    "description": "Updated description",
    "imageUrl": "https://example.com/new-image.jpg"
    // Any other fields to update
  }
}
```

### Recipe Delete
```http
DELETE /recipe/delete
Content-Type: application/json

{
  "recipeId": "recipe-id-hash"
}
```

### Operation Status
```http
GET /recipe/status?id=recipe-id-hash
```

### Batch Operations
```http
POST /batch
Content-Type: application/json

{
  "operations": [
    {
      "id": "op1",
      "type": "save",
      "data": {
        "recipe": { /* recipe data */ }
      }
    },
    {
      "id": "op2",
      "type": "update",
      "data": {
        "recipeId": "recipe-id",
        "updates": { /* update data */ }
      }
    },
    {
      "id": "op3",
      "type": "delete",
      "data": {
        "recipeId": "recipe-id"
      }
    }
  ]
}
```

## Response Format

### Success Response
```json
{
  "success": true,
  "id": "recipe-id-hash",
  "recipe": {
    "id": "recipe-id-hash",
    "title": "Recipe Title",
    "imageUrl": "https://images.nolanfoster.me/recipe-id-hash/imageUrl_1234567890.jpg",
    "images": [
      "https://images.nolanfoster.me/recipe-id-hash/images_0_1234567890.jpg",
      "https://images.nolanfoster.me/recipe-id-hash/images_1_1234567890.jpg"
    ],
    "_originalImageUrls": ["https://example.com/original.jpg"],
    // ... other recipe fields with metadata
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error message description"
}
```

### Batch Response
```json
{
  "results": [
    {
      "success": true,
      "id": "recipe-id",
      "operationId": "op1"
    },
    {
      "success": false,
      "error": "Error message",
      "operationId": "op2"
    }
  ]
}
```

## Image Processing

The worker automatically processes images in recipes:

### Automatic Download
- Detects external image URLs in recipe data
- Downloads images from external sources
- Supports common image formats: JPEG, PNG, GIF, WebP, AVIF, SVG

### R2 Storage
- Stores images in R2 with structured paths: `{recipeId}/{fieldName}_{timestamp}.{extension}`
- Sets appropriate content types and cache headers
- Maintains metadata about original URLs and upload times

### URL Replacement
- Replaces external URLs with CDN-hosted R2 URLs
- Preserves original URLs in `_originalImageUrls` field for reference
- Skips already processed R2 URLs to avoid re-downloading

### Supported Image Fields
- `imageUrl`: Main recipe image
- `images[]`: Array of additional images (e.g., for steps)

### Error Handling
- If image download fails, the original URL is preserved
- Image processing failures don't block recipe save operations
- Failed downloads are logged for monitoring

### Image Deletion
- When a recipe is deleted, associated images are removed from R2
- Handles deletion errors gracefully

## Development

### Prerequisites
- Node.js 16+
- Cloudflare account with Workers enabled
- Wrangler CLI installed

### Setup
1. Clone the repository
2. Install dependencies:
   ```bash
   cd recipe-save-worker
   npm install
   ```

3. Configure your KV namespace and Durable Objects in `wrangler.toml`

4. Run locally:
   ```bash
   npm run dev
   ```

### Testing
Run the test suite:
```bash
npm test
```

Run tests with coverage:
```bash
npm run test:coverage
```

The test suite includes:
- Worker functionality tests
- Image processing tests
- Durable Object tests
- Integration tests

### Deployment

Deploy to preview:
```bash
npm run deploy:preview
```

Deploy to production:
```bash
npm run deploy:production
```

Monitor logs:
```bash
npm run tail:production
```

## Configuration

### Environment Variables
- `SEARCH_DB_URL`: URL of the search database worker
- `IMAGE_DOMAIN`: Domain for serving recipe images (R2 public bucket URL)

### KV Namespace
The worker requires a KV namespace binding named `RECIPE_STORAGE` for storing recipe data.

### Durable Objects
The worker uses a Durable Object class `RecipeSaver` bound as `RECIPE_SAVER` for atomic operations.

### R2 Bucket
The worker requires an R2 bucket binding named `RECIPE_IMAGES` for storing recipe images.

### Optional Bindings
- `ANALYTICS`: Analytics Engine for monitoring (optional)

## Data Storage Format

### KV Storage
Recipes are stored in KV with:
- **Key**: SHA-256 hash of the recipe URL
- **Value**: Compressed JSON containing:
  - Recipe data
  - Metadata (id, createdAt, updatedAt, version)
  - Processed image URLs
  - Original image URLs reference

### R2 Storage
Images are stored in R2 with:
- **Key**: `{recipeId}/{fieldName}_{timestamp}.{extension}`
- **Metadata**:
  - `recipeId`: Associated recipe ID
  - `originalUrl`: Original image URL
  - `field`: Field name in recipe (e.g., 'imageUrl', 'images')
  - `uploadedAt`: Upload timestamp

## Search Database Integration

The worker automatically synchronizes with the search database:
- Creates nodes for new recipes
- Updates nodes when recipes are modified
- Deletes nodes when recipes are removed
- Handles failures gracefully without affecting KV operations

## Error Handling

- **Duplicate Prevention**: Prevents saving duplicate recipes unless `overwrite` is specified
- **Version Conflicts**: Increments version numbers on updates
- **Network Failures**: Search sync and image download failures don't block KV operations
- **Validation**: Validates required fields before processing
- **Image Errors**: Failed image downloads preserve original URLs

## Performance Considerations

- **Compression**: All recipe data is compressed using pako/gzip
- **Atomic Operations**: Durable Objects ensure consistency without race conditions
- **Batch Processing**: Multiple operations can be processed in a single request
- **Parallel Downloads**: Images are downloaded in parallel for efficiency
- **CDN Caching**: R2 images are served with long cache headers

## Security

- **CORS**: Configured to allow cross-origin requests
- **Input Validation**: All inputs are validated before processing
- **Error Messages**: Sensitive information is not exposed in error messages
- **Image Validation**: Only downloads images from HTTP/HTTPS URLs

## Monitoring

- **Operation Status**: Track individual operation success/failure
- **Logging**: Comprehensive logging for debugging
- **Observability**: Cloudflare logs enabled for monitoring
- **Image Processing**: Logs failed downloads and deletions

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

MIT