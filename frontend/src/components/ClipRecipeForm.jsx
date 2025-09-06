import React from 'react';

const ClipRecipeForm = ({
  isClipping,
  clipUrl,
  clipError,
  onClipUrlChange,
  onClipRecipe,
  onCloseForm
}) => {
  if (!isClipping) return null;

  return (
    <div className="overlay">
      <div className="overlay-content">
        <div className="form-panel glass">
          <div className="form-panel-header">
            <h2>Clip Recipe from Website</h2>
            <button 
              className="close-btn" 
              onClick={onCloseForm}
              title="Close"
            >×</button>
          </div>
          <div className="form-panel-content">
            <div className="recipe-preview-section">
              <h4>Recipe URL</h4>
              <input
                type="text"
                placeholder="Recipe URL"
                value={clipUrl}
                onChange={(e) => onClipUrlChange(e.target.value)}
                className="preview-edit-input"
              />
            </div>
            {clipError && (
              <p className="error-message">{clipError}</p>
            )}
            <div className="form-actions">
              <button 
                onClick={onClipRecipe}
                className="add-btn"
                aria-label="Submit Clip Recipe"
              >
                Clip Recipe
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClipRecipeForm;
