# Recipe Search Integration

## Overview
The search functionality has been integrated with the `recipe-search-db` worker to provide real-time recipe search capabilities.

## Features

### 1. Real-time Search
- As you type in the search bar, recipes are searched automatically
- Search is debounced with a 300ms delay to avoid excessive API calls
- Minimum 2 characters required to trigger search

### 2. URL Clipping Support
- The search bar continues to support URL clipping
- When a valid URL is detected, the clip icon appears
- Pressing Enter or clicking the button will clip the recipe from the URL

### 3. Search Results Display
- Results appear in a dropdown below the search bar
- Each result shows:
  - Recipe title
  - Prep time (if available)
  - Cook time (if available)
  - Yield/servings (if available)
- Results are limited to 20 per search

### 4. User Interaction
- Click on any search result to select it (currently logs to console)
- Click outside the search area to close results
- Search results have hover effects for better UX

## Technical Implementation

### Environment Variables
- `VITE_SEARCH_DB_URL`: URL for the recipe-search-db worker (defaults to `https://recipe-search-db.nolanfoster.workers.dev`)

### API Endpoint
- **Search Endpoint**: `GET /api/search?q={query}&type=RECIPE&limit=20`
- Returns recipes matching the search query from the graph database

### State Management
- `searchResults`: Array of search results
- `isSearching`: Loading state for search
- `showSearchResults`: Controls visibility of results dropdown

### Styling
- New SCSS file: `frontend/src/styles/search-results.scss`
- Responsive design with mobile support
- Dark mode compatible
- Glassmorphism effects matching the app's design

## Testing

To test the integration:

1. **Search Functionality**:
   - Type recipe names in the search bar
   - Verify results appear after 300ms
   - Check that prep time, cook time, and yield are displayed correctly

2. **URL Clipping**:
   - Paste a recipe URL in the search bar
   - Verify the clip icon appears
   - Confirm clipping still works as before

3. **User Experience**:
   - Test clicking on search results
   - Verify clicking outside closes the dropdown
   - Check mobile responsiveness

## Future Enhancements

As requested, clicking on a search result currently only logs to the console. Future functionality could include:
- Opening the full recipe view
- Adding the recipe to the user's collection
- Showing a preview panel
- Navigating to the recipe detail page