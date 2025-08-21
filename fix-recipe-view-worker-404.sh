#!/bin/bash

# Script to fix the 404 issue when recipe view worker calls recipe save worker

echo "Fixing Recipe View Worker 404 Issue"
echo "=================================="
echo ""

# Step 1: Check current configuration
echo "Step 1: Checking current configuration..."
echo ""

# Check if the recipe view worker has the correct environment variable set
echo "Checking if RECIPE_SAVE_WORKER_URL is set for recipe-view-worker..."
echo "Run: wrangler secret list --env staging --name recipe-view-worker"
echo ""

# Step 2: Set the environment variable
echo "Step 2: Setting RECIPE_SAVE_WORKER_URL for recipe-view-worker..."
echo ""

# For staging environment
echo "For STAGING environment:"
echo "wrangler secret put RECIPE_SAVE_WORKER_URL --env staging --name staging-recipe-view-worker"
echo "Then enter: https://staging-recipe-save-worker.nolanfoster.workers.dev"
echo ""

# For production environment  
echo "For PRODUCTION environment:"
echo "wrangler secret put RECIPE_SAVE_WORKER_URL --name recipe-view-worker"
echo "Then enter: https://recipe-save-worker.nolanfoster.workers.dev"
echo ""

# Step 3: Verify the configuration
echo "Step 3: Verify the configuration..."
echo ""
echo "After setting the secret, test the recipe view worker:"
echo ""
echo "For staging:"
echo "curl https://staging-recipe-view-worker.nolanfoster.workers.dev/recipe/YOUR_RECIPE_ID_HERE"
echo ""
echo "For production:"
echo "curl https://recipe-view-worker.nolanfoster.workers.dev/recipe/YOUR_RECIPE_ID_HERE"
echo ""

# Step 4: Alternative - Update wrangler.toml
echo "Step 4: Alternative - Add to wrangler.toml (if you prefer not using secrets)..."
echo ""
echo "Add these lines to recipe-view-worker/wrangler.toml:"
echo ""
echo "[vars]"
echo "RECIPE_SAVE_WORKER_URL = \"https://recipe-save-worker.nolanfoster.workers.dev\""
echo ""
echo "[env.staging.vars]"
echo "RECIPE_SAVE_WORKER_URL = \"https://staging-recipe-save-worker.nolanfoster.workers.dev\""
echo ""

echo "=================================="
echo "Debug Information"
echo "=================================="
echo ""
echo "The recipe view worker expects to call:"
echo "  \${RECIPE_SAVE_WORKER_URL}/recipe/get?id=\${recipeId}"
echo ""
echo "The recipe save worker accepts these routes:"
echo "  /recipe/save    - POST   - Save a new recipe"
echo "  /recipe/update  - PUT    - Update an existing recipe"
echo "  /recipe/delete  - DELETE - Delete a recipe"
echo "  /recipe/get     - GET    - Get a recipe by ID (query param: id)"
echo "  /recipe/status  - GET    - Get recipe status by ID (query param: id)"
echo ""
echo "The pattern matches, so the issue is likely the missing RECIPE_SAVE_WORKER_URL environment variable."