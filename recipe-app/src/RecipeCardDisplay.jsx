import React from 'react'

export function parseDuration(val) {
  if (!val) return null
  if (typeof val === 'number') return `${val} min`
  const str = String(val).trim().toUpperCase()
  if (!str.startsWith('PT') && !str.startsWith('P')) return val
  const hours = str.match(/(\d+)H/)?.[1]
  const minutes = str.match(/(\d+)M/)?.[1]
  const parts = []
  if (hours) parts.push(`${hours} hr`)
  if (minutes) parts.push(`${minutes} min`)
  return parts.length ? parts.join(' ') : val
}

const sourceBadgeMap = {
  clipped: { label: 'Clipped', color: '#5bb87a' },
  ai_generated: { label: 'AI Generated', color: '#c8a96e' },
  elevated: { label: 'Elevated', color: '#e8c87a' },
  youtube: { label: 'YouTube', color: '#ff0000' },
}

function appliedConstraintLabels(constraints) {
  if (!constraints) return []
  const labels = []
  if (constraints.dietary?.length) labels.push(constraints.dietary.join(', '))
  if (constraints.cuisine) labels.push(constraints.cuisine)
  if (constraints.maxCookTime) labels.push(`${constraints.maxCookTime} min max`)
  if (constraints.servings) labels.push(`${constraints.servings} servings`)
  return labels
}

// Pure display component — no state, no browser APIs.
// Safe to use with ReactDOMServer.renderToStaticMarkup.
// Props:
//   recipe       — recipe data object
//   onCookClick  — click handler for the Cook button (omitted in SSR)
//   cookBtnId    — optional id attr on the Cook button (for vanilla-JS hooks)
export default function RecipeCardDisplay({ recipe, onCookClick, cookBtnId }) {
  const instructions = (recipe.instructions || []).map((inst) => {
    if (typeof inst === 'string') return inst
    return inst.text || inst.name || JSON.stringify(inst)
  })

  const sourceBadge = sourceBadgeMap[recipe.source]
  const allergenSummary = recipe.allergenSummary
  const hardAllergens = recipe.appliedConstraints?.hardAllergens || []
  const showAllergenNotice = hardAllergens.length > 0 || allergenSummary
  const blockedAllergens = allergenSummary?.blocked || []

  return (
    <>
      <div className="recipe-card-header">
        <div className="recipe-title-row">
          <h2 className="recipe-title">{recipe.name}</h2>
          {sourceBadge && (
            <span className="recipe-source-badge" style={{ backgroundColor: sourceBadge.color }}>
              {sourceBadge.label}
            </span>
          )}
        </div>
      </div>

      {recipe.image && (
        <img className="recipe-image" src={recipe.image} alt={recipe.name} />
      )}

      {recipe.description && (
        <p className="recipe-description">{recipe.description}</p>
      )}

      {showAllergenNotice && (
        <div className="recipe-allergen-notice" role="note">
          {blockedAllergens.length > 0
            ? `Allergen safety blocked: ${blockedAllergens.join(', ')}.`
            : 'Allergen check completed. AI can miss allergens and cross-contact; verify labels and preparation conditions.'}
        </div>
      )}

      <div className="recipe-meta">
        {recipe.prep_time && (
          <span className="recipe-meta-pill"><strong>Prep</strong> {parseDuration(recipe.prep_time)}</span>
        )}
        {recipe.cook_time && (
          <span className="recipe-meta-pill"><strong>Cook</strong> {parseDuration(recipe.cook_time)}</span>
        )}
        {recipe.recipe_yield && (
          <span className="recipe-meta-pill"><strong>Serves</strong> {recipe.recipe_yield}</span>
        )}
        {recipe.source_url && recipe.source !== 'ai_generated' && (
          <a className="source-link" href={recipe.source_url} target="_blank" rel="noopener noreferrer">Source ↗</a>
        )}
        {instructions.length > 0 && (
          <button
            id={cookBtnId}
            className="cook-btn"
            onClick={onCookClick}
            title="Step-by-step cooking mode"
            aria-label="Start step-by-step cooking mode"
            style={{ marginLeft: 'auto' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 3l14 9-14 9V3z"/>
            </svg>
            Cook
          </button>
        )}
      </div>

      {appliedConstraintLabels(recipe.appliedConstraints).length > 0 && (
        <div className="applied-constraints" aria-label="Applied generation constraints">
          <span className="applied-constraints-label">Personalized</span>
          {appliedConstraintLabels(recipe.appliedConstraints).map((label) => (
            <span key={label} className="applied-constraint-chip">{label}</span>
          ))}
        </div>
      )}

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
    </>
  )
}
