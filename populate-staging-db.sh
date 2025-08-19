#!/bin/bash

# Populate Staging Database Script
# This script uses the crawler to populate the staging database with recipes

set -e  # Exit on any error

echo "🍳 Populating Staging Database with Recipes"
echo "=========================================="

# Configuration
STAGING_SCRAPER_URL="https://staging-recipe-scraper.nolanfoster.workers.dev"
CRAWLER_DIR="crawler"
OUTPUT_FILE="staging_population_results.json"
HISTORY_FILE="staging_population_history.json"

# Create a curated list of recipe URLs for staging
cat > staging_recipe_urls.txt << 'EOF'
# Curated recipe URLs for staging database population
# These URLs are known to have good recipe data

# AllRecipes - Popular recipes
https://www.allrecipes.com/recipe/24074/alysias-basic-meat-lasagna/
https://www.allrecipes.com/recipe/237983/easy-tamale-casserole/
https://www.allrecipes.com/recipe/23600/worlds-best-lasagna/
https://www.allrecipes.com/recipe/16383/easy-meatloaf/
https://www.allrecipes.com/recipe/10813/best-chocolate-chip-cookies/

# Food Network - Quality recipes
https://www.foodnetwork.com/recipes/food-network-kitchen/pancakes-recipe-1913844
https://www.foodnetwork.com/recipes/tyler-florence/grilled-cheese-sandwich-recipe-1914057
https://www.foodnetwork.com/recipes/ree-drummond/perfect-pot-roast-recipe-2107099

# Epicurious - Gourmet recipes
https://www.epicurious.com/recipes/food/views/classic-chicken-soup-51259710
https://www.epicurious.com/recipes/food/views/perfect-chocolate-chip-cookies-51259540

# Bon Appétit - Modern recipes
https://www.bonappetit.com/recipe/bas-best-chocolate-chip-cookies
https://www.bonappetit.com/recipe/classic-macaroni-and-cheese

# Serious Eats - Technique-focused recipes
https://www.seriouseats.com/the-food-lab-complete-guide-to-pan-seared-steaks
https://www.seriouseats.com/the-food-lab-complete-guide-to-making-chocolate-chip-cookies
EOF

echo "📝 Created staging recipe URLs file"

# Check if crawler directory exists
if [ ! -d "$CRAWLER_DIR" ]; then
    echo "❌ Crawler directory not found: $CRAWLER_DIR"
    exit 1
fi

# Check if Python and required packages are available
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is required but not installed"
    exit 1
fi

# Check if required Python packages are installed
cd "$CRAWLER_DIR"
if ! python3 -c "import requests, beautifulsoup4" 2>/dev/null; then
    echo "📦 Installing required Python packages..."
    pip3 install requests beautifulsoup4
fi

echo "🔍 Performing health check on staging scraper..."
HEALTH_CHECK_OUTPUT=$(python3 recipe_crawler.py --scraper-url "$STAGING_SCRAPER_URL" --health-check 2>&1)
HEALTH_CHECK_EXIT_CODE=$?

# The health check passes but then exits with error because no URLs are provided
# We need to check if the health check itself passed, not the overall exit code
if echo "$HEALTH_CHECK_OUTPUT" | grep -q "Health check passed"; then
    echo "✅ Staging scraper is healthy"
else
    echo "❌ Staging scraper health check failed"
    echo "$HEALTH_CHECK_OUTPUT"
    exit 1
fi

echo "🚀 Starting recipe population..."
echo "   Target: $STAGING_SCRAPER_URL"
echo "   URLs: $(wc -l < staging_recipe_urls.txt) recipes"
echo "   Output: $OUTPUT_FILE"
echo "   History: $HISTORY_FILE"

# Run the crawler with staging configuration
python3 recipe_crawler.py \
    --scraper-url "$STAGING_SCRAPER_URL" \
    --url-file staging_recipe_urls.txt \
    --output "$OUTPUT_FILE" \
    --save-history \
    --history-file "$HISTORY_FILE" \
    --show-stats \
    --delay 2.0

echo ""
echo "📊 Population Results:"
echo "======================"

# Show summary statistics
if [ -f "$OUTPUT_FILE" ]; then
    echo "✅ Results saved to: $OUTPUT_FILE"
    
    # Count successful vs failed recipes
    SUCCESSFUL=$(grep -c '"success": true' "$OUTPUT_FILE" || echo "0")
    FAILED=$(grep -c '"success": false' "$OUTPUT_FILE" || echo "0")
    TOTAL=$((SUCCESSFUL + FAILED))
    
    echo "📈 Summary:"
    echo "   Total processed: $TOTAL"
    echo "   Successful: $SUCCESSFUL"
    echo "   Failed: $FAILED"
    
    if [ "$TOTAL" -gt 0 ]; then
        SUCCESS_RATE=$((SUCCESSFUL * 100 / TOTAL))
        echo "   Success rate: ${SUCCESS_RATE}%"
    fi
fi

if [ -f "$HISTORY_FILE" ]; then
    echo "📋 Detailed history saved to: $HISTORY_FILE"
fi

echo ""
echo "🔍 Verifying staging database population..."

# List recipes in staging to verify population
echo "📋 Current recipes in staging database:"
python3 recipe_crawler.py \
    --scraper-url "$STAGING_SCRAPER_URL" \
    --list-recipes \
    --limit 10

echo ""
echo "✅ Staging database population complete!"
echo ""
echo "🌐 You can now test the staging environment at:"
echo "   Frontend: https://seasoned-frontend.pages.dev"
echo "   API: $STAGING_SCRAPER_URL"
echo ""
echo "📝 Next steps:"
echo "   1. Test the staging frontend"
echo "   2. Verify recipes are displaying correctly"
echo "   3. Test recipe search and recommendations"
echo "   4. Deploy to production when ready"
