#!/bin/bash

echo "🔧 Update Staging Database IDs"
echo "=============================="
echo ""

# Function to update database ID in a file
update_db_id() {
    local file=$1
    local placeholder=$2
    local new_id=$3
    local description=$4
    
    if [ -f "$file" ]; then
        if grep -q "$placeholder" "$file"; then
            sed -i.bak "s/$placeholder/$new_id/g" "$file"
            echo "✅ Updated $description in $file"
        else
            echo "ℹ️  No placeholder found for $description in $file"
        fi
    else
        echo "❌ File not found: $file"
    fi
}

# Check if arguments are provided
if [ $# -eq 0 ]; then
    echo "Usage: $0 <main-db-id> <search-db-id>"
    echo ""
    echo "Example:"
    echo "  $0 abc123-def456-ghi789 xyz789-abc123-def456"
    echo ""
    echo "Where:"
    echo "  - main-db-id: The database_id from 'wrangler d1 create recipe-db-staging'"
    echo "  - search-db-id: The database_id from 'wrangler d1 create recipe-search-db-staging'"
    echo ""
    exit 1
fi

MAIN_DB_ID=$1
SEARCH_DB_ID=$2

echo "Updating configuration files with:"
echo "  Main DB ID: $MAIN_DB_ID"
echo "  Search DB ID: $SEARCH_DB_ID"
echo ""

# Update main database ID
update_db_id "clipped-recipe-db-worker/wrangler.toml" "REPLACE_WITH_STAGING_DB_ID" "$MAIN_DB_ID" "main database ID"

# Update search database ID  
update_db_id "recipe-search-db/wrangler.toml" "REPLACE_WITH_STAGING_SEARCH_DB_ID" "$SEARCH_DB_ID" "search database ID"

echo ""
echo "🔍 Running validation..."
./validate-environments.sh

echo ""
echo "✅ Database IDs updated! Next steps:"
echo "  1. Run database migrations:"
echo "     cd clipped-recipe-db-worker && wrangler d1 execute recipe-db-staging --file=schema.sql --env staging"
echo "     cd ../recipe-search-db && wrangler d1 execute recipe-search-db-staging --file=schema.sql --env staging"
echo ""  
echo "  2. Deploy to staging:"
echo "     ./deploy-staging.sh"