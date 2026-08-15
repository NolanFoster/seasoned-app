import React, { useEffect, useMemo, useState } from 'react'
import { PANTRY_LOCATIONS } from './usePantry.js'

const LOCATION_LABELS = {
  fridge: 'Fridge',
  freezer: 'Freezer',
  pantry: 'Pantry',
  other: 'Other',
}

const EMPTY_FORM = {
  name: '',
  quantity: '',
  unit: '',
  location: 'pantry',
  expiresOn: '',
  tags: '',
}

const KNOWN_UNITS = new Set([
  'bag', 'bags', 'bottle', 'bottles', 'box', 'boxes', 'can', 'cans', 'cup', 'cups',
  'g', 'gram', 'grams', 'kg', 'lb', 'lbs', 'ounce', 'ounces', 'oz', 'pinch', 'pound',
  'pounds', 'tbsp', 'tablespoon', 'tablespoons', 'tsp', 'teaspoon', 'teaspoons',
])

function parseQuantity(value) {
  const parts = value.trim().split(/\s+/)
  if (parts.length === 2 && parts[1].includes('/')) {
    const whole = Number(parts[0])
    const [numerator, denominator] = parts[1].split('/').map(Number)
    if (Number.isFinite(whole) && denominator) return whole + numerator / denominator
  }
  if (value.includes('/')) {
    const [numerator, denominator] = value.split('/').map(Number)
    if (denominator) return numerator / denominator
  }
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function parsePantryIngredient(ingredient) {
  if (ingredient && typeof ingredient === 'object') {
    return {
      name: String(ingredient.name || ingredient.ingredient || ingredient.text || '').trim(),
      quantity: ingredient.quantity ?? '',
      unit: ingredient.unit || '',
    }
  }
  const value = String(ingredient || '').trim()
  const match = value.match(/^((?:\d+\s+)?\d+(?:\.\d+)?(?:\/\d+)?)\s+([a-zA-Z]+)\s+(.+)$/)
  if (!match || !KNOWN_UNITS.has(match[2].toLowerCase())) return { name: value, quantity: '', unit: '' }
  return { name: match[3].trim(), quantity: parseQuantity(match[1]) ?? '', unit: match[2].toLowerCase() }
}

function formFromItem(item) {
  return {
    name: item.name || '',
    quantity: item.quantity ?? '',
    unit: item.unit || '',
    location: item.location || 'pantry',
    expiresOn: item.expiresOn || item.expires_on || '',
    tags: Array.isArray(item.tags) ? item.tags.join(', ') : '',
  }
}

function inputFromForm(form) {
  return {
    name: form.name.trim(),
    quantity: form.quantity === '' ? null : Number(form.quantity),
    unit: form.unit.trim() || null,
    location: form.location,
    expiresOn: form.expiresOn || null,
    tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
  }
}

function expiryState(value) {
  if (!value) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expiry = new Date(`${value}T00:00:00`)
  const days = Math.ceil((expiry.getTime() - today.getTime()) / 86400000)
  if (days < 0) return 'expired'
  if (days <= 7) return 'soon'
  return null
}

function itemLabel(item) {
  const quantity = item.quantity === null || item.quantity === undefined || item.quantity === ''
    ? ''
    : `${item.quantity}${item.unit ? ` ${item.unit}` : ''}`
  return [quantity, item.name].filter(Boolean).join(' ')
}

export default function PantryModal({
  open,
  items = [],
  loading = false,
  syncError = '',
  activeRecipe = null,
  onAdd,
  onUpdate,
  onRemove,
  onClose,
}) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [message, setMessage] = useState('')
  const [working, setWorking] = useState(false)

  useEffect(() => {
    if (!open) {
      setEditingId(null)
      setForm(EMPTY_FORM)
      setMessage('')
    }
  }, [open])

  const groupedItems = useMemo(() => PANTRY_LOCATIONS
    .map((location) => ({
      location,
      items: items.filter((item) => item.location === location),
    }))
    .filter((group) => group.items.length > 0), [items])

  if (!open) return null

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function beginEdit(item) {
    setEditingId(item.id)
    setForm(formFromItem(item))
    setMessage('')
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setMessage('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!form.name.trim()) {
      setMessage('Add an ingredient name first.')
      return
    }
    setWorking(true)
    setMessage('')
    try {
      if (editingId !== null) await onUpdate(editingId, inputFromForm(form))
      else await onAdd(inputFromForm(form))
      cancelEdit()
    } catch {
      setMessage('Could not sync that pantry change. It is still available locally.')
    } finally {
      setWorking(false)
    }
  }

  async function addRecipeIngredients() {
    const ingredients = activeRecipe?.ingredients || []
    if (!ingredients.length) return
    setWorking(true)
    setMessage('')
    try {
      for (const ingredient of ingredients) {
        const parsed = parsePantryIngredient(ingredient)
        if (parsed.name) await onAdd({ ...parsed, location: 'pantry' })
      }
      setMessage(`${ingredients.length} ingredient${ingredients.length === 1 ? '' : 's'} added to your pantry.`)
    } catch {
      setMessage('Some ingredients were saved locally and will sync when available.')
    } finally {
      setWorking(false)
    }
  }

  async function handleRemove(item) {
    try {
      await onRemove(item.id)
    } catch {
      setMessage('Could not sync the removal. The item was restored.')
    }
  }

  return (
    <div className="pantry-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="pantry-sheet" role="dialog" aria-modal="true" aria-labelledby="pantry-title">
        <div className="pantry-header">
          <div>
            <h2 id="pantry-title">My pantry</h2>
            <p>Keep track of what you have so future planning can start with your kitchen.</p>
          </div>
          <button type="button" className="pantry-close" aria-label="Close pantry" onClick={onClose}>×</button>
        </div>

        {syncError && <p className="pantry-status pantry-status--offline" role="status">Working offline: {syncError}</p>}
        {message && <p className="pantry-status" role="status">{message}</p>}

        {activeRecipe?.ingredients?.length > 0 && (
          <button type="button" className="pantry-leftovers" onClick={addRecipeIngredients} disabled={working}>
            Add leftovers from “{activeRecipe.name || 'this recipe'}”
          </button>
        )}

        <form className="pantry-form" onSubmit={handleSubmit}>
          <div className="pantry-form-heading">
            <h3>{editingId === null ? 'Add an item' : 'Edit item'}</h3>
            {editingId !== null && <button type="button" className="pantry-form-cancel" onClick={cancelEdit}>Cancel edit</button>}
          </div>
          <label className="pantry-field pantry-field--wide">Ingredient
            <input autoFocus={editingId === null} type="text" value={form.name} onChange={(event) => updateField('name', event.target.value)} placeholder="e.g. chickpeas" maxLength={200} />
          </label>
          <div className="pantry-form-grid">
            <label className="pantry-field">Quantity
              <input type="number" min="0" step="any" value={form.quantity} onChange={(event) => updateField('quantity', event.target.value)} placeholder="Optional" />
            </label>
            <label className="pantry-field">Unit
              <input type="text" value={form.unit} onChange={(event) => updateField('unit', event.target.value)} placeholder="can, cup…" maxLength={40} />
            </label>
            <label className="pantry-field">Location
              <select value={form.location} onChange={(event) => updateField('location', event.target.value)}>
                {PANTRY_LOCATIONS.map((location) => <option key={location} value={location}>{LOCATION_LABELS[location]}</option>)}
              </select>
            </label>
            <label className="pantry-field">Use by
              <input type="date" value={form.expiresOn} onChange={(event) => updateField('expiresOn', event.target.value)} />
            </label>
          </div>
          <label className="pantry-field pantry-field--wide">Tags <span className="pantry-help">comma separated</span>
            <input type="text" value={form.tags} onChange={(event) => updateField('tags', event.target.value)} placeholder="breakfast, staple" />
          </label>
          <button type="submit" className="pantry-primary" disabled={working}>{working ? 'Saving…' : editingId === null ? 'Add to pantry' : 'Save changes'}</button>
        </form>

        <div className="pantry-list" aria-live="polite">
          <div className="pantry-list-heading"><h3>On hand</h3><span>{items.length} item{items.length === 1 ? '' : 's'}</span></div>
          {loading ? <p className="pantry-empty">Loading your pantry…</p> : groupedItems.length === 0 ? (
            <div className="pantry-empty">
              <strong>Your pantry is empty</strong>
              <p>Add a few staples above, or add ingredients from the open recipe.</p>
            </div>
          ) : groupedItems.map((group) => (
            <section key={group.location} className="pantry-group" aria-labelledby={`pantry-group-${group.location}`}>
              <h4 id={`pantry-group-${group.location}`}>{LOCATION_LABELS[group.location]}</h4>
              <ul>
                {group.items.map((item) => {
                  const expiry = item.expiresOn || item.expires_on
                  const state = expiryState(expiry)
                  return (
                    <li key={item.id} className="pantry-item">
                      <div className="pantry-item-copy">
                        <strong>{itemLabel(item)}</strong>
                        <span>{item.tags?.join(' · ') || 'No tags'}</span>
                        {expiry && <small className={`pantry-expiry pantry-expiry--${state || 'normal'}`}>{state === 'expired' ? 'Expired' : state === 'soon' ? 'Use soon' : 'Use by'} {expiry}</small>}
                      </div>
                      <div className="pantry-item-actions">
                        <button type="button" onClick={() => beginEdit(item)} aria-label={`Edit ${item.name}`}>Edit</button>
                        <button type="button" onClick={() => handleRemove(item)} aria-label={`Remove ${item.name}`}>Remove</button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      </section>
    </div>
  )
}
