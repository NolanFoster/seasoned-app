import React, { useState } from 'react'
import { useFlag } from './flaggly.js'
import { EQUIPMENT, HARD_ALLERGENS } from '../../shared/culinary-profile.js'

export default function EphemeralKitchenModal({
  isOpen,
  onClose,
  activeOverlay,
  onSaveOverlay,
  onClearOverlay,
}) {
  const travelModeEnabled = useFlag('ephemeral-kitchen-mode')
  const [label, setLabel] = useState(activeOverlay?.label || 'Hotel / Airbnb Kitchen')
  const [selectedEquipment, setSelectedEquipment] = useState(activeOverlay?.equipment || ['stovetop', 'microwave'])
  const [hostAllergens, setHostAllergens] = useState(activeOverlay?.hostAllergens || [])

  if (!isOpen || !travelModeEnabled) return null

  function toggleEquipment(eq) {
    if (selectedEquipment.includes(eq)) {
      setSelectedEquipment(selectedEquipment.filter(item => item !== eq))
    } else {
      setSelectedEquipment([...selectedEquipment, eq])
    }
  }

  function toggleAllergen(all) {
    if (hostAllergens.includes(all)) {
      setHostAllergens(hostAllergens.filter(item => item !== all))
    } else {
      setHostAllergens([...hostAllergens, all])
    }
  }

  function handleSave(e) {
    e.preventDefault()
    onSaveOverlay({
      active: true,
      label: label.trim() || 'Travel Kitchen',
      equipment: selectedEquipment,
      hostAllergens,
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    })
    onClose()
  }

  return (
    <div className="travel-kitchen-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="travel-kitchen-title">
      <div className="travel-kitchen-modal-card">
        <div className="travel-kitchen-header">
          <div>
            <span className="travel-kitchen-badge">🧳 Ephemeral Travel Mode</span>
            <h2 id="travel-kitchen-title">Temporary Kitchen Overlay</h2>
          </div>
          <button type="button" className="travel-kitchen-close-btn" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        <form onSubmit={handleSave} className="travel-kitchen-body">
          <p className="travel-kitchen-hint">
            Staying in a hotel, Airbnb, RV, or visiting family? Restrict equipment and add temporary host allergens without polluting your permanent home profile.
          </p>

          <label htmlFor="travel-label">Location / Trip Name</label>
          <input
            id="travel-label"
            type="text"
            className="travel-kitchen-input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Lake Tahoe Airbnb"
            required
          />

          <h4>Available Appliances on Site</h4>
          <div className="travel-kitchen-chips">
            {EQUIPMENT.map((eq) => (
              <button
                key={eq}
                type="button"
                className={`travel-chip${selectedEquipment.includes(eq) ? ' active' : ''}`}
                onClick={() => toggleEquipment(eq)}
              >
                {eq.replace('_', ' ')}
              </button>
            ))}
          </div>

          <h4>Temporary Host Allergens</h4>
          <div className="travel-kitchen-chips">
            {HARD_ALLERGENS.map((all) => (
              <button
                key={all}
                type="button"
                className={`travel-chip${hostAllergens.includes(all) ? ' active' : ''}`}
                onClick={() => toggleAllergen(all)}
              >
                {all.replace('_', ' ')}
              </button>
            ))}
          </div>

          <div className="travel-kitchen-actions">
            {activeOverlay?.active && (
              <button
                type="button"
                className="travel-kitchen-clear-btn"
                onClick={() => {
                  onClearOverlay()
                  onClose()
                }}
              >
                Return to Home Profile
              </button>
            )}
            <button type="submit" className="travel-kitchen-save-btn">
              Activate Travel Overlay
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
