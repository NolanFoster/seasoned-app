import React, { useState } from 'react'
import { useFlag } from './flaggly.js'
import { parseProduceBoxLines } from '../../shared/produce-box-intake.js'

export default function ProduceBoxIntakeModal({
  isOpen,
  onClose,
  onImportToPantry,
}) {
  const csaIntakeEnabled = useFlag('csa-produce-intake')
  const [rawText, setRawText] = useState('')
  const [parsedItems, setParsedItems] = useState([])
  const [step, setStep] = useState('input') // 'input' | 'review'

  if (!isOpen || !csaIntakeEnabled) return null

  function handleParse(e) {
    e.preventDefault()
    if (!rawText.trim()) return
    const items = parseProduceBoxLines(rawText)
    setParsedItems(items)
    setStep('review')
  }

  function handleCommit() {
    onImportToPantry(parsedItems)
    onClose()
  }

  return (
    <div className="csa-intake-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="csa-intake-title">
      <div className="csa-intake-modal-card">
        <div className="csa-intake-header">
          <div>
            <span className="csa-intake-badge">🌾 Farmers Market & CSA</span>
            <h2 id="csa-intake-title">Produce Box Intake</h2>
          </div>
          <button type="button" className="csa-intake-close-btn" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        <div className="csa-intake-body">
          {step === 'input' ? (
            <form onSubmit={handleParse} className="csa-intake-form">
              <p className="csa-intake-hint">
                Paste your weekly share email, farmers market list, or produce haul. We'll identify items, storage tips, and shelf-life urgency.
              </p>
              <textarea
                className="csa-intake-textarea"
                placeholder="e.g.&#10;1 bunch Garlic Scapes&#10;Bok Choy&#10;Heirloom Tomatoes&#10;Kohlrabi"
                rows={6}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                required
              />
              <div className="csa-intake-actions">
                <button type="submit" className="csa-intake-submit-btn">Parse Produce Haul →</button>
              </div>
            </form>
          ) : (
            <div className="csa-intake-review">
              <h3>Identified Produce ({parsedItems.length})</h3>
              <div className="csa-items-list">
                {parsedItems.map((item, idx) => (
                  <div key={idx} className="csa-item-card">
                    <div className="csa-item-header">
                      <strong>{item.name}</strong>
                      <span className="csa-item-shelf-life">⏱️ ~{item.shelfLifeDays} days shelf-life</span>
                    </div>
                    <p className="csa-item-storage">💡 <strong>Storage:</strong> {item.storageTip}</p>
                  </div>
                ))}
              </div>
              <div className="csa-intake-actions">
                <button type="button" className="csa-intake-back-btn" onClick={() => setStep('input')}>← Back</button>
                <button type="button" className="csa-intake-submit-btn" onClick={handleCommit}>Add to Pantry & Plan</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
