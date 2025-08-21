#!/bin/bash

# Test script to verify recipe view worker can successfully call recipe save worker

echo "Testing Recipe View Worker Integration"
echo "====================================="
echo ""

# Function to test a recipe ID
test_recipe() {
    local env=$1
    local recipe_id=$2
    local base_url=$3
    
    echo "Testing $env environment with recipe ID: $recipe_id"
    echo "URL: $base_url/recipe/$recipe_id"
    echo ""
    
    # Make the request and capture response
    response=$(curl -s -w "\n%{http_code}" "$base_url/recipe/$recipe_id")
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    echo "HTTP Status Code: $http_code"
    
    if [ "$http_code" = "200" ]; then
        echo "✅ Success! Recipe page loaded successfully."
        # Check if it contains recipe data
        if echo "$body" | grep -q "recipe-title\|recipe-name"; then
            echo "✅ Recipe data found in HTML response."
        else
            echo "⚠️  Warning: Response received but no recipe data found in HTML."
        fi
    elif [ "$http_code" = "404" ]; then
        echo "❌ Error: 404 Not Found"
        # Check if it's a recipe not found or endpoint not found
        if echo "$body" | grep -q "Recipe not found"; then
            echo "   → Recipe ID not found in database (this is expected for invalid IDs)"
        else
            echo "   → Endpoint configuration issue - RECIPE_SAVE_WORKER_URL might not be set"
        fi
    else
        echo "❌ Error: Unexpected status code $http_code"
    fi
    
    echo ""
    echo "---"
    echo ""
}

# Test staging environment
echo "1. Testing STAGING Environment"
echo "==============================="
echo ""

# You'll need to replace this with an actual recipe ID from your staging database
# Run this to get a recipe ID: wrangler kv:key list --env staging --namespace-id YOUR_KV_NAMESPACE_ID
STAGING_RECIPE_ID="test-recipe-id"  # Replace with actual ID
test_recipe "STAGING" "$STAGING_RECIPE_ID" "https://staging-recipe-view-worker.nolanfoster.workers.dev"

# Test production environment
echo "2. Testing PRODUCTION Environment"
echo "================================="
echo ""

# Replace with an actual recipe ID from production
PROD_RECIPE_ID="test-recipe-id"  # Replace with actual ID
test_recipe "PRODUCTION" "$PROD_RECIPE_ID" "https://recipe-view-worker.nolanfoster.workers.dev"

# Test with a known non-existent ID to verify 404 handling
echo "3. Testing Non-existent Recipe (Expected 404)"
echo "============================================="
echo ""
test_recipe "STAGING" "non-existent-recipe-id-12345" "https://staging-recipe-view-worker.nolanfoster.workers.dev"

echo ""
echo "Test complete!"
echo ""
echo "If you see 'Endpoint configuration issue' errors, run:"
echo "  ./fix-recipe-view-worker-404.sh"
echo ""
echo "To get actual recipe IDs for testing, use:"
echo "  wrangler kv:key list --env staging --namespace-id YOUR_KV_NAMESPACE_ID --prefix recipes:"