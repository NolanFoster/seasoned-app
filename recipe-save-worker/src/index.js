// Recipe Save Worker with Durable Object for atomic writes
// This worker handles saving recipes to KV storage and synchronizing with the search database

import { compressData, generateRecipeId, decompressData } from '../../shared/kv-storage.js';
import { calculateNutritionalFacts } from '../../shared/nutrition-calculator.js';

// Utility function for structured logging
function log(level, message, data = {}, context = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    ...data,
    ...context
  };
  
  // Use appropriate console method based on level
  switch (level.toLowerCase()) {
    case 'error':
      console.error(JSON.stringify(logEntry));
      break;
    case 'warn':
      console.warn(JSON.stringify(logEntry));
      break;
    case 'info':
      console.log(JSON.stringify(logEntry));
      break;
    case 'debug':
      console.log(JSON.stringify(logEntry));
      break;
    default:
      console.log(JSON.stringify(logEntry));
  }
}

// Generate unique request ID for tracking
function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Parse recipe ingredients for nutrition calculation
export function parseIngredientsForNutrition(ingredients) {
  if (!Array.isArray(ingredients)) {
    return [];
  }

  return ingredients.map(ingredient => {
    // Handle string ingredients
    if (typeof ingredient === 'string') {
      // Try to parse quantity, unit, and name from string
      // Common patterns: "2 cups flour", "1 tablespoon olive oil", "3 large eggs"
      const match = ingredient.match(/^(\d+(?:\.\d+)?|\d+\/\d+)\s*(\w+)?\s+(.+)$/);
      
      if (match) {
        const [, quantity, unit, name] = match;
        // Handle fractions like "1/2"
        let quantityValue;
        if (quantity.includes('/')) {
          const [num, denom] = quantity.split('/').map(n => parseFloat(n));
          quantityValue = num / denom;
        } else {
          quantityValue = parseFloat(quantity);
        }
        return {
          name: name.trim(),
          quantity: quantityValue,
          unit: unit || 'unit'
        };
      }
      
      // If no pattern matches, assume whole string is ingredient name with quantity 1
      return {
        name: ingredient.trim(),
        quantity: 1,
        unit: 'unit'
      };
    }
    
    // Handle object ingredients
    if (typeof ingredient === 'object' && ingredient !== null) {
      // If it already has the required structure
      if (ingredient.name && ingredient.quantity) {
        return {
          name: ingredient.name,
          quantity: parseFloat(ingredient.quantity) || 1,
          unit: ingredient.unit || 'unit'
        };
      }
      
      // If it has a different structure, try to extract what we can
      const name = ingredient.name || ingredient.ingredient || ingredient.item || JSON.stringify(ingredient);
      const quantity = parseFloat(ingredient.quantity || ingredient.amount || ingredient.value || 1);
      const unit = ingredient.unit || ingredient.measure || 'unit';
      
      return {
        name: name,
        quantity: quantity,
        unit: unit
      };
    }
    
    // Fallback for any other type
    return {
      name: String(ingredient),
      quantity: 1,
      unit: 'unit'
    };
  }).filter(ing => ing.name && ing.quantity > 0); // Filter out invalid ingredients
}

