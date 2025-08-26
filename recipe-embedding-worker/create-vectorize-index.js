#!/usr/bin/env node

/**
 * Script to create a new Vectorize index with 384 dimensions for BGE-small embeddings
 * 
 * Run this script to create the vectorize index:
 * node create-vectorize-index.js
 */

console.log('🔧 Setting up Vectorize index for recipe embeddings...\n');

console.log('To create the new Vectorize index with 384 dimensions, run these commands:\n');

console.log('1. Create the index for preview environment:');
console.log('   wrangler vectorize create recipe-vectors-384 --dimensions=384 --metric=cosine --env=preview\n');

console.log('2. Create the index for staging environment:');
console.log('   wrangler vectorize create recipe-vectors-384 --dimensions=384 --metric=cosine --env=staging\n');

console.log('3. Create the index for production environment:');
console.log('   wrangler vectorize create recipe-vectors-384 --dimensions=384 --metric=cosine --env=production\n');

console.log('📋 Index Configuration:');
console.log('   - Name: recipe-vectors-384');
console.log('   - Dimensions: 384 (matches @cf/baai/bge-small-en-v1.5 model)');
console.log('   - Metric: cosine (best for text similarity)');
console.log('   - Model: @cf/baai/bge-small-en-v1.5\n');

console.log('⚠️  Note: You may need to delete the old index if you want to clean up:');
console.log('   wrangler vectorize delete recipe-vectors --env=preview');
console.log('   wrangler vectorize delete recipe-vectors --env=staging');  
console.log('   wrangler vectorize delete recipe-vectors --env=production\n');

console.log('✅ After creating the index, your embedding worker will be ready to run!');

// Also show the wrangler commands that can be copy-pasted
console.log('\n📋 Copy-paste commands:');
console.log('```bash');
console.log('# Create new 384-dimension indexes');
console.log('wrangler vectorize create recipe-vectors-384 --dimensions=384 --metric=cosine --env=preview');
console.log('wrangler vectorize create recipe-vectors-384 --dimensions=384 --metric=cosine --env=staging');
console.log('wrangler vectorize create recipe-vectors-384 --dimensions=384 --metric=cosine --env=production');
console.log('```');
