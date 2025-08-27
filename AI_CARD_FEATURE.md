# AI Card Recipe Generation Feature

## Overview

This feature automatically generates recipes when AI cards are selected, providing a seamless user experience for AI-generated recipe suggestions.

## How It Works

1. **AI Card Detection**: Cards with `source: 'ai_generated'` or `fallback: true` are identified as AI cards
2. **Recipe Generation**: When an AI card is clicked, it calls the recipe generation worker to create a full recipe
3. **Loading States**: While generating, the card displays a loading spinner and pulsates with a glowing effect
4. **Fullscreen View**: Once generated, the complete recipe opens in the fullscreen recipe view

## Features

### Visual Feedback
- **Glow Effect**: AI cards have a subtle purple-blue glow on hover
- **Pulsating Animation**: Loading cards pulsate with an enhanced glow effect
- **Loading Spinner**: Shows a spinning indicator with "Generating Recipe..." text
- **Smooth Transitions**: All animations use CSS transitions for smooth effects

### Recipe Generation
- **AI-Powered**: Uses the recipe generation worker with LLaMA model
- **Fallback Support**: Includes mock mode for development/testing
- **Timeout Handling**: 30-second timeout with proper error handling
- **Rich Data**: Generates complete recipes with ingredients, instructions, timing, etc.

## Setup

### 1. Environment Variables

Add the recipe generation worker URL to your `.env` file:

```bash
VITE_RECIPE_GENERATION_URL=https://your-recipe-generation-worker.your-subdomain.workers.dev
```

### 2. Recipe Generation Worker

Ensure your recipe generation worker is deployed and accessible. The worker should:

- Accept POST requests to `/generate`
- Handle recipe generation requests with proper CORS headers
- Return recipe data in the expected format

### 3. Worker Configuration

The worker should be configured with:
- AI binding for LLaMA model access
- Vectorize binding for recipe embeddings
- Proper environment variables

## API Endpoint

### POST /generate

**Request Body:**
```json
{
  "recipeName": "Recipe Name",
  "ingredients": ["ingredient1", "ingredient2"],
  "servings": "4",
  "cuisine": "General",
  "dietary": []
}
```

**Response:**
```json
{
  "success": true,
  "recipe": {
    "name": "Generated Recipe Name",
    "description": "Recipe description",
    "ingredients": ["2 cups ingredient1", "1 lb ingredient2"],
    "instructions": ["Step 1", "Step 2"],
    "prepTime": "15 minutes",
    "cookTime": "20 minutes",
    "servings": "4",
    "difficulty": "Easy",
    "cuisine": "General",
    "dietary": [],
    "generatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

## CSS Classes

### AI Card Styling
- `.ai-card`: Base AI card styling with enhanced hover effects
- `.ai-card.loading`: Loading state with pulsating animation
- `.ai-generated-indicator`: Container for AI generation UI
- `.ai-loading-state`: Loading state container
- `.ai-loading-spinner`: Spinning loading indicator
- `.ai-loading-text`: Loading text display

### Animations
- `ai-card-pulsate`: Pulsating glow effect for loading cards
- `ai-spin`: Spinning animation for loading indicator

## Error Handling

- **Network Errors**: Proper timeout handling with 30-second limit
- **Generation Failures**: User-friendly error messages
- **Fallback Mode**: Mock responses for development environments
- **State Management**: Proper cleanup of loading states

## Testing

### Manual Testing
1. Click on an AI card (identified by "Generate with AI" text)
2. Verify loading state appears with spinner and pulsating effect
3. Check that recipe generation completes successfully
4. Verify fullscreen recipe view opens with generated content

### Test Data
Use cards with:
- `source: 'ai_generated'`
- `fallback: true`

## Future Enhancements

- **Progress Indicators**: Show generation progress percentage
- **Retry Logic**: Allow users to retry failed generations
- **Caching**: Cache generated recipes to avoid regeneration
- **User Preferences**: Remember user's cuisine/dietary preferences
- **Batch Generation**: Generate multiple recipes simultaneously

## Troubleshooting

### Common Issues

1. **Worker Not Accessible**
   - Check worker deployment status
   - Verify environment variable is correct
   - Test worker endpoint directly

2. **CORS Errors**
   - Ensure worker has proper CORS headers
   - Check worker configuration

3. **Generation Timeouts**
   - Verify AI model access
   - Check worker logs for errors
   - Consider increasing timeout for complex recipes

4. **Loading States Not Clearing**
   - Check error handling in `handleAiCardRecipeGeneration`
   - Verify state cleanup logic

### Debug Mode

Enable debug logging by setting `DEBUG_MODE = true` in the App component to see detailed generation logs.