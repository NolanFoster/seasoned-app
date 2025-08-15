#!/usr/bin/env node

/**
 * KV to Search Database Migration Script
 * 
 * This script migrates all recipes from Cloudflare KV storage to the search database,
 * creating a graph structure with nodes for recipes, ingredients, and categories,
 * and edges representing relationships between them.
 * 
 * Usage: node migrate-kv-to-search.js
 */

import { getRecipeFromKV, decompressData } from '../shared/kv-storage.js';

// Configuration
const MIGRATION_CONFIG = {
  batchSize: 10,           // Process recipes in batches
  delayBetweenBatches: 1000, // 1 second delay between batches
  maxRetries: 3,           // Maximum retries for failed operations
  logProgress: true         // Log progress to console
};

// Migration statistics
let migrationStats = {
  total: 0,
  processed: 0,
  successful: 0,
  failed: 0,
  skipped: 0,
  errors: []
};

/**
 * Main migration function
 */
async function migrateKVToSearch(env) {
  console.log('🚀 Starting KV to Search Database Migration...\n');
  
  try {
    // Get all recipe keys from KV
    console.log('📋 Fetching recipe keys from KV storage...');
    const keys = await env.RECIPE_STORAGE.list();
    
    if (!keys.keys || keys.keys.length === 0) {
      console.log('❌ No recipes found in KV storage');
      return { success: false, error: 'No recipes found' };
    }
    
    migrationStats.total = keys.keys.length;
    console.log(`📊 Found ${migrationStats.total} recipes to migrate\n`);
    
    // Process recipes in batches
    const batches = chunkArray(keys.keys, MIGRATION_CONFIG.batchSize);
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`🔄 Processing batch ${i + 1}/${batches.length} (${batch.length} recipes)`);
      
      // Process batch concurrently
      const batchPromises = batch.map(key => processRecipe(key, env));
      const batchResults = await Promise.allSettled(batchPromises);
      
      // Update statistics
      batchResults.forEach(result => {
        migrationStats.processed++;
        if (result.status === 'fulfilled' && result.value.success) {
          migrationStats.successful++;
        } else if (result.status === 'rejected') {
          migrationStats.failed++;
          migrationStats.errors.push({
            key: result.reason.key,
            error: result.reason.message
          });
        }
      });
      
      // Log batch progress
      if (MIGRATION_CONFIG.logProgress) {
        const batchSuccess = batchResults.filter(r => r.status === 'fulfilled' && r.value.success).length;
        const batchFailed = batchResults.filter(r => r.status === 'rejected').length;
        console.log(`  ✅ Batch ${i + 1} complete: ${batchSuccess} success, ${batchFailed} failed`);
      }
      
      // Add delay between batches to avoid overwhelming the system
      if (i < batches.length - 1) {
        await delay(MIGRATION_CONFIG.delayBetweenBatches);
      }
    }
    
    // Print final statistics
    printMigrationStats();
    
    return {
      success: true,
      stats: migrationStats
    };
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    return {
      success: false,
      error: error.message,
      stats: migrationStats
    };
  }
}

/**
 * Process a single recipe
 */
async function processRecipe(key, env) {
  try {
    // Get recipe from KV
    const recipe = await getRecipeFromKV(env, key.name);
    
    if (!recipe.success) {
      throw new Error(`Failed to retrieve recipe: ${recipe.error}`);
    }
    
    // Check if recipe already exists in search database
    const existingNode = await checkExistingNode(env, key.name);
    if (existingNode) {
      migrationStats.skipped++;
      return { success: true, skipped: true, reason: 'Already exists' };
    }
    
    // Create recipe node
    const recipeNode = await createRecipeNode(env, key.name, recipe.recipe);
    if (!recipeNode.success) {
      throw new Error(`Failed to create recipe node: ${recipeNode.error}`);
    }
    
    // Create ingredient nodes and relationships
    if (recipe.recipe.ingredients && Array.isArray(recipe.recipe.ingredients)) {
      await createIngredientNodes(env, recipeNode.nodeId, recipe.recipe.ingredients);
    }
    
    // Create category/tag nodes and relationships
    if (recipe.recipe.tags && Array.isArray(recipe.recipe.tags)) {
      await createCategoryNodes(env, recipeNode.nodeId, recipe.recipe.tags);
    }
    
    // Create cooking method relationships
    if (recipe.recipe.cookingMethod) {
      await createCookingMethodNode(env, recipeNode.nodeId, recipe.recipe.cookingMethod);
    }
    
    return { success: true, nodeId: recipeNode.nodeId };
    
  } catch (error) {
    throw { key: key.name, message: error.message };
  }
}

/**
 * Create a recipe node in the search database
 */
