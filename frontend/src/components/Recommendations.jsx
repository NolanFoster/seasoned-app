import React, { useEffect, useState } from 'react';
import { formatDuration } from '../../../shared/utility-functions.js';

const RECOMMENDATION_API_URL = import.meta.env.VITE_RECOMMENDATION_API_URL || 'https://recipe-recommendation-worker.nolanfoster.workers.dev';
const SEARCH_DB_URL = import.meta.env.VITE_SEARCH_DB_URL || 'https://recipe-search-db.nolanfoster.workers.dev';

function Recommendations({ onRecipeSelect, recipesByCategory }) {
  // If recipesByCategory is provided, use it directly; otherwise fall back to fetching
  const [recommendations, setRecommendations] = useState(null);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(true);
  const [userLocation, setUserLocation] = useState(null);
  const [externalRecipes, setExternalRecipes] = useState({});

  useEffect(() => {
    // If recipesByCategory is provided, skip fetching recommendations
    if (recipesByCategory && recipesByCategory.size > 0) {
      setIsLoadingRecommendations(false);
      return;
    }
    
    // Fetch recommendations but don't let it block the app
    fetchRecommendations().catch(err => {
      console.error('Failed to fetch initial recommendations:', err);
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
        for (const [categoryName, tags] of Object.entries(recommendations.recommendations)) {
          if (Array.isArray(tags)) {
            try {
              const externalRecipes = await searchRecipesByTags(tags, 6);
              externalData[categoryName] = externalRecipes;
            } catch (error) {
              console.error(`Error fetching external recipes for ${categoryName}:`, error);
              externalData[categoryName] = [];
            }
          }
        }
        setExternalRecipes(externalData);
      };
      fetchExternalRecipes();
    }
  }, [recommendations, recipesByCategory]);

  async function fetchRecommendations() {
    try {
      setIsLoadingRecommendations(true);
      
      // Try to get user's location or use a default
      let location = userLocation || 'San Francisco, CA'; // Default location
      
      // Try to get user's location from browser
      if (!userLocation && navigator.geolocation) {
        try {
          const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
          });
          // For now, just use a general location based on coordinates
          location = `${position.coords.latitude.toFixed(2)}°N, ${position.coords.longitude.toFixed(2)}°W`;
          setUserLocation(location);
        } catch (geoError) {
          console.log('Could not get user location, using default');
        }
      }
      
      const currentDate = new Date().toISOString().split('T')[0];
      console.log('Fetching recommendations for date:', currentDate, 'location:', location);
      
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
        console.log('Recommendations received:', data);
        
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
      console.log(`🔍 Searching for category with combined query: "${categoryQuery}"`);
      
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
        
        console.log(`✅ Category "${categoryQuery}" found ${transformedResults.length} recipes`);
        return transformedResults;
      }
      
      console.log(`⚠️ Category "${categoryQuery}" found no recipes`);
      return [];
    } catch (e) {
      console.error(`Error searching for category "${tags.join(' ')}":`, e);
      return [];
    }
  }

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

  // If we have recipesByCategory, render them directly
  if (recipesByCategory && recipesByCategory.size > 0) {
    return (
      <div className="recommendations-container">
        {(() => {
          try {
            // Track which recipes have been shown to avoid duplicates
            const shownRecipeIds = new Set();
            
            return Array.from(recipesByCategory.entries()).map(([categoryName, recipes]) => {
              console.log(`🎯 Rendering category "${categoryName}" with ${recipes.length} recipes`);
              
              // Filter out duplicates across categories
              const uniqueRecipes = recipes.filter(recipe => 
                !shownRecipeIds.has(recipe.id)
              );
              
              // Take up to 6 recipes for this category
              const sortedRecipes = uniqueRecipes.slice(0, 6);
              
              console.log(`📊 Category "${categoryName}": ${recipes.length} total recipes, ${sortedRecipes.length} displayed`);
              
              // Add selected recipes to the shown set
              sortedRecipes.forEach(recipe => shownRecipeIds.add(recipe.id));
              
              // Only show category if it has recipes
              if (sortedRecipes.length === 0) return null;
              
              return (
                <div key={categoryName} className="recommendation-category">
                  <h2 className="category-title">{categoryName}</h2>
                  <div className="recipe-grid category-recipes">
                    {sortedRecipes.map((recipe) => (
                      <div key={recipe.id} className="recipe-card" onClick={() => onRecipeSelect(recipe)}>
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
                        </div>
                      </div>
                    ))}
                  </div>
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
    return (
      <div className="recommendations-container">
        {(() => {
          try {
            // Show loading state with placeholder categories
            if (isLoadingRecommendations || !recommendations || !recommendations.recommendations) {
              const loadingCategories = ['Seasonal Favorites', 'Local Specialties', 'Holiday Treats'];
              return loadingCategories.map(categoryName => (
                <div key={categoryName} className="recommendation-category">
                  <h2 className="category-title">{categoryName}</h2>
                  <div className="recipe-grid category-recipes">
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
                  </div>
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
              
              console.log(`Processing category: ${categoryName} with tags:`, tags);
              
              // Get external recipes for this category (no longer using local recipes)
              const categoryExternalRecipes = externalRecipes[categoryName] || [];
              
              console.log(`📊 Category "${categoryName}": ${categoryExternalRecipes.length} total recipes, ${tags.length} tags`);
              
              // Filter out duplicates across categories
              const uniqueExternalRecipes = categoryExternalRecipes.filter(external => 
                !shownRecipeIds.has(external.id)
              );
              
              // Take up to 6 recipes for this category
              const sortedRecipes = uniqueExternalRecipes.slice(0, 6);
              
              console.log(`🎯 Category "${categoryName}": ${uniqueExternalRecipes.length} unique recipes, ${sortedRecipes.length} displayed`);
              
              // Add selected recipes to the shown set
              sortedRecipes.forEach(recipe => shownRecipeIds.add(recipe.id));
              
              // Only show category if it has recipes
              if (sortedRecipes.length === 0) return null;
              
              return (
                <div key={categoryName} className="recommendation-category">
                  <h2 className="category-title">{categoryName}</h2>
                  <div className="recipe-grid category-recipes">
                    {sortedRecipes.map((recipe) => (
                      <div key={recipe.id} className="recipe-card" onClick={() => onRecipeSelect(recipe)}>
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
                        </div>
                      </div>
                    ))}
                  </div>
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

  return null;
}

export default Recommendations;
