import React, { useState } from 'react'
import { useFlag } from './flaggly.js'
import { normalizeCollection, toggleRecipeInCollection } from '../../shared/recipe-collections.js'

export default function CollectionsModal({
  isOpen,
  onClose,
  collections = [],
  recipes = [],
  onCreateCollection,
  onUpdateCollection,
}) {
  const collectionsEnabled = useFlag('recipe-collections')
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [selectedCollectionId, setSelectedCollectionId] = useState(null)
  const [isCreating, setIsCreating] = useState(false)

  if (!isOpen || !collectionsEnabled) return null

  const selectedCollection = collections.find((c) => c.id === selectedCollectionId)

  function handleCreate(e) {
    e.preventDefault()
    if (!newTitle.trim()) return
    const created = normalizeCollection({
      id: `col-${Date.now()}`,
      title: newTitle.trim(),
      description: newDescription.trim(),
      recipeIds: [],
      source: 'manual',
    })
    onCreateCollection(created)
    setNewTitle('')
    setNewDescription('')
    setIsCreating(false)
    setSelectedCollectionId(created.id)
  }

  function handleToggleRecipe(recipeId) {
    if (!selectedCollection) return
    const updated = toggleRecipeInCollection(selectedCollection, recipeId)
    onUpdateCollection(updated)
  }

  return (
    <div className="collections-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="collections-modal-title">
      <div className="collections-modal-card">
        <div className="collections-modal-header">
          <h2 id="collections-modal-title">📚 Recipe Collections & Cookbooks</h2>
          <button type="button" className="collections-close-btn" onClick={onClose} aria-label="Close collections">
            ✕
          </button>
        </div>

        <div className="collections-modal-body">
          {/* Sidebar collection list */}
          <div className="collections-sidebar">
            <div className="collections-sidebar-header">
              <span>My Cookbooks</span>
              <button
                type="button"
                className="collections-create-btn"
                onClick={() => setIsCreating(true)}
              >
                + New
              </button>
            </div>

            <div className="collections-list" role="list">
              {collections.length === 0 && !isCreating && (
                <p className="collections-empty-hint">No collections yet. Create one to organize themed meals.</p>
              )}
              {collections.map((col) => {
                const isSelected = col.id === selectedCollectionId
                return (
                  <button
                    key={col.id}
                    type="button"
                    className={`collections-list-item${isSelected ? ' active' : ''}`}
                    onClick={() => {
                      setSelectedCollectionId(col.id)
                      setIsCreating(false)
                    }}
                  >
                    <strong>{col.title}</strong>
                    <small>{col.recipeIds?.length || 0} recipe(s)</small>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Main content pane */}
          <div className="collections-main">
            {isCreating ? (
              <form onSubmit={handleCreate} className="collections-create-form">
                <h3>Create New Collection</h3>
                <label htmlFor="col-title-input">Collection Title</label>
                <input
                  id="col-title-input"
                  type="text"
                  placeholder="e.g. Quick Weeknight Dinners"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                />

                <label htmlFor="col-desc-input">Description (Optional)</label>
                <textarea
                  id="col-desc-input"
                  placeholder="e.g. 30-minute meals with under 10 ingredients."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                />

                <div className="collections-form-actions">
                  <button type="submit" className="collections-submit-btn">Save Collection</button>
                  <button type="button" className="collections-cancel-btn" onClick={() => setIsCreating(false)}>Cancel</button>
                </div>
              </form>
            ) : selectedCollection ? (
              <div className="collections-details">
                <div className="collections-details-header">
                  <h3>{selectedCollection.title}</h3>
                  {selectedCollection.description && <p>{selectedCollection.description}</p>}
                </div>

                <h4>Add / Remove Recipes</h4>
                <div className="collections-recipe-picker">
                  {recipes.length === 0 && <p>No saved recipes found in your library.</p>}
                  {recipes.map((recipe) => {
                    const isInCollection = selectedCollection.recipeIds?.includes(String(recipe.id))
                    return (
                      <label key={recipe.id} className="collections-recipe-checkbox">
                        <input
                          type="checkbox"
                          checked={Boolean(isInCollection)}
                          onChange={() => handleToggleRecipe(recipe.id)}
                        />
                        <span>{recipe.name}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="collections-empty-pane">
                <p>Select a collection on the left or create a new cookbook.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
