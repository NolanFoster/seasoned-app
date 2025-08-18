#!/bin/bash

echo "🔧 Creating separate staging resources to prevent data leakage..."

# Create staging D1 databases
echo "📊 Creating staging D1 databases..."

echo "Creating recipe-db-staging (if not exists)..."
STAGING_DB_OUTPUT=$(wrangler d1 create recipe-db-staging 2>&1 || echo "Database may already exist")
echo "$STAGING_DB_OUTPUT"

echo "Creating recipe-search-db-staging (if not exists)..."
STAGING_SEARCH_DB_OUTPUT=$(wrangler d1 create recipe-search-db-staging 2>&1 || echo "Database may already exist")
echo "$STAGING_SEARCH_DB_OUTPUT"

# Create staging KV namespace
echo "🗄️  Creating staging KV namespace..."
STAGING_KV_OUTPUT=$(wrangler kv:namespace create "RECIPE_STORAGE_STAGING" 2>&1 || echo "KV namespace may already exist")
echo "$STAGING_KV_OUTPUT"

# Create staging R2 buckets
echo "🪣 Creating staging R2 buckets..."

echo "Creating recipe-images-staging bucket (if not exists)..."
wrangler r2 bucket create recipe-images-staging 2>&1 || echo "Bucket may already exist"

echo "✅ Staging resource creation completed!"
echo ""
echo "⚠️  IMPORTANT: You need to update the following placeholders in wrangler.toml files:"
echo ""
echo "1. Update STAGING_DATABASE_ID_PLACEHOLDER in clipped-recipe-db-worker/wrangler.toml"
echo "   with the actual database_id from the recipe-db-staging creation output above"
echo ""
echo "2. Update STAGING_SEARCH_DB_ID_PLACEHOLDER in recipe-search-db/wrangler.toml"
echo "   with the actual database_id from the recipe-search-db-staging creation output above"
echo ""
echo "3. Update all STAGING_KV_NAMESPACE_ID_PLACEHOLDER entries in:"
echo "   - clipped-recipe-db-worker/wrangler.toml"
echo "   - recipe-search-db/wrangler.toml"  
echo "   - clipper/wrangler.toml"
echo "   - recipe-save-worker/wrangler.toml"
echo "   with the actual KV namespace ID from the RECIPE_STORAGE_STAGING creation output above"
echo ""
echo "4. Run database migrations for staging:"
echo "   cd clipped-recipe-db-worker && wrangler d1 execute recipe-db-staging --file=schema.sql --env staging"
echo "   cd recipe-search-db && wrangler d1 execute recipe-search-db-staging --file=schema.sql --env staging"
echo ""
echo "5. After updating placeholders, deploy to staging: ./deploy-staging.sh"