import React from 'react';
import SwipeableRecipeGrid from './SwipeableRecipeGrid.jsx';

const LoadingRecipes = ({ isLoadingRecipes, cachedCategoryNames }) => {
  if (!isLoadingRecipes) return null;

  return (
    <div className="loading-recommendations">
      {/* Show green loading bar initially, then cached categories when available */}
      {cachedCategoryNames.length > 0 ? (
        // Use cached category names for instant display
        cachedCategoryNames.map((categoryName, categoryIndex) => (
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
                    <div className="loading-text loading-pulse" style={{ width: '60%' }}></div>
                  </div>
                </div>
              ))}
            </SwipeableRecipeGrid>
          </div>
        ))
      ) : (
        // Show green loading bar when no cached categories
        <div className="loading-bar-container">
          <div className="loading-bar"></div>
        </div>
      )}
    </div>
  );
};

export default LoadingRecipes;
