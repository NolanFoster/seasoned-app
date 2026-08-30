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
  adapted: { label: 'Adapted', color: '#7fbf91' },
  youtube: { label: 'YouTube', color: '#ff0000' },
}

import { estimateRecipeCost } from '../../shared/ingredient-cost-heuristics.js'
import { composeMealSides } from '../../shared/complete-meal.js'
import { computeTrafficLights, computeNutritionConfidence } from '../../shared/nutrition-friction.js'
import { suggestLeftoverTransforms } from '../../shared/leftover-transforms.js'
import { evaluateRatioIntegrity } from '../../shared/ratio-integrity.js'
import { useFlag } from './flaggly.js'

function appliedConstraintLabels(constraints) {
  if (!constraints) return []
  const labels = []
  if (constraints.dietary?.length) labels.push(constraints.dietary.join(', '))
  if (constraints.cuisine) labels.push(constraints.cuisine)
  if (constraints.maxCookTime) labels.push(`${constraints.maxCookTime} min max`)
  if (constraints.servings) labels.push(`${constraints.servings} servings`)
  if (constraints.budgetBand && constraints.budgetBand !== 'flexible') {
    labels.push(constraints.budgetBand === 'low' ? 'Budget-friendly ($)' : 'Moderate budget ($$)')
  }
  if (constraints.mealBudgetUsd) labels.push(`≤$${constraints.mealBudgetUsd}`)
  return labels
}

