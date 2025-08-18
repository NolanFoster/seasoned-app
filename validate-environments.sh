#!/bin/bash

echo "🔍 Validating environment configurations..."

# Function to check for placeholders in files
check_placeholders() {
    local file=$1
    local placeholders=$(grep -n "PLACEHOLDER" "$file" 2>/dev/null || echo "")
    
    if [ -n "$placeholders" ]; then
        echo "❌ Found placeholders in $file:"
        echo "$placeholders"
        return 1
    else
        echo "✅ No placeholders found in $file"
        return 0
    fi
}

# Function to check if database IDs are different between environments
check_database_separation() {
    local file=$1
    echo "🔍 Checking database separation in $file..."
    
    # Extract production and staging database IDs
    local prod_db_id=$(grep -A 5 "\[env\.production\.d1_databases\]" "$file" 2>/dev/null | grep "database_id" | cut -d'"' -f2)
    local staging_db_id=$(grep -A 5 "\[env\.staging\.d1_databases\]" "$file" 2>/dev/null | grep "database_id" | cut -d'"' -f2)
    
    if [ -n "$prod_db_id" ] && [ -n "$staging_db_id" ]; then
        if [ "$prod_db_id" = "$staging_db_id" ]; then
            echo "❌ WARNING: Production and staging use the same database ID in $file"
            echo "   Production: $prod_db_id"
            echo "   Staging: $staging_db_id"
            return 1
        else
            echo "✅ Production and staging use different database IDs in $file"
            return 0
        fi
    else
        echo "ℹ️  Could not find both production and staging database IDs in $file"
        return 0
    fi
}

echo ""
echo "Checking wrangler.toml files for placeholders..."

# Check all wrangler.toml files
files=(
    "clipped-recipe-db-worker/wrangler.toml"
    "recipe-search-db/wrangler.toml"
    "clipper/wrangler.toml"
    "recipe-save-worker/wrangler.toml"
    "recipe-recommendation-worker/wrangler.toml"
)

placeholder_errors=0
separation_errors=0

for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        check_placeholders "$file" || ((placeholder_errors++))
        check_database_separation "$file" || ((separation_errors++))
    else
        echo "⚠️  File not found: $file"
    fi
    echo ""
done

echo "🔍 Checking frontend environment files..."
if [ -f "frontend/.env.staging" ]; then
    echo "✅ frontend/.env.staging exists"
else
    echo "❌ frontend/.env.staging missing"
    ((placeholder_errors++))
fi

if [ -f "frontend/.env.production" ]; then
    echo "✅ frontend/.env.production exists"
else
    echo "❌ frontend/.env.production missing"
    ((placeholder_errors++))
fi

echo ""
echo "📊 Validation Summary:"
echo "Placeholder errors: $placeholder_errors"
echo "Database separation errors: $separation_errors"

if [ $placeholder_errors -eq 0 ] && [ $separation_errors -eq 0 ]; then
    echo "✅ All environment configurations are properly set up!"
    exit 0
else
    echo "❌ Environment configuration issues found. Please fix before deploying."
    exit 1
fi