# Fix for "Only 3 recommendations per category and none are AI-generated"

## Root Cause
The frontend was not explicitly sending `limit: 4` in the API request body to the recommendation worker. While the backend defaults to 4 recipes per category, the frontend needs to explicitly request this.

## Changes Made

### Frontend Updates
1. **Updated `frontend/src/components/Recommendations.jsx`** (2 locations):
   - Added `limit: 4` to both API request bodies in `fetchRecommendationsWithLocation()` and `fetchRecommendations()`

2. **Updated `frontend/src/App.jsx`** (2 locations):
   - Added `limit: 4` to both API request bodies in `getRecipeCategories()` and `getRecipesFromRecommendations()`

### Request Body Before:
```json
{
  "location": "Seattle, WA",
  "date": "2024-01-15"
}
```

### Request Body After:
```json
{
  "location": "Seattle, WA", 
  "date": "2024-01-15",
  "limit": 4
}
```

## Expected Behavior After Fix
- Each recommendation category should display **4 recipes**
- The **4th recipe** in each category should be marked as **AI-generated**
- AI-generated recipes display "Generate with AI" instead of timing information
- Clicking an AI-generated recipe triggers the recipe generation worker

## Verification
After deployment, you should see:
- 3 categories with 4 recipes each (total 12 recipes)
- Each category's 4th recipe shows "Generate with AI"
- AI-generated recipes have a distinct visual style (ai-card class)

## Deployment Notes
- Changes affect both the main app and the recommendations component
- No backend changes were needed (backend already supports limit=4)
- The fix ensures consistent behavior across all frontend entry points

## Testing the API Directly
You can test the API endpoint directly with:
```bash
curl -X POST "YOUR_RECOMMENDATION_API_URL/recommendations" \
  -H "Content-Type: application/json" \
  -d '{"location": "Seattle, WA", "date": "2024-01-15", "limit": 4}'
```

This should return 3 categories with 4 recipes each, where the 4th recipe in each category has `"source": "ai_generated"`.