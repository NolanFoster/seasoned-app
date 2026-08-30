import React, { useState } from 'react'
import { useFlag } from './flaggly.js'
import { DEFAULT_HOMES } from '../../shared/multi-home.js'

export default function MultiHomeCustodyModal({
  isOpen,
  onClose,
  activeHomeId = 'home-primary',
  onSelectHome,
}) {
  const multiHomeEnabled = useFlag('multi-home-custody')
  const [selectedHome, setSelectedHome] = useState(activeHomeId)

  if (!isOpen || !multiHomeEnabled) return null

  function handleSave(e) {
    e.preventDefault()
    onSelectHome(selectedHome)
    onClose()
  }

  return (
    <div className="multi-home-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="multi-home-title">
      <div className="multi-home-modal-card">
        <div className="multi-home-header">
          <div>
            <span className="multi-home-badge">🏡 Multi-Home Custody Rails</span>
            <h2 id="multi-home-title">Active Household Locus</h2>
          </div>
          <button type="button" className="multi-home-close-btn" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        <form onSubmit={handleSave} className="multi-home-body">
          <p className="multi-home-hint">
            Alternate pantry state, grocery planning, and equipment constraints based on co-parenting or dual-residence schedules. Child allergens synchronize automatically across all homes.
          </p>

          <h4>Select Active Cooking Home</h4>
          <div className="multi-home-options">
            {DEFAULT_HOMES.map((home) => (
              <label key={home.id} className={`multi-home-radio-card${selectedHome === home.id ? ' active' : ''}`}>
                <input
                  type="radio"
                  name="activeHome"
                  value={home.id}
                  checked={selectedHome === home.id}
                  onChange={() => setSelectedHome(home.id)}
                />
                <div className="multi-home-info">
                  <strong>{home.name}</strong>
                  <span>{home.id === 'home-primary' ? 'Primary Pantry & Staging' : 'Secondary Co-Parent Kitchen'}</span>
                </div>
              </label>
            ))}
          </div>

          <div className="multi-home-actions">
            <button type="submit" className="multi-home-save-btn">
              Switch Active Kitchen
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
