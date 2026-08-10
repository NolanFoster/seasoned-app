import React, { useEffect, useState } from 'react'
import { EMPTY_CULINARY_PROFILE } from './useCulinaryProfile.js'

const DIET_OPTIONS = [
  ['vegetarian', 'Vegetarian'],
  ['vegan', 'Vegan'],
  ['pescatarian', 'Pescatarian'],
  ['halal', 'Halal'],
  ['kosher', 'Kosher'],
  ['gluten_free', 'Gluten-free'],
  ['dairy_free', 'Dairy-free'],
]

const ALLERGEN_OPTIONS = [
  ['milk', 'Milk'],
  ['eggs', 'Eggs'],
  ['fish', 'Fish'],
  ['shellfish', 'Shellfish'],
  ['tree_nuts', 'Tree nuts'],
  ['peanuts', 'Peanuts'],
  ['wheat', 'Wheat'],
  ['soy', 'Soy'],
  ['sesame', 'Sesame'],
]

const HARD_ALLERGEN_VALUES = new Set(ALLERGEN_OPTIONS.map(([value]) => value))

const EQUIPMENT_OPTIONS = [
  ['oven', 'Oven'],
  ['stovetop', 'Stovetop'],
  ['air_fryer', 'Air fryer'],
  ['instant_pot', 'Instant Pot'],
  ['slow_cooker', 'Slow cooker'],
  ['grill', 'Grill'],
  ['blender', 'Blender'],
]

function listValue(value) {
  return Array.isArray(value) ? value.join(', ') : ''
}

function parseList(value) {
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

function toFormState(profile) {
  const value = { ...EMPTY_CULINARY_PROFILE, ...(profile || {}) }
  return {
    ...value,
    diet_tags: Array.isArray(value.diet_tags) ? value.diet_tags : [],
    hard_allergens: Array.isArray(value.hard_allergens) ? value.hard_allergens : [],
    hard_allergens_text: Array.isArray(value.hard_allergens)
      ? value.hard_allergens.filter((item) => !HARD_ALLERGEN_VALUES.has(item)).join(', ')
      : '',
    equipment: Array.isArray(value.equipment) ? value.equipment : [],
    soft_avoids_text: listValue(value.soft_avoids),
    cuisine_likes_text: listValue(value.cuisine_likes),
    cuisine_dislikes_text: listValue(value.cuisine_dislikes),
    exclude_ingredients_text: listValue(value.exclude_ingredients),
  }
}

function toggleValue(values, value) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
}

export default function CulinaryProfile({ open, profile, loading, saving, error, onSave, onClose }) {
  const [form, setForm] = useState(() => toFormState(profile))

  useEffect(() => {
    if (open && profile) setForm(toFormState(profile))
  }, [open, profile])

  if (!open) return null

  function setField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function submit(event) {
    event.preventDefault()
    await onSave({
      diet_tags: form.diet_tags,
      hard_allergens: [...form.hard_allergens, ...parseList(form.hard_allergens_text)],
      soft_avoids: parseList(form.soft_avoids_text),
      cuisine_likes: parseList(form.cuisine_likes_text),
      cuisine_dislikes: parseList(form.cuisine_dislikes_text),
      spice_level: Number(form.spice_level),
      skill_level: form.skill_level,
      default_servings: Number(form.default_servings),
      max_cook_time_min: Number(form.max_cook_time_min),
      equipment: form.equipment,
      units_pref: form.units_pref,
      exclude_ingredients: parseList(form.exclude_ingredients_text),
      notes_freeform: form.notes_freeform,
      consent_flags: form.consent_flags,
    })
    onClose()
  }

  return (
    <div className="culinary-profile-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="culinary-profile-sheet" role="dialog" aria-modal="true" aria-labelledby="culinary-profile-title">
        <div className="culinary-profile-header">
          <div>
            <h2 id="culinary-profile-title">Kitchen profile</h2>
            <p>Save your preferences once and use them across your kitchen.</p>
          </div>
          <button type="button" className="culinary-profile-close" aria-label="Close kitchen profile" onClick={onClose}>×</button>
        </div>

        {loading ? <p className="culinary-profile-status">Loading your profile…</p> : (
          <form onSubmit={submit}>
            <fieldset>
              <legend>Diet</legend>
              <div className="culinary-profile-options">
                {DIET_OPTIONS.map(([value, label]) => (
                  <label key={value} className="culinary-profile-check">
                    <input
                      type="checkbox"
                      checked={form.diet_tags.includes(value)}
                      onChange={() => setField('diet_tags', toggleValue(form.diet_tags, value))}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend>Hard allergens <span>(we will never intentionally suggest these)</span></legend>
              <div className="culinary-profile-options">
                {ALLERGEN_OPTIONS.map(([value, label]) => (
                  <label key={value} className="culinary-profile-check">
                    <input
                      type="checkbox"
                      checked={form.hard_allergens.includes(value)}
                      onChange={() => setField('hard_allergens', toggleValue(form.hard_allergens, value))}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <label className="culinary-profile-field culinary-profile-field--inline">Other allergens
                <input value={form.hard_allergens_text} onChange={(event) => setField('hard_allergens_text', event.target.value)} placeholder="Add custom allergens, comma separated" />
              </label>
            </fieldset>

            <div className="culinary-profile-grid">
              <label>Cooking skill
                <select value={form.skill_level} onChange={(event) => setField('skill_level', event.target.value)}>
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </label>
              <label>Default servings
                <input type="number" min="1" max="24" value={form.default_servings} onChange={(event) => setField('default_servings', event.target.value)} />
              </label>
              <label>Weeknight limit (minutes)
                <input type="number" min="5" max="720" value={form.max_cook_time_min} onChange={(event) => setField('max_cook_time_min', event.target.value)} />
              </label>
              <label>Units
                <select value={form.units_pref} onChange={(event) => setField('units_pref', event.target.value)}>
                  <option value="us">US</option>
                  <option value="metric">Metric</option>
                </select>
              </label>
            </div>

            <fieldset>
              <legend>Equipment</legend>
              <div className="culinary-profile-options">
                {EQUIPMENT_OPTIONS.map(([value, label]) => (
                  <label key={value} className="culinary-profile-check">
                    <input
                      type="checkbox"
                      checked={form.equipment.includes(value)}
                      onChange={() => setField('equipment', toggleValue(form.equipment, value))}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="culinary-profile-field">Avoids and dislikes
              <input value={form.soft_avoids_text} onChange={(event) => setField('soft_avoids_text', event.target.value)} placeholder="cilantro, very spicy (comma separated)" />
            </label>
            <label className="culinary-profile-field">Favorite cuisines
              <input value={form.cuisine_likes_text} onChange={(event) => setField('cuisine_likes_text', event.target.value)} placeholder="Thai, Mexican" />
            </label>
            <label className="culinary-profile-field">Chef notes
              <textarea value={form.notes_freeform} maxLength="500" onChange={(event) => setField('notes_freeform', event.target.value)} placeholder="Anything useful to your future self" rows="2" />
            </label>

            {error && <p className="culinary-profile-error" role="alert">{error}</p>}
            <div className="culinary-profile-actions">
              <button type="button" className="culinary-profile-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="culinary-profile-primary" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button>
            </div>
          </form>
        )}
      </section>
    </div>
  )
}
