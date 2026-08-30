import React, { useState } from 'react'
import { useFlag } from './flaggly.js'
import { reconcileGroceryArrival, RECONCILE_DIFF_TYPES } from '../../shared/grocery-reconciliation.js'

export default function ArrivalReconciliationModal({
  isOpen,
  onClose,
  orderedItems = [],
  onCommitArrival,
  hardAllergens = [],
}) {
  const reconcileEnabled = useFlag('arrival-reconciliation')
  const [arrivedText, setArrivedText] = useState('')
  const [diffs, setDiffs] = useState([])
  const [step, setStep] = useState('input') // 'input' | 'review'

  if (!isOpen || !reconcileEnabled) return null

  function handleReconcile(e) {
    e.preventDefault()
    const arrivedLines = arrivedText
      .split('\n')
      .map((l) => l.trim().replace(/^[-*•\d.)]+\s*/, ''))
      .filter(Boolean)
      .map((name) => ({ name }))

    const computedDiffs = reconcileGroceryArrival(orderedItems, arrivedLines, { hardAllergens })
    setDiffs(computedDiffs)
    setStep('review')
  }

  function handleAccept() {
    onCommitArrival(diffs)
    onClose()
  }

  const hasAllergenHazard = diffs.some((d) => d.allergenConflict)

  return (
    <div className="arrival-reconcile-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="arrival-reconcile-title">
      <div className="arrival-reconcile-modal-card">
        <div className="arrival-reconcile-header">
          <div>
            <span className="arrival-reconcile-badge">📦 Delivery Arrival</span>
            <h2 id="arrival-reconcile-title">Reconcile Grocery Order</h2>
          </div>
          <button type="button" className="arrival-reconcile-close-btn" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        <div className="arrival-reconcile-body">
          {step === 'input' ? (
            <form onSubmit={handleReconcile} className="arrival-reconcile-form">
              <p className="arrival-reconcile-hint">
                Paste your delivery receipt or unpacked grocery items to detect substitutions, missing staples, and allergen conflicts.
              </p>
              <textarea
                className="arrival-reconcile-textarea"
                rows={6}
                placeholder="Paste arrived items here..."
                value={arrivedText}
                onChange={(e) => setArrivedText(e.target.value)}
                required
              />
              <div className="arrival-reconcile-actions">
                <button type="submit" className="arrival-reconcile-submit-btn">
                  Check Order & Substitutions →
                </button>
              </div>
            </form>
          ) : (
            <div className="arrival-reconcile-review">
              {hasAllergenHazard && (
                <div className="arrival-allergen-alert" role="alert">
                  <strong>🚨 Allergen Conflict Detected:</strong> A substituted item conflicts with household hard allergen rules!
                </div>
              )}

              <div className="arrival-diffs-list">
                {diffs.map((diff, idx) => (
                  <div
                    key={idx}
                    className={`arrival-diff-card arrival-diff-card--${diff.type}${diff.allergenConflict ? ' allergen-conflict' : ''}`}
                  >
                    <div className="arrival-diff-badge">{diff.type.toUpperCase()}</div>
                    <div className="arrival-diff-content">
                      {diff.type === RECONCILE_DIFF_TYPES.MATCH && (
                        <span>✓ <strong>{diff.orderedName}</strong> arrived as expected</span>
                      )}
                      {diff.type === RECONCILE_DIFF_TYPES.SUBSTITUTION && (
                        <span>
                          ⚠️ <strong>{diff.orderedName}</strong> substituted with <em>{diff.arrivedName}</em>
                        </span>
                      )}
                      {diff.type === RECONCILE_DIFF_TYPES.MISSING && (
                        <span>❌ <strong>{diff.orderedName}</strong> was out-of-stock / missing</span>
                      )}
                      {diff.type === RECONCILE_DIFF_TYPES.EXTRA && (
                        <span>➕ <strong>{diff.arrivedName}</strong> (Extra item)</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="arrival-reconcile-actions">
                <button type="button" className="arrival-reconcile-back-btn" onClick={() => setStep('input')}>
                  ← Re-edit
                </button>
                <button
                  type="button"
                  className="arrival-reconcile-submit-btn"
                  onClick={handleAccept}
                  disabled={hasAllergenHazard}
                >
                  {hasAllergenHazard ? 'Resolve Allergen First' : 'Confirm & Update Pantry'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
