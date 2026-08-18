import React, { useState } from 'react'

/** The card renders ingredients and instructions as strings; edit them as strings. */
export function toEditableLines(values = []) {
  return values.map((value) => {
    if (typeof value === 'string') return value
    if (value && typeof value === 'object') return value.text || value.name || ''
    return String(value ?? '')
  })
}

export function recipeToForm(recipe = {}) {
  const ingredients = toEditableLines(recipe.ingredients || [])
  const instructions = toEditableLines(recipe.instructions || [])
  return {
    name: recipe.name || '',
    description: recipe.description || '',
    image: recipe.image || '',
    prep_time: recipe.prep_time || '',
    cook_time: recipe.cook_time || '',
    recipe_yield: recipe.recipe_yield || '',
    ingredients: ingredients.length ? ingredients : [''],
    instructions: instructions.length ? instructions : [''],
  }
}

/** Drop rows the user blanked out rather than saving empty steps. */
function cleanLines(lines) {
  return lines.map((line) => line.trim()).filter(Boolean)
}

export function formToRecipePatch(form) {
  return {
    name: form.name.trim(),
    description: form.description.trim(),
    image: form.image.trim(),
    prep_time: form.prep_time.trim(),
    cook_time: form.cook_time.trim(),
    recipe_yield: form.recipe_yield.trim(),
    ingredients: cleanLines(form.ingredients),
    instructions: cleanLines(form.instructions),
  }
}

function move(list, index, delta) {
  const target = index + delta
  if (target < 0 || target >= list.length) return list
  const next = [...list]
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item)
  return next
}

function ListEditor({ label, field, singular, placeholder, rows, values, onChange }) {
  return (
    <fieldset className="recipe-editor-list">
      <legend>{label}</legend>
      <ol>
        {values.map((value, index) => (
          <li key={`${field}-${index}`}>
            <label className="recipe-editor-visually-hidden" htmlFor={`${field}-${index}`}>
              {singular} {index + 1}
            </label>
            {rows > 1 ? (
              <textarea
                id={`${field}-${index}`}
                value={value}
                rows={rows}
                placeholder={placeholder}
                onChange={(event) => onChange(values.map((item, i) => i === index ? event.target.value : item))}
              />
            ) : (
              <input
                id={`${field}-${index}`}
                type="text"
                value={value}
                placeholder={placeholder}
                onChange={(event) => onChange(values.map((item, i) => i === index ? event.target.value : item))}
              />
            )}
            <div className="recipe-editor-row-actions">
              <button
                type="button"
                onClick={() => onChange(move(values, index, -1))}
                disabled={index === 0}
                aria-label={`Move ${singular.toLowerCase()} ${index + 1} up`}
              >↑</button>
              <button
                type="button"
                onClick={() => onChange(move(values, index, 1))}
                disabled={index === values.length - 1}
                aria-label={`Move ${singular.toLowerCase()} ${index + 1} down`}
              >↓</button>
              <button
                type="button"
                onClick={() => onChange(values.length === 1 ? [''] : values.filter((_, i) => i !== index))}
                aria-label={`Remove ${singular.toLowerCase()} ${index + 1}`}
              >×</button>
            </div>
          </li>
        ))}
      </ol>
      <button type="button" className="recipe-editor-add" onClick={() => onChange([...values, ''])}>
        Add {singular.toLowerCase()}
      </button>
    </fieldset>
  )
}

/**
 * Edit a saved recipe in place. The recipe record is shared, so this is only
 * offered for recipes already in the store — the save worker merges the patch
 * onto the stored version and re-indexes it for search.
 */
export default function RecipeEditor({ recipe, onSave, onClose }) {
  const [form, setForm] = useState(() => recipeToForm(recipe))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!form.name.trim()) {
      setMessage('A recipe needs a title.')
      return
    }
    setSaving(true)
    setMessage('')
    try {
      await onSave(formToRecipePatch(form))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save your changes.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="recipe-editor-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="recipe-editor-sheet" role="dialog" aria-modal="true" aria-labelledby="recipe-editor-title">
        <div className="recipe-editor-header">
          <div>
            <h2 id="recipe-editor-title">Edit recipe</h2>
            <p>Changes are saved to this recipe for everyone who opens it.</p>
          </div>
          <button type="button" className="recipe-editor-close" aria-label="Close editor" onClick={onClose}>×</button>
        </div>

        {message && <p className="recipe-editor-status" role="alert">{message}</p>}

        <form className="recipe-editor-form" onSubmit={handleSubmit}>
          <label className="recipe-editor-field recipe-editor-field--wide">Title
            <input
              type="text"
              value={form.name}
              onChange={(event) => updateField('name', event.target.value)}
              maxLength={300}
              autoFocus
            />
          </label>

          <label className="recipe-editor-field recipe-editor-field--wide">Description
            <textarea
              value={form.description}
              rows={3}
              onChange={(event) => updateField('description', event.target.value)}
            />
          </label>

          <div className="recipe-editor-grid">
            <label className="recipe-editor-field">Prep time
              <input
                type="text"
                value={form.prep_time}
                placeholder="PT20M or 20 min"
                onChange={(event) => updateField('prep_time', event.target.value)}
              />
            </label>
            <label className="recipe-editor-field">Cook time
              <input
                type="text"
                value={form.cook_time}
                placeholder="PT45M or 45 min"
                onChange={(event) => updateField('cook_time', event.target.value)}
              />
            </label>
            <label className="recipe-editor-field">Serves
              <input
                type="text"
                value={form.recipe_yield}
                placeholder="4"
                onChange={(event) => updateField('recipe_yield', event.target.value)}
              />
            </label>
          </div>

          <label className="recipe-editor-field recipe-editor-field--wide">Image URL
            <input
              type="url"
              value={form.image}
              placeholder="https://…"
              onChange={(event) => updateField('image', event.target.value)}
            />
          </label>

          <ListEditor
            label="Ingredients"
            field="recipe-editor-ingredient"
            singular="Ingredient"
            placeholder="2 cups flour"
            rows={1}
            values={form.ingredients}
            onChange={(values) => updateField('ingredients', values)}
          />

          <ListEditor
            label="Instructions"
            field="recipe-editor-instruction"
            singular="Step"
            placeholder="Preheat the oven to 200°C."
            rows={2}
            values={form.instructions}
            onChange={(values) => updateField('instructions', values)}
          />

          <div className="recipe-editor-actions">
            <button type="button" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="recipe-editor-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
