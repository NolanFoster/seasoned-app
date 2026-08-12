import React, { useEffect, useRef, useState } from 'react'

const DIET_OPTIONS = [
  ['dairy_free', 'Dairy-free'],
  ['gluten_free', 'Gluten-free'],
  ['vegan', 'Vegan'],
  ['vegetarian', 'Vegetarian'],
  ['keto', 'Lower carb'],
]

const EQUIPMENT_OPTIONS = [
  ['air_fryer', 'Air fryer'],
  ['oven', 'Oven'],
  ['stovetop', 'Stovetop'],
  ['instant_pot', 'Instant Pot'],
  ['grill', 'Grill'],
]

const QUICK_ADAPTATIONS = [
  { label: 'Dairy-free', dietary: 'dairy_free' },
  { label: 'Gluten-free', dietary: 'gluten_free' },
  { label: 'Higher protein', nutritionFocus: 'high_protein' },
  { label: '30 minutes', maxCookTime: 30 },
  { label: 'Air fryer', equipment: 'air_fryer' },
  { label: 'Kid-mild', spiceLevel: 1 },
]

function initialForm(profile) {
  return {
    dietary: [],
    equipment: [],
    servings: profile?.default_servings ?? 4,
    maxCookTime: profile?.max_cook_time_min ?? 60,
    nutritionFocus: '',
    spiceLevel: profile?.spice_level ?? 2,
    excludeIngredients: '',
    preserveNote: '',
  }
}

function toggleValue(values, value) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value]
}

function commaSeparated(value) {
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean)
}

export default function AdaptComposer({ open, recipe, profile, busy, onClose, onAdapt }) {
  const [form, setForm] = useState(() => initialForm(profile))
  const firstFieldRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setForm(initialForm(profile))
    const focusFirstField = () => firstFieldRef.current?.focus()
    if (typeof window !== 'undefined' && window.requestAnimationFrame) {
      window.requestAnimationFrame(focusFirstField)
    } else {
      focusFirstField()
    }
  }, [open, profile, recipe])

  useEffect(() => {
    if (!open) return undefined
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open || !recipe) return null

  function setField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function applyQuickAdaptation(adaptation) {
    setForm((current) => {
      const next = { ...current }
      if (adaptation.dietary) next.dietary = toggleValue(current.dietary, adaptation.dietary)
      if (adaptation.nutritionFocus) next.nutritionFocus = adaptation.nutritionFocus
      if (adaptation.maxCookTime) next.maxCookTime = adaptation.maxCookTime
      if (adaptation.equipment) next.equipment = toggleValue(current.equipment, adaptation.equipment)
      if (adaptation.spiceLevel !== undefined) next.spiceLevel = adaptation.spiceLevel
      return next
    })
  }

  function submit(event) {
    event.preventDefault()
    onAdapt({
      dietary: form.dietary,
      equipment: form.equipment,
      servings: Number(form.servings),
      maxCookTime: Number(form.maxCookTime),
      spiceLevel: Number(form.spiceLevel),
      nutritionGoals: form.nutritionFocus ? { focus: form.nutritionFocus } : undefined,
      excludeIngredients: commaSeparated(form.excludeIngredients),
      preserve: form.preserveNote.trim() ? [form.preserveNote.trim()] : [],
    })
  }

  return (
    <div
      className="generation-composer-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section className="generation-composer-sheet" role="dialog" aria-modal="true" aria-labelledby="adapt-composer-title">
        <div className="generation-composer-header">
          <div>
            <p className="generation-composer-eyebrow">RecipeAdapt</p>
            <h2 id="adapt-composer-title">Make {recipe.name} work for you</h2>
            <p>Keep the dish recognizable while changing what does not fit your kitchen.</p>
          </div>
          <button type="button" className="generation-composer-close" aria-label="Close recipe adaptation" onClick={onClose}>×</button>
        </div>

        <div className="generation-composer-profile" role="status">
          <strong>Quick adaptations</strong>
          <div className="generation-composer-options">
            {QUICK_ADAPTATIONS.map((adaptation) => (
              <button
                key={adaptation.label}
                type="button"
                className="generation-composer-check"
                onClick={() => applyQuickAdaptation(adaptation)}
              >
                {adaptation.label}
              </button>
            ))}
          </div>
          {profile?.hard_allergens?.length > 0 && (
            <span className="generation-composer-safety">Hard allergens protected: {profile.hard_allergens.join(', ')}</span>
          )}
        </div>

        <form onSubmit={submit}>
          <fieldset>
            <legend>Constraints</legend>
            <div className="generation-composer-options">
              {DIET_OPTIONS.map(([value, label]) => (
                <label key={value} className="generation-composer-check">
                  <input
                    type="checkbox"
                    checked={form.dietary.includes(value)}
                    onChange={() => setField('dietary', toggleValue(form.dietary, value))}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="generation-composer-grid">
            <label>
              Servings
              <input ref={firstFieldRef} type="number" min="1" max="24" value={form.servings} onChange={(event) => setField('servings', event.target.value)} />
            </label>
            <label>
              Max time (minutes)
              <input type="number" min="5" max="720" value={form.maxCookTime} onChange={(event) => setField('maxCookTime', event.target.value)} />
            </label>
            <label>
              Nutrition focus
              <select value={form.nutritionFocus} onChange={(event) => setField('nutritionFocus', event.target.value)}>
                <option value="">No change</option>
                <option value="high_protein">Higher protein</option>
                <option value="low_sodium">Lower sodium</option>
                <option value="lower_carb">Lower carb</option>
              </select>
            </label>
            <label>
              Spice level (0–5)
              <input type="number" min="0" max="5" value={form.spiceLevel} onChange={(event) => setField('spiceLevel', event.target.value)} />
            </label>
          </div>

          <fieldset>
            <legend>Available equipment</legend>
            <div className="generation-composer-options">
              {EQUIPMENT_OPTIONS.map(([value, label]) => (
                <label key={value} className="generation-composer-check">
                  <input type="checkbox" checked={form.equipment.includes(value)} onChange={() => setField('equipment', toggleValue(form.equipment, value))} />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="generation-composer-field">
            Exclude ingredients
            <input type="text" value={form.excludeIngredients} onChange={(event) => setField('excludeIngredients', event.target.value)} placeholder="cilantro, mushrooms" />
          </label>
          <label className="generation-composer-field">
            Keep this detail
            <input type="text" value={form.preserveNote} onChange={(event) => setField('preserveNote', event.target.value)} placeholder="the miso glaze, crispy edges…" />
          </label>

          <p className="generation-composer-disclaimer">Adapted recipes include a change list and remain linked to the original. AI can make mistakes; always verify ingredients and labels.</p>
          <div className="generation-composer-actions">
            <button type="button" className="generation-composer-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="generation-composer-primary" disabled={busy}>{busy ? 'Adapting…' : 'Adapt recipe'}</button>
          </div>
        </form>
      </section>
    </div>
  )
}