// Durable Object class for handling atomic recipe saves
export class RecipeSaver {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    log('info', 'RecipeSaver Durable Object initialized', { 
      objectId: this.state.id ? this.state.id.toString() : 'test',
      env: Object.keys(env)
    });
  }

  async fetch(request) {
    const requestId = generateRequestId();
    const startTime = Date.now();
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    log('info', 'Durable Object request received', {
      requestId,
      method,
      path,
      url: request.url,
      headers: Object.fromEntries(request.headers.entries())
    });

    try {
      let response;
      
      if (path === '/save' && method === 'POST') {
        response = await this.handleSave(request, requestId);
      } else if (path === '/update' && method === 'PUT') {
        response = await this.handleUpdate(request, requestId);
      } else if (path === '/delete' && method === 'DELETE') {
        response = await this.handleDelete(request, requestId);
      } else if (path === '/status' && method === 'GET') {
        response = await this.handleStatus(request, requestId);
      } else if (path === '/get' && method === 'GET') {
        response = await this.handleGet(request, requestId);
      } else {
        log('warn', 'Unknown endpoint requested', { requestId, path, method });
        response = new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const duration = Date.now() - startTime;
      log('info', 'Durable Object request completed', {
        requestId,
        method,
        path,
        status: response.status,
        duration: `${duration}ms`
      });

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      log('error', 'Durable Object request failed', {
        requestId,
        method,
        path,
        error: error.message,
        stack: error.stack,
        duration: `${duration}ms`
      });

      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  async handleSave(request, requestId) {
    log('info', 'Starting save operation', { requestId });
    const startTime = Date.now();

    try {
      const requestBody = await request.json();
      log('debug', 'Save request body received', { 
        requestId, 
        hasRecipe: !!requestBody.recipe,
        hasOptions: !!requestBody.options,
        recipeUrl: requestBody.recipe?.url
      });

      const { recipe, options = {} } = requestBody;
      
      if (!recipe || !recipe.url) {
        log('warn', 'Save request validation failed', { 
          requestId, 
          hasRecipe: !!recipe, 
          hasUrl: !!recipe?.url 
        });
        return new Response(JSON.stringify({ error: 'Recipe URL is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      log('info', 'Generating recipe ID', { requestId, url: recipe.url });
      const recipeId = await generateRecipeId(recipe.url);
      log('info', 'Recipe ID generated', { requestId, recipeId });

      // Use Durable Object transaction for atomic operations
      const result = await this.state.blockConcurrencyWhile(async () => {
        log('debug', 'Starting atomic save transaction', { requestId, recipeId });
        
        try {
          // Check if recipe already exists
          log('debug', 'Checking for existing recipe', { requestId, recipeId });
          const existing = await this.env.RECIPE_STORAGE.get(recipeId);
          if (existing && !options.overwrite) {
            log('info', 'Recipe already exists, overwrite not allowed', { 
              requestId, 
              recipeId, 
              overwrite: options.overwrite 
            });
            return {
              success: false,
              error: 'Recipe already exists',
              id: recipeId
            };
          }

          if (existing) {
            log('info', 'Overwriting existing recipe', { requestId, recipeId });
          }

          // Process and download images
          log('info', 'Processing recipe images', { requestId, recipeId });
          const processedRecipe = await this.processRecipeImages(recipe, recipeId, requestId);

          // Calculate nutrition if missing
          log('info', 'Checking for nutrition information', { requestId, recipeId });
          const recipeWithNutrition = await this.calculateAndAddNutrition(processedRecipe, requestId);

          // Create recipe record with metadata
          const recipeRecord = {
            ...recipeWithNutrition,
            id: recipeId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            version: 1
          };

          log('debug', 'Recipe record created', { 
            requestId, 
            recipeId, 
            title: recipeRecord.title,
            hasImageUrl: !!recipeRecord.imageUrl,
            imageCount: recipeRecord.images?.length || 0
          });

          // Compress and save to KV
          log('debug', 'Compressing recipe data', { requestId, recipeId });
          const compressedData = await compressData(recipeRecord);
          log('debug', 'Recipe data compressed', { 
            requestId, 
            recipeId, 
            originalSize: JSON.stringify(recipeRecord).length,
            compressedSize: compressedData.length,
            compressionRatio: (compressedData.length / JSON.stringify(recipeRecord).length * 100).toFixed(2) + '%'
          });

          log('info', 'Saving recipe to KV storage', { requestId, recipeId });
          await this.env.RECIPE_STORAGE.put(recipeId, compressedData);
          log('info', 'Recipe saved to KV storage', { requestId, recipeId });

          // Sync with search database
          log('info', 'Syncing with search database', { requestId, recipeId });
          await this.syncWithSearchDB(recipeRecord, 'create', requestId);

          // Store operation status
          const operationStatus = {
            status: 'completed',
            timestamp: new Date().toISOString(),
            operation: 'create',
            requestId
          };
          await this.state.storage.put(`operation:${recipeId}`, operationStatus);
          log('info', 'Operation status stored', { requestId, recipeId, status: 'completed' });

          const duration = Date.now() - startTime;
          log('info', 'Save operation completed successfully', {
            requestId,
            recipeId,
            duration: `${duration}ms`,
            title: recipeRecord.title
          });

          return {
            success: true,
            id: recipeId,
            recipe: recipeRecord
          };
        } catch (error) {
          const duration = Date.now() - startTime;
          log('error', 'Save operation failed during transaction', {
            requestId,
            recipeId,
            error: error.message,
            stack: error.stack,
            duration: `${duration}ms`
          });
          
          // Store failure status
          const failureStatus = {
            status: 'failed',
            timestamp: new Date().toISOString(),
            operation: 'create',
            error: error.message,
            requestId
          };
          await this.state.storage.put(`operation:${recipeId}`, failureStatus);
          log('info', 'Failure status stored', { requestId, recipeId, status: 'failed' });

          throw error;
        }
      });

      return new Response(JSON.stringify(result), {
        status: result.success ? 200 : 400,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      log('error', 'Save operation failed', {
        requestId,
        error: error.message,
        stack: error.stack,
        duration: `${duration}ms`
      });
      throw error;
    }
  }

  async handleUpdate(request, requestId) {
    log('info', 'Starting update operation', { requestId });
    const startTime = Date.now();

    try {
      const requestBody = await request.json();
      log('debug', 'Update request body received', { 
        requestId, 
        hasRecipeId: !!requestBody.recipeId,
        hasUpdates: !!requestBody.updates,
        hasOptions: !!requestBody.options
      });

      const { recipeId, updates, options = {} } = requestBody;
      
      if (!recipeId) {
        log('warn', 'Update request validation failed', { requestId, hasRecipeId: !!recipeId });
        return new Response(JSON.stringify({ error: 'Recipe ID is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      log('info', 'Processing update for recipe', { requestId, recipeId });

      const result = await this.state.blockConcurrencyWhile(async () => {
        log('debug', 'Starting atomic update transaction', { requestId, recipeId });
        
        try {
          // Get existing recipe
          log('debug', 'Fetching existing recipe from KV', { requestId, recipeId });
          const compressedData = await this.env.RECIPE_STORAGE.get(recipeId);
          if (!compressedData) {
            log('warn', 'Recipe not found for update', { requestId, recipeId });
            return {
              success: false,
              error: 'Recipe not found'
            };
          }

          // Decompress existing recipe
          log('debug', 'Decompressing existing recipe', { requestId, recipeId });
          const existingRecipe = await decompressData(compressedData);
          log('debug', 'Existing recipe decompressed', { 
            requestId, 
            recipeId, 
            version: existingRecipe.version,
            title: existingRecipe.title
          });

          // Process images in updates if any
          log('info', 'Processing images in updates', { requestId, recipeId });
          const processedUpdates = await this.processRecipeImages(updates, recipeId, existingRecipe, requestId);

          // Apply updates
          let updatedRecipe = {
            ...existingRecipe,
            ...processedUpdates,
            id: recipeId, // Ensure ID doesn't change
            updatedAt: new Date().toISOString(),
            version: (existingRecipe.version || 1) + 1
          };

          // Calculate nutrition if missing or ingredients changed
          if (!updatedRecipe.nutrition || 
              (updates.ingredients && JSON.stringify(updates.ingredients) !== JSON.stringify(existingRecipe.ingredients))) {
            log('info', 'Recalculating nutrition due to missing data or ingredient changes', { requestId, recipeId });
            updatedRecipe = await this.calculateAndAddNutrition(updatedRecipe, requestId);
          }

          log('debug', 'Recipe updated with new data', { 
            requestId, 
            recipeId, 
            oldVersion: existingRecipe.version,
            newVersion: updatedRecipe.version,
            updatedFields: Object.keys(processedUpdates)
          });

          // Compress and save updated recipe
          log('debug', 'Compressing updated recipe data', { requestId, recipeId });
          const updatedCompressed = await compressData(updatedRecipe);
          log('debug', 'Updated recipe data compressed', { 
            requestId, 
            recipeId, 
            originalSize: JSON.stringify(updatedRecipe).length,
            compressedSize: updatedCompressed.length
          });

          log('info', 'Saving updated recipe to KV storage', { requestId, recipeId });
          await this.env.RECIPE_STORAGE.put(recipeId, updatedCompressed);
          log('info', 'Updated recipe saved to KV storage', { requestId, recipeId });

          // Sync with search database
          log('info', 'Syncing updated recipe with search database', { requestId, recipeId });
          await this.syncWithSearchDB(updatedRecipe, 'update', requestId);

          // Store operation status
          const operationStatus = {
            status: 'completed',
            timestamp: new Date().toISOString(),
            operation: 'update',
            requestId
          };
          await this.state.storage.put(`operation:${recipeId}`, operationStatus);
          log('info', 'Update operation status stored', { requestId, recipeId, status: 'completed' });

          const duration = Date.now() - startTime;
          log('info', 'Update operation completed successfully', {
            requestId,
            recipeId,
            duration: `${duration}ms`,
            title: updatedRecipe.title,
            version: updatedRecipe.version
          });

          return {
            success: true,
            id: recipeId,
            recipe: updatedRecipe
          };
        } catch (error) {
          const duration = Date.now() - startTime;
          log('error', 'Update operation failed during transaction', {
            requestId,
            recipeId,
            error: error.message,
            stack: error.stack,
            duration: `${duration}ms`
          });
          
          await this.state.storage.put(`operation:${recipeId}`, {
            status: 'failed',
            timestamp: new Date().toISOString(),
            operation: 'update',
            error: error.message,
            requestId
          });
          log('info', 'Update failure status stored', { requestId, recipeId, status: 'failed' });

          throw error;
        }
      });

      return new Response(JSON.stringify(result), {
        status: result.success ? 200 : 400,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      log('error', 'Update operation failed', {
        requestId,
        error: error.message,
        stack: error.stack,
        duration: `${duration}ms`
      });
      throw error;
    }
  }

  async handleDelete(request, requestId) {
    log('info', 'Starting delete operation', { requestId });
    const startTime = Date.now();

    try {
      const requestBody = await request.json();
      log('debug', 'Delete request body received', { 
        requestId, 
        hasRecipeId: !!requestBody.recipeId
      });

      const { recipeId } = requestBody;
      
      if (!recipeId) {
        log('warn', 'Delete request validation failed', { requestId, hasRecipeId: !!recipeId });
        return new Response(JSON.stringify({ error: 'Recipe ID is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      log('info', 'Processing delete for recipe', { requestId, recipeId });

      const result = await this.state.blockConcurrencyWhile(async () => {
        log('debug', 'Starting atomic delete transaction', { requestId, recipeId });
        
        try {
          // Check if recipe exists
          log('debug', 'Checking if recipe exists in KV', { requestId, recipeId });
          const compressedData = await this.env.RECIPE_STORAGE.get(recipeId);
          if (!compressedData) {
            log('warn', 'Recipe not found for deletion', { requestId, recipeId });
            return {
              success: false,
              error: 'Recipe not found'
            };
          }

          // Decompress to get image URLs for cleanup
          log('debug', 'Decompressing recipe for image cleanup', { requestId, recipeId });
          const recipe = await decompressData(compressedData);
          log('debug', 'Recipe decompressed for deletion', { 
            requestId, 
            recipeId, 
            title: recipe.title,
            hasImageUrl: !!recipe.imageUrl,
            imageCount: recipe.images?.length || 0
          });

          // Delete images from R2 if they exist
          log('info', 'Deleting recipe images from R2', { requestId, recipeId });
          await this.deleteRecipeImages(recipe, requestId);

          // Delete from KV
          log('info', 'Deleting recipe from KV storage', { requestId, recipeId });
          await this.env.RECIPE_STORAGE.delete(recipeId);
          log('info', 'Recipe deleted from KV storage', { requestId, recipeId });

          // Delete from search database
          log('info', 'Deleting recipe from search database', { requestId, recipeId });
          await this.syncWithSearchDB({ id: recipeId }, 'delete', requestId);

          // Store operation status
          const operationStatus = {
            status: 'completed',
            timestamp: new Date().toISOString(),
            operation: 'delete',
            requestId
          };
          await this.state.storage.put(`operation:${recipeId}`, operationStatus);
          log('info', 'Delete operation status stored', { requestId, recipeId, status: 'completed' });

          const duration = Date.now() - startTime;
          log('info', 'Delete operation completed successfully', {
            requestId,
            recipeId,
            duration: `${duration}ms`,
            title: recipe.title
          });

          return {
            success: true,
            id: recipeId
          };
        } catch (error) {
          const duration = Date.now() - startTime;
          log('error', 'Delete operation failed during transaction', {
            requestId,
            recipeId,
            error: error.message,
            stack: error.stack,
            duration: `${duration}ms`
          });
          
          await this.state.storage.put(`operation:${recipeId}`, {
            status: 'failed',
            timestamp: new Date().toISOString(),
            operation: 'delete',
            error: error.message,
            requestId
          });
          log('info', 'Delete failure status stored', { requestId, recipeId, status: 'failed' });

          throw error;
        }
      });

      return new Response(JSON.stringify(result), {
        status: result.success ? 200 : 400,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      log('error', 'Delete operation failed', {
        requestId,
        error: error.message,
        stack: error.stack,
        duration: `${duration}ms`
      });
      throw error;
    }
  }

  async handleStatus(request, requestId) {
    log('info', 'Starting status check', { requestId });
    const startTime = Date.now();

    try {
      const url = new URL(request.url);
      const recipeId = url.searchParams.get('id');

      if (!recipeId) {
        log('warn', 'Status request validation failed', { requestId, hasRecipeId: !!recipeId });
        return new Response(JSON.stringify({ error: 'Recipe ID is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      log('debug', 'Fetching operation status', { requestId, recipeId });
      const status = await this.state.storage.get(`operation:${recipeId}`);
      
      if (!status) {
        log('warn', 'No operation status found', { requestId, recipeId });
        return new Response(JSON.stringify({ error: 'No operation status found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const duration = Date.now() - startTime;
      log('info', 'Status check completed', {
        requestId,
        recipeId,
        status: status.status,
        operation: status.operation,
        duration: `${duration}ms`
      });

      return new Response(JSON.stringify(status), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      log('error', 'Status check failed', {
        requestId,
        error: error.message,
        stack: error.stack,
        duration: `${duration}ms`
      });
      throw error;
    }
  }

  async handleGet(request, requestId) {
    log('info', 'Starting get operation', { requestId });
    const startTime = Date.now();

    try {
      const url = new URL(request.url);
      const recipeId = url.searchParams.get('id');

      if (!recipeId) {
        log('warn', 'Get request validation failed', { requestId, hasRecipeId: !!recipeId });
        return new Response(JSON.stringify({ error: 'Recipe ID is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      log('debug', 'Fetching recipe from KV', { requestId, recipeId });
      const compressedData = await this.env.RECIPE_STORAGE.get(recipeId);

      if (!compressedData) {
        log('warn', 'Recipe not found', { requestId, recipeId });
        return new Response(JSON.stringify({ error: 'Recipe not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      log('debug', 'Decompressing recipe', { requestId, recipeId });
      const recipe = await decompressData(compressedData);
      log('debug', 'Recipe decompressed', { 
        requestId, 
        recipeId, 
        title: recipe.title,
        hasImageUrl: !!recipe.imageUrl,
        imageCount: recipe.images?.length || 0
      });

      const duration = Date.now() - startTime;
      log('info', 'Get operation completed successfully', {
        requestId,
        recipeId,
        duration: `${duration}ms`,
        title: recipe.title
      });

      return new Response(JSON.stringify(recipe), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      log('error', 'Get operation failed', {
        requestId,
        error: error.message,
        stack: error.stack,
        duration: `${duration}ms`
      });
      throw error;
    }
  }

  async processRecipeImages(recipe, recipeId, existingRecipe = null, requestId = null) {
    log('info', 'Starting image processing', { requestId, recipeId });
    const startTime = Date.now();

    const processedRecipe = { ...recipe };
    const imagesToProcess = [];

    // Collect all image URLs that need processing
    if (recipe.imageUrl && this.isExternalUrl(recipe.imageUrl)) {
      imagesToProcess.push({ field: 'imageUrl', url: recipe.imageUrl });
      log('debug', 'Found main image to process', { requestId, recipeId, url: recipe.imageUrl });
    }

    // Check for images in recipe steps/instructions if they exist
    if (recipe.images && Array.isArray(recipe.images)) {
      recipe.images.forEach((img, index) => {
        if (this.isExternalUrl(img)) {
          imagesToProcess.push({ field: 'images', index, url: img });
          log('debug', 'Found step image to process', { requestId, recipeId, index, url: img });
        }
      });
    }

    log('info', 'Image processing summary', { 
      requestId, 
      recipeId, 
      totalImages: imagesToProcess.length,
      mainImage: !!recipe.imageUrl,
      stepImages: recipe.images?.length || 0
    });

    if (imagesToProcess.length === 0) {
      log('info', 'No images to process', { requestId, recipeId });
      return processedRecipe;
    }

    // Process images in parallel
    log('info', 'Processing images in parallel', { requestId, recipeId, imageCount: imagesToProcess.length });
    const processedImages = await Promise.all(
      imagesToProcess.map(async (img) => {
        try {
          log('debug', 'Processing individual image', { 
            requestId, 
            recipeId, 
            field: img.field, 
            index: img.index, 
            url: img.url 
          });
          
          const r2Url = await this.downloadAndStoreImage(img.url, recipeId, img.field, img.index, requestId);
          
          log('debug', 'Image processed successfully', { 
            requestId, 
            recipeId, 
            field: img.field, 
            index: img.index, 
            originalUrl: img.url,
            r2Url 
          });
          
          return { ...img, r2Url };
        } catch (error) {
          log('error', 'Failed to process image', { 
            requestId, 
            recipeId, 
            field: img.field, 
            index: img.index, 
            url: img.url,
            error: error.message 
          });
          
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

    const duration = Date.now() - startTime;
    log('info', 'Image processing completed', {
      requestId,
      recipeId,
      duration: `${duration}ms`,
      processedImages: processedImages.length,
      successCount: processedImages.filter(img => img.r2Url !== img.url).length
    });

    return processedRecipe;
  }

  async downloadAndStoreImage(imageUrl, recipeId, field, index, requestId = null) {
    const startTime = Date.now();
    log('info', 'Starting image download and storage', { 
      requestId, 
      recipeId, 
      field, 
      index, 
      url: imageUrl 
    });

    try {
      // Download the image
      log('debug', 'Downloading image', { requestId, recipeId, url: imageUrl });
      const response = await fetch(imageUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.status}`);
      }

      // Get content type
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const extension = this.getExtensionFromContentType(contentType);
      
      log('debug', 'Image download successful', { 
        requestId, 
        recipeId, 
        status: response.status,
        contentType,
        extension,
        contentLength: response.headers.get('content-length')
      });

      // Generate unique filename
      const timestamp = Date.now();
      const filename = index !== undefined 
        ? `${recipeId}/${field}_${index}_${timestamp}.${extension}`
        : `${recipeId}/${field}_${timestamp}.${extension}`;

      log('debug', 'Generated filename', { requestId, recipeId, filename });

      // Get image data
      log('debug', 'Reading image data', { requestId, recipeId });
      const imageData = await response.arrayBuffer();
      log('debug', 'Image data read', { 
        requestId, 
        recipeId, 
        size: imageData.byteLength 
      });

      // Store in R2
      log('info', 'Storing image in R2', { requestId, recipeId, filename });
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
      log('info', 'Image stored in R2 successfully', { requestId, recipeId, filename });

      // Return the R2 URL
      const imageDomain = this.env.IMAGE_DOMAIN || 'https://images.nolanfoster.me';
      const r2Url = `${imageDomain}/${filename}`;
      
      const duration = Date.now() - startTime;
      log('info', 'Image download and storage completed', {
        requestId,
        recipeId,
        field,
        index,
        originalUrl: imageUrl,
        r2Url,
        duration: `${duration}ms`,
        size: imageData.byteLength
      });

      return r2Url;
    } catch (error) {
      const duration = Date.now() - startTime;
      log('error', 'Image download and storage failed', {
        requestId,
        recipeId,
        field,
        index,
        url: imageUrl,
        error: error.message,
        stack: error.stack,
        duration: `${duration}ms`
      });
      throw error;
    }
  }

  async deleteRecipeImages(recipe, requestId = null) {
    log('info', 'Starting recipe image deletion', { requestId, recipeId: recipe.id });
    const startTime = Date.now();

    try {
      const imagesToDelete = [];

      // Collect R2 URLs from the recipe
      if (recipe.imageUrl && recipe.imageUrl.includes(this.env.IMAGE_DOMAIN)) {
        const key = this.getR2KeyFromUrl(recipe.imageUrl);
        if (key) {
          imagesToDelete.push(key);
          log('debug', 'Found main image to delete', { requestId, recipeId: recipe.id, key });
        }
      }

      if (recipe.images && Array.isArray(recipe.images)) {
        recipe.images.forEach((img, index) => {
          if (img && img.includes(this.env.IMAGE_DOMAIN)) {
            const key = this.getR2KeyFromUrl(img);
            if (key) {
              imagesToDelete.push(key);
              log('debug', 'Found step image to delete', { requestId, recipeId: recipe.id, index, key });
            }
          }
        });
      }

      log('info', 'Image deletion summary', { 
        requestId, 
        recipeId: recipe.id, 
        imagesToDelete: imagesToDelete.length 
      });

      if (imagesToDelete.length === 0) {
        log('info', 'No images to delete', { requestId, recipeId: recipe.id });
        return;
      }

      // Delete images from R2
      log('info', 'Deleting images from R2', { requestId, recipeId: recipe.id, count: imagesToDelete.length });
      const deleteResults = await Promise.all(
        imagesToDelete.map(async (key) => {
          try {
            await this.env.RECIPE_IMAGES.delete(key);
            log('debug', 'Image deleted successfully', { requestId, recipeId: recipe.id, key });
            return { key, success: true };
          } catch (err) {
            log('error', 'Failed to delete image', { requestId, recipeId: recipe.id, key, error: err.message });
            return { key, success: false, error: err.message };
          }
        })
      );

      const successCount = deleteResults.filter(r => r.success).length;
      const failureCount = deleteResults.filter(r => !r.success).length;

      const duration = Date.now() - startTime;
      log('info', 'Recipe image deletion completed', {
        requestId,
        recipeId: recipe.id,
        duration: `${duration}ms`,
        totalImages: imagesToDelete.length,
        successCount,
        failureCount
      });

      if (failureCount > 0) {
        log('warn', 'Some images failed to delete', { 
          requestId, 
          recipeId: recipe.id, 
          failures: deleteResults.filter(r => !r.success).map(r => ({ key: r.key, error: r.error }))
        });
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      log('error', 'Recipe image deletion failed', {
        requestId,
        recipeId: recipe.id,
        error: error.message,
        stack: error.stack,
        duration: `${duration}ms`
      });
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

  async calculateAndAddNutrition(recipe, requestId = null) {
    log('info', 'Starting nutrition calculation', { 
      requestId, 
      recipeId: recipe.id,
      hasIngredients: !!recipe.ingredients,
      ingredientCount: recipe.ingredients?.length || 0
    });
    const startTime = Date.now();

    try {
      // Check if nutrition info already exists
      if (recipe.nutrition && Object.keys(recipe.nutrition).length > 0) {
        log('info', 'Recipe already has nutrition information', { 
          requestId, 
          recipeId: recipe.id 
        });
        return recipe;
      }

      // Check if we have ingredients to calculate from
      if (!recipe.ingredients || recipe.ingredients.length === 0) {
        log('warn', 'No ingredients found for nutrition calculation', { 
          requestId, 
          recipeId: recipe.id 
        });
        return recipe;
      }

      // Check if API key is available
      if (!this.env.FDC_API_KEY) {
        log('warn', 'USDA API key not configured, skipping nutrition calculation', { 
          requestId, 
          recipeId: recipe.id 
        });
        return recipe;
      }

      // Parse ingredients for nutrition calculation
      log('debug', 'Parsing ingredients for nutrition', { 
        requestId, 
        recipeId: recipe.id 
      });
      const parsedIngredients = parseIngredientsForNutrition(recipe.ingredients);
      
      if (parsedIngredients.length === 0) {
        log('warn', 'No valid ingredients parsed for nutrition calculation', { 
          requestId, 
          recipeId: recipe.id 
        });
        return recipe;
      }

      log('info', 'Parsed ingredients for nutrition', { 
        requestId, 
        recipeId: recipe.id,
        parsedCount: parsedIngredients.length,
        totalIngredients: recipe.ingredients.length
      });

      // Get servings count (default to 1 if not specified)
      const servings = parseInt(recipe.servings) || parseInt(recipe.yield) || 1;

      // Calculate nutrition
      log('info', 'Calling nutrition calculator', { 
        requestId, 
        recipeId: recipe.id,
        servings,
        ingredientCount: parsedIngredients.length
      });
      
      const nutritionResult = await calculateNutritionalFacts(
        parsedIngredients,
        this.env.FDC_API_KEY,
        servings
      );

      if (nutritionResult.success && nutritionResult.nutrition) {
        // Add nutrition to recipe
        recipe.nutrition = nutritionResult.nutrition;
        
        const duration = Date.now() - startTime;
        log('info', 'Nutrition calculation completed successfully', {
          requestId,
          recipeId: recipe.id,
          duration: `${duration}ms`,
          processedIngredients: nutritionResult.processedIngredients,
          totalIngredients: nutritionResult.totalIngredients
        });
      } else {
        log('warn', 'Nutrition calculation returned no data', { 
          requestId, 
          recipeId: recipe.id,
          error: nutritionResult.error
        });
      }

      return recipe;
    } catch (error) {
      const duration = Date.now() - startTime;
      log('error', 'Nutrition calculation failed', {
        requestId,
        recipeId: recipe.id,
        error: error.message,
        stack: error.stack,
        duration: `${duration}ms`
      });
      
      // Return recipe without nutrition on error
      return recipe;
    }
  }

  async syncWithSearchDB(recipe, operation, requestId = null) {
    log('info', 'Starting search database sync', { 
      requestId, 
      recipeId: recipe.id, 
      operation 
    });
    const startTime = Date.now();

    try {
      const searchDbUrl = this.env.SEARCH_DB_URL;
      
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

        log('debug', 'Preparing search DB node data', { 
          requestId, 
          recipeId: recipe.id, 
          operation,
          hasTitle: !!nodeData.properties.title,
          hasIngredients: !!nodeData.properties.ingredients.length,
          hasTags: !!nodeData.properties.tags.length
        });

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

        const duration = Date.now() - startTime;
        log('info', 'Search database sync completed successfully', {
          requestId,
          recipeId: recipe.id,
          operation,
          duration: `${duration}ms`
        });
      } else if (operation === 'delete') {
        // Delete node from search database
        log('debug', 'Deleting from search database', { requestId, recipeId: recipe.id });
        
        const response = await fetch(`${searchDbUrl}/api/nodes/${recipe.id}`, {
          method: 'DELETE'
        });

        if (!response.ok && response.status !== 404) {
          const error = await response.text();
          throw new Error(`Search DB delete failed: ${error}`);
        }

        const duration = Date.now() - startTime;
        log('info', 'Search database deletion completed successfully', {
          requestId,
          recipeId: recipe.id,
          duration: `${duration}ms`
        });
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      log('error', 'Search database sync error', {
        requestId,
        recipeId: recipe.id,
        operation,
        error: error.message,
        stack: error.stack,
        duration: `${duration}ms`
      });
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
    const requestId = generateRequestId();
    const startTime = Date.now();
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    log('info', 'Worker request received', {
      requestId,
      method,
      path,
      url: request.url,
      headers: Object.fromEntries(request.headers.entries())
    });

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle preflight requests
    if (method === 'OPTIONS') {
      log('debug', 'Handling CORS preflight request', { requestId });
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Health check endpoint
      if (path === '/health' && method === 'GET') {
        log('debug', 'Health check requested', { requestId });
        const response = new Response(JSON.stringify({ 
          status: 'healthy',
          timestamp: new Date().toISOString(),
          version: '1.0.0'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
        
        const duration = Date.now() - startTime;
        log('info', 'Health check completed', { requestId, duration: `${duration}ms` });
        return response;
      }

      // Route to Durable Object for all recipe operations
      if (path.startsWith('/recipe')) {
        log('info', 'Routing to Durable Object', { requestId, path });
        
        // Get or create Durable Object instance
        const id = env.RECIPE_SAVER.idFromName('global-recipe-saver');
        const stub = env.RECIPE_SAVER.get(id);

        // Forward request to Durable Object
        const doPath = path.replace('/recipe', '');
        const doUrl = new URL(request.url);
        doUrl.pathname = doPath;

        log('debug', 'Forwarding request to Durable Object', { 
          requestId, 
          originalPath: path, 
          doPath, 
          doUrl: doUrl.toString() 
        });

        const response = await stub.fetch(new Request(doUrl, request));
        
        // Add CORS headers to response
        const newHeaders = new Headers(response.headers);
        Object.entries(corsHeaders).forEach(([key, value]) => {
          newHeaders.set(key, value);
        });

        const duration = Date.now() - startTime;
        log('info', 'Durable Object request completed', {
          requestId,
          path,
          status: response.status,
          duration: `${duration}ms`
        });

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders
        });
      }

      // Batch operations endpoint
      if (path === '/batch' && method === 'POST') {
        log('info', 'Handling batch operations', { requestId });
        const response = await handleBatchOperations(request, env, corsHeaders, requestId);
        
        const duration = Date.now() - startTime;
        log('info', 'Batch operations completed', { requestId, duration: `${duration}ms` });
        return response;
      }

      log('warn', 'Unknown endpoint requested', { requestId, path, method });
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      log('error', 'Worker request failed', {
        requestId,
        method,
        path,
        error: error.message,
        stack: error.stack,
        duration: `${duration}ms`
      });

      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};

// Handle batch operations
async function handleBatchOperations(request, env, corsHeaders, requestId) {
  log('info', 'Starting batch operations processing', { requestId });
  const startTime = Date.now();

  try {
    const requestBody = await request.json();
    log('debug', 'Batch operations request body received', { 
      requestId, 
      operationCount: requestBody.operations?.length || 0
    });

    const { operations } = requestBody;
    
    if (!Array.isArray(operations) || operations.length === 0) {
      log('warn', 'Batch operations validation failed', { 
        requestId, 
        hasOperations: !!operations, 
        isArray: Array.isArray(operations),
        length: operations?.length || 0
      });
      
      return new Response(JSON.stringify({ error: 'Operations array is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    log('info', 'Processing batch operations', { requestId, operationCount: operations.length });

    const results = [];
    const id = env.RECIPE_SAVER.idFromName('global-recipe-saver');
    const stub = env.RECIPE_SAVER.get(id);

    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      const operationId = op.id || `op_${i}`;
      
      log('debug', 'Processing batch operation', { 
        requestId, 
        operationIndex: i, 
        operationId, 
        type: op.type 
      });

      try {
        let response;
        
        switch (op.type) {
          case 'save':
            log('debug', 'Executing save operation in batch', { requestId, operationId });
            response = await stub.fetch(new Request('http://do/save', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(op.data)
            }));
            break;
          case 'update':
            log('debug', 'Executing update operation in batch', { requestId, operationId });
            response = await stub.fetch(new Request('http://do/update', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(op.data)
            }));
            break;
          case 'delete':
            log('debug', 'Executing delete operation in batch', { requestId, operationId });
            response = await stub.fetch(new Request('http://do/delete', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(op.data)
            }));
            break;
          default:
            log('warn', 'Unknown operation type in batch', { requestId, operationId, type: op.type });
            throw new Error(`Unknown operation type: ${op.type}`);
        }

        const result = await response.json();
        results.push({
          ...result,
          operationId: operationId
        });

        log('debug', 'Batch operation completed', { 
          requestId, 
          operationId, 
          success: result.success,
          status: response.status
        });
      } catch (error) {
        log('error', 'Batch operation failed', { 
          requestId, 
          operationId, 
          type: op.type,
          error: error.message 
        });

        results.push({
          success: false,
          error: error.message,
          operationId: operationId
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    const duration = Date.now() - startTime;

    log('info', 'Batch operations processing completed', {
      requestId,
      totalOperations: operations.length,
      successCount,
      failureCount,
      duration: `${duration}ms`
    });

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    log('error', 'Batch operations processing failed', {
      requestId,
      error: error.message,
      stack: error.stack,
      duration: `${duration}ms`
    });
    throw error;
  }
}