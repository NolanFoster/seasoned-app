import React, { useState, useEffect } from 'react'

const DEFAULT_TIPS = [
  'Organising by category…',
  'Combining duplicate ingredients…',
  'Estimating quantities…',
  'Sorting your list…',
  'Almost ready…',
]

/**
 * GeneratingGroceryCard
 *
 * Animated loading card displayed while the AI grocery list is being generated.
 * Mirrors the visual style of GeneratingCard.jsx (bubble animation, rotating
 * phrases) but is contextualised for the grocery list flow.
 *
 * @param {string}   [props.title]     - Primary heading text
 * @param {string}   [props.subtitle]  - Supporting hint below the title
 * @param {string[]} [props.tips]      - Array of rotating tip strings
 * @param {string}   [props.className] - Optional extra CSS class on the root element
 */
export default function GeneratingGroceryCard({
  title = 'Generating your grocery list…',
  subtitle = 'This usually takes 8–15 seconds',
  tips = DEFAULT_TIPS,
  className = '',
}) {
  const [tipIndex, setTipIndex] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setTipIndex((i) => (i + 1) % tips.length)
    }, 2500)
    return () => clearInterval(id)
  }, [tips.length])

  return (
    <div
      className={`generating-grocery-card${className ? ` ${className}` : ''}`}
      role="status"
      aria-label="Generating grocery list"
      aria-live="polite"
    >
      <div className="generating-grocery-card__visual" aria-hidden="true">
        <span className="generating-grocery-card__bubble" />
        <span className="generating-grocery-card__bubble" />
        <span className="generating-grocery-card__bubble" />
        <span className="generating-grocery-card__bubble" />
        <span className="generating-grocery-card__bubble" />
      </div>

      <p className="generating-grocery-card__title">{title}</p>

      <p className="generating-grocery-card__tip" key={tipIndex}>
        {tips[tipIndex]}
      </p>

      <p className="generating-grocery-card__subtitle">{subtitle}</p>
    </div>
  )
}
