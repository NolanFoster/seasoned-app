import React from 'react';
import { formatDuration, isValidUrl } from '../../../shared/utility-functions.js';
import { renderInstructionWithTimers } from './TimerUtils.jsx';

const RecipeFullscreen = ({
  selectedRecipe,
  showSharePanel,
  showNutrition,
  titleOpacity,
  floatingTimer,
  onBackClick,
  onSharePanelToggle,
  onNutritionToggle,
  onStartTimer,
  onPauseTimer,
  onStopTimer,
  onDeleteRecipe,
  onShareRecipe,
  onEditRecipe,
  onVideoPopupOpen,
  getRecipeDescription,
  getFilteredIngredients,
  getFilteredInstructions
}) => {
  if (!selectedRecipe) return null;

  return (
    <div className="recipe-fullscreen">
      {/* Top Header with Back Button and Action Buttons */}
      <div className="recipe-top-header">
        <button className="back-btn" onClick={onBackClick}>
          <span className="back-arrow">←</span>
        </button>
        
        {/* Timer FAB - integrated into header */}
        {floatingTimer && (
          <div className="header-timer-fab">
            <div className="header-timer-display">
              <span className="header-timer-time">{floatingTimer.remainingSeconds}</span>
              <span className="header-timer-label">{floatingTimer.timeText}</span>
            </div>
            <div className="header-timer-controls">
              <button 
                className="header-timer-control-btn"
                onClick={() => {
                  if (floatingTimer.isRunning) {
                    onPauseTimer(floatingTimer.id);
                  } else {
                    onStartTimer(floatingTimer.id);
                  }
                }}
                title={floatingTimer.isRunning ? "Pause timer" : "Start timer"}
              >
                {floatingTimer.isRunning ? (
                  <img src="/pause.svg" alt="Pause" className="timer-icon" />
                ) : (
                  <img src="/play.svg" alt="Play" className="timer-icon" />
                )}
              </button>
              <button 
                className="header-timer-dismiss"
                onClick={() => onStopTimer(floatingTimer.id)}
                title="Stop timer"
              >
                ✕
              </button>
            </div>
          </div>
        )}
        
        {/* Nutrition FAB - only show if nutrition data exists */}
        {selectedRecipe.nutrition && Object.keys(selectedRecipe.nutrition).length > 0 && (
          <button 
            className="fab-nutrition-trigger"
            onClick={onNutritionToggle}
            title={showNutrition ? "Show ingredients and instructions" : "Show nutrition information"}
          >
            <img 
              src="/nutrition-label.png" 
              alt="Nutrition" 
              className="nutrition-icon"
              width="24"
              height="24"
            />
          </button>
        )}
        
        {/* Share/More Actions FAB */}
        <button 
          className="fab-share-trigger"
          onClick={onSharePanelToggle}
          title="More actions"
        >
          <span className="share-icon">⋮</span>
        </button>
      </div>
      
      {/* Share Panel */}
      <div className={`share-panel ${showSharePanel ? 'visible' : ''}`}>
        {/* TODO: Enable with feature flag */}
        {/* <button 
          className="share-panel-item edit-action"
          onClick={() => {
            onEditRecipe(selectedRecipe);
            onSharePanelToggle();
          }}
        >
          <span className="action-icon">✏️</span>
          <span className="action-label">Edit Recipe</span>
        </button> */}
        
        <button 
          className="share-panel-item delete-action"
          onClick={() => {
            if (confirm('Are you sure you want to delete this recipe?')) {
              onDeleteRecipe(selectedRecipe.id);
              onSharePanelToggle();
            }
          }}
        >
          <span className="action-icon">🗑️</span>
          <span className="action-label">Delete Recipe</span>
        </button>
        
        <button 
          className="share-panel-item share-action"
          onClick={onShareRecipe}
        >
          <span className="action-icon">🔗</span>
          <span className="action-label">Share Recipe</span>
        </button>
      </div>
      
      {/* Title Section - moved below header */}
      <div className="recipe-title-section" style={{ opacity: titleOpacity, transition: 'opacity 0.2s ease-out' }}>
        <h1 className="recipe-fullscreen-title">{selectedRecipe.name}</h1>
        
        {/* Description for AI-generated recipes */}
        {getRecipeDescription(selectedRecipe) && (
          <p className="recipe-description">{getRecipeDescription(selectedRecipe)}</p>
        )}
        
        {/* Recipe Timing Info - prep time, cook time, yield */}
        {(selectedRecipe.prep_time || selectedRecipe.prepTime || 
          selectedRecipe.cook_time || selectedRecipe.cookTime || 
          selectedRecipe.recipe_yield || selectedRecipe.recipeYield || selectedRecipe.yield) ? (
          <div className="recipe-card-time">
            <div className="time-item">
              <span className="time-label">Prep</span>
              <span className="time-value">{formatDuration(selectedRecipe.prep_time || selectedRecipe.prepTime) || '-'}</span>
            </div>
            <div className="time-divider"></div>
            <div className="time-item">
              <span className="time-label">Cook</span>
              <span className="time-value">{formatDuration(selectedRecipe.cook_time || selectedRecipe.cookTime) || '-'}</span>
            </div>
            {(selectedRecipe.recipe_yield || selectedRecipe.recipeYield || selectedRecipe.yield) && (
              <>
                <div className="time-divider"></div>
                <div className="time-item">
                  <span className="time-label">Yield</span>
                  <span className="time-value">{selectedRecipe.recipe_yield || selectedRecipe.recipeYield || selectedRecipe.yield}</span>
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
        
        {/* Recipe Links - under title */}
        {(selectedRecipe.source_url || selectedRecipe.video_url !== undefined || (selectedRecipe.video && selectedRecipe.video.contentUrl)) && (
          <div className="recipe-links">
            {selectedRecipe.source_url && (
              <a 
                href={selectedRecipe.source_url} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="recipe-link source-link"
                title="View original recipe"
              >
                🌐 Source Recipe
              </a>
            )}
            {(() => {
              const videoUrl = selectedRecipe.video_url || (selectedRecipe.video && selectedRecipe.video.contentUrl);
              return videoUrl && isValidUrl(videoUrl) && (
                <button 
                  className="recipe-link video-link"
                  title="Watch recipe video"
                  onClick={(e) => {
                    e.stopPropagation();
                    onVideoPopupOpen(videoUrl);
                  }}
                >
                  🎥 Watch Video
                </button>
              );
            })()}
          </div>
        )}
      </div>
      
      {/* Full Background Image */}
      <div className="recipe-full-background">
        {(() => {
          // For AI-generated recipes, use the card image as background
          const isAiGenerated = selectedRecipe.source === 'ai_generated' || selectedRecipe.fallback;
          const backgroundImageUrl = isAiGenerated 
            ? (selectedRecipe.image_url || selectedRecipe.image)  // For AI recipes, use image_url first (this is the card image)
            : (selectedRecipe.image || selectedRecipe.image_url); // For regular recipes, use image first
          
          return backgroundImageUrl ? (
            <img 
              src={backgroundImageUrl} 
              alt={selectedRecipe.name}
              className="recipe-full-background-image"
            />
          ) : (
            <div className="recipe-full-background-placeholder">
              <div className="placeholder-gradient"></div>
            </div>
          );
        })()}
      </div>
      
      {/* Recipe Content */}
      <div className={`recipe-fullscreen-content ${showNutrition ? 'nutrition-view' : ''}`}>
        {showNutrition ? (
          /* Nutrition Panel */
          <div className="nutrition-facts-label">
            <h2 className="nutrition-title">Nutrition Facts</h2>
              {(selectedRecipe.recipe_yield || selectedRecipe.recipeYield || selectedRecipe.yield) && (
                <div className="serving-info">
                  <span className="serving-label">Serving Size</span>
                  <span className="serving-value">1 serving</span>
                </div>
              )}
              {(selectedRecipe.recipe_yield || selectedRecipe.recipeYield || selectedRecipe.yield) && (
                <div className="servings-per-container">
                  <span className="serving-label">Servings Per Recipe</span>
                  <span className="serving-value">{selectedRecipe.recipe_yield || selectedRecipe.recipeYield || selectedRecipe.yield}</span>
                </div>
              )}
              
              <div className="nutrition-divider thick"></div>
              
              {selectedRecipe.nutrition.calories && (
                <>
                  <div className="calories-section">
                    <span className="calories-label">Calories</span>
                    <span className="calories-value">{selectedRecipe.nutrition.calories}</span>
                  </div>
                  <div className="nutrition-divider medium"></div>
                </>
              )}
              
              <div className="nutrition-list">
                {selectedRecipe.nutrition.fatContent && (
                  <div className="nutrition-row">
                    <span className="nutrient-name bold">Total Fat</span>
                    <span className="nutrient-value">{selectedRecipe.nutrition.fatContent}</span>
                  </div>
                )}
                {selectedRecipe.nutrition.saturatedFatContent && (
                  <div className="nutrition-row indent">
                    <span className="nutrient-name">Saturated Fat</span>
                    <span className="nutrient-value">{selectedRecipe.nutrition.saturatedFatContent}</span>
                  </div>
                )}
                {selectedRecipe.nutrition.unsaturatedFatContent && selectedRecipe.nutrition.unsaturatedFatContent !== "0 g" && (
                  <div className="nutrition-row indent">
                    <span className="nutrient-name">Unsaturated Fat</span>
                    <span className="nutrient-value">{selectedRecipe.nutrition.unsaturatedFatContent}</span>
                  </div>
                )}
                
                {selectedRecipe.nutrition.cholesterolContent && (
                  <>
                    <div className="nutrition-divider thin"></div>
                    <div className="nutrition-row">
                      <span className="nutrient-name bold">Cholesterol</span>
                      <span className="nutrient-value">{selectedRecipe.nutrition.cholesterolContent}</span>
                    </div>
                  </>
                )}
                
                {selectedRecipe.nutrition.sodiumContent && (
                  <>
                    <div className="nutrition-divider thin"></div>
                    <div className="nutrition-row">
                      <span className="nutrient-name bold">Sodium</span>
                      <span className="nutrient-value">{selectedRecipe.nutrition.sodiumContent}</span>
                    </div>
                  </>
                )}
                
                {selectedRecipe.nutrition.carbohydrateContent && (
                  <>
                    <div className="nutrition-divider thin"></div>
                    <div className="nutrition-row">
                      <span className="nutrient-name bold">Total Carbohydrate</span>
                      <span className="nutrient-value">{selectedRecipe.nutrition.carbohydrateContent}</span>
                    </div>
                  </>
                )}
                {selectedRecipe.nutrition.fiberContent && (
                  <div className="nutrition-row indent">
                    <span className="nutrient-name">Dietary Fiber</span>
                    <span className="nutrient-value">{selectedRecipe.nutrition.fiberContent}</span>
                  </div>
                )}
                {selectedRecipe.nutrition.sugarContent && (
                  <div className="nutrition-row indent">
                    <span className="nutrient-name">Total Sugars</span>
                    <span className="nutrient-value">{selectedRecipe.nutrition.sugarContent}</span>
                  </div>
                )}
                
                {selectedRecipe.nutrition.proteinContent && (
                  <>
                    <div className="nutrition-divider thin"></div>
                    <div className="nutrition-row">
                      <span className="nutrient-name bold">Protein</span>
                      <span className="nutrient-value">{selectedRecipe.nutrition.proteinContent}</span>
                    </div>
                  </>
                )}
              </div>
              
              <div className="nutrition-divider thick"></div>
              
              <div className="nutrition-footer">
                <p className="nutrition-note">* Nutrition information is estimated based on the ingredients and cooking instructions for each recipe.</p>
              </div>
            </div>
        ) : (
          <>
            {/* Ingredients Panel */}
            <div className="recipe-panel glass">
              <h2>Ingredients</h2>
              <ul className="ingredients-list">
                {(() => {
                  const ingredients = getFilteredIngredients(selectedRecipe);
                  if (ingredients.length === 0) {
                    return <li>No ingredients available</li>;
                  }
                  return ingredients.map((ingredient, index) => (
                    <li key={index}>{ingredient}</li>
                  ));
                })()}
              </ul>
            </div>
            
            {/* Instructions Panel */}
            <div className="recipe-panel glass">
              <h2>Instructions</h2>
              <ol className="instructions-list">
                {(() => {
                  const instructions = getFilteredInstructions(selectedRecipe);
                  if (instructions.length === 0) {
                    return <li>No instructions available</li>;
                  }
                  return instructions.map((instruction, index) => (
                    <li key={index}>
                      {renderInstructionWithTimers(
                        typeof instruction === 'string' ? instruction : instruction.text || '',
                        {}, // activeTimers - this will be passed from parent
                        () => {} // onStartNewTimer - this will be passed from parent
                      )}
                    </li>
                  ));
                })()}
              </ol>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default RecipeFullscreen;
