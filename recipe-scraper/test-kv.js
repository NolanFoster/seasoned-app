#!/usr/bin/env node

/**
 * Test script for KV storage functionality
 * Demonstrates scraping and storing recipes in KV
 */

import fetch from 'node-fetch';

const WORKER_URL = 'http://localhost:8787'; // Change this to your deployed worker URL

async function testKVFunctionality() {
  console.log('🧪 Testing KV storage functionality...\n');

  try {
    // Test 1: Scrape and save a recipe
    console.log('1️⃣ Testing recipe scraping with KV storage...');
    const testUrl = 'https://www.allrecipes.com/recipe/24074/alysias-basic-meat-lasagna/';
    
    const scrapeResponse = await fetch(`${WORKER_URL}/scrape?url=${encodeURIComponent(testUrl)}&save=true`);
    const scrapeResult = await scrapeResponse.json();
    
    console.log('Scrape result:', JSON.stringify(scrapeResult, null, 2));
    
    if (scrapeResult.results && scrapeResult.results[0] && scrapeResult.results[0].recipeId) {
      const recipeId = scrapeResult.results[0].recipeId;
      console.log(`✅ Recipe scraped and saved with ID: ${recipeId}\n`);
      
      // Test 2: Retrieve the saved recipe
      console.log('2️⃣ Testing recipe retrieval...');
      const getResponse = await fetch(`${WORKER_URL}/recipes?id=${recipeId}`);
      const getResult = await getResponse.json();
      
      if (getResponse.ok) {
        console.log('✅ Recipe retrieved successfully');
        console.log('Recipe data:', JSON.stringify(getResult, null, 2));
      } else {
        console.log('❌ Failed to retrieve recipe:', getResult);
      }
      
      // Test 3: List all recipes
      console.log('\n3️⃣ Testing recipe listing...');
      const listResponse = await fetch(`${WORKER_URL}/recipes`);
      const listResult = await listResponse.json();
      
      if (listResponse.ok) {
        console.log('✅ Recipe list retrieved successfully');
        console.log(`Found ${listResult.recipes.length} recipes`);
        console.log('Recipes:', listResult.recipes.map(r => ({ id: r.id, title: r.data.name, url: r.url })));
      } else {
        console.log('❌ Failed to list recipes:', listResult);
      }
      
      // Test 4: Delete the recipe
      console.log('\n4️⃣ Testing recipe deletion...');
      const deleteResponse = await fetch(`${WORKER_URL}/recipes?id=${recipeId}`, {
        method: 'DELETE'
      });
      const deleteResult = await deleteResponse.json();
      
      if (deleteResponse.ok) {
        console.log('✅ Recipe deleted successfully');
      } else {
        console.log('❌ Failed to delete recipe:', deleteResult);
      }
      
    } else {
      console.log('❌ No recipe ID returned from scraping');
    }
    
    // Test 5: Health check
    console.log('\n5️⃣ Testing health check...');
    const healthResponse = await fetch(`${WORKER_URL}/health`);
    const healthResult = await healthResponse.json();
    
    if (healthResponse.ok) {
      console.log('✅ Health check passed');
      console.log('Health result:', JSON.stringify(healthResult, null, 2));
    } else {
      console.log('❌ Health check failed:', healthResult);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\n💡 Make sure your worker is running: npm run dev');
  }
}

// Run tests
testKVFunctionality().catch(console.error);
