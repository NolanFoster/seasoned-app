import React, { useEffect, useState } from 'react'

const MAX_PHOTO_BYTES = 10 * 1024 * 1024
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const LOCATIONS = ['fridge', 'freezer', 'pantry', 'other']
const LOCATION_LABELS = {
  fridge: 'Fridge',
  freezer: 'Freezer',
  pantry: 'Pantry',
  other: 'Other',
}

export function validatePantryPhotoFile(file) {
  if (!file) return 'Choose a pantry photo first.'
  if (!file.size) return 'The pantry photo is empty.'
  if (file.size > MAX_PHOTO_BYTES) return 'Pantry photos must be 10 MB or smaller.'
  if (!IMAGE_TYPES.has(String(file.type || '').toLowerCase())) return 'Use a JPG, PNG, or WebP pantry photo.'
  return ''
}

function normalizedCandidate(item, index) {
  return {
    id: `${item.name || 'item'}-${index}`,
    name: String(item.name || '').trim(),
    quantity: item.quantity === null || item.quantity === undefined ? '' : item.quantity,
    unit: item.unit || '',
    location: LOCATIONS.includes(item.location) ? item.location : 'other',
    expiresOn: '',
    confidence: Number.isFinite(Number(item.confidence)) ? Number(item.confidence) : 0.5,
    selected: true,
  }
}

export default function PantryPhotoScan({ open, onScan, onAdd, onClose }) {
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [candidates, setCandidates] = useState([])
  const [status, setStatus] = useState('')
  const [working, setWorking] = useState(false)

  useEffect(() => {
    if (!open) {
      setFile(null)
      setCandidates([])
      setStatus('')
      setWorking(false)
      setPreviewUrl('')
    }
  }, [open])

  useEffect(() => () => {
    if (previewUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  if (!open) return null

  function selectFile(event) {
    const nextFile = event.target.files?.[0] || null
    const error = validatePantryPhotoFile(nextFile)
    setStatus(error)
    setCandidates([])
    if (error) {
      setFile(null)
      setPreviewUrl('')
      return
    }
    setFile(nextFile)
    setPreviewUrl(typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(nextFile) : '')
  }

  async function scan() {
    const error = validatePantryPhotoFile(file)
    if (error) {
      setStatus(error)
      return
    }
    setWorking(true)
    setStatus('Scanning this photo…')
    try {
      const result = await onScan(file)
      const nextCandidates = (Array.isArray(result) ? result : [])
        .map(normalizedCandidate)
        .filter((item) => item.name)
      setCandidates(nextCandidates)
      setStatus(nextCandidates.length ? 'Review each estimate before adding it to your pantry.' : 'No food items were detected. Try a clearer photo.')
    } catch (scanError) {
      setStatus(scanError instanceof Error ? scanError.message : 'Could not scan that photo. Try another image.')
    } finally {
      setWorking(false)
    }
  }

  function updateCandidate(index, field, value) {
    setCandidates((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item))
  }

  async function addSelected() {
    const selected = candidates.filter((item) => item.selected && item.name.trim())
    if (!selected.length) {
      setStatus('Select at least one detected item to add.')
      return
    }
    setWorking(true)
    setStatus('Adding selected items…')
    try {
      for (const item of selected) {
        await onAdd({
          name: item.name.trim(),
          quantity: item.quantity === '' ? null : Number(item.quantity),
          unit: item.unit.trim() || null,
          location: item.location,
          expiresOn: null,
          tags: [],
        })
      }
      setStatus(`${selected.length} item${selected.length === 1 ? '' : 's'} added to your pantry.`)
      setCandidates([])
      setFile(null)
      setPreviewUrl('')
    } catch {
      setStatus('Some items could not be added. Review the list and try again.')
    } finally {
      setWorking(false)
    }
  }

  return (
    <section className="pantry-scan" aria-labelledby="pantry-scan-title">
      <div className="pantry-scan-heading">
        <div>
          <h3 id="pantry-scan-title">Scan a pantry photo</h3>
          <p>We’ll suggest visible ingredients and quantities. Photos are processed ephemerally and are not saved.</p>
        </div>
        <button type="button" className="pantry-form-cancel" onClick={onClose} disabled={working}>Close scan</button>
      </div>

      <label className="pantry-scan-upload">
        <span>Choose a fridge, freezer, or pantry photo</span>
        <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={selectFile} disabled={working} />
      </label>
      {previewUrl && <img className="pantry-scan-preview" src={previewUrl} alt="Selected pantry photo preview" />}
      {file && <p className="pantry-scan-file">{file.name} · {Math.ceil(file.size / 1024)} KB</p>}
      {status && <p className="pantry-status" role="status">{status}</p>}

      <div className="pantry-scan-actions">
        <button type="button" className="pantry-leftovers" onClick={scan} disabled={!file || working}>{working ? 'Working…' : 'Scan photo'}</button>
        {candidates.length > 0 && <button type="button" className="pantry-primary" onClick={addSelected} disabled={working}>Add selected items</button>}
      </div>

      {candidates.length > 0 && (
        <div className="pantry-scan-results">
          <h4>Review detected items</h4>
          <p className="pantry-help">Every result is an estimate. Confirm names, quantities, and locations before saving.</p>
          <ul>
            {candidates.map((item, index) => (
              <li key={item.id} className="pantry-scan-result">
                <label className="pantry-scan-check">
                  <input type="checkbox" checked={item.selected} onChange={(event) => updateCandidate(index, 'selected', event.target.checked)} />
                  <span>Include</span>
                </label>
                <div className="pantry-scan-fields">
                  <label className="pantry-field">Ingredient
                    <input type="text" value={item.name} onChange={(event) => updateCandidate(index, 'name', event.target.value)} maxLength={200} />
                  </label>
                  <label className="pantry-field">Quantity
                    <input type="number" min="0" step="any" value={item.quantity} onChange={(event) => updateCandidate(index, 'quantity', event.target.value)} />
                  </label>
                  <label className="pantry-field">Unit
                    <input type="text" value={item.unit} onChange={(event) => updateCandidate(index, 'unit', event.target.value)} maxLength={40} />
                  </label>
                  <label className="pantry-field">Location
                    <select value={item.location} onChange={(event) => updateCandidate(index, 'location', event.target.value)}>
                      {LOCATIONS.map((location) => <option key={location} value={location}>{LOCATION_LABELS[location]}</option>)}
                    </select>
                  </label>
                </div>
                <span className="pantry-scan-confidence">Estimate confidence: {Math.round(Math.max(0, Math.min(1, item.confidence)) * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
