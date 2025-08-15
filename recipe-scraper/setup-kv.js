#!/usr/bin/env node

/**
 * Setup script for KV namespace
 * This script helps create the KV namespace and update wrangler.toml
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const WRANGLER_TOML_PATH = './wrangler.toml';

async function setupKV() {
  console.log('🚀 Setting up KV namespace for recipe-scraper...\n');

  try {
    // Create KV namespace
    console.log('📦 Creating KV namespace...');
    const createOutput = execSync('npx wrangler kv namespace create "RECIPE_STORAGE"', { 
      encoding: 'utf8',
      stdio: 'pipe'
    });
    
    // Extract namespace ID from output
    const idMatch = createOutput.match(/id = "([^"]+)"/);
    const namespaceId = idMatch ? idMatch[1] : null;
    
    if (!namespaceId) {
      throw new Error('Could not extract namespace ID from wrangler output');
    }
    
    console.log(`✅ KV namespace created with ID: ${namespaceId}`);
    
    // Create preview namespace
    console.log('📦 Creating preview KV namespace...');
    const previewOutput = execSync('npx wrangler kv namespace create "RECIPE_STORAGE" --preview', { 
      encoding: 'utf8',
      stdio: 'pipe'
    });
    
    const previewIdMatch = previewOutput.match(/id = "([^"]+)"/);
    const previewNamespaceId = previewIdMatch ? previewIdMatch[1] : null;
    
    if (!previewNamespaceId) {
      throw new Error('Could not extract preview namespace ID from wrangler output');
    }
    
    console.log(`✅ Preview KV namespace created with ID: ${previewNamespaceId}`);
    
    // Update wrangler.toml
    console.log('📝 Updating wrangler.toml...');
    let wranglerConfig = fs.readFileSync(WRANGLER_TOML_PATH, 'utf8');
    
    // Replace placeholder IDs with actual IDs
    wranglerConfig = wranglerConfig.replace(
      /id = "your-kv-namespace-id"/g,
      `id = "${namespaceId}"`
    );
    
    wranglerConfig = wranglerConfig.replace(
      /preview_id = "your-preview-kv-namespace-id"/g,
      `preview_id = "${previewNamespaceId}"`
    );
    
    fs.writeFileSync(WRANGLER_TOML_PATH, wranglerConfig);
    
    console.log('✅ wrangler.toml updated successfully');
    
    console.log('\n🎉 KV setup complete!');
    console.log('\nNext steps:');
    console.log('1. Deploy your worker: npm run deploy');
    console.log('2. Test scraping with KV storage:');
    console.log('   curl "https://your-worker.your-subdomain.workers.dev/scrape?url=https://example.com/recipe&save=true"');
    console.log('3. List stored recipes:');
    console.log('   curl "https://your-worker.your-subdomain.workers.dev/recipes"');
    
  } catch (error) {
    console.error('❌ Error setting up KV:', error.message);
    
    if (error.message.includes('already exists')) {
      console.log('\n💡 The KV namespace already exists. You can:');
      console.log('1. List existing namespaces: npx wrangler kv namespace list');
      console.log('2. Manually update wrangler.toml with the correct IDs');
    }
    
    process.exit(1);
  }
}

// Run setup
setupKV().catch(console.error);