function allergenLabel(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

/**
 * Explain the graph result without claiming that a recipe is medically safe.
 * The same notice is rendered in the recipe card and cooking navigator so the
 * warning remains visible when a user moves from browsing to cooking.
 */
export function AllergenSafetyNotice({ summary, hardAllergens = [], className = '' }) {
  if (!summary && hardAllergens.length === 0) return null

  const blocked = summary?.blocked || []
  const contains = summary?.contains || []
  const uncertain = summary?.may_contain_uncertain || []
  const needsReview = Boolean(
    summary?.needs_review
      || (summary && summary.safe === false && blocked.length === 0)
      || (hardAllergens.length > 0 && summary?.ingredient_data_available === false)
  )
  const noticeClass = [
    'recipe-allergen-notice',
    blocked.length > 0 ? 'recipe-allergen-notice--blocked' : '',
    needsReview ? 'recipe-allergen-notice--review' : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <div className={noticeClass} role={blocked.length > 0 ? 'alert' : 'note'}>
      <strong>
        {blocked.length > 0
          ? 'Allergen conflict detected'
          : needsReview
            ? 'Needs verification'
            : 'Allergen check'}
      </strong>
      <p>
        {blocked.length > 0
          ? `This recipe includes ${blocked.map(allergenLabel).join(', ')}. Do not use it for those saved hard allergens.`
          : needsReview
            ? 'The recipe could not be fully verified from its available ingredient information.'
            : 'No mapped conflict was found for the saved hard allergens.'}
      </p>
      {contains.length > 0 && (
        <p>Detected allergens: {contains.map(allergenLabel).join(', ')}.</p>
      )}
      {uncertain.length > 0 && (
        <p>Review these ingredients or preparation notes: {uncertain.join('; ')}.</p>
      )}
      <p>AI can miss allergens and cross-contact; verify labels and preparation conditions.</p>
    </div>
  )
}

/**
 * Explain a food-process gate decision. Rendered in the recipe card and at
 * cooking-mode entry so the warning follows a user from browsing to cooking,
 * exactly as the allergen notice does.
 */
export function ProcessSafetyNotice({ summary, className = '' }) {
  if (!summary || !summary.checked) return null

  const blocked = summary.blocked || []
  const requiresTemplate = summary.requires_template || []
  const warnings = summary.warnings || []
  const sources = summary.sources || []
  if (blocked.length === 0 && requiresTemplate.length === 0 && warnings.length === 0) return null

  const gated = blocked.length > 0 || requiresTemplate.length > 0
  const noticeClass = [
    'recipe-process-notice',
    blocked.length > 0 ? 'recipe-process-notice--blocked' : '',
    requiresTemplate.length > 0 ? 'recipe-process-notice--template' : '',
    warnings.length > 0 && !gated ? 'recipe-process-notice--review' : '',
    className,
  ].filter(Boolean).join(' ')

  const labelsFor = (tags) => tags
    .map((tag) => summary.policyActions?.find((action) => action.tag === tag)?.label || allergenLabel(tag))
    .join(', ')

  return (
    <div className={noticeClass} role={gated ? 'alert' : 'note'}>
      <strong>
        {blocked.length > 0
          ? 'Unsafe technique blocked'
          : requiresTemplate.length > 0
            ? 'Use a tested process'
            : 'Check this technique'}
      </strong>
      {blocked.length > 0 && (
        <p>
          Seasoned will not generate instructions for {labelsFor(blocked)}. Follow a lab-tested
          process from the sources below instead.
        </p>
      )}
      {requiresTemplate.length > 0 && (
        <p>
          The {labelsFor(requiresTemplate)} steps were removed. Use a tested schedule for your food,
          jar size, and altitude rather than an improvised one.
        </p>
      )}
      {warnings.map((warning) => (
        <p key={warning.tag}>
          <strong>{warning.label}:</strong> {warning.reason} {warning.guidance}
        </p>
      ))}
      {sources.length > 0 && (
        <ul className="recipe-process-notice-sources">
          {sources.map((source) => (
            <li key={source.id}>
              <a href={source.url} target="_blank" rel="noopener noreferrer">{source.label}</a>
            </li>
          ))}
        </ul>
      )}
      <p>{summary.disclaimer}</p>
    </div>
  )
}

const provenanceMethodLabels = {
  'llama-ai': 'LLaMA generation',
  'llama-ai-elevate': 'AI elevated',
  'llama-ai-recipe-adapt': 'AI adapted',
  'mock-ai': 'Local adaptation preview',
  mock: 'Local generation preview',
}

function provenanceMethodLabel(value, source) {
  if (provenanceMethodLabels[value]) return provenanceMethodLabels[value]
  if (sourceBadgeMap[source]) return sourceBadgeMap[source].label
  return value ? String(value).replace(/[-_]/g, ' ') : 'AI generated'
}

function qualityStatusLabel(value) {
  return {
    passed: 'Checks passed',
    needs_review: 'Review recommended',
    blocked: 'Blocked',
    not_checked: 'Not checked',
  }[value] || 'Not checked'
}

/**
 * Explain the origin and deterministic checks behind an AI recipe without
 * exposing retrieved recipe payloads or presenting a score as a guarantee.
 */
export function RecipeProvenance({ recipe }) {
  const provenance = recipe.provenance || recipe.provenance_metadata
  const qualityBar = recipe.qualityBar || recipe.quality_bar
  const isAiRecipe = Boolean(
    provenance
      || recipe.source === 'ai_generated'
      || recipe.source === 'adapted'
      || recipe.generationMethod
  )
  if (!isAiRecipe) return null

  const source = provenance?.source || recipe.source
  const method = provenance?.generationMethod || recipe.generationMethod
  const methodLabel = method ? provenanceMethodLabel(method, source) : null
  const qualityScore = qualityBar?.score ?? provenance?.qualityScore
  const similarRecipeIds = provenance?.similarRecipeIds || []
  const nutritionCoverage = provenance?.nutritionCoverage
  const allergenCheck = qualityBar?.allergenCheck
    || (recipe.allergenSummary?.blocked?.length > 0
      ? 'blocked'
      : recipe.allergenSummary?.needs_review ? 'needs_review' : recipe.allergenSummary ? 'passed' : 'not_checked')
  const constraintCount = Object.values(provenance?.appliedConstraints || recipe.appliedConstraints || {})
    .filter((value) => (Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && value !== '')).length

  return (
    <section className="recipe-provenance" aria-label="How this was made">
      <div className="recipe-provenance-heading">
        <h3>How this was made</h3>
        {methodLabel && (
          <span className="recipe-provenance-method">{methodLabel}</span>
        )}
      </div>
      <div className="recipe-provenance-grid">
        {qualityScore !== null && qualityScore !== undefined && (
          <span className={`recipe-provenance-item recipe-provenance-item--${qualityBar?.status || 'passed'}`}>
            <strong>Quality</strong> {Math.round(Number(qualityScore))}/100
          </span>
        )}
        <span className={`recipe-provenance-item recipe-provenance-item--${allergenCheck}`}>
          <strong>Safety</strong> {qualityStatusLabel(allergenCheck)}
        </span>
        {provenance?.model && (
          <span className="recipe-provenance-item">
            <strong>Model</strong> {provenance.model}
          </span>
        )}
        {similarRecipeIds.length > 0 && (
          <span className="recipe-provenance-item">
            <strong>Recipe context</strong> {similarRecipeIds.length} similar recipe{similarRecipeIds.length === 1 ? '' : 's'}
          </span>
        )}
        {constraintCount > 0 && (
          <span className="recipe-provenance-item">
            <strong>Constraints</strong> {constraintCount} applied
          </span>
        )}
        <span className="recipe-provenance-item">
          <strong>Nutrition</strong> {typeof nutritionCoverage === 'number' ? `${Math.round(nutritionCoverage)}% ingredient coverage` : 'Not calculated'}
        </span>
        {useFlag('ratio-integrity') && (() => {
          const ratioReport = evaluateRatioIntegrity(recipe)
          return (
            <span className={`recipe-provenance-item recipe-provenance-item--${ratioReport.status}`}>
              <strong>Ratio check</strong> {ratioReport.status.replace('_', ' ')}
            </span>
          )
        })()}
        {useFlag('kitchen-physics-packs') && (
          <span className="recipe-provenance-item">
            <strong>Physics</strong> Density & heat adjusted
          </span>
        )}
      </div>
      <p className="recipe-provenance-disclaimer">
        Quality checks are automated signals, not a guarantee. Verify ingredients, labels, and preparation conditions.
      </p>
    </section>
  )
}

/**
 * Nutrition panel showing per-serving macros, USDA coverage/confidence indicator,
 * expandable micronutrients when available, and clear honest non-medical disclaimers.
 */
export function NutritionPanel({ recipe, onGoalAdaptClick }) {
  const nutrition = recipe?.nutrition
  const nutritionProvenance = recipe?.nutritionProvenance || recipe?.nutrition_provenance
  const coveragePct = typeof nutritionProvenance?.coverage_pct === 'number'
    ? Math.round(nutritionProvenance.coverage_pct)
    : typeof recipe?.provenance?.nutritionCoverage === 'number'
      ? Math.round(recipe.provenance.nutritionCoverage)
      : null
  const isEstimated = nutritionProvenance?.estimated ?? (coveragePct !== null && coveragePct < 80)
  const uncertainIngredients = nutritionProvenance?.uncertain_ingredients || []

  if (!nutrition && coveragePct === null) return null

  const calories = nutrition?.calories || nutrition?.energy || null
  const protein = nutrition?.proteinContent || nutrition?.protein || null
  const carbs = nutrition?.carbohydrateContent || nutrition?.carbohydrates || null
  const fat = nutrition?.fatContent || nutrition?.fat || null
  const fiber = nutrition?.fiberContent || nutrition?.fiber || null
  const sugar = nutrition?.sugarContent || nutrition?.sugar || null
  const sodium = nutrition?.sodiumContent || nutrition?.sodium || null

  const hasMacros = Boolean(calories || protein || carbs || fat)

  return (
    <section className="recipe-nutrition-panel" aria-label="Nutritional facts per serving">
      <div className="recipe-nutrition-header">
        <div>
          <h3>Estimated nutrition (per serving)</h3>
          <p className="recipe-nutrition-source">
            Estimated from USDA FoodData Central matches · Not medical or dietary advice
          </p>
        </div>
        {coveragePct !== null && (
          <span className={`recipe-nutrition-coverage ${isEstimated ? 'recipe-nutrition-coverage--estimated' : 'recipe-nutrition-coverage--good'}`}>
            {coveragePct}% matched
          </span>
        )}
      </div>

      {hasMacros && (
        <div className="recipe-nutrition-macros">
          {calories && (
            <div className="nutrition-macro-item">
              <span className="nutrition-macro-value">{calories}</span>
              <span className="nutrition-macro-label">Calories</span>
            </div>
          )}
          {protein && (
            <div className="nutrition-macro-item">
              <span className="nutrition-macro-value">{protein}</span>
              <span className="nutrition-macro-label">Protein</span>
            </div>
          )}
          {carbs && (
            <div className="nutrition-macro-item">
              <span className="nutrition-macro-value">{carbs}</span>
              <span className="nutrition-macro-label">Carbs</span>
            </div>
          )}
          {fat && (
            <div className="nutrition-macro-item">
              <span className="nutrition-macro-value">{fat}</span>
              <span className="nutrition-macro-label">Fat</span>
            </div>
          )}
        </div>
      )}

      {useFlag('nutrition-overtrust-friction') && (() => {
        const lights = computeTrafficLights(nutrition)
        const confidence = computeNutritionConfidence(nutritionProvenance)
        return (
          <div className="recipe-nutrition-trust-wrap" aria-label="Nutrition trust indicators">
            <div className="recipe-nutrition-traffic-lights">
              <span className="nutrition-traffic-title">Traffic Lights (FSA):</span>
              <span className={`nutrition-traffic-badge nutrition-traffic--${lights.fat.level}`}>
                Fat: {lights.fat.value}
              </span>
              <span className={`nutrition-traffic-badge nutrition-traffic--${lights.saturates.level}`}>
                Sat Fat: {lights.saturates.value}
              </span>
              <span className={`nutrition-traffic-badge nutrition-traffic--${lights.sugars.level}`}>
                Sugar: {lights.sugars.value}
              </span>
              <span className={`nutrition-traffic-badge nutrition-traffic--${lights.salt.level}`}>
                Salt: {lights.salt.value}
              </span>
            </div>
            {lights.hasRedLight && (
              <div className="nutrition-overtrust-warning" role="alert">
                <strong>Attention:</strong> One or more nutrients exceed daily guideline benchmarks. Review ingredient quantities carefully.
              </div>
            )}
            <div className="nutrition-confidence-pill">
              Confidence: <strong>{confidence.toUpperCase()}</strong>
            </div>
          </div>
        )
      })()}

      {(fiber || sugar || sodium) && (
        <div className="recipe-nutrition-micros">
          {fiber && <span><strong>Fiber:</strong> {fiber}</span>}
          {sugar && <span><strong>Sugar:</strong> {sugar}</span>}
          {sodium && <span><strong>Sodium:</strong> {sodium}</span>}
        </div>
      )}

      {uncertainIngredients.length > 0 && (
        <p className="recipe-nutrition-uncertain">
          Unmatched ingredients: {uncertainIngredients.map((u) => u.name).join(', ')}
        </p>
      )}

      {onGoalAdaptClick && (
        <button
          type="button"
          className="recipe-nutrition-adapt-btn"
          onClick={onGoalAdaptClick}
        >
          Align closer to nutrition goals
        </button>
      )}
    </section>
  )
}



export function AppetiteFriendlyTips({ constraints }) {
  const modes = constraints?.lifestyleModes || constraints?.lifestyle_modes || []
  if (!modes.includes('appetite_gentle')) return null

  return (
    <div className="process-safety-notice" style={{ backgroundColor: '#eaf4eb', borderLeftColor: '#7fbf91' }}>
      <strong>Appetite-friendly tips</strong>
      <p style={{ margin: '4px 0 0', fontSize: '0.9em' }}>
        • Pause if full; this recipe is designed to reheat well later.<br/>
        • Eat the protein components first if you have a smaller appetite.<br/>
        • <em>Not medical advice.</em>
      </p>
    </div>
  )
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
  const hardAllergens = recipe.appliedConstraints?.hardAllergens
    || recipe.appliedConstraints?.hard_allergens
    || []

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

      <AllergenSafetyNotice summary={allergenSummary} hardAllergens={hardAllergens} />
      <ProcessSafetyNotice summary={recipe.processSafetySummary} />
      <RecipeProvenance recipe={recipe} />
      <AppetiteFriendlyTips constraints={recipe.appliedConstraints} />

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
        {recipe.ingredients?.length > 0 && (() => {
          const costInfo = estimateRecipeCost(recipe)
          return (
            <span 
              className="recipe-meta-pill" 
              title={costInfo.disclaimer}
              style={{ cursor: 'help' }}
            >
              <strong>Est. Cost</strong> ${costInfo.estimatedCostPerServingUsd.toFixed(2)}/serving ({costInfo.costBand === 'low' ? '$' : costInfo.costBand === 'medium' ? '$$' : '$$$'})
            </span>
          )
        })()}
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

      {useFlag('complete-meal-composer') && (() => {
        const pairedSides = composeMealSides(recipe, { hardAllergens })
        if (pairedSides.length === 0) return null
        return (
          <section className="complete-meal-section" aria-label="Complete the meal recommendations">
            <div className="complete-meal-header">
              <h3>🍽️ Complete the Meal</h3>
              <span className="complete-meal-tagline">Pairings & sides tailored to this dish</span>
            </div>
            <div className="complete-meal-grid">
              {pairedSides.map((side) => (
                <div key={side.id} className="complete-meal-card">
                  <div className="complete-meal-card-title">
                    <strong>{side.name}</strong>
                    <span className="complete-meal-pill">{side.type.replace('_', ' ')} · ~{side.prepMinutes}m</span>
                  </div>
                  <p className="complete-meal-card-ingredients">
                    <strong>Ingredients:</strong> {side.ingredients.join(', ')}
                  </p>
                  <p className="complete-meal-card-instruction">{side.instructions[0]}</p>
                </div>
              ))}
            </div>
          </section>
        )
      })()}

      {useFlag('leftover-transform-cascade') && (() => {
        const transforms = suggestLeftoverTransforms(recipe)
        if (transforms.length === 0) return null
        return (
          <section className="leftover-cascade-section" aria-label="Next-day remix cascade">
            <div className="leftover-cascade-header">
              <h3>🔄 Transform Tomorrow</h3>
              <span className="leftover-cascade-tagline">Intentional next-day meals from these cooked components (not "leftovers again")</span>
            </div>
            <div className="leftover-cascade-grid">
              {transforms.map((t) => (
                <div key={t.id} className="leftover-cascade-card">
                  <div className="leftover-cascade-card-header">
                    <strong>{t.title}</strong>
                    <span className="leftover-cascade-pill">~{t.effortMin}m effort</span>
                  </div>
                  <p className="leftover-cascade-fresh">
                    <strong>Fresh finishers needed:</strong> {t.requiresFresh.join(', ')}
                  </p>
                  <p className="leftover-cascade-inst">{t.instructions[0]}</p>
                </div>
              ))}
            </div>
          </section>
        )
      })()}

      {appliedConstraintLabels(recipe.appliedConstraints).length > 0 && (
        <div className="applied-constraints" aria-label="Applied generation constraints">
          <span className="applied-constraints-label">Personalized</span>
          {appliedConstraintLabels(recipe.appliedConstraints).map((label) => (
            <span key={label} className="applied-constraint-chip">{label}</span>
          ))}
        </div>
      )}

      {(recipe.substitutions?.length > 0 || recipe.adaptationNotes?.length > 0) && (
        <section className="adaptation-summary" aria-label="Recipe adaptation details">
          <h3>What changed</h3>
          {recipe.substitutions?.length > 0 && (
            <ul className="adaptation-substitutions">
              {recipe.substitutions.map((change, index) => (
                <li key={`${change.from || 'change'}-${index}`}>
                  <strong>{change.from}</strong> → {change.to}
                  {change.reason && <span>{change.reason}</span>}
                </li>
              ))}
            </ul>
          )}
          {recipe.adaptationNotes?.length > 0 && (
            <ul className="adaptation-notes">
              {recipe.adaptationNotes.map((note, index) => <li key={`${note}-${index}`}>{note}</li>)}
            </ul>
          )}
          {recipe.adapted_from && (
            <div className="adaptation-lineage" style={{ margin: '8px 0', padding: '6px 10px', background: '#f5f5f5', borderRadius: '4px', fontSize: '0.85em' }}>
              <span>🌱 <strong>Lineage:</strong> Adapted from original <em>{recipe.original_name || recipe.parent_recipe_name || 'recipe'}</em></span>
              {recipe.adaptation_timestamp && (
                <small style={{ display: 'block', color: '#666', marginTop: '2px' }}>
                  Variant generated on {new Date(recipe.adaptation_timestamp).toLocaleDateString()}
                </small>
              )}
            </div>
          )}
        </section>
      )}

      <NutritionPanel recipe={recipe} />

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
