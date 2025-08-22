#!/bin/bash

# Simple curl test for recipe-view-worker

RECIPE_URL="https://www.allrecipes.com/recipe/23037/easy-beginners-turkey-with-stuffing/"
VIEW_WORKER_URL="${RECIPE_VIEW_WORKER_URL:-http://localhost:8789}"

echo "🧪 Testing Recipe View Worker with curl"
echo "======================================"
echo "Recipe URL: $RECIPE_URL"
echo "View Worker URL: $VIEW_WORKER_URL"
echo ""

# Generate recipe ID using sha256sum (same logic as the workers)
RECIPE_ID=$(echo -n "$RECIPE_URL" | sha256sum | cut -c1-16)
echo "Recipe ID: $RECIPE_ID"
echo ""

# Test the view endpoint
VIEW_URL="$VIEW_WORKER_URL/recipe/$RECIPE_ID"
echo "📥 Fetching recipe view from: $VIEW_URL"
echo ""

# Fetch the HTML
RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" "$VIEW_URL")
HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS:" | cut -d: -f2)
HTML_CONTENT=$(echo "$RESPONSE" | sed '/HTTP_STATUS:/d')

echo "Response Status: $HTTP_STATUS"

if [ "$HTTP_STATUS" = "200" ]; then
  echo "✅ Recipe view returned successfully!"
  echo ""
  
  # Check content length
  CONTENT_LENGTH=$(echo -n "$HTML_CONTENT" | wc -c)
  echo "Content Length: $CONTENT_LENGTH bytes"
  echo ""
  
  # Check for key content
  echo "Content Analysis:"
  
  if echo "$HTML_CONTENT" | grep -q "Easy Beginner.*Turkey"; then
    echo "  ✅ Recipe title found"
  else
    echo "  ❌ Recipe title not found"
  fi
  
  if echo "$HTML_CONTENT" | grep -qi "ingredient"; then
    echo "  ✅ Ingredients section found"
  else
    echo "  ❌ Ingredients section not found"
  fi
  
  if echo "$HTML_CONTENT" | grep -qi "instruction"; then
    echo "  ✅ Instructions section found"
  else
    echo "  ❌ Instructions section not found"
  fi
  
  if echo "$HTML_CONTENT" | grep -q "<!DOCTYPE html>\|<html"; then
    echo "  ✅ Valid HTML structure"
  else
    echo "  ❌ Invalid HTML structure"
  fi
  
  echo ""
  echo "📱 View the recipe in your browser:"
  echo "   $VIEW_URL"
  
  if [[ "$VIEW_WORKER_URL" == *"localhost"* ]]; then
    echo ""
    echo "   Or use the deployed version:"
    echo "   https://recipe-view-worker.nolanfoster.workers.dev/recipe/$RECIPE_ID"
  fi
  
  # Option to save the HTML
  if [ -n "$SAVE_HTML" ]; then
    FILENAME="recipe-view-${RECIPE_ID}.html"
    echo "$HTML_CONTENT" > "$FILENAME"
    echo ""
    echo "💾 HTML saved to: $FILENAME"
  fi
  
elif [ "$HTTP_STATUS" = "404" ]; then
  echo "❌ Recipe not found (404)"
  echo ""
  echo "This might mean:"
  echo "1. The recipe hasn't been saved to KV storage yet"
  echo "2. The recipe ID calculation is different"
  echo "3. The view worker can't connect to the save worker"
  echo ""
  echo "Try running the save test first:"
  echo "  ./test-recipe-save-curl.sh"
else
  echo "❌ Unexpected status code: $HTTP_STATUS"
  echo ""
  echo "Response preview:"
  echo "$HTML_CONTENT" | head -20
fi

echo ""
echo "💡 Tip: To save the HTML output, run:"
echo "   SAVE_HTML=1 $0"