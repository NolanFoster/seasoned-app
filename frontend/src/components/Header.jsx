import React from 'react';
import { isValidUrl } from '../../../shared/utility-functions.js';

const Header = ({
  searchInput,
  setSearchInput,
  isSearchBarClipping,
  searchBarClipError,
  clipperStatus,
  showSearchResults,
  searchResults,
  isSearching,
  onSearchBarClip,
  onSearchRecipes,
  onRecipeSelect,
  onClipDialogOpen
}) => {
  const handleSearchInputChange = (e) => {
    setSearchInput(e.target.value);
    
    // Clear search results if it's a URL
    if (isValidUrl(e.target.value)) {
      // Clear search results if it's a URL
      // This will be handled by the parent component
    } else if (e.target.value.trim().length >= 2) {
      // Trigger search for non-URL inputs
      onSearchRecipes(e.target.value);
    } else {
      // Clear results if query is too short
      // This will be handled by the parent component
    }
  };

  const handleSearchKeyPress = (e) => {
    if (e.key === 'Enter') {
      if (isValidUrl(searchInput) && clipperStatus === 'available') {
        onSearchBarClip();
      } else if (!isValidUrl(searchInput) && searchInput.trim()) {
        // Trigger search for non-URL inputs
        onSearchRecipes(searchInput);
      } else if (!searchInput.trim()) {
        // Only open clip dialog if input is empty
        onClipDialogOpen();
      }
    }
  };

  const handleSearchButtonClick = () => {
    if (isValidUrl(searchInput) && clipperStatus === 'available') {
      onSearchBarClip();
    } else if (!isValidUrl(searchInput) && searchInput.trim()) {
      // Trigger search for non-URL inputs
      onSearchRecipes(searchInput);
    } else if (!searchInput.trim()) {
      // Only open clip dialog if input is empty
      onClipDialogOpen();
    }
  };

  return (
    <div className="header-container">
      <h1 className="title">
        <img src="/spoon.svg" alt="Seasoned" className="title-icon" />
        Seasoned
        {/* Search bar in the same panel */}
        <div className={`title-search ${isSearchBarClipping ? 'clipping' : ''} ${searchBarClipError ? 'clip-error' : ''}`}>
          <input 
            type="text" 
            className="title-search-input" 
            placeholder="Search recipes or paste a URL to clip..."
            aria-label="Search recipes"
            value={searchInput}
            onChange={handleSearchInputChange}
            onKeyPress={handleSearchKeyPress}
            disabled={isSearchBarClipping || (isValidUrl(searchInput) && clipperStatus !== 'available')}
          />
          <button 
            className={`title-search-button ${isValidUrl(searchInput) && clipperStatus === 'available' ? 'clipper-available' : ''}`}
            aria-label={isValidUrl(searchInput) ? "Clip recipe" : "Search"}
            title={isValidUrl(searchInput) ? 
              (clipperStatus === 'available' ? "Clip recipe from website" : "Recipe clipper service is currently unavailable") : 
              "Search recipes"
            }
            onClick={handleSearchButtonClick}
            disabled={isSearchBarClipping || (isValidUrl(searchInput) && clipperStatus !== 'available')}
          >
            {isSearchBarClipping ? (
              <div className="loading-spinner">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 11-6.219-8.56" />
                </svg>
              </div>
            ) : isValidUrl(searchInput) ? (
              <img 
                src="/scissor.svg" 
                alt="Clip" 
                style={{ 
                  width: '18px', 
                  height: '18px',
                  opacity: clipperStatus === 'available' ? 1 : 0.3
                }} 
                className={clipperStatus === 'available' ? 'clip-icon-available' : 'clip-icon'}
              />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.35-4.35"></path>
              </svg>
            )}
          </button>
        </div>
      </h1>
      
      {/* Search Results Dropdown - now inside the header container */}
      {showSearchResults && (
        <div className="search-results-dropdown">
          {isSearching ? (
            <div className="search-loading">
              <div className="loading-spinner">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 11-6.219-8.56" />
                </svg>
              </div>
              <span>Searching recipes...</span>
            </div>
          ) : searchResults.length > 0 ? (
            <div className="search-results-list">
              {searchResults.map((recipe) => (
                <div 
                  key={recipe.id} 
                  className="search-result-item"
                  onClick={() => {
                    // Open the recipe in fullscreen view
                    onRecipeSelect(recipe);
                    // Clear search - this will be handled by parent
                  }}
                >
                  <div className="search-result-title">{recipe.name}</div>
                  <div className="search-result-meta">
                    {recipe.prep_time && (
                      <span className="search-meta-item">
                        <span className="meta-label">Prep:</span> {recipe.prep_time}
                      </span>
                    )}
                    {recipe.cook_time && (
                      <span className="search-meta-item">
                        <span className="meta-label">Cook:</span> {recipe.cook_time}
                      </span>
                    )}
                    {recipe.recipe_yield && (
                      <span className="search-meta-item">
                        <span className="meta-label">Yield:</span> {recipe.recipe_yield}
                      </span>
                    )}
                    {!recipe.prep_time && !recipe.cook_time && !recipe.recipe_yield && (
                      <span className="search-meta-item no-meta">No timing information</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="search-no-results">
              No recipes found for "{searchInput}"
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Header;
