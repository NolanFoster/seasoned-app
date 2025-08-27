import React, { useEffect, useState, useRef, useCallback } from 'react';
import { formatDuration } from '../../../shared/utility-functions.js';
import SwipeableRecipeGrid from './SwipeableRecipeGrid.jsx';

const RECOMMENDATION_API_URL = import.meta.env.VITE_RECOMMENDATION_API_URL;
const SEARCH_DB_URL = import.meta.env.VITE_SEARCH_DB_URL;

function Recommendations({ onRecipeSelect, recipesByCategory }) {
  // Debug flag - set to true to enable detailed logging
  const DEBUG_MODE = false;
  
  // Helper function for debug logging with emojis
  const debugLogEmoji = (emoji, message, data = {}) => {
    if (DEBUG_MODE) {
      console.log(`${emoji} ${message}`, data);
    }
  };
  
  // Debug logging
  debugLogEmoji('🔍', 'Recommendations component rendered with:', {
    recipesByCategory: recipesByCategory,
    recipesByCategorySize: recipesByCategory?.size,
    recipesByCategoryType: typeof recipesByCategory,
    hasRecipesByCategory: Boolean(recipesByCategory && recipesByCategory.size > 0)
  });
  
  // If recipesByCategory is provided, use it directly; otherwise fall back to fetching
  const [recommendations, setRecommendations] = useState(null);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(true);
  const [userLocation, setUserLocation] = useState(null);
  const [externalRecipes, setExternalRecipes] = useState({});
  const [recipeCache, setRecipeCache] = useState(new Map()); // Cache for recipe searches
  const [showLocationPrompt, setShowLocationPrompt] = useState(false);
  const [loadedCategories, setLoadedCategories] = useState(new Set()); // Track which categories have been loaded
  const [visibleCategories, setVisibleCategories] = useState(new Set()); // Track which categories are visible

  useEffect(() => {
    // If recipesByCategory is provided, skip fetching recommendations
    if (recipesByCategory && recipesByCategory.size > 0) {
      debugLogEmoji('��', 'Using recipesByCategory directly:', {
        size: recipesByCategory.size,
        categories: Array.from(recipesByCategory.keys())
      });
      
      const externalData = {};
      for (const [categoryName, recipes] of recipesByCategory.entries()) {
        debugLogEmoji('📋', `Processing category "${categoryName}" with ${recipes.length} recipes:`, {
          sampleRecipe: recipes[0] ? {
            id: recipes[0].id,
            name: recipes[0].name,
            hasIngredients: recipes[0].ingredients?.length > 0,
            hasInstructions: recipes[0].instructions?.length > 0,
            ingredientCount: recipes[0].ingredients?.length || 0,
            instructionCount: recipes[0].instructions?.length || 0
          } : 'No recipes'
        });
        externalData[categoryName] = recipes;
      }
      
      debugLogEmoji('🎯', 'Final externalData:', {
        categoryCount: Object.keys(externalData).length,
        categories: Object.keys(externalData),
        totalRecipes: Object.values(externalData).reduce((sum, recipes) => sum + recipes.length, 0)
      });
      
      setExternalRecipes(externalData);
      setIsLoadingRecommendations(false);
      return;
    }
    
    // Fetch recommendations but don't let it block the app
    fetchRecommendations().catch(err => {
      console.error('Failed to fetch initial recommendations:', err);
    });
  }, [recipesByCategory]);

  // Monitor changes to recipesByCategory
  useEffect(() => {
    debugLogEmoji('🔄', 'recipesByCategory changed:', {
      hasRecipesByCategory: Boolean(recipesByCategory),
      size: recipesByCategory?.size || 0,
      categories: recipesByCategory ? Array.from(recipesByCategory.keys()) : [],
      timestamp: new Date().toISOString()
    });
  }, [recipesByCategory]);

  // Fetch external recipes when recommendations change (only if recipesByCategory not provided)
  useEffect(() => {
    // If recipesByCategory is provided, use it directly
    if (recipesByCategory && recipesByCategory.size > 0) {
      const externalData = {};
      for (const [categoryName, recipes] of recipesByCategory.entries()) {
        externalData[categoryName] = recipes;
      }
      setExternalRecipes(externalData);
      setIsLoadingRecommendations(false);
      return;
    }
    
    // Otherwise, fetch recommendations and external recipes
    if (recommendations && recommendations.recommendations) {
      const fetchExternalRecipes = async () => {
        const externalData = {};
        
        // Create all promises at once to run in parallel
        const categoryPromises = Object.entries(recommendations.recommendations).map(async ([categoryName, tags]) => {
          if (Array.isArray(tags)) {
            try {
              debugLogEmoji('🚀', `Starting parallel fetch for category: ${categoryName}`);
              const externalRecipes = await searchRecipesByTags(tags, 3);
              return { categoryName, recipes: externalRecipes };
            } catch (error) {
              console.error(`Error fetching external recipes for ${categoryName}:`, error);
              return { categoryName, recipes: [] };
            }
          }
          return { categoryName, recipes: [] };
        });
        
        // Wait for all categories to complete in parallel
        const results = await Promise.all(categoryPromises);
        
        // Build the externalData object from results
        results.forEach(({ categoryName, recipes }) => {
          externalData[categoryName] = recipes;
        });
        
        debugLogEmoji('✅', 'All categories fetched in parallel', {
          categoryCount: results.length,
          totalRecipes: results.reduce((sum, { recipes }) => sum + recipes.length, 0)
        });
        
        setExternalRecipes(externalData);
      };
      fetchExternalRecipes();
    }
  }, [recommendations, recipesByCategory]);

  // Monitor location permission changes
  useEffect(() => {
    if (navigator.permissions && navigator.permissions.query) {
      const checkPermission = async () => {
        try {
          const permission = await navigator.permissions.query({ name: 'geolocation' });
          
          // Listen for permission changes
          permission.addEventListener('change', () => {
            debugLogEmoji('🔒', 'Location permission changed to:', permission.state);
            
            if (permission.state === 'granted' && !userLocation) {
              // Permission was granted, try to get location
              fetchRecommendations();
            } else if (permission.state === 'denied') {
              // Permission was denied, show manual option
              setShowLocationPrompt(true);
            }
          });
        } catch (error) {
          debugLogEmoji('⚠️', 'Could not monitor permission changes:', error.message);
        }
      };
      
      checkPermission();
    }
  }, [userLocation]);

  // Fetch recommendations on component mount
  useEffect(() => {
    fetchRecommendations();
  }, []); // Empty dependency array means this runs once on mount

  async function fetchRecommendations() {
    try {
      setIsLoadingRecommendations(true);
      
      let location = userLocation; // Start with cached user location
      
      // Try to get user's location from browser if we don't have it cached
      if (!userLocation && navigator.geolocation) {
        try {
          debugLogEmoji('📍', 'Requesting user location permission...');
          
          // Check current permission state if supported
          let permissionState = 'prompt'; // Default to prompt state
          if (navigator.permissions && navigator.permissions.query) {
            try {
              const permission = await navigator.permissions.query({name: 'geolocation'});
              permissionState = permission.state;
              debugLogEmoji('🔒', 'Geolocation permission state:', permission.state);
              
              if (permission.state === 'denied') {
                debugLogEmoji('❌', 'Geolocation permission denied by user');
                throw new Error('Geolocation permission denied');
              }
            } catch (permissionError) {
              debugLogEmoji('⚠️', 'Permission query failed, proceeding with geolocation request:', permissionError.message);
              // Continue with geolocation request even if permission query fails
            }
          }
          
          const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { 
              timeout: 10000,
              enableHighAccuracy: true,
              maximumAge: 300000 // Cache for 5 minutes
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
              
              if (city && region) {
                location = `${city}, ${region}`;
              } else if (city) {
                location = city;
              } else {
                // Fallback to coordinates if no city found
                location = `${lat.toFixed(2)}°N, ${lng.toFixed(2)}°W`;
              }
            } else {
              // Fallback to coordinates if geocoding fails
              location = `${lat.toFixed(2)}°N, ${lng.toFixed(2)}°W`;
            }
          } catch (geocodeError) {
            console.log('Reverse geocoding failed, using coordinates');
            location = `${lat.toFixed(2)}°N, ${lng.toFixed(2)}°W`;
          }
          
          setUserLocation(location);
          debugLogEmoji('📍', 'Got user location:', location);
        } catch (geoError) {
          console.log('Could not get user location, will use no specific location');
          debugLogEmoji('❌', 'Geolocation failed:', geoError.message);
          
          // Better error handling for different geolocation error types
          if (geoError.code === 1) { // PERMISSION_DENIED
            debugLogEmoji('💡', 'Location permission denied - showing manual location option');
            setShowLocationPrompt(true);
          } else if (geoError.code === 2) { // POSITION_UNAVAILABLE
            debugLogEmoji('⚠️', 'Location unavailable - using location-agnostic recommendations');
          } else if (geoError.code === 3) { // TIMEOUT
            debugLogEmoji('⏰', 'Location request timed out - using location-agnostic recommendations');
          } else if (geoError.message && geoError.message.includes('denied')) {
            debugLogEmoji('💡', 'Location permission denied - showing manual location option');
            setShowLocationPrompt(true);
          } else {
            debugLogEmoji('❓', 'Unknown geolocation error - using location-agnostic recommendations');
          }
          
          // Don't set a default location - let the backend handle location-agnostic recommendations
          location = '';
        }
      } else if (!navigator.geolocation) {
        debugLogEmoji('🚫', 'Geolocation not supported by this browser');
      }
      
      // If we still don't have a location, use empty string for location-agnostic recommendations
      if (!location) {
        location = '';
        debugLogEmoji('🌍', 'Using location-agnostic recommendations');
      }
      
      const currentDate = new Date().toISOString().split('T')[0];
      debugLogEmoji('🔍', 'Fetching recommendations for date:', currentDate, 'location:', location);
      
      const res = await fetch(`${RECOMMENDATION_API_URL}/recommendations`, {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          location: location,
          date: currentDate
        })
      });
      
      if (res.ok) {
        const data = await res.json();
        debugLogEmoji('��', 'Recommendations received:', data);
        
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
      } else {
        console.error('Failed to fetch recommendations:', res.status);
        setRecommendations(null);
      }
    } catch (e) {
      console.error('Error fetching recommendations:', e);
      setRecommendations(null);
    } finally {
      setIsLoadingRecommendations(false);
    }
  }

  // New function to search for recipes matching recommendation category
  async function searchRecipesByTags(tags, limit = 3) {
    if (!tags || !Array.isArray(tags) || tags.length === 0) {
      return [];
    }
    
    try {
      // Combine all tags into one search query for the category
      const categoryQuery = tags.join(' ');
      const cacheKey = `${categoryQuery}:${limit}`;
      
      // Check cache first
      if (recipeCache.has(cacheKey)) {
        debugLogEmoji('💾', `Cache hit for category: "${categoryQuery}"`);
        return recipeCache.get(cacheKey);
      }
      
      debugLogEmoji('🔍', `Searching for category with combined query: "${categoryQuery}"`);
      
      // Use smart search endpoint with the combined category query
      const results = await searchWithSmartSearch(categoryQuery, limit);
      
      if (results && results.length > 0) {
        // Transform results to frontend format
        const transformedResults = results.map(node => {
          const properties = node.properties;
          return {
            id: node.id,
            name: properties.title || properties.name || 'Untitled Recipe',
            description: properties.description || '',
            image: properties.image || properties.image_url || '',
            image_url: properties.image || properties.image_url || '',
            prep_time: properties.prepTime || properties.prep_time || null,
            cook_time: properties.cookTime || properties.cook_time || null,
            recipe_yield: properties.servings || properties.recipeYield || properties.recipe_yield || null,
            source_url: properties.url || properties.source_url || '',
            ingredients: properties.ingredients || [],
            instructions: properties.instructions || [],
            recipeIngredient: properties.ingredients || [],
            recipeInstructions: properties.instructions || [],
            // Mark as external recipe
            isExternal: true
          };
        });
        
        // Cache the results
        setRecipeCache(prev => new Map(prev).set(cacheKey, transformedResults));
        
        debugLogEmoji('✅', `Category "${categoryQuery}" found ${transformedResults.length} recipes`);
        return transformedResults;
      }
      
      debugLogEmoji('⚠️', `Category "${categoryQuery}" found no recipes`);
      return [];
    } catch (e) {
      console.error(`Error searching for category "${tags.join(' ')}":`, e);
      return [];
    }
  }

  // Clear user location
  const clearUserLocation = () => {
    setUserLocation(null);
    debugLogEmoji('🗑️', 'User location cleared');
    fetchRecommendations();
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

  // Helper function to search using smart search endpoint
  async function searchWithSmartSearch(query, limit = 1) {
    try {
      const res = await fetch(`${SEARCH_DB_URL}/api/smart-search?q=${encodeURIComponent(query)}&type=RECIPE&limit=${limit}`);
      if (res.ok) {
        const result = await res.json();
        return result.results || [];
      }
    } catch (e) {
      console.error(`Error searching for query "${query}":`, e);
    }
    return [];
  }

  async function requestLocationManually() {
    try {
      debugLogEmoji('📍', 'Manual location request initiated');
      setShowLocationPrompt(false);
      
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
          debugLogEmoji('📍', 'Manual location set:', location);
          
          // Refresh recommendations with new location
          fetchRecommendations();
        }
      } catch (geocodeError) {
        console.log('Reverse geocoding failed, using coordinates');
        const location = `${lat.toFixed(2)}°N, ${lng.toFixed(2)}°W`;
        setUserLocation(location);
        fetchRecommendations();
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
      <div className="recommendations-container">
        {(() => {
          try {
            const entries = Array.from(recipesByCategory.entries());
            debugLogEmoji('📊', 'recipesByCategory entries:', entries);
            
            return entries.map(([categoryName, recipes]) => {
              debugLogEmoji('🎯', `Rendering category "${categoryName}" with ${recipes.length} recipes`);
              
              // For now, show all recipes in each category without cross-category deduplication
              // This prevents the blank page issue while we debug the data structure
              const sortedRecipes = recipes.slice(0, 10);
              
              debugLogEmoji('📊', `Category "${categoryName}": ${recipes.length} total recipes, ${sortedRecipes.length} displayed`);
              
              // Only show category if it has recipes
              if (sortedRecipes.length === 0) return null;
              
              return (
                <div key={categoryName} className="recommendation-category">
                  <h2 className="category-title">{categoryName}</h2>
                  <SwipeableRecipeGrid>
                    {sortedRecipes.map((recipe, index) => (
                      <div key={`${categoryName}-${recipe.id}-${index}`} className="recipe-card" onClick={() => onRecipeSelect(recipe)}>
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
                              <span className="ai-generated-text">Generate with AI</span>
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
      <div className="recommendations-container">
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
                    {[1, 2, 3].map(index => (
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
            
            return Object.entries(recommendations.recommendations).map(([categoryName, tags]) => {
              // Ensure tags is an array
              if (!Array.isArray(tags)) {
                console.error(`Invalid tags format for category ${categoryName}:`, tags);
                return null;
              }
              
              debugLogEmoji('🔄', `Processing category: ${categoryName} with tags:`, tags);
              
              // Get external recipes for this category (no longer using local recipes)
              const categoryExternalRecipes = externalRecipes[categoryName] || [];
              
              debugLogEmoji('📊', `Category "${categoryName}": ${categoryExternalRecipes.length} total recipes, ${tags.length} tags`);
              
              // Filter out duplicates across categories
              const uniqueExternalRecipes = categoryExternalRecipes.filter(external => 
                !shownRecipeIds.has(external.id)
              );
              
              // Take up to 10 recipes for this category
              const sortedRecipes = uniqueExternalRecipes.slice(0, 10);
              
              debugLogEmoji('🎯', `Category "${categoryName}": ${uniqueExternalRecipes.length} unique recipes, ${sortedRecipes.length} displayed`);
              
              // Add selected recipes to the shown set
              sortedRecipes.forEach(recipe => shownRecipeIds.add(recipe.id));
              
              // Only show category if it has recipes
              if (sortedRecipes.length === 0) return null;
              
              return (
                <div key={categoryName} className="recommendation-category">
                  <h2 className="category-title">{categoryName}</h2>
                  <SwipeableRecipeGrid>
                    {sortedRecipes.map((recipe, index) => (
                      <div key={`${categoryName}-${recipe.id}-${index}`} className="recipe-card" onClick={() => onRecipeSelect(recipe)}>
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
                              <span className="ai-generated-text">Generate with AI</span>
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
