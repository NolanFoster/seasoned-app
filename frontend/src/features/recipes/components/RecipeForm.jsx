import React from 'react';

const RecipeForm = ({
  showAddForm,
  editingRecipe,
  isEditingRecipe,
  editableRecipe,
  name,
  description,
  ingredients,
  instructions,
  prepTime,
  cookTime,
  recipeYield,
  selectedImage,
  onNameChange,
  onDescriptionChange,
  onIngredientsChange,
  onInstructionsChange,
  onPrepTimeChange,
  onCookTimeChange,
  onRecipeYieldChange,
  onImageChange,
  onAddIngredient,
  onRemoveIngredient,
  onAddInstruction,
  onRemoveInstruction,
  onAddRecipe,
  onUpdateRecipe,
  onResetForm,
  onCloseForm
}) => {
  if (!showAddForm) return null;

  return (
    <div className="overlay">
      <div className="overlay-content">
        <div className="form-panel glass">
          <div className="form-panel-header">
            <h2>{editingRecipe ? 'Edit Recipe' : 'Add New Recipe'}</h2>
            <button className="close-btn" onClick={onCloseForm}>×</button>
          </div>
          <div className="form-panel-content">
            {editingRecipe && isEditingRecipe && editableRecipe ? (
              // Edit Mode - matching clip edit format
              <>
                <div className="recipe-preview-content">
                  <div className="recipe-preview-section">
                    <h4>Recipe Name</h4>
                    <input 
                      type="text" 
                      value={editableRecipe.name} 
                      onChange={e => onNameChange(e.target.value)}
                      className="preview-edit-input"
                    />
                  </div>
                  
                  <div className="recipe-preview-section">
                    <h4>Description</h4>
                    <textarea 
                      value={editableRecipe.description} 
                      onChange={e => onDescriptionChange(e.target.value)}
                      className="preview-edit-textarea"
                      placeholder="Recipe description..."
                    />
                  </div>
                  
                  <div className="recipe-preview-section">
                    <h4>Ingredients</h4>
                    <div className="ingredients-edit-container">
                      {editableRecipe.ingredients.map((ingredient, index) => (
                        <div key={index} className="ingredient-edit-row">
                          <input 
                            type="text" 
                            value={ingredient} 
                            onChange={e => onIngredientsChange(index, e.target.value)}
                            className="preview-edit-input ingredient-input"
                          />
                          <button 
                            onClick={() => onRemoveIngredient(index)}
                            className="remove-ingredient-btn"
                            title="Remove ingredient"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <button 
                        onClick={onAddIngredient}
                        className="add-ingredient-btn"
                      >
                        + Add Ingredient
                      </button>
                    </div>
                  </div>
                  
                  <div className="recipe-preview-section">
                    <h4>Instructions</h4>
                    <div className="instructions-edit-container">
                      {editableRecipe.instructions.map((instruction, index) => (
                        <div key={index} className="instruction-edit-row">
                          <textarea 
                            value={instruction} 
                            onChange={e => onInstructionsChange(index, e.target.value)}
                            className="preview-edit-textarea instruction-textarea"
                            placeholder={`Step ${index + 1}`}
                          />
                          <button 
                            onClick={() => onRemoveInstruction(index)}
                            className="remove-instruction-btn"
                            title="Remove instruction"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <button 
                        onClick={onAddInstruction}
                        className="add-instruction-btn"
                      >
                        + Add Instruction
                      </button>
                    </div>
                  </div>
                  
                  <div className="recipe-preview-section">
                    <h4>Prep Time (minutes)</h4>
                    <input 
                      type="number" 
                      value={editableRecipe.prep_time || ''} 
                      onChange={e => onPrepTimeChange(e.target.value ? parseInt(e.target.value) : null)}
                      className="preview-edit-input"
                      placeholder="Prep time in minutes"
                      min="0"
                    />
                  </div>
                  
                  <div className="recipe-preview-section">
                    <h4>Cook Time (minutes)</h4>
                    <input 
                      type="number" 
                      value={editableRecipe.cook_time || ''} 
                      onChange={e => onCookTimeChange(e.target.value ? parseInt(e.target.value) : null)}
                      className="preview-edit-input"
                      placeholder="Cook time in minutes"
                      min="0"
                    />
                  </div>
                  
                  <div className="recipe-preview-section">
                    <h4>Yield</h4>
                    <input 
                      type="text" 
                      value={editableRecipe.recipe_yield || ''} 
                      onChange={e => onRecipeYieldChange(e.target.value)}
                      className="preview-edit-input"
                      placeholder="e.g., 4 servings, 1 loaf"
                    />
                  </div>
                  
                  <div className="recipe-preview-section">
                    <h4>Recipe Image</h4>
                    <div className="image-upload">
                      <label htmlFor="image-input" className="image-upload-label">
                        {selectedImage ? selectedImage.name : 'Choose New Image (Optional)'}
                      </label>
                      <input
                        id="image-input"
                        type="file"
                        accept="image/*"
                        onChange={onImageChange}
                        style={{ display: 'none' }}
                      />
                    </div>
                    {editableRecipe.image && (
                      <img 
                        src={editableRecipe.image} 
                        alt={editableRecipe.name}
                        className="preview-image"
                        style={{ marginTop: '10px', maxWidth: '200px' }}
                      />
                    )}
                  </div>
                </div>
                
                <div className="form-actions">
                  <button onClick={onUpdateRecipe} className="update-btn">
                    ✓ Update Recipe
                  </button>
                  <button onClick={onResetForm} className="cancel-btn">
                    Cancel Edit
                  </button>
                </div>
              </>
            ) : (
              // Add Mode - updated to match edit panel format
              <>
                <div className="recipe-preview-content">
                  <div className="recipe-preview-section">
                    <h4>Recipe Name</h4>
                    <input 
                      type="text" 
                      value={name} 
                      onChange={e => onNameChange(e.target.value)}
                      className="preview-edit-input"
                      placeholder="Enter recipe name"
                    />
                  </div>
                  
                  <div className="recipe-preview-section">
                    <h4>Description</h4>
                    <textarea 
                      value={description} 
                      onChange={e => onDescriptionChange(e.target.value)}
                      className="preview-edit-textarea"
                      placeholder="Recipe description..."
                    />
                  </div>
                  
                  <div className="recipe-preview-section">
                    <h4>Ingredients</h4>
                    <div className="ingredients-edit-container">
                      {ingredients.map((ingredient, index) => (
                        <div key={index} className="ingredient-edit-row">
                          <input 
                            type="text" 
                            value={ingredient} 
                            onChange={e => onIngredientsChange(index, e.target.value)}
                            className="preview-edit-input ingredient-input"
                          />
                          <button 
                            onClick={() => onRemoveIngredient(index)}
                            className="remove-ingredient-btn"
                            title="Remove ingredient"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      {ingredients.length === 0 && (
                        <div className="ingredient-edit-row">
                          <input 
                            type="text" 
                            value="" 
                            onChange={e => onIngredientsChange(0, e.target.value)}
                            className="preview-edit-input ingredient-input"
                            placeholder="Add first ingredient"
                          />
                        </div>
                      )}
                      <button 
                        onClick={onAddIngredient}
                        className="add-ingredient-btn"
                      >
                        + Add Ingredient
                      </button>
                    </div>
                  </div>
                  
                  <div className="recipe-preview-section">
                    <h4>Instructions</h4>
                    <div className="instructions-edit-container">
                      {instructions.map((instruction, index) => (
                        <div key={index} className="instruction-edit-row">
                          <textarea 
                            value={instruction} 
                            onChange={e => onInstructionsChange(index, e.target.value)}
                            className="preview-edit-textarea instruction-textarea"
                            placeholder={`Step ${index + 1}`}
                          />
                          <button 
                            onClick={() => onRemoveInstruction(index)}
                            className="remove-instruction-btn"
                            title="Remove instruction"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      {instructions.length === 0 && (
                        <div className="instruction-edit-row">
                          <textarea 
                            value="" 
                            onChange={e => onInstructionsChange(0, e.target.value)}
                            className="preview-edit-textarea instruction-textarea"
                            placeholder="Step 1"
                          />
                        </div>
                      )}
                      <button 
                        onClick={onAddInstruction}
                        className="add-instruction-btn"
                      >
                        + Add Instruction
                      </button>
                    </div>
                  </div>
                  
                  <div className="recipe-preview-section">
                    <h4>Prep Time (minutes)</h4>
                    <input 
                      type="number" 
                      value={prepTime} 
                      onChange={e => onPrepTimeChange(e.target.value)}
                      className="preview-edit-input"
                      placeholder="Prep time in minutes"
                      min="0"
                    />
                  </div>
                  
                  <div className="recipe-preview-section">
                    <h4>Cook Time (minutes)</h4>
                    <input 
                      type="number" 
                      value={cookTime} 
                      onChange={e => onCookTimeChange(e.target.value)}
                      className="preview-edit-input"
                      placeholder="Cook time in minutes"
                      min="0"
                    />
                  </div>
                  
                  <div className="recipe-preview-section">
                    <h4>Yield</h4>
                    <input 
                      type="text" 
                      value={recipeYield} 
                      onChange={e => onRecipeYieldChange(e.target.value)}
                      className="preview-edit-input"
                      placeholder="e.g., 4 servings, 1 loaf"
                    />
                  </div>
                  
                  <div className="recipe-preview-section">
                    <h4>Recipe Image</h4>
                    <div className="image-upload">
                      <label htmlFor="image-input-add" className="image-upload-label">
                        {selectedImage ? selectedImage.name : 'Choose Image (Optional)'}
                      </label>
                      <input
                        id="image-input-add"
                        type="file"
                        accept="image/*"
                        onChange={onImageChange}
                        style={{ display: 'none' }}
                      />
                    </div>
                  </div>
                </div>
                
                <div className="form-actions">
                  <button onClick={onAddRecipe} className="add-btn">
                    + Add Recipe
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

export default RecipeForm;
