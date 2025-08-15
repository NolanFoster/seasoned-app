# JSON-LD Recipe Extraction Update

## Overview

The recipe clipper has been updated to first check for JSON-LD structured data before making LLM calls. This significantly improves performance and reduces costs when extracting recipes from websites that already provide structured data.

## Changes Made

### 1. Added JSON-LD Detection and Parsing

**File**: `worker/src/recipe-clipper.js` and `clipper/src/recipe-clipper.js`

- Added `extractRecipeFromJsonLd()` function to detect and parse JSON-LD scripts
- Added `findRecipeInJsonLd()` to handle various JSON-LD structures (arrays, graphs, nested objects)
- Added `normalizeJsonLdRecipe()` to convert JSON-LD to our expected format
- Added helper functions for normalizing different field types

### 2. Updated Recipe Extraction Flow

The `extractRecipeWithGPT()` function now:
1. Fetches the HTML from the URL
2. **NEW**: Checks for JSON-LD recipe data
3. If JSON-LD found: Returns the parsed recipe immediately (skips LLM)
4. If no JSON-LD: Falls back to the existing LLM extraction

### 3. Deployment Scripts

Created staging deployment scripts:
- `worker/deploy-clipper-staging.sh`
- `clipper/deploy-clipper-staging.sh`

## Benefits

1. **Performance**: JSON-LD extraction is nearly instantaneous (< 500ms vs 2-5s for LLM)
2. **Cost Savings**: No LLM API calls for sites with JSON-LD (most major recipe sites)
3. **Accuracy**: JSON-LD data is structured and reliable
4. **Fallback**: Still supports sites without JSON-LD using the existing LLM approach

## Testing

Created test scripts:
- `worker/test-json-ld-extraction.js` - Tests JSON-LD parsing directly
- `worker/test-json-ld-clipper.js` - Integration test for the clipper service

### Test Results

Successfully tested JSON-LD extraction on:
- AllRecipes ✅
- Serious Eats ✅
- Bon Appétit ✅
- NY Times Cooking ✅

## Deployment to Staging

To deploy the updated clipper to staging:

```bash
cd worker
./deploy-clipper-staging.sh
```

Or from the clipper directory:

```bash
cd clipper
./deploy-clipper-staging.sh
```

## Verification

After deployment, test the staging endpoint:

```bash
curl -X POST https://recipe-clipper-worker-staging.[your-subdomain].workers.dev/clip \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.allrecipes.com/recipe/222000/spaghetti-aglio-e-olio/"}'
```

The response should be nearly instantaneous for sites with JSON-LD.