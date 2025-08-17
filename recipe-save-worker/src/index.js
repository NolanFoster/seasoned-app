// Recipe Save Worker with Durable Object for atomic writes
// This worker handles saving recipes to KV storage and synchronizing with the search database

import { compressData, generateRecipeId } from '../../shared/kv-storage.js';

// Durable Object class for handling atomic recipe saves
export class RecipeSaver {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/save' && request.method === 'POST') {
        return await this.handleSave(request);
      } else if (path === '/update' && request.method === 'PUT') {
        return await this.handleUpdate(request);
      } else if (path === '/delete' && request.method === 'DELETE') {
        return await this.handleDelete(request);
      } else if (path === '/status' && request.method === 'GET') {
        return await this.handleStatus(request);
      }

      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('Durable Object error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  async handleSave(request) {
    const { recipe, options = {} } = await request.json();
    
    if (!recipe || !recipe.url) {
      return new Response(JSON.stringify({ error: 'Recipe URL is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Generate recipe ID
    const recipeId = await generateRecipeId(recipe.url);

    // Use Durable Object transaction for atomic operations
    const result = await this.state.blockConcurrencyWhile(async () => {
      try {
        // Check if recipe already exists
        const existing = await this.env.RECIPE_STORAGE.get(recipeId);
        if (existing && !options.overwrite) {
          return {
            success: false,
            error: 'Recipe already exists',
            id: recipeId
          };
        }

        // Process and download images
        const processedRecipe = await this.processRecipeImages(recipe, recipeId);

        // Create recipe record with metadata
        const recipeRecord = {
          ...processedRecipe,
          id: recipeId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: 1
        };

        // Compress and save to KV
        const compressedData = await compressData(recipeRecord);
        await this.env.RECIPE_STORAGE.put(recipeId, compressedData);

        // Sync with search database
        await this.syncWithSearchDB(recipeRecord, 'create');

        // Store operation status
        await this.state.storage.put(`operation:${recipeId}`, {
          status: 'completed',
          timestamp: new Date().toISOString(),
          operation: 'create'
        });

        return {
          success: true,
          id: recipeId,
          recipe: recipeRecord
        };
      } catch (error) {
        console.error('Save operation failed:', error);
        
        // Store failure status
        await this.state.storage.put(`operation:${recipeId}`, {
          status: 'failed',
          timestamp: new Date().toISOString(),
          operation: 'create',
          error: error.message
        });

        throw error;
      }
    });

    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async handleUpdate(request) {
    const { recipeId, updates, options = {} } = await request.json();
    
    if (!recipeId) {
      return new Response(JSON.stringify({ error: 'Recipe ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const result = await this.state.blockConcurrencyWhile(async () => {
      try {
        // Get existing recipe
        const compressedData = await this.env.RECIPE_STORAGE.get(recipeId);
        if (!compressedData) {
          return {
            success: false,
            error: 'Recipe not found'
          };
        }

        // Decompress existing recipe
        const { decompressData } = await import('../../shared/kv-storage.js');
        const existingRecipe = await decompressData(compressedData);

        // Process images in updates if any
        const processedUpdates = await this.processRecipeImages(updates, recipeId, existingRecipe);

        // Apply updates
        const updatedRecipe = {
          ...existingRecipe,
          ...processedUpdates,
          id: recipeId, // Ensure ID doesn't change
          updatedAt: new Date().toISOString(),
          version: (existingRecipe.version || 1) + 1
        };

        // Compress and save updated recipe
        const updatedCompressed = await compressData(updatedRecipe);
        await this.env.RECIPE_STORAGE.put(recipeId, updatedCompressed);

        // Sync with search database
        await this.syncWithSearchDB(updatedRecipe, 'update');

        // Store operation status
        await this.state.storage.put(`operation:${recipeId}`, {
          status: 'completed',
          timestamp: new Date().toISOString(),
          operation: 'update'
        });

        return {
          success: true,
          id: recipeId,
          recipe: updatedRecipe
        };
      } catch (error) {
        console.error('Update operation failed:', error);
        
        await this.state.storage.put(`operation:${recipeId}`, {
          status: 'failed',
          timestamp: new Date().toISOString(),
          operation: 'update',
          error: error.message
        });

        throw error;
      }
    });

    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async handleDelete(request) {
    const { recipeId } = await request.json();
    
    if (!recipeId) {
      return new Response(JSON.stringify({ error: 'Recipe ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const result = await this.state.blockConcurrencyWhile(async () => {
      try {
        // Check if recipe exists
        const compressedData = await this.env.RECIPE_STORAGE.get(recipeId);
        if (!compressedData) {
          return {
            success: false,
            error: 'Recipe not found'
          };
        }

        // Decompress to get image URLs for cleanup
        const { decompressData } = await import('../../shared/kv-storage.js');
        const recipe = await decompressData(compressedData);

        // Delete images from R2 if they exist
        await this.deleteRecipeImages(recipe);

        // Delete from KV
        await this.env.RECIPE_STORAGE.delete(recipeId);

        // Delete from search database
        await this.syncWithSearchDB({ id: recipeId }, 'delete');

        // Store operation status
        await this.state.storage.put(`operation:${recipeId}`, {
          status: 'completed',
          timestamp: new Date().toISOString(),
          operation: 'delete'
        });

        return {
          success: true,
          id: recipeId
        };
      } catch (error) {
        console.error('Delete operation failed:', error);
        
        await this.state.storage.put(`operation:${recipeId}`, {
          status: 'failed',
          timestamp: new Date().toISOString(),
          operation: 'delete',
          error: error.message
        });

        throw error;
      }
    });

    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async handleStatus(request) {
    const url = new URL(request.url);
    const recipeId = url.searchParams.get('id');

    if (!recipeId) {
      return new Response(JSON.stringify({ error: 'Recipe ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const status = await this.state.storage.get(`operation:${recipeId}`);
    
    if (!status) {
      return new Response(JSON.stringify({ error: 'No operation status found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify(status), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async processRecipeImages(recipe, recipeId, existingRecipe = null) {
    const processedRecipe = { ...recipe };
    const imagesToProcess = [];

    // Collect all image URLs that need processing
    if (recipe.imageUrl && this.isExternalUrl(recipe.imageUrl)) {
      imagesToProcess.push({ field: 'imageUrl', url: recipe.imageUrl });
    }

    // Check for images in recipe steps/instructions if they exist
    if (recipe.images && Array.isArray(recipe.images)) {
      recipe.images.forEach((img, index) => {
        if (this.isExternalUrl(img)) {
          imagesToProcess.push({ field: 'images', index, url: img });
        }
      });
    }

    // Process images in parallel
    const processedImages = await Promise.all(
      imagesToProcess.map(async (img) => {
        try {
          const r2Url = await this.downloadAndStoreImage(img.url, recipeId, img.field, img.index);
          return { ...img, r2Url };
        } catch (error) {
          console.error(`Failed to process image ${img.url}:`, error);
          // Return original URL if download fails
          return { ...img, r2Url: img.url };
        }
      })
    );

    // Update recipe with R2 URLs
    processedImages.forEach(({ field, index, r2Url }) => {
      if (field === 'imageUrl') {
        processedRecipe.imageUrl = r2Url;
      } else if (field === 'images' && index !== undefined) {
        if (!processedRecipe.images) processedRecipe.images = [...recipe.images];
        processedRecipe.images[index] = r2Url;
      }
    });

    // Keep track of original URLs for potential cleanup
    processedRecipe._originalImageUrls = imagesToProcess.map(img => img.url);

    return processedRecipe;
  }

  async downloadAndStoreImage(imageUrl, recipeId, field, index) {
    try {
      // Download the image
      const response = await fetch(imageUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.status}`);
      }

      // Get content type
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const extension = this.getExtensionFromContentType(contentType);
      
      // Generate unique filename
      const timestamp = Date.now();
      const filename = index !== undefined 
        ? `${recipeId}/${field}_${index}_${timestamp}.${extension}`
        : `${recipeId}/${field}_${timestamp}.${extension}`;

      // Get image data
      const imageData = await response.arrayBuffer();

      // Store in R2
      await this.env.RECIPE_IMAGES.put(filename, imageData, {
        httpMetadata: {
          contentType: contentType,
          cacheControl: 'public, max-age=31536000' // Cache for 1 year
        },
        customMetadata: {
          recipeId: recipeId,
          originalUrl: imageUrl,
          field: field,
          uploadedAt: new Date().toISOString()
        }
      });

      // Return the R2 URL
      const imageDomain = this.env.IMAGE_DOMAIN || 'https://images.nolanfoster.me';
      return `${imageDomain}/${filename}`;
    } catch (error) {
      console.error(`Error downloading/storing image from ${imageUrl}:`, error);
      throw error;
    }
  }

  async deleteRecipeImages(recipe) {
    try {
      const imagesToDelete = [];

      // Collect R2 URLs from the recipe
      if (recipe.imageUrl && recipe.imageUrl.includes(this.env.IMAGE_DOMAIN)) {
        imagesToDelete.push(this.getR2KeyFromUrl(recipe.imageUrl));
      }

      if (recipe.images && Array.isArray(recipe.images)) {
        recipe.images.forEach(img => {
          if (img && img.includes(this.env.IMAGE_DOMAIN)) {
            imagesToDelete.push(this.getR2KeyFromUrl(img));
          }
        });
      }

      // Delete images from R2
      await Promise.all(
        imagesToDelete.map(key => 
          this.env.RECIPE_IMAGES.delete(key).catch(err => 
            console.error(`Failed to delete image ${key}:`, err)
          )
        )
      );

      console.log(`Deleted ${imagesToDelete.length} images for recipe ${recipe.id}`);
    } catch (error) {
      console.error('Error deleting recipe images:', error);
      // Don't fail the entire operation if image deletion fails
    }
  }

  isExternalUrl(url) {
    if (!url) return false;
    try {
      const parsed = new URL(url);
      const imageDomain = this.env.IMAGE_DOMAIN || 'https://images.nolanfoster.me';
      return !url.startsWith(imageDomain) && (parsed.protocol === 'http:' || parsed.protocol === 'https:');
    } catch {
      return false;
    }
  }

  getExtensionFromContentType(contentType) {
    const typeMap = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'image/svg+xml': 'svg',
      'image/avif': 'avif'
    };
    return typeMap[contentType.toLowerCase()] || 'jpg';
  }

  getR2KeyFromUrl(url) {
    try {
      const imageDomain = this.env.IMAGE_DOMAIN || 'https://images.nolanfoster.me';
      if (url.startsWith(imageDomain)) {
        return url.substring(imageDomain.length + 1); // +1 for the trailing slash
      }
      return null;
    } catch {
      return null;
    }
  }

  async syncWithSearchDB(recipe, operation) {
    try {
      const searchDbUrl = this.env.SEARCH_DB_URL || 'https://recipe-search-db.nolanfoster.workers.dev';
      
      if (operation === 'create' || operation === 'update') {
        // Create or update node in search database
        const nodeData = {
          id: recipe.id,
          type: 'recipe',
          properties: {
            title: recipe.title || '',
            description: recipe.description || '',
            ingredients: recipe.ingredients || [],
            tags: recipe.tags || [],
            cuisine: recipe.cuisine || '',
            prepTime: recipe.prepTime || '',
            cookTime: recipe.cookTime || '',
            servings: recipe.servings || '',
            url: recipe.url,
            imageUrl: recipe.imageUrl || '',
            author: recipe.author || '',
            createdAt: recipe.createdAt,
            updatedAt: recipe.updatedAt
          }
        };

        const response = await fetch(`${searchDbUrl}/api/nodes`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(nodeData)
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Search DB sync failed: ${error}`);
        }

        console.log(`Successfully synced recipe ${recipe.id} to search database`);
      } else if (operation === 'delete') {
        // Delete node from search database
        const response = await fetch(`${searchDbUrl}/api/nodes/${recipe.id}`, {
          method: 'DELETE'
        });

        if (!response.ok && response.status !== 404) {
          const error = await response.text();
          throw new Error(`Search DB delete failed: ${error}`);
        }

        console.log(`Successfully deleted recipe ${recipe.id} from search database`);
      }
    } catch (error) {
      console.error('Search database sync error:', error);
      // Don't fail the entire operation if search sync fails
      // Log the error for monitoring
      if (this.env.SENTRY_DSN) {
        // Report to error tracking service if configured
      }
    }
  }
}

// Main worker export
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Health check endpoint
      if (path === '/health' && request.method === 'GET') {
        return new Response(JSON.stringify({ 
          status: 'healthy',
          timestamp: new Date().toISOString(),
          version: '1.0.0'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Route to Durable Object for all recipe operations
      if (path.startsWith('/recipe')) {
        // Get or create Durable Object instance
        const id = env.RECIPE_SAVER.idFromName('global-recipe-saver');
        const stub = env.RECIPE_SAVER.get(id);

        // Forward request to Durable Object
        const doPath = path.replace('/recipe', '');
        const doUrl = new URL(request.url);
        doUrl.pathname = doPath;

        const response = await stub.fetch(new Request(doUrl, request));
        
        // Add CORS headers to response
        const newHeaders = new Headers(response.headers);
        Object.entries(corsHeaders).forEach(([key, value]) => {
          newHeaders.set(key, value);
        });

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders
        });
      }

      // Batch operations endpoint
      if (path === '/batch' && request.method === 'POST') {
        return await handleBatchOperations(request, env, corsHeaders);
      }

      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};

// Handle batch operations
async function handleBatchOperations(request, env, corsHeaders) {
  const { operations } = await request.json();
  
  if (!Array.isArray(operations) || operations.length === 0) {
    return new Response(JSON.stringify({ error: 'Operations array is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const results = [];
  const id = env.RECIPE_SAVER.idFromName('global-recipe-saver');
  const stub = env.RECIPE_SAVER.get(id);

  for (const op of operations) {
    try {
      let response;
      
      switch (op.type) {
        case 'save':
          response = await stub.fetch(new Request('http://do/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(op.data)
          }));
          break;
        case 'update':
          response = await stub.fetch(new Request('http://do/update', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(op.data)
          }));
          break;
        case 'delete':
          response = await stub.fetch(new Request('http://do/delete', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(op.data)
          }));
          break;
        default:
          throw new Error(`Unknown operation type: ${op.type}`);
      }

      const result = await response.json();
      results.push({
        ...result,
        operationId: op.id
      });
    } catch (error) {
      results.push({
        success: false,
        error: error.message,
        operationId: op.id
      });
    }
  }

  return new Response(JSON.stringify({ results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}