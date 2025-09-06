import React from 'react';

const NoRecipesFound = ({ onRetry }) => {
  return (
    <div className="no-recipes-found">
      <div className="no-recipes-content">
        <h2>No Recipes Found</h2>
        <p>We couldn't load any recipes at the moment. This might be due to:</p>
        <ul>
          <li>Network connectivity issues</li>
          <li>Search service temporarily unavailable</li>
          <li>No recipes matching current recommendations</li>
        </ul>
        <button 
          className="retry-button"
          onClick={onRetry}
        >
          🔄 Try Again
        </button>
      </div>
    </div>
  );
};

export default NoRecipesFound;
