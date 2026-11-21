import React from 'react'

const DIMENSION_LABELS = {
  nutrition: 'Nutrition',
  allergen_coverage: 'Allergen coverage',
  process_safety: 'Process safety',
  authenticity: 'Authenticity',
  technique: 'Technique',
  timing: 'Timing',
  product_identity: 'Product identity',
  general: 'Recipe checks',
}

const REASON_MESSAGES = {
  nutrition_not_calculated: 'Macros were not calculated, so do not treat this recipe as meeting a nutrition target.',
  nutrition_coverage_unknown: 'Macro coverage is unknown; the displayed values may not include every ingredient.',
  nutrition_coverage_insufficient: 'Too few ingredients were matched to support reliable macro estimates.',
  nutrition_is_estimated: 'Macros are estimates rather than a verified package label.',
  opaque_or_precautionary_ingredient_terms: 'Some ingredient terms are ambiguous. Review the package labels before cooking.',
  custom_allergen_not_in_graph: 'A saved allergen is not in the recognition graph and needs manual verification.',
  ingredient_data_unavailable: 'Ingredient data was unavailable, so allergen coverage cannot be confirmed.',
  allergen_conflict: 'An allergen conflict was detected. Do not use this recipe for the affected profile.',
  allergen_coverage_partial: 'Allergen coverage is partial; check every ingredient label.',
  process_safety_not_checked: 'The food-process safety check did not run.',
  process_safety_requires_review: 'The cooking process needs review against a tested source before use.',
  process_safety_blocked: 'The cooking process could not be cleared. Follow a tested process instead.',
  generated_content_not_independently_verified: 'The generated culinary claims have not been independently verified.',
  packaged_product_identity_missing: 'A packaged ingredient was not matched to a specific product or label.',
  packaged_product_components_need_label_review: 'Packaged ingredients need label review for their component ingredients.',
  timing_fields_incomplete: 'Preparation or cooking timing is incomplete.',
  timing_consistency_uncertain: 'The stated total time differs from the preparation and cooking times.',
  quality_checks_need_review: 'Automated quality checks found details that need a human review.',
  quality_validation_blocked: 'Automated quality validation blocked a claim about this recipe.',
}

function levelRank(level) {
  return { high: 0, medium: 1, low: 2, abstain: 3 }[level] ?? 1
}

function levelLabel(level) {
  return {
    medium: 'Review recommended',
    low: 'Needs verification',
    abstain: 'Cannot verify',
  }[level] || 'Checked'
}

function reasonMessage(reason) {
  return REASON_MESSAGES[reason] || 'This information is incomplete or could not be independently verified.'
}

function dimensionMessage(dimension, detail) {
  const reason = detail?.reasons?.[0]
  if (reason) return reasonMessage(reason)
  if (dimension === 'allergen_coverage') return 'Allergen coverage is not complete; check every ingredient label.'
  if (dimension === 'process_safety') return 'Review the cooking process against a tested source.'
  if (dimension === 'nutrition') return 'Nutrition information is an estimate, not a guarantee.'
  return 'This recipe detail needs human verification.'
}

/**
 * Human-centered uncertainty UI. It distinguishes a knowledge abstention from
 * the existing red allergen/process BLOCK notices and never calls an uncertain
 * dimension safe or cleared.
 */
export default function UncertaintyBanner({ summary, className = '' }) {
  if (!summary?.checked || !summary.dimensions) return null

  const concerns = Object.entries(summary.dimensions)
    .filter(([, detail]) => levelRank(detail?.level) > 0)
    .sort(([, left], [, right]) => levelRank(right?.level) - levelRank(left?.level))
  if (concerns.length === 0) return null

  const allergenLevel = summary.dimensions.allergen_coverage?.level
  const processLevel = summary.dimensions.process_safety?.level
  const safetyLevels = [allergenLevel, processLevel].filter(Boolean)
  const safetyLevel = safetyLevels.length > 0
    ? safetyLevels.reduce((worst, level) => levelRank(level) > levelRank(worst) ? level : worst, 'high')
    : 'high'
  const safetyConcern = levelRank(safetyLevel) > 0
  const isAbstained = summary.abstained || summary.level === 'abstain' || levelRank(safetyLevel) >= 3
  const heading = safetyConcern
    ? (isAbstained ? 'Safety information needs review' : 'Safety review recommended')
    : 'Some recipe details need review'
  const noticeClass = [
    'recipe-uncertainty-banner',
    safetyConcern ? 'recipe-uncertainty-banner--safety' : '',
    isAbstained ? 'recipe-uncertainty-banner--abstain' : 'recipe-uncertainty-banner--review',
    className,
  ].filter(Boolean).join(' ')

  return (
    <section className={noticeClass} role={safetyConcern ? 'alert' : 'note'} aria-label="Recipe uncertainty">
      <div className="recipe-uncertainty-heading">
        <strong>{heading}</strong>
        <span className="recipe-uncertainty-level">{levelLabel(summary.level)}</span>
      </div>
      <p>
        Seasoned is showing what it could not verify. This is not a safety clearance or a medical
        nutrition assessment.
      </p>
      <ul>
        {concerns.map(([dimension, detail]) => (
          <li key={dimension}>
            <strong>{DIMENSION_LABELS[dimension] || dimension}</strong>{' '}
            <span>{dimensionMessage(dimension, detail)}</span>
          </li>
        ))}
      </ul>
      <p className="recipe-uncertainty-action">
        Verify labels, measurements, and preparation conditions before relying on this recipe.
      </p>
    </section>
  )
}

export { DIMENSION_LABELS, REASON_MESSAGES, dimensionMessage }
