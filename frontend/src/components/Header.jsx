import { useState, useRef, useEffect } from 'react';
import { isValidUrl } from '../../../shared/utility-functions.js';

function UserIcon() {
  return (
    <svg
      className="auth-header-btn-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function getUserInitials(user) {
  if (!user) return null;
  const email = user.email || '';
  return email.charAt(0).toUpperCase() || '?';
}

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
  onClipDialogOpen,
  onGenerateAiRecipe,
  isGeneratingAiRecipe,
  // Auth props
  user,
  isAuthenticated,
  onAuthClick,
  onSignOut,
}) => {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!showUserMenu) return;
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showUserMenu]);

  const handleSearchInputChange = (e) => {
    setSearchInput(e.target.value);
    if (!isValidUrl(e.target.value) && e.target.value.trim().length >= 2) {
      onSearchRecipes(e.target.value);
    }
  };

  const handleSearchKeyPress = (e) => {
    if (e.key === 'Enter') {
      if (isValidUrl(searchInput) && clipperStatus === 'available') {
        onSearchBarClip();
      } else if (!isValidUrl(searchInput) && searchInput.trim()) {
        onSearchRecipes(searchInput);
      } else if (!searchInput.trim()) {
        onClipDialogOpen();
      }
    }
  };

  const handleSearchButtonClick = () => {
    if (isValidUrl(searchInput) && clipperStatus === 'available') {
      onSearchBarClip();
    } else if (!isValidUrl(searchInput) && searchInput.trim()) {
      onSearchRecipes(searchInput);
    } else if (!searchInput.trim()) {
      onClipDialogOpen();
    }
  };

  const handleAiButtonClick = () => {
    if (!isValidUrl(searchInput) && searchInput.trim()) {
      onGenerateAiRecipe(searchInput);
    }
  };

  const handleAuthButtonClick = () => {
    if (isAuthenticated) {
      setShowUserMenu((v) => !v);
    } else {
      onAuthClick();
    }
  };

  const handleSignOut = () => {
    setShowUserMenu(false);
    onSignOut();
  };

  return (
    <div className="header-container">
      <h1 className="title">
        <img src="/spoon.svg" alt="Seasoned" className="title-icon" />
        Seasoned

        <div className={`title-search ${isSearchBarClipping ? 'clipping' : ''} ${searchBarClipError ? 'clip-error' : ''} ${isGeneratingAiRecipe ? 'ai-generating' : ''}`}>
          <input
            type="text"
            className="title-search-input"
            placeholder="Search recipes or paste a URL to clip..."
            aria-label="Search recipes"
            value={searchInput}
            onChange={handleSearchInputChange}
            onKeyPress={handleSearchKeyPress}
            disabled={isSearchBarClipping || isGeneratingAiRecipe || (isValidUrl(searchInput) && clipperStatus !== 'available')}
          />
          <button
            className={`title-search-button ${isValidUrl(searchInput) && clipperStatus === 'available' ? 'clipper-available' : ''} ${!isValidUrl(searchInput) && searchInput.trim() ? 'ai-button' : ''}`}
            aria-label={isValidUrl(searchInput) ? 'Clip recipe' : (!isValidUrl(searchInput) && searchInput.trim() ? 'Generate AI recipe' : 'Search')}
            title={
              isValidUrl(searchInput)
                ? clipperStatus === 'available'
                  ? 'Clip recipe from website'
                  : 'Recipe clipper service is currently unavailable'
                : !isValidUrl(searchInput) && searchInput.trim()
                  ? 'Generate AI recipe from your search'
                  : 'Search recipes'
            }
            onClick={!isValidUrl(searchInput) && searchInput.trim() ? handleAiButtonClick : handleSearchButtonClick}
            disabled={isSearchBarClipping || isGeneratingAiRecipe || (isValidUrl(searchInput) && clipperStatus !== 'available')}
          >
            {isSearchBarClipping || isGeneratingAiRecipe ? (
              <div className="loading-spinner">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 11-6.219-8.56" />
                </svg>
              </div>
            ) : isValidUrl(searchInput) ? (
              <img
                src="/scissor.svg"
                alt="Clip"
                style={{ width: '18px', height: '18px', opacity: clipperStatus === 'available' ? 1 : 0.3 }}
                className={clipperStatus === 'available' ? 'clip-icon-available' : 'clip-icon'}
              />
            ) : !isValidUrl(searchInput) && searchInput.trim() ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            )}
          </button>
        </div>

        {/* Auth button — always present alongside the search bar */}
        <div className="auth-header-wrapper" ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
          <button
            className={`auth-header-btn ${isAuthenticated ? 'authenticated' : ''}`}
            onClick={handleAuthButtonClick}
            aria-label={isAuthenticated ? `Signed in as ${user?.email}` : 'Sign in'}
            title={isAuthenticated ? `Signed in as ${user?.email}` : 'Sign in / Create account'}
          >
            {isAuthenticated ? (
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'white' }}>
                {getUserInitials(user)}
              </span>
            ) : (
              <UserIcon />
            )}
          </button>

          {showUserMenu && isAuthenticated && (
            <div className="auth-user-dropdown">
              <div className="auth-dropdown-email">{user?.email}</div>
              <button className="auth-dropdown-signout" onClick={handleSignOut}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </h1>

      {/* Search Results Dropdown */}
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
                  onClick={() => onRecipeSelect(recipe)}
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