async function createRecipeNode(env, recipeId, recipeData) {
  const nodeData = {
    id: recipeId,
    type: 'RECIPE',
    properties: {
      title: recipeData.title || 'Untitled Recipe',
      description: recipeData.description || '',
      ingredients: recipeData.ingredients || [],
      instructions: recipeData.instructions || [],
      url: recipeData.url || '',
      scrapedAt: recipeData.scrapedAt || new Date().toISOString(),
      prepTime: recipeData.prepTime || null,
      cookTime: recipeData.cookTime || null,
      servings: recipeData.servings || null,
      difficulty: recipeData.difficulty || null,
      cuisine: recipeData.cuisine || null,
      tags: recipeData.tags || []
    }
  };
  
  try {
    const response = await fetch(`${env.SEARCH_DB_URL || 'http://localhost:8787'}/api/nodes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nodeData)
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create recipe node');
    }
    
    const result = await response.json();
    return { success: true, nodeId: result.nodeId };
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Create ingredient nodes and relationships
 */
async function createIngredientNodes(env, recipeNodeId, ingredients) {
  for (const ingredient of ingredients) {
    try {
      // Normalize ingredient name
      const ingredientName = normalizeIngredientName(ingredient);
      const ingredientId = `ingredient_${ingredientName.toLowerCase().replace(/\s+/g, '_')}`;
      
      // Create ingredient node if it doesn't exist
      const ingredientNode = await createOrGetNode(env, {
        id: ingredientId,
        type: 'INGREDIENT',
        properties: {
          name: ingredientName,
          aliases: getIngredientAliases(ingredientName),
          category: categorizeIngredient(ingredientName)
        }
      });
      
      if (ingredientNode.success) {
        // Create HAS_INGREDIENT relationship
        await createEdge(env, {
          from_id: recipeNodeId,
          to_id: ingredientNode.nodeId,
          type: 'HAS_INGREDIENT',
          properties: {
            originalText: ingredient,
            quantity: extractQuantity(ingredient),
            unit: extractUnit(ingredient)
          }
        });
      }
      
    } catch (error) {
      console.warn(`Failed to create ingredient node for "${ingredient}":`, error.message);
    }
  }
}

/**
 * Create category/tag nodes and relationships
 */
async function createCategoryNodes(env, recipeNodeId, tags) {
  for (const tag of tags) {
    try {
      const tagName = tag.trim().toLowerCase();
      const tagId = `tag_${tagName.replace(/\s+/g, '_')}`;
      
      // Create tag node if it doesn't exist
      const tagNode = await createOrGetNode(env, {
        id: tagId,
        type: 'TAG',
        properties: {
          name: tagName,
          category: categorizeTag(tagName)
        }
      });
      
      if (tagNode.success) {
        // Create HAS_TAG relationship
        await createEdge(env, {
          from_id: recipeNodeId,
          to_id: tagNode.nodeId,
          type: 'HAS_TAG'
        });
      }
      
    } catch (error) {
      console.warn(`Failed to create tag node for "${tag}":`, error.message);
    }
  }
}

/**
 * Create cooking method node and relationship
 */
async function createCookingMethodNode(env, recipeNodeId, cookingMethod) {
  try {
    const methodName = cookingMethod.trim().toLowerCase();
    const methodId = `method_${methodName.replace(/\s+/g, '_')}`;
    
    // Create method node if it doesn't exist
    const methodNode = await createOrGetNode(env, {
      id: methodId,
      type: 'COOKING_METHOD',
      properties: {
        name: methodName,
        category: categorizeCookingMethod(methodName)
      }
    });
    
    if (methodNode.success) {
      // Create USES_METHOD relationship
      await createEdge(env, {
        from_id: recipeNodeId,
        to_id: methodNode.nodeId,
        type: 'USES_METHOD'
      });
    }
    
  } catch (error) {
    console.warn(`Failed to create cooking method node for "${cookingMethod}":`, error.message);
  }
}

/**
 * Create or get an existing node
 */
async function createOrGetNode(env, nodeData) {
  try {
    // Try to get existing node first
    const response = await fetch(`${env.SEARCH_DB_URL || 'http://localhost:8787'}/api/nodes/${nodeData.id}`);
    
    if (response.ok) {
      // Node exists, return it
      const existingNode = await response.json();
      return { success: true, nodeId: existingNode.id };
    }
    
    // Node doesn't exist, create it
    const createResponse = await fetch(`${env.SEARCH_DB_URL || 'http://localhost:8787'}/api/nodes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nodeData)
    });
    
    if (!createResponse.ok) {
      const error = await createResponse.json();
      throw new Error(error.error || 'Failed to create node');
    }
    
    const result = await createResponse.json();
    return { success: true, nodeId: result.nodeId };
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Create an edge between two nodes
 */
