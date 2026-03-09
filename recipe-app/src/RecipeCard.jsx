import React from 'react'

export default function RecipeCard({ recipe, onClose, onElevate, isElevating }) {
  const instructions = (recipe.instructions || []).map((inst) => {
    if (typeof inst === 'string') return inst
    return inst.text || inst.name || JSON.stringify(inst)
  })

  const sourceBadge = {
    clipped: { label: 'Clipped', color: '#5bb87a' },
    ai_generated: { label: 'AI Generated', color: '#c8a96e' },
    elevated: { label: 'Elevated', color: '#e8c87a' },
  }[recipe.source] || { label: 'Recipe', color: '#4a6e52' }

  return (
    <div className="recipe-card">
      <div className="recipe-card-header">
        <span className="recipe-badge" style={{ background: sourceBadge.color }}>{sourceBadge.label}</span>
        <h2 className="recipe-title">{recipe.name}</h2>
        <div className="recipe-header-actions">
          <button
            className="elevate-btn"
            onClick={onElevate}
            disabled={isElevating}
            title="Elevate this recipe with AI — improve instructions, suggest variations, add tips"
          >
            {isElevating ? (
              <>
                <svg className="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 11-6.219-8.56"/>
                </svg>
                Elevating…
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 3l14 9-14 9V3z"/>
                </svg>
                Elevate
              </>
            )}
          </button>
          <button className="close-btn" onClick={onClose} title="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>

      {recipe.image && (
        <img className="recipe-image" src={recipe.image} alt={recipe.name} />
      )}

      {recipe.description && (
        <p className="recipe-description">{recipe.description}</p>
      )}

      <div className="recipe-meta">
        {recipe.prep_time && (
          <span className="recipe-meta-pill"><strong>Prep</strong> {recipe.prep_time}</span>
        )}
        {recipe.cook_time && (
          <span className="recipe-meta-pill"><strong>Cook</strong> {recipe.cook_time}</span>
        )}
        {recipe.recipe_yield && (
          <span className="recipe-meta-pill"><strong>Serves</strong> {recipe.recipe_yield}</span>
        )}
        {recipe.source_url && (
          <a href={recipe.source_url} target="_blank" rel="noopener noreferrer">Source ↗</a>
        )}
      </div>

      <div className="recipe-body">
        {recipe.ingredients?.length > 0 && (
          <div className="recipe-section">
            <h3>Ingredients</h3>
            <ul>
              {recipe.ingredients.map((ing, i) => (
                <li key={i}>{typeof ing === 'string' ? ing : ing.name || JSON.stringify(ing)}</li>
              ))}
            </ul>
          </div>
        )}

        {instructions.length > 0 && (
          <div className="recipe-section">
            <h3>Instructions</h3>
            <ol>
              {instructions.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  )
}
