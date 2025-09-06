import React from 'react';

const RecipePreview = ({ 
  clippedRecipePreview, 
  isEditingPreview, 
  editablePreview, 
  isSavingRecipe,
  onEditPreview, 
  onUpdatePreview, 
  onCancelEditPreview, 
  onSaveRecipe, 
  onClosePreview 
}) => {
  if (!clippedRecipePreview) return null;

  // Helper function to format ingredient amounts
  const formatIngredientAmount = (ingredient) => {
    if (typeof ingredient === 'string') return ingredient;
    if (ingredient && ingredient.text) return ingredient.text;
    if (ingredient && ingredient.name) return ingredient.name;
    return ingredient;
  };

  // Helper function to save recipe to database
  const saveRecipeToDatabase = async () => {
    // This would be implemented in the parent component
    // For now, just call the onSaveRecipe callback
    if (onSaveRecipe) {
      await onSaveRecipe();
    }
  };

  // Helper function to prevent rapid successive saves
  let lastSaveTime = 0;
  const handleSaveRecipe = async () => {
    const now = Date.now();
    if (now - lastSaveTime < 2000) { // 2 second debounce
      console.warn('Please wait a moment before trying to save again.');
      return;
    }
    
    if (isSavingRecipe) return; // Prevent double saves
    lastSaveTime = now;
    
    try {
      await saveRecipeToDatabase();
    } catch (error) {
      console.error('Error saving recipe:', error);
      console.error('Failed to save recipe. Please try again.');
    }
  };

  return (
    <div className="overlay">
      <div className="overlay-content recipe-preview-overlay">
        <div className="form-panel glass recipe-preview-panel">
          {/* Save Progress Overlay */}
          {false && isSavingRecipe && (
            <div className="save-progress-overlay">
              <div className="save-progress-content">
                <div className="save-spinner">🔄</div>
                <p>Saving recipe...</p>
                <p className="save-note">Please don't close this window</p>
              </div>
            </div>
          )}
          
          {/* Hero Image that extends under header */}
          {!isEditingPreview && (clippedRecipePreview.image || clippedRecipePreview.image_url) && (
            <div className="recipe-preview-image-hero-full">
              <img 
                src={clippedRecipePreview.image || clippedRecipePreview.image_url} 
                alt={clippedRecipePreview.name}
                className="preview-hero-image"
              />
              <div className="recipe-preview-hero-gradient"></div>
            </div>
          )}
          
          <div className="form-panel-header">
            <h2>Clipped Recipe Preview</h2>
            <button 
              className="close-btn" 
              onClick={onClosePreview}
              disabled={isSavingRecipe}
            >×</button>
          </div>
          
          <div className="form-panel-content">
            {!isEditingPreview ? (
              // Preview Mode
              <>
                <div className="recipe-preview-content">
                  {/* Title and description - always shown */}
                  <div className="recipe-preview-header-section">
                    <h3 className="recipe-preview-title">{clippedRecipePreview.name}</h3>
                    {clippedRecipePreview.description && (
                      <p className="recipe-preview-description">{clippedRecipePreview.description}</p>
                    )}
                  </div>
                  
                  <div className="recipe-preview-sections">
                    <div className="recipe-preview-section">
                      <h4>Ingredients ({(clippedRecipePreview.recipeIngredient || clippedRecipePreview.ingredients || []).length})</h4>
                      <ul className="recipe-preview-ingredients">
                        {(clippedRecipePreview.recipeIngredient || clippedRecipePreview.ingredients || []).map((ingredient, index) => (
                          <li key={index}>{formatIngredientAmount(ingredient)}</li>
                        ))}
                      </ul>
                    </div>
                    
                    <div className="recipe-preview-section">
                      <h4>Instructions ({(clippedRecipePreview.recipeInstructions || clippedRecipePreview.instructions || []).length})</h4>
                      <ol className="recipe-preview-instructions">
                        {(clippedRecipePreview.recipeInstructions || clippedRecipePreview.instructions || []).map((instruction, index) => (
                          <li key={index}>
                            {typeof instruction === 'string' ? instruction : instruction.text || ''}
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>
                  
                  <div className="recipe-preview-source">
                    <h4>Source</h4>
                    <p><a href={clippedRecipePreview.source_url} target="_blank" rel="noopener noreferrer" className="source-link">{clippedRecipePreview.source_url}</a></p>
                  </div>
                </div>
                
                <div className="form-actions">
                  {/* TODO: Enable with feature flag */}
                  {/* <button onClick={onEditPreview} className="edit-btn" disabled={isSavingRecipe}>
                    ✏️ Edit Recipe
                  </button> */}
                  <button 
                    onClick={handleSaveRecipe}
                    className={`add-btn ${isSavingRecipe ? 'saving' : ''}`}
                    disabled={isSavingRecipe}
                  >
                    {isSavingRecipe ? (
                      <>
                        <div className="loading-spinner">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 12a9 9 0 11-6.219-8.56" />
                          </svg>
                        </div>
                        <span>Saving...</span>
                      </>
                    ) : 'Save Recipe'}
                  </button>

                  <button 
                    onClick={onClosePreview}
                    className="cancel-btn"
                    disabled={isSavingRecipe}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              // Edit Mode
              <>
                <div className="recipe-preview-content">
                  <div className="recipe-preview-section">
                    <h4>Recipe Name</h4>
                    <input 
                      type="text" 
                      value={editablePreview.name} 
                      onChange={e => onUpdatePreview({...editablePreview, name: e.target.value})}
                      className="preview-edit-input"
                    />
                  </div>
                  
                  <div className="recipe-preview-section">
                    <h4>Description</h4>
                    <textarea 
                      value={editablePreview.description} 
                      onChange={e => onUpdatePreview({...editablePreview, description: e.target.value})}
                      className="preview-edit-textarea"
                      placeholder="Recipe description..."
                    />
                  </div>
                  
                  <div className="recipe-preview-section">
                    <h4>Ingredients</h4>
                    <div className="ingredients-edit-container">
                      {editablePreview.ingredients.map((ingredient, index) => (
                        <div key={index} className="ingredient-edit-row">
                          <input 
                            type="text" 
                            value={ingredient} 
                            onChange={e => {
                              const newIngredients = [...editablePreview.ingredients];
                              newIngredients[index] = e.target.value;
                              onUpdatePreview({...editablePreview, ingredients: newIngredients});
                            }}
                            className="preview-edit-input ingredient-input"
                          />
                          <button 
                            onClick={() => {
                              const newIngredients = editablePreview.ingredients.filter((_, i) => i !== index);
                              onUpdatePreview({...editablePreview, ingredients: newIngredients});
                            }}
                            className="remove-ingredient-btn"
                            title="Remove ingredient"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <button 
                        onClick={() => {
                          onUpdatePreview({
                            ...editablePreview, 
                            ingredients: [...editablePreview.ingredients, '']
                          });
                        }}
                        className="add-ingredient-btn"
                      >
                        + Add Ingredient
                      </button>
                    </div>
                  </div>
                  
                  <div className="recipe-preview-section">
                    <h4>Instructions</h4>
                    <div className="instructions-edit-container">
                      {editablePreview.instructions.map((instruction, index) => (
                        <div key={index} className="instruction-edit-row">
                          <textarea 
                            value={instruction} 
                            onChange={e => {
                              const newInstructions = [...editablePreview.instructions];
                              newInstructions[index] = e.target.value;
                              onUpdatePreview({...editablePreview, instructions: newInstructions});
                            }}
                            className="preview-edit-textarea instruction-textarea"
                            placeholder={`Step ${index + 1}`}
                          />
                          <button 
                            onClick={() => {
                              const newInstructions = editablePreview.instructions.filter((_, i) => i !== index);
                              onUpdatePreview({...editablePreview, instructions: newInstructions});
                            }}
                            className="remove-instruction-btn"
                            title="Remove instruction"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <button 
                        onClick={() => {
                          onUpdatePreview({
                            ...editablePreview, 
                            instructions: [...editablePreview.instructions, '']
                          });
                        }}
                        className="add-instruction-btn"
                      >
                        + Add Instruction
                      </button>
                    </div>
                  </div>
                  
                  {clippedRecipePreview.image_url && (
                    <div className="recipe-preview-image">
                      <h4>Recipe Image</h4>
                      <img 
                        src={clippedRecipePreview.image_url} 
                        alt={clippedRecipePreview.name}
                        className="preview-image"
                      />
                    </div>
                  )}
                  
                  <div className="recipe-preview-source">
                    <h4>Source</h4>
                    <p><a href={clippedRecipePreview.source_url} target="_blank" rel="noopener noreferrer" className="source-link">{clippedRecipePreview.source_url}</a></p>
                  </div>
                </div>
                
                <div className="form-actions">
                  <button onClick={onUpdatePreview} className="update-btn" disabled={isSavingRecipe}>
                    ✓ Update Preview
                  </button>
                  <button onClick={onCancelEditPreview} className="cancel-btn" disabled={isSavingRecipe}>
                    Cancel Edit
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecipePreview;