async function createEdge(env, edgeData) {
  try {
    const response = await fetch(`${env.SEARCH_DB_URL || 'http://localhost:8787'}/api/edges`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(edgeData)
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create edge');
    }
    
    return { success: true };
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Check if a node already exists
 */
async function checkExistingNode(env, nodeId) {
  try {
    const response = await fetch(`${env.SEARCH_DB_URL || 'http://localhost:8787'}/api/nodes/${nodeId}`);
    return response.ok;
  } catch (error) {
    return false;
  }
}

// Utility functions

function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeIngredientName(ingredient) {
  // Remove quantities, units, and extra text to get the core ingredient name
  return ingredient
    .replace(/^\d+\/\d+|\d+\.?\d*\s*(cup|tbsp|tsp|oz|lb|g|kg|ml|l|pound|ounce|gram|kilogram|milliliter|liter)s?\.?\s*/gi, '')
    .replace(/^\d+\s*/, '')
    .replace(/\s*\([^)]*\)/g, '')
    .trim()
    .toLowerCase();
}

function getIngredientAliases(ingredientName) {
  // Common ingredient aliases
  const aliases = {
    'tomato': ['tomatoes', 'roma tomato', 'cherry tomato'],
    'onion': ['onions', 'yellow onion', 'red onion', 'white onion'],
    'garlic': ['garlic clove', 'garlic cloves'],
    'olive oil': ['extra virgin olive oil', 'evoo'],
    'salt': ['sea salt', 'kosher salt', 'table salt'],
    'pepper': ['black pepper', 'ground pepper', 'freshly ground pepper']
  };
  
  return aliases[ingredientName] || [];
}

function categorizeIngredient(ingredientName) {
  // Categorize ingredients for better organization
  const categories = {
    'vegetables': ['tomato', 'onion', 'garlic', 'carrot', 'celery', 'bell pepper', 'mushroom', 'spinach', 'lettuce'],
    'fruits': ['apple', 'banana', 'orange', 'lemon', 'lime', 'strawberry', 'blueberry'],
    'proteins': ['chicken', 'beef', 'pork', 'fish', 'shrimp', 'tofu', 'egg', 'beans'],
    'dairy': ['milk', 'cheese', 'yogurt', 'butter', 'cream', 'sour cream'],
    'grains': ['rice', 'pasta', 'bread', 'flour', 'quinoa', 'oats'],
    'herbs_spices': ['basil', 'oregano', 'thyme', 'rosemary', 'cumin', 'paprika', 'cinnamon']
  };
  
  for (const [category, ingredients] of Object.entries(categories)) {
    if (ingredients.some(ing => ingredientName.includes(ing))) {
      return category;
    }
  }
  
  return 'other';
}

function categorizeTag(tagName) {
  // Categorize tags
  const categories = {
    'cuisine': ['italian', 'mexican', 'chinese', 'indian', 'french', 'japanese', 'thai'],
    'meal_type': ['breakfast', 'lunch', 'dinner', 'dessert', 'snack', 'appetizer'],
    'dietary': ['vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'keto', 'paleo'],
    'cooking_method': ['baked', 'fried', 'grilled', 'roasted', 'steamed', 'slow-cooked'],
    'difficulty': ['easy', 'medium', 'hard', 'beginner', 'advanced']
  };
  
  for (const [category, tags] of Object.entries(categories)) {
    if (tags.some(t => tagName.includes(t))) {
      return category;
    }
  }
  
  return 'other';
}

function categorizeCookingMethod(methodName) {
  // Categorize cooking methods
  const categories = {
    'dry_heat': ['bake', 'roast', 'grill', 'broil', 'pan-fry', 'deep-fry'],
    'moist_heat': ['boil', 'simmer', 'steam', 'poach', 'braise'],
    'combination': ['stew', 'slow-cook', 'sous-vide']
  };
  
  for (const [category, methods] of Object.entries(categories)) {
    if (methods.some(m => methodName.includes(m))) {
      return category;
    }
  }
  
  return 'other';
}

function extractQuantity(ingredient) {
  // Extract quantity from ingredient string
  const match = ingredient.match(/^(\d+\/\d+|\d+\.?\d*)/);
  return match ? match[1] : null;
}

function extractUnit(ingredient) {
  // Extract unit from ingredient string
  const units = ['cup', 'tbsp', 'tsp', 'oz', 'lb', 'g', 'kg', 'ml', 'l', 'pound', 'ounce', 'gram', 'kilogram', 'milliliter', 'liter'];
  const lowerIngredient = ingredient.toLowerCase();
  
  for (const unit of units) {
    if (lowerIngredient.includes(unit)) {
      return unit;
    }
  }
  
  return null;
}

function printMigrationStats() {
  console.log('\n📊 Migration Complete!');
  console.log('========================');
  console.log(`Total recipes found: ${migrationStats.total}`);
  console.log(`Processed: ${migrationStats.processed}`);
  console.log(`✅ Successful: ${migrationStats.successful}`);
  console.log(`❌ Failed: ${migrationStats.failed}`);
  console.log(`⏭️  Skipped: ${migrationStats.skipped}`);
  
  if (migrationStats.errors.length > 0) {
    console.log('\n⚠️  Errors encountered:');
    migrationStats.errors.forEach(error => {
      console.log(`  - ${error.key}: ${error.error}`);
    });
  }
  
  const successRate = ((migrationStats.successful / migrationStats.total) * 100).toFixed(1);
  console.log(`\n🎯 Success Rate: ${successRate}%`);
}

// Export for use in other modules
export { migrateKVToSearch, processRecipe, createRecipeNode };

// Run migration if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('This script is designed to be run within a Cloudflare Worker environment.');
  console.log('Please use the migration endpoint instead.');
}
