import React, { useState } from 'react'
import { useFlag } from './flaggly.js'
import { MEAL_MODES, COMPONENT_ROLES, normalizeMealAtom } from '../../shared/meal-atom.js'

export default function MealAtomComposerModal({
  isOpen,
  onClose,
  initialMeal,
  onSaveMeal,
}) {
  const mealAtomEnabled = useFlag('meal-atom')
  const [title, setTitle] = useState(initialMeal?.title || 'Taco Night Hybrid Plate')
  const [mode, setMode] = useState(initialMeal?.mode || MEAL_MODES.HYBRID)
  const [components, setComponents] = useState(initialMeal?.components || [
    {
      id: 'comp-1',
      name: 'Corn Tortillas & Fresh Salsa (Shared Base)',
      role: COMPONENT_ROLES.HERO,
      diners: 'all',
      ingredients: ['Corn tortillas', 'Salsa', 'Cilantro'],
    },
    {
      id: 'comp-2',
      name: 'Seasoned Ground Beef (Omnivore)',
      role: COMPONENT_ROLES.HERO,
      diners: ['Adults'],
      ingredients: ['Ground beef', 'Taco seasoning'],
    },
    {
      id: 'comp-3',
      name: 'Black Beans & Roasted Mushrooms (Vegetarian)',
      role: COMPONENT_ROLES.HERO,
      diners: ['Vegetarian'],
      ingredients: ['Black beans', 'Mushrooms', 'Taco seasoning'],
    },
  ])

  if (!isOpen || !mealAtomEnabled) return null

  function handleSave(e) {
    e.preventDefault()
    const meal = normalizeMealAtom({
      id: initialMeal?.id || `meal-${Date.now()}`,
      title: title.trim() || 'Hybrid Meal',
      mode,
      components,
    })
    onSaveMeal(meal)
    onClose()
  }

  return (
    <div className="meal-atom-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="meal-atom-title">
      <div className="meal-atom-modal-card">
        <div className="meal-atom-header">
          <div>
            <span className="meal-atom-badge">🍽️ Meal-as-Atom Planner</span>
            <h2 id="meal-atom-title">Hybrid Meal Composer</h2>
          </div>
          <button type="button" className="meal-atom-close-btn" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        <form onSubmit={handleSave} className="meal-atom-body">
          <p className="meal-atom-hint">
            Compose a multi-component plate with shared bases and divergent per-diner proteins/garnishes for mixed-diet tables.
          </p>

          <label htmlFor="meal-title-input">Meal Name</label>
          <input
            id="meal-title-input"
            type="text"
            className="meal-atom-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />

          <div className="meal-atom-mode-selector">
            <span className="meal-atom-mode-label">Plate Mode:</span>
            {Object.values(MEAL_MODES).map((m) => (
              <button
                key={m}
                type="button"
                className={`meal-mode-chip${mode === m ? ' active' : ''}`}
                onClick={() => setMode(m)}
              >
                {m}
              </button>
            ))}
          </div>

          <h4>Plate Components ({components.length})</h4>
          <div className="meal-components-list">
            {components.map((comp) => (
              <div key={comp.id} className="meal-component-card">
                <div className="meal-component-title">
                  <strong>{comp.name}</strong>
                  <span className="meal-component-diner-pill">
                    {Array.isArray(comp.diners) ? comp.diners.join(', ') : 'All Diners'}
                  </span>
                </div>
                <p className="meal-component-ing">
                  <strong>Ingredients:</strong> {comp.ingredients.join(', ')}
                </p>
              </div>
            ))}
          </div>

          <div className="meal-atom-actions">
            <button type="submit" className="meal-atom-save-btn">
              Save Hybrid Meal Plate
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
