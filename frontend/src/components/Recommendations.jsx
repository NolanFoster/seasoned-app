import React, { useEffect, useState, useRef, useCallback } from 'react';
import { formatDuration } from '../../../shared/utility-functions.js';
import SwipeableRecipeGrid from './SwipeableRecipeGrid.jsx';

const RECOMMENDATION_API_URL = import.meta.env.VITE_RECOMMENDATION_API_URL || process.env.VITE_RECOMMENDATION_API_URL || 'https://recommendations.test.workers.dev';

function Recommendations({ onRecipeSelect, recipesByCategory, aiCardLoadingStates, onAiCardClick, onLocationUpdate }) {
  // Debug flag - set to true to enable detailed logging
  const DEBUG_MODE = false;
  
  // Helper function for debug logging with emojis
  const debugLogEmoji = (emoji, message, data = {}) => {
    if (DEBUG_MODE) {
      console.log(`${emoji} ${message}`, data);
    }
  };
  
  // If recipesByCategory is provided, use it directly; otherwise fetch recommendations (which now include recipes)
  const [recommendations, setRecommendations] = useState(null);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(true);
  const [userLocation, setUserLocation] = useState(null);
  const [showLocationPrompt, setShowLocationPrompt] = useState(false);
  const [isResolvingLocation, setIsResolvingLocation] = useState(true); // Track location resolution state
  const [locationTimeout, setLocationTimeout] = useState(null); // Track timeout state
  const [isFetchingRecommendations, setIsFetchingRecommendations] = useState(false); // Prevent multiple simultaneous API calls
  const [lastProcessedLocation, setLastProcessedLocation] = useState(null); // Track the last location we processed recipes for
  const [recommendationCallCount, setRecommendationCallCount] = useState(0); // Track total number of API calls made
  const hasMadeApiCall = useRef(false); // Track if we've already made an API call to prevent duplicates

  // Debug logging - now that all state variables are declared
  debugLogEmoji('🔍', 'Recommendations component rendered with:', {
    recipesByCategory: recipesByCategory,
    recipesByCategorySize: recipesByCategory?.size,
    recipesByCategoryType: typeof recipesByCategory,
    hasRecipesByCategory: Boolean(recipesByCategory && recipesByCategory.size > 0),
    hasRecommendations: Boolean(recommendations),
    recommendationsType: recommendations ? typeof recommendations : 'none',
    userLocation: userLocation,
    lastProcessedLocation: lastProcessedLocation,
    recommendationCallCount: recommendationCallCount
  });

  // Check if we need to fetch fresh recommendations due to location change
  const shouldFetchFreshRecommendations = () => {
    // If we don't have recipesByCategory, we need to fetch
    if (!recipesByCategory || recipesByCategory.size === 0) {
      return true;
    }
    
    // If we have a new location that's different from what we processed last, we need to fetch
    if (userLocation && userLocation !== lastProcessedLocation) {
      debugLogEmoji('🔄', 'Location changed, need fresh recommendations:', {
        currentLocation: userLocation,
        lastProcessedLocation: lastProcessedLocation
      });
      return true;
    }
    
    // If we have recipes but no location tracking, we might need to fetch
    if (recipesByCategory.size > 0 && lastProcessedLocation === null) {
      debugLogEmoji('🤔', 'Have recipes but no location tracking, may need fresh recommendations');
      return true;
    }
    
    // Otherwise, we can use existing recipesByCategory
    return false;
  };

  // Fetch recommendations on component mount
  useEffect(() => {
    // Debug: Check if recommendation API URL is set
    debugLogEmoji('🔗', 'Recommendation API URL:', RECOMMENDATION_API_URL);
    if (!RECOMMENDATION_API_URL) {
      console.error('❌ RECOMMENDATION_API_URL is not set!');
      debugLogEmoji('❌', 'RECOMMENDATION_API_URL is not set - recommendations will fail');
    }
    
    // Don't fetch recommendations immediately - wait for location permission resolution
    // The fetchRecommendations will be called after location is determined or timeout occurs
  }, []); // Empty dependency array means this runs once on mount

  // Handle when recipesByCategory changes from parent (e.g., when location changes)
  useEffect(() => {
    if (recipesByCategory && recipesByCategory.size > 0) {
      // If we receive recipesByCategory from parent, mark that we've processed data
      // This prevents unnecessary API calls while still allowing fresh calls when location changes
      if (lastProcessedLocation === null) {
        // If we don't have a lastProcessedLocation, assume this is location-agnostic data
        setLastProcessedLocation('');
        debugLogEmoji('📥', 'Received recipesByCategory from parent, set lastProcessedLocation to empty string');
      }
      
      // Set loading states to false since we have data
      setIsResolvingLocation(false);
      setIsLoadingRecommendations(false);
    }
  }, [recipesByCategory, lastProcessedLocation]);

  // Handle location changes that require fresh recommendations
  useEffect(() => {
    // Since the parent (App.jsx) handles all API calls, we should never make our own API calls
    // The parent will call getRecipesFromRecommendations() and pass the results via recipesByCategory
    debugLogEmoji('✅', 'Parent handles all API calls, skipping local fetch logic');
  }, [userLocation, lastProcessedLocation, isFetchingRecommendations, recipesByCategory]);

  // Handle location permission resolution with timeout
  useEffect(() => {
    // Since the parent (App.jsx) handles all API calls and location resolution,
    // we should never run our own location resolution logic
    debugLogEmoji('✅', 'Parent handles location resolution, skipping local logic');
      setIsResolvingLocation(false);
      setIsLoadingRecommendations(false);
  }, []); // Only run once on mount

  // Monitor changes to recipesByCategory
  useEffect(() => {
    debugLogEmoji('🔄', 'recipesByCategory changed:', {
      hasRecipesByCategory: Boolean(recipesByCategory),
      size: recipesByCategory?.size || 0,
      categories: recipesByCategory ? Array.from(recipesByCategory.keys()) : [],
      timestamp: new Date().toISOString()
    });
  }, [recipesByCategory]);

  // Handle recommendations changes (now that they include recipes directly)
  useEffect(() => {
    // If recipesByCategory is provided, use it directly
    if (recipesByCategory && recipesByCategory.size > 0) {
      debugLogEmoji('✅', 'Using recipesByCategory directly, no processing needed');
      setIsLoadingRecommendations(false);
      return;
    }
    
    // If we have recommendations with recipes, just set loading to false
    if (recommendations && recommendations.recommendations) {
      debugLogEmoji('✅', 'Recommendations with recipes received, setting loading to false');
      setIsLoadingRecommendations(false);
    }
  }, [recommendations, recipesByCategory]);

  // Monitor location permission changes - DISABLED to prevent multiple API calls
  useEffect(() => {
    // Skip permission monitoring to prevent multiple API calls
    debugLogEmoji('✅', 'Permission monitoring disabled to prevent multiple API calls');
  }, [userLocation]); // Only monitor userLocation changes, not recipesByCategory

  // Centralized function to fetch recommendations - handles all cases
  async function fetchRecommendations(location = null) {
    debugLogEmoji('🚀', 'fetchRecommendations called', {
      location,
      userLocation,
      lastProcessedLocation,
      recipesByCategorySize: recipesByCategory?.size || 0,
      isFetchingRecommendations,
      shouldFetch: shouldFetchFreshRecommendations(),
      callStack: new Error().stack?.split('\n').slice(1, 4).join('\n') || 'No stack trace'
    });
    
    // Prevent multiple simultaneous calls
    if (isFetchingRecommendations) {
      debugLogEmoji('🔄', 'Recommendations fetch already in progress, skipping duplicate call');
      return;
    }
    
    // Check if we've already made an API call
    if (hasMadeApiCall.current) {
      debugLogEmoji('🔄', 'API call already made, skipping duplicate call');
      return;
    }
    
    // Check if we need to fetch fresh recommendations
    if (!shouldFetchFreshRecommendations()) {
      debugLogEmoji('✅', 'No need to fetch fresh recommendations, using existing recipesByCategory');
      return;
    }
    
    try {
      setIsFetchingRecommendations(true);
      setIsLoadingRecommendations(true);
      hasMadeApiCall.current = true; // Mark that we're making an API call
      
      // Increment the API call counter
      const newCallCount = recommendationCallCount + 1;
      setRecommendationCallCount(newCallCount);
      debugLogEmoji('📊', `API call #${newCallCount} initiated (previous count: ${recommendationCallCount})`);
      debugLogEmoji('🔍', 'fetchRecommendations called with:', {
        location,
        userLocation,
        lastProcessedLocation,
        recipesByCategorySize: recipesByCategory?.size || 0,
        shouldFetch: shouldFetchFreshRecommendations(),
        timestamp: new Date().toISOString()
      });
      
      // Determine the location to use:
      // 1. Use passed location parameter if provided
      // 2. Fall back to userLocation state if available
      // 3. Use empty string for location-agnostic recommendations
      let finalLocation = location;
      if (finalLocation === null) {
        finalLocation = userLocation || '';
      }
      
      // If we still don't have a location, use empty string for location-agnostic recommendations
      if (!finalLocation) {
        finalLocation = '';
        debugLogEmoji('🌍', 'Using location-agnostic recommendations');
      }
      
      const currentDate = new Date().toISOString().split('T')[0];
      debugLogEmoji('🔍', 'Fetching recommendations for date:', currentDate, 'location:', finalLocation);
      
      const res = await fetch(`${RECOMMENDATION_API_URL}/recommendations`, {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          location: finalLocation,
          date: currentDate
        })
      });
      
      if (res.ok) {
        const data = await res.json();
        debugLogEmoji('✅', 'Recommendations received:', data);
        
        // Filter out inappropriate seasonal recommendations
        if (data.recommendations && data.season) {
          const filteredRecommendations = {};
          const season = data.season.toLowerCase();
          
          Object.entries(data.recommendations).forEach(([category, tags]) => {
            if (Array.isArray(tags)) {
              // Filter out fall/winter holiday items in summer
              if (season === 'summer' && category.toLowerCase().includes('holiday')) {
                // Keep only summer-appropriate items
                filteredRecommendations[category] = tags.filter(tag => {
                  const tagLower = tag.toLowerCase();
                  // Remove fall/winter holidays
                  return !tagLower.includes('halloween') && 
                         !tagLower.includes('thanksgiving') && 
                         !tagLower.includes('christmas') &&
                         !tagLower.includes('pumpkin') &&
                         !tagLower.includes('gingerbread');
                });
              } else if (season === 'winter' && category.toLowerCase().includes('holiday')) {
                // Keep only winter-appropriate items
                filteredRecommendations[category] = tags.filter(tag => {
                  const tagLower = tag.toLowerCase();
                  // Remove summer holidays
                  return !tagLower.includes('4th of july') && 
                         !tagLower.includes('labor day') &&
                         !tagLower.includes('memorial day');
                });
              } else {
                // Keep all tags for non-holiday categories
                filteredRecommendations[category] = tags;
              }
            }
          });
          
          // Update the data with filtered recommendations
          data.recommendations = filteredRecommendations;
        }
        
        setRecommendations(data);
        
        // Update the last processed location to prevent unnecessary future API calls
        setLastProcessedLocation(finalLocation || '');
        debugLogEmoji('📍', 'Updated lastProcessedLocation to:', finalLocation || '');
        
        // Recommendations now include recipes directly, no additional fetching needed
        debugLogEmoji('✅', 'Recommendations with recipes set, no additional fetching required');
      } else {
        console.error('Failed to fetch recommendations:', res.status, res.statusText);
        setRecommendations(null);
      }
    } catch (error) {
      console.error('Error fetching recommendations:', error);
      setRecommendations(null);
    } finally {
      setIsLoadingRecommendations(false);
      setIsFetchingRecommendations(false);
    }
  }

  // Function removed - recommendations now include recipes directly

  // Handle manual location input
  const handleManualLocationInput = (locationInput) => {
    const trimmedLocation = locationInput.trim();
    if (trimmedLocation && !isFetchingRecommendations) {
      // Clear any pending timeout since user is manually setting location
      setLocationTimeout(null);
      setIsResolvingLocation(false);
      
      setUserLocation(trimmedLocation);
      onLocationUpdate?.(trimmedLocation); // Update parent component with manual location
      setShowLocationPrompt(false);
      debugLogEmoji('📍', 'Manual location set:', trimmedLocation);
      // fetchRecommendations will be called by useEffect when userLocation changes
    }
  };

  // Clear user location
  const clearUserLocation = () => {
    if (!isFetchingRecommendations) {
      // Clear any pending timeout since user is clearing location
      setLocationTimeout(null);
      setIsResolvingLocation(false);
      
      setUserLocation(null);
      onLocationUpdate?.(''); // Update parent component to clear location
      debugLogEmoji('🗑️', 'User location cleared');
      // fetchRecommendations will be called by useEffect when userLocation changes
    }
  };

  // Helper function to check if location permissions are available
  const checkLocationPermissions = async () => {
    if (!navigator.geolocation) {
      return { available: false, reason: 'Geolocation not supported' };
    }
    
    if (navigator.permissions && navigator.permissions.query) {
      try {
        const permission = await navigator.permissions.query({ name: 'geolocation' });
        return { available: true, state: permission.state };
      } catch (error) {
        return { available: true, state: 'unknown' };
      }
    }
    
    return { available: true, state: 'unknown' };
  };

  // Function removed - recommendations now include recipes directly

  async function requestLocationManually() {
    // Prevent multiple simultaneous location requests
    if (isFetchingRecommendations) {
      debugLogEmoji('🔄', 'Location request already in progress, skipping duplicate request');
      return;
    }
    
    try {
      debugLogEmoji('📍', 'Manual location request initiated');
      setShowLocationPrompt(false);
      setIsResolvingLocation(false); // Mark location as resolved
      
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { 
          timeout: 15000,
          enableHighAccuracy: true,
          maximumAge: 0 // Force fresh location request
        });
      });
      
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      
      // Try to get city name using reverse geocoding
      try {
        const geocodeResponse = await fetch(
          `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`
        );
        
        if (geocodeResponse.ok) {
          const geocodeData = await geocodeResponse.json();
          const city = geocodeData.city || geocodeData.locality;
          const region = geocodeData.principalSubdivision || geocodeData.countryName;
          
          let location;
          if (city && region) {
            location = `${city}, ${region}`;
          } else if (city) {
            location = city;
          } else {
            location = `${lat.toFixed(2)}°N, ${lng.toFixed(2)}°W`;
          }
          
          setUserLocation(location);
          onLocationUpdate?.(location); // Update parent component with manual GPS location
          debugLogEmoji('📍', 'Manual location set:', location);
          // fetchRecommendations will be called by useEffect when userLocation changes
        }
      } catch (geocodeError) {
        console.log('Reverse geocoding failed, using coordinates');
        const location = `${lat.toFixed(2)}°N, ${lng.toFixed(2)}°W`;
        setUserLocation(location);
        onLocationUpdate?.(location); // Update parent component with coordinate location
        // fetchRecommendations will be called by useEffect when userLocation changes
      }
    } catch (error) {
      debugLogEmoji('❌', 'Manual location request failed:', error.message);
      
      // Provide specific error messages based on error type
      let errorMessage = 'Location request failed';
      if (error.code === 1) {
        errorMessage = 'Location permission denied. Please enable location access in your browser settings.';
      } else if (error.code === 2) {
        errorMessage = 'Location unavailable. Please try again later.';
      } else if (error.code === 3) {
        errorMessage = 'Location request timed out. Please try again.';
      }
      
      // Show error message to user and re-show location prompt
      setShowLocationPrompt(true);
      
      // You could also show a toast notification here if you have a notification system
      console.error('Location request failed:', errorMessage);
    }
  }

  // If we have recipesByCategory, render them directly
  if (recipesByCategory && recipesByCategory.size > 0) {
    debugLogEmoji('✅', 'Using recipesByCategory for rendering');
    return (
      <div className="recommendations-container" data-testid="recommendations-container">
        {(() => {
          try {
            const entries = Array.from(recipesByCategory.entries());
            debugLogEmoji('📊', 'recipesByCategory entries:', entries);
            
            return entries.map(([categoryName, recipes]) => {
              debugLogEmoji('🎯', `Rendering category "${categoryName}" with ${recipes.length} recipes`);
              
              // Show all recipes in each category without any limits
              const sortedRecipes = recipes;
              
              debugLogEmoji('📊', `Category "${categoryName}": ${recipes.length} total recipes, ${sortedRecipes.length} displayed`);
              
              // Only show category if it has recipes
              if (sortedRecipes.length === 0) return null;
              
              return (
                <div key={categoryName} className="recommendation-category">
                  <h2 className="category-title">{categoryName}</h2>
                  <SwipeableRecipeGrid>
                    {sortedRecipes.map((recipe, index) => (
                      <div 
                        key={`${categoryName}-${recipe.id}-${index}`} 
                        className={`recipe-card ${(recipe.source === 'ai_generated' || recipe.fallback) ? 'ai-card' : ''} ${(recipe.source === 'ai_generated' || recipe.fallback) && aiCardLoadingStates.has(recipe.id || recipe.name) ? 'loading' : ''}`}
                        onClick={() => {
                          if (recipe.source === 'ai_generated' || recipe.fallback) {
                            onAiCardClick(recipe);
                          } else {
                            onRecipeSelect(recipe);
                          }
                        }}
                      >
                        <div className="recipe-card-image">
                          {/* Main image display */}
                          {(recipe.image || recipe.image_url) ? (
                            <img 
                              src={recipe.image || recipe.image_url} 
                              alt={recipe.name}
                              loading="lazy"
                              style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                zIndex: 1,
                                borderRadius: '20px 20px 0 0',
                                opacity: 0.85
                              }}
                              onError={(e) => {
                                // Fallback to gradient if image fails
                                e.target.style.display = 'none';
                              }}
                            />
                          ) : (
                            <div style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: '100%',
                              height: '100%',
                              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                              zIndex: 1,
                              opacity: 0.85
                            }}></div>
                          )}
                          <div className="recipe-card-overlay"></div>
                          <div className="recipe-card-title-overlay">
                            <h3 className="recipe-card-title">{recipe.name}</h3>
                          </div>
                        </div>
                        <div className="recipe-card-content">
                          {/* Only show timing information for non-AI-generated recipes */}
                          {!(recipe.source === 'ai_generated' || recipe.fallback) && (
                            <>
                              {recipe.prep_time || recipe.cook_time || recipe.recipe_yield || recipe.recipeYield || recipe.yield ? (
                                <div className="recipe-card-time">
                                  <div className="time-item">
                                    <span className="time-label">Prep</span>
                                    <span className="time-value">{formatDuration(recipe.prep_time || recipe.prepTime) || '-'}</span>
                                  </div>
                                  <div className="time-divider"></div>
                                  <div className="time-item">
                                    <span className="time-label">Cook</span>
                                    <span className="time-value">{formatDuration(recipe.cook_time || recipe.cookTime) || '-'}</span>
                                  </div>
                                  {(recipe.recipe_yield || recipe.recipeYield || recipe.yield) && (
                                    <>
                                      <div className="time-divider"></div>
                                      <div className="time-item">
                                        <span className="time-label">Yield</span>
                                        <span className="time-value">{recipe.recipe_yield || recipe.recipeYield || recipe.yield}</span>
                                      </div>
                                    </>
                                  )}
                                </div>
                              ) : (
                                <p className="recipe-card-time">
                                  <span className="time-icon">⏱️</span>
                                  <span className="no-time">-</span>
                                </p>
                              )}
                            </>
                          )}
                                                    {/* Show "Generate with AI" for AI-generated recipes */}
                          {(recipe.source === 'ai_generated' || recipe.fallback) && (
                            <div className="ai-generated-indicator">
                              {aiCardLoadingStates.has(`${recipe.id || recipe.name}`) ? (
                                <div className="ai-loading-state">
                                  <div className="loading-spinner">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M21 12a9 9 0 11-6.219-8.56" />
                                    </svg>
                                  </div>
                                  <span className="ai-loading-text">Generating Recipe...</span>
                                </div>
                              ) : (
                                <span className="ai-generated-text">Generate with AI</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </SwipeableRecipeGrid>
                </div>
              );
            });
          } catch (error) {
            console.error('Error rendering recommendations:', error);
            return null;
          }
        })()}
      </div>
    );
  }

  // Fallback: If no recipesByCategory, use the original logic
  if (isLoadingRecommendations || recommendations) {
    debugLogEmoji('🔄', 'Using fallback rendering logic:', {
      isLoadingRecommendations,
      hasRecommendations: Boolean(recommendations),
      hasRecommendationsData: Boolean(recommendations?.recommendations)
    });
    return (
      <div className="recommendations-container" data-testid="recommendations-container">
        {/* Location resolution loading indicator */}
        {isResolvingLocation && (
          <div style={{
            background: '#e3f2fd',
            border: '1px solid #2196f3',
            borderRadius: '6px',
            padding: '16px',
            margin: '16px 0',
            textAlign: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '8px' }}>
              <div className="loading-spinner" style={{
                width: '20px',
                height: '20px',
                border: '2px solid #f3f3f3',
                borderTop: '2px solid #2196f3',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }}></div>
              <span style={{ fontSize: '16px', color: '#1976d2', fontWeight: '500' }}>
                Resolving location permissions...
              </span>
            </div>
            {locationTimeout && (
              <div style={{ fontSize: '14px', color: '#666' }}>
                Using default location in {locationTimeout} seconds
              </div>
            )}
            {!locationTimeout && isResolvingLocation && (
              <div style={{ fontSize: '14px', color: '#666' }}>
                Waiting for location permission... (up to 2 minutes)
              </div>
            )}

            <style>{`
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            `}</style>
          </div>
        )}

        {/* Location status indicator */}
        {userLocation && (
          <div style={{
            background: '#e8f5e8',
            border: '1px solid #c3e6c3',
            borderRadius: '6px',
            padding: '12px 16px',
            margin: '16px 0',
            display: 'flex',
            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '8px'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '16px' }}>📍</span>
                              <span style={{ fontSize: '14px', color: '#2d5a2d' }}>
                                Location: <strong>{userLocation}</strong>
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button
                                onClick={() => setShowLocationPrompt(true)}
                                style={{
                                  background: '#007bff',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  padding: '6px 12px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                Change
              </button>
              <button
                onClick={clearUserLocation}
                style={{
                  background: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '6px 12px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Location button for users without location */}
        {!userLocation && !showLocationPrompt && (
          <div style={{
            background: '#f8f9fa',
            border: '1px solid #dee2e6',
            borderRadius: '6px',
            padding: '12px 16px',
            margin: '16px 0',
            textAlign: 'center'
          }}>

            <button
              onClick={() => setShowLocationPrompt(true)}
              style={{
                background: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '10px 20px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                margin: '0 auto'
              }}
            >
              <span>📍</span>
              Enable Location for Better Recommendations
            </button>
          </div>
        )}

        {/* Location permission prompt */}
        {showLocationPrompt && (
          <div className="location-prompt" style={{
            background: '#f8f9fa',
            border: '1px solid #dee2e6',
            borderRadius: '8px',
            padding: '20px',
            margin: '16px 0',
            textAlign: 'center',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>📍</div>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', color: '#333' }}>
                Enable Location Access
              </h3>
              <p style={{ margin: '0 0 16px 0', color: '#666', fontSize: '14px', lineHeight: '1.4' }}>
                Get personalized recipe recommendations based on your location, including seasonal ingredients and local specialties.
              </p>
            </div>
            
            <div style={{ marginBottom: '16px' }}>
              <input
                type="text"
                placeholder="Enter your city (e.g., San Francisco, CA)"
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px',
                  marginBottom: '8px'
                }}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && e.target.value.trim()) {
                    handleManualLocationInput(e.target.value);
                  }
                }}
                id="manual-location-input"
              />
              <button
                onClick={() => {
                  const input = document.getElementById('manual-location-input');
                  if (input && input.value.trim()) {
                    handleManualLocationInput(input.value);
                  }
                }}
                style={{
                  background: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '8px 16px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  marginBottom: '12px'
                }}
              >
                Set Location
              </button>
              <div style={{ fontSize: '12px', color: '#666', marginBottom: '12px' }}>
                Or use one of the options below
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button 
                onClick={requestLocationManually}
                style={{
                  background: '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '10px 20px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  transition: 'background-color 0.2s'
                }}
                onMouseOver={(e) => e.target.style.background = '#0056b3'}
                onMouseOut={(e) => e.target.style.background = '#007bff'}
              >
                Use GPS Location
              </button>
              <button 
                onClick={() => setShowLocationPrompt(false)}
                style={{
                  background: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '10px 20px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  transition: 'background-color 0.2s'
                }}
                onMouseOver={(e) => e.target.style.background = '#545b62'}
                onMouseOut={(e) => e.target.style.background = '#6c757d'}
              >
                Skip for Now
              </button>
            </div>
            
            <div style={{ marginTop: '16px', fontSize: '12px', color: '#999' }}>
              You can enable location access anytime in your browser settings
            </div>
          </div>
        )}
        
        {(() => {
          try {
            // Show loading state with placeholder categories
            if (isLoadingRecommendations || !recommendations || !recommendations.recommendations) {
              const loadingCategories = ['Seasonal Favorites', 'Local Specialties', 'Holiday Treats'];
              return loadingCategories.map(categoryName => (
                <div key={categoryName} className="recommendation-category">
                  <h2 className="category-title">{categoryName}</h2>
                  <SwipeableRecipeGrid>
                    {[1, 2, 3, 4, 5].map(index => (
                      <div key={index} className="recipe-card loading-card">
                        <div className="recipe-card-image loading-pulse">
                          <div className="loading-shimmer"></div>
                        </div>
                        <div className="recipe-card-content">
                          <div className="loading-text loading-pulse"></div>
                        </div>
                      </div>
                    ))}
                  </SwipeableRecipeGrid>
                </div>
              ));
            }
            
            // Track which recipes have been shown to avoid duplicates
            const shownRecipeIds = new Set();
            
            return Object.entries(recommendations.recommendations).map(([categoryName, recipes]) => {
              // Ensure recipes is an array
              if (!Array.isArray(recipes)) {
                console.error(`Invalid recipes format for category ${categoryName}:`, recipes);
                return null;
              }
              
              debugLogEmoji('🔄', `Processing category: ${categoryName} with ${recipes.length} recipes`);
              
              // Filter out duplicates across categories
              const uniqueRecipes = recipes.filter(recipe => 
                !shownRecipeIds.has(recipe.id)
              );
              
              // Show all unique recipes for this category
              const sortedRecipes = uniqueRecipes;
              
              debugLogEmoji('🎯', `Category "${categoryName}": ${uniqueRecipes.length} unique recipes, ${sortedRecipes.length} displayed`);
              
              // Add selected recipes to the shown set
              sortedRecipes.forEach(recipe => shownRecipeIds.add(recipe.id));
              
              // Only show category if it has recipes
              if (sortedRecipes.length === 0) return null;
              
              return (
                <div key={categoryName} className="recommendation-category">
                  <h2 className="category-title">{categoryName}</h2>
                  <SwipeableRecipeGrid>
                    {sortedRecipes.map((recipe, index) => (
                      <div 
                        key={`${categoryName}-${recipe.id}-${index}`} 
                        className={`recipe-card ${(recipe.source === 'ai_generated' || recipe.fallback) ? 'ai-card' : ''} ${(recipe.source === 'ai_generated' || recipe.fallback) && aiCardLoadingStates.has(recipe.id || recipe.name) ? 'loading' : ''}`}
                        onClick={() => {
                          if (recipe.source === 'ai_generated' || recipe.fallback) {
                            onAiCardClick(recipe);
                          } else {
                            onRecipeSelect(recipe);
                          }
                        }}
                      >
                        <div className="recipe-card-image">
                          {/* Main image display */}
                          {(recipe.image || recipe.image_url) ? (
                            <img 
                              src={recipe.image || recipe.image_url} 
                              alt={recipe.name}
                              loading="lazy"
                              style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                zIndex: 1,
                                borderRadius: '20px 20px 0 0',
                                opacity: 0.85
                              }}
                              onError={(e) => {
                                // Fallback to gradient if image fails
                                e.target.style.display = 'none';
                              }}
                            />
                          ) : (
                            <div style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: '100%',
                              height: '100%',
                              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                              textAlign: 'center',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'white',
                              fontSize: '24px',
                              fontWeight: 'bold'
                            }}>🍳</div>
                          )}
                          <div className="recipe-card-overlay"></div>
                          <div className="recipe-card-title-overlay">
                            <h3 className="recipe-card-title">{recipe.name}</h3>
                          </div>
                        </div>
                        <div className="recipe-card-content">
                          {/* Only show timing information for non-AI-generated recipes */}
                          {!(recipe.source === 'ai_generated' || recipe.fallback) && (
                            <>
                              {recipe.prep_time || recipe.cook_time || recipe.recipe_yield || recipe.recipeYield || recipe.yield ? (
                                <div className="recipe-card-time">
                                  <div className="time-item">
                                    <span className="time-label">Prep</span>
                                    <span className="time-value">{formatDuration(recipe.prep_time || recipe.prepTime) || '-'}</span>
                                  </div>
                                  <div className="time-divider"></div>
                                  <div className="time-item">
                                    <span className="time-label">Cook</span>
                                    <span className="time-value">{formatDuration(recipe.cook_time || recipe.cookTime) || '-'}</span>
                                  </div>
                                  {(recipe.recipe_yield || recipe.recipeYield || recipe.yield) && (
                                    <>
                                      <div className="time-divider"></div>
                                      <div className="time-item">
                                        <span className="time-label">Yield</span>
                                        <span className="time-value">{recipe.recipe_yield || recipe.recipeYield || recipe.yield}</span>
                                      </div>
                                    </>
                                  )}
                                </div>
                              ) : (
                                <p className="recipe-card-time">
                                  <span className="time-icon">⏱️</span>
                                  <span className="no-time">-</span>
                                </p>
                              )}
                            </>
                          )}
                          {/* Show "Generate with AI" for AI-generated recipes */}
                          {(recipe.source === 'ai_generated' || recipe.fallback) && (
                            <div className="ai-generated-indicator">
                              {aiCardLoadingStates.has(`${recipe.id || recipe.name}`) ? (
                                <div className="ai-loading-state">
                                  <div className="loading-spinner">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M21 12a9 9 0 11-6.219-8.56" />
                                    </svg>
                                  </div>
                                  <span className="ai-loading-text">Generating Recipe...</span>
                                </div>
                              ) : (
                                <span className="ai-generated-text">Generate with AI</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </SwipeableRecipeGrid>
                </div>
              );
            });
          } catch (error) {
            console.error('Error rendering recommendations:', error);
            return null;
          }
        })()}
      </div>
    );
  }

  debugLogEmoji('❌', 'No rendering conditions met, returning null');
  return null;
}

export default Recommendations;
