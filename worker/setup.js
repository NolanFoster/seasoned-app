#!/usr/bin/env node

// Setup script for Recipe App backend
// This script helps set up the D1 database and R2 bucket

console.log('🍳 Recipe App Backend Setup');
console.log('=============================\n');

console.log('1. Create D1 Database:');
console.log('   wrangler d1 create recipe-db');
console.log('   (Copy the database_id and update wrangler.toml)\n');

console.log('2. Create R2 Bucket:');
console.log('   wrangler r2 bucket create recipe-images');
console.log('   (Update the bucket name in wrangler.toml if different)\n');

console.log('3. Apply Database Schema:');
console.log('   wrangler d1 execute recipe-db --file=./schema.sql\n');

console.log('4. Configure R2 Public Access (Optional):');
console.log('   - Go to Cloudflare Dashboard > R2 > recipe-images');
console.log('   - Enable public access if you want direct image URLs');
console.log('   - Update the image URL in index.js with your custom domain\n');

console.log('5. Deploy Worker:');
console.log('   wrangler deploy\n');

console.log('6. Test the API:');
console.log('   curl https://your-worker.your-subdomain.workers.dev/recipes\n');

console.log('\n📝 Note: Update the following:');
console.log('   - Copy .dev.vars.example to .dev.vars.local and update values');
console.log('   - Set GPT_API_KEY secret: wrangler secret put GPT_API_KEY');
console.log('   - Update database_id and bucket_name in wrangler.toml if different');
console.log('   - See ENVIRONMENT_SETUP.md for complete configuration guide'); 