#!/usr/bin/env node

// Integration test for recipe scraping and saving to KV storage

const RECIPE_URL = 'https://www.allrecipes.com/recipe/23037/easy-beginners-turkey-with-stuffing/';

// Configuration
const SCRAPER_URL = process.env.RECIPE_SCRAPER_URL || 'http://localhost:8788';
const SAVE_WORKER_URL = process.env.RECIPE_SAVE_WORKER_URL || 'http://localhost:8787';

async function testRecipeIntegration() {
  console.log('🧪 Recipe KV Storage Integration Test');
  console.log('====================================');
  console.log('Recipe URL:', RECIPE_URL);
  console.log('Scraper URL:', SCRAPER_URL);
  console.log('Save Worker URL:', SAVE_WORKER_URL);
  console.log('');

  try {
    // Step 1: Scrape the recipe
    console.log('📥 Step 1: Scraping recipe...');
    const scrapeResponse = await fetch(`${SCRAPER_URL}/scrape`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: RECIPE_URL })
    });

    if (!scrapeResponse.ok) {
      const error = await scrapeResponse.text();
      throw new Error(`Scraping failed: ${scrapeResponse.status} - ${error}`);
    }

    const scrapedRecipe = await scrapeResponse.json();
    console.log('✅ Recipe scraped successfully!');
    console.log('   Title:', scrapedRecipe.title);
    console.log('   Ingredients:', scrapedRecipe.ingredients?.length || 0);
    console.log('   Instructions:', scrapedRecipe.instructions?.length || 0);
    console.log('   Has image:', !!scrapedRecipe.imageUrl);
    console.log('');

    // Step 2: Save the recipe to KV storage
    console.log('💾 Step 2: Saving recipe to KV storage...');
    const saveResponse = await fetch(`${SAVE_WORKER_URL}/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipe: scrapedRecipe,
        options: {
          overwrite: true
        }
      })
    });

    const saveResult = await saveResponse.json();

    if (!saveResponse.ok || !saveResult.success) {
      throw new Error(`Save failed: ${saveResponse.status} - ${JSON.stringify(saveResult)}`);
    }

    console.log('✅ Recipe saved successfully!');
    console.log('   Recipe ID:', saveResult.id);
    console.log('   Image processing:', saveResult.imageProcessingResults?.success ? '✅' : '❌');
    if (saveResult.imageProcessingResults?.processedImages) {
      console.log('   Processed images:', saveResult.imageProcessingResults.processedImages.length);
    }
    console.log('');

    // Step 3: Verify the saved recipe
    console.log('🔍 Step 3: Verifying saved recipe...');
    const getResponse = await fetch(`${SAVE_WORKER_URL}/get?id=${saveResult.id}`);
    
    if (!getResponse.ok) {
      const error = await getResponse.text();
      throw new Error(`Get failed: ${getResponse.status} - ${error}`);
    }

    const savedRecipe = await getResponse.json();
    console.log('✅ Recipe retrieved successfully!');
    console.log('   Title:', savedRecipe.title);
    console.log('   URL:', savedRecipe.url);
    console.log('   Created at:', savedRecipe.createdAt);
    console.log('   Version:', savedRecipe.version);
    console.log('');

    // Step 4: Verify data integrity
    console.log('🔐 Step 4: Verifying data integrity...');
    const checks = {
      'Title matches': scrapedRecipe.title === savedRecipe.title,
      'URL matches': scrapedRecipe.url === savedRecipe.url,
      'Ingredients count matches': scrapedRecipe.ingredients?.length === savedRecipe.ingredients?.length,
      'Instructions count matches': scrapedRecipe.instructions?.length === savedRecipe.instructions?.length,
      'Has nutrition data': !!savedRecipe.nutrition,
      'Has recipe ID': !!savedRecipe.id,
      'Has timestamps': !!savedRecipe.createdAt && !!savedRecipe.updatedAt
    };

    Object.entries(checks).forEach(([check, passed]) => {
      console.log(`   ${passed ? '✅' : '❌'} ${check}`);
    });

    // Step 5: Test update functionality
    console.log('\n📝 Step 5: Testing update functionality...');
    const updatedRecipe = {
      ...savedRecipe,
      title: savedRecipe.title + ' (Updated)',
      customField: 'test-update'
    };

    const updateResponse = await fetch(`${SAVE_WORKER_URL}/update`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: saveResult.id,
        updates: {
          title: updatedRecipe.title,
          customField: updatedRecipe.customField
        }
      })
    });

    const updateResult = await updateResponse.json();

    if (updateResponse.ok && updateResult.success) {
      console.log('✅ Recipe updated successfully!');
      
      // Verify the update
      const verifyUpdateResponse = await fetch(`${SAVE_WORKER_URL}/get?id=${saveResult.id}`);
      const updatedSavedRecipe = await verifyUpdateResponse.json();
      
      console.log('   Title updated:', updatedSavedRecipe.title.includes('(Updated)') ? '✅' : '❌');
      console.log('   Custom field added:', updatedSavedRecipe.customField === 'test-update' ? '✅' : '❌');
      console.log('   Version incremented:', updatedSavedRecipe.version > savedRecipe.version ? '✅' : '❌');
    } else {
      console.log('❌ Update failed:', updateResult);
    }

    console.log('\n🎉 All tests completed successfully!');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Display usage instructions
console.log('📋 Usage Instructions:');
console.log('1. Start the recipe-scraper worker:');
console.log('   cd recipe-scraper && npx wrangler dev --port 8788');
console.log('');
console.log('2. Start the recipe-save-worker:');
console.log('   cd recipe-save-worker && npx wrangler dev --port 8787');
console.log('');
console.log('3. Run this test:');
console.log('   node test-recipe-kv-integration.js');
console.log('');
console.log('Or set custom URLs:');
console.log('   RECIPE_SCRAPER_URL=<url> RECIPE_SAVE_WORKER_URL=<url> node test-recipe-kv-integration.js');
console.log('');
console.log('Starting test in 3 seconds...\n');

// Give user time to read instructions
setTimeout(testRecipeIntegration, 3000);