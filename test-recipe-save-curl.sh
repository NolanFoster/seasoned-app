#!/bin/bash

# Simple curl-based test for recipe save worker

RECIPE_URL="https://www.allrecipes.com/recipe/23037/easy-beginners-turkey-with-stuffing/"
SAVE_WORKER_URL="${RECIPE_SAVE_WORKER_URL:-http://localhost:8787}"

echo "🧪 Testing Recipe Save Worker with curl"
echo "======================================"
echo "Recipe URL: $RECIPE_URL"
echo "Worker URL: $SAVE_WORKER_URL"
echo ""

# Test recipe data (pre-scraped for this test)
RECIPE_DATA='{
  "recipe": {
    "url": "https://www.allrecipes.com/recipe/23037/easy-beginners-turkey-with-stuffing/",
    "title": "Easy Beginners Turkey with Stuffing",
    "description": "This is a simple recipe for beginners to make a delicious turkey with stuffing.",
    "ingredients": [
      "1 (10 pound) whole turkey, neck and giblets removed",
      "1/2 cup butter, divided",
      "2 cups warm water",
      "1 (14 ounce) package herb-seasoned stuffing mix",
      "1 tablespoon dried sage",
      "1 tablespoon dried thyme",
      "1 tablespoon dried rosemary",
      "salt and pepper to taste"
    ],
    "instructions": [
      "Preheat oven to 350 degrees F (175 degrees C).",
      "Rinse turkey and pat dry. Place turkey in a roasting pan.",
      "In a small bowl, combine 1/4 cup butter, sage, thyme, rosemary, salt, and pepper. Rub butter mixture all over the outside and inside of turkey.",
      "In a medium bowl, mix together stuffing mix, water, and remaining 1/4 cup butter. Spoon stuffing into body cavity of turkey.",
      "Cover turkey loosely with aluminum foil.",
      "Bake in the preheated oven for 3 to 3 1/2 hours, or until the internal temperature of the thigh reaches 180 degrees F (85 degrees C).",
      "Remove foil during last 45 minutes of cooking to brown the turkey."
    ],
    "prepTime": "PT20M",
    "cookTime": "PT3H30M",
    "totalTime": "PT3H50M",
    "servings": 10,
    "imageUrl": "https://www.allrecipes.com/thmb/QSMcUYDYPbK-JhMaVoUAJBLqjQw=/750x0/filters:no_upscale():max_bytes(150000):strip_icc():format(webp)/23037-easy-beginners-turkey-with-stuffing-DDMFS-4x3-c06ade3655c6485590b1f4a01055ad66.jpg"
  },
  "options": {
    "overwrite": true
  }
}'

echo "📤 Sending save request..."
echo ""

# Save the recipe
RESPONSE=$(curl -s -X POST "$SAVE_WORKER_URL/save" \
  -H "Content-Type: application/json" \
  -d "$RECIPE_DATA")

echo "Response: $RESPONSE"
echo ""

# Extract recipe ID from response using grep and sed
RECIPE_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | sed 's/"id":"\([^"]*\)"/\1/')

if [ -n "$RECIPE_ID" ]; then
  echo "✅ Recipe saved successfully!"
  echo "Recipe ID: $RECIPE_ID"
  echo ""
  
  echo "🔍 Verifying saved recipe..."
  # Retrieve the saved recipe
  VERIFY_RESPONSE=$(curl -s -X GET "$SAVE_WORKER_URL/get?id=$RECIPE_ID")
  
  # Check if we got a successful response
  if echo "$VERIFY_RESPONSE" | grep -q '"title"'; then
    echo "✅ Recipe retrieved successfully!"
    echo ""
    echo "Recipe details:"
    echo "$VERIFY_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$VERIFY_RESPONSE"
  else
    echo "❌ Failed to retrieve recipe"
    echo "Response: $VERIFY_RESPONSE"
  fi
else
  echo "❌ Failed to save recipe"
  echo "Response: $RESPONSE"
fi