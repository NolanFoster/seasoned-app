import React, { useEffect, useRef, useState } from 'react'
import './PlanInterchange.css'
import {
  formatPlanInterchangeReport,
  parsePlanInterchange,
  serializeSeasonedWeekCsv,
  serializeSeasonedWeekJson,
} from '../../shared/plan-interchange.js'

export function downloadPlanFile(content, filename, type) {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return false
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
  return true
}

function describeError(error) {
  return error instanceof Error ? error.message : 'That week file could not be read.'
}

/**
 * Feature-flagged import/export surface for portable week plans. Parsing is
 * preview-first: the caller only receives a commit callback after the user has
 * seen the mapping report and the safety gate has passed.
 */
export default function PlanInterchangeModal({
  open,
  onClose,
  mealPlan,
  upNext,
  groceryList,
  hardAllergens = [],
  onCommit,
}) {
  const [input, setInput] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const dialogRef = useRef(null)
  const closeButtonRef = useRef(null)
  const previousFocusRef = useRef(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  useEffect(() => {
    if (!open) return
    setInput('')
    setResult(null)
    setError('')
    setBusy(false)
  }, [open])

  // This surface sits above the planner drawer, so it owns focus and Escape
  // while open rather than allowing the drawer's focus trap to compete with it.
  useEffect(() => {
    if (!open) return undefined
    previousFocusRef.current = document.activeElement
    closeButtonRef.current?.focus()
    const getFocusable = () => [...(dialogRef.current?.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    ) || [])]
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current?.()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = getFocusable()
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      const previous = previousFocusRef.current
      if (previous && document.contains(previous)) previous.focus()
    }
  }, [open])

  if (!open) return null

  function exportJson() {
    downloadPlanFile(
      serializeSeasonedWeekJson({ mealPlan, upNext, groceryList }),
      'seasoned-week.json',
      'application/json',
    )
  }

  function exportCsv() {
    downloadPlanFile(
      serializeSeasonedWeekCsv({ mealPlan, upNext, groceryList }),
      'seasoned-week.csv',
      'text/csv;charset=utf-8',
    )
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setBusy(true)
    setError('')
    try {
      setInput(await file.text())
      setResult(null)
    } catch (fileError) {
      setError(describeError(fileError))
    } finally {
      setBusy(false)
    }
  }

  function previewImport() {
    setError('')
    setResult(null)
    try {
      setResult(parsePlanInterchange(input, { hardAllergens }))
    } catch (parseError) {
      setError(describeError(parseError))
    }
  }

  function commitImport() {
    if (!result?.report?.canCommit) return
    onCommit?.(result)
    onClose?.()
  }

  const reportText = result ? formatPlanInterchangeReport(result.report) : ''

  return (
    <div className="plan-interchange-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="plan-interchange-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-interchange-title"
      >
        <header className="plan-interchange-header">
          <div>
            <h2 id="plan-interchange-title">Move a week</h2>
            <p>Import a user-provided week file or take your Seasoned plan with you.</p>
          </div>
          <button ref={closeButtonRef} type="button" className="drawer-close-btn" onClick={onClose} aria-label="Close move a week">
            ×
          </button>
        </header>

        <div className="plan-interchange-content">
          <div className="plan-interchange-export" aria-label="Export week">
            <strong>Export this week</strong>
            <span>JSON keeps the most detail; CSV is easiest to edit.</span>
            <div className="plan-interchange-actions">
              <button type="button" onClick={exportJson}>Download JSON</button>
              <button type="button" onClick={exportCsv}>Download CSV</button>
            </div>
          </div>

          <div className="plan-interchange-import">
            <label htmlFor="plan-interchange-file"><strong>Import a week</strong></label>
            <span>Seasoned JSON, CSV, schema.org Recipe ItemList, or the documented Cooklang bundle.</span>
            <input
              id="plan-interchange-file"
              type="file"
              accept=".json,.csv,.txt,application/json,text/csv,text/plain"
              onChange={handleFileChange}
              disabled={busy}
            />
            <label htmlFor="plan-interchange-paste">Or paste the file contents</label>
            <textarea
              id="plan-interchange-paste"
              value={input}
              onChange={(event) => { setInput(event.target.value); setResult(null); setError('') }}
              rows={8}
              placeholder="date,slot,title,servings,ingredients,notes,recipe_id"
            />
            <button type="button" className="plan-interchange-preview-btn" onClick={previewImport} disabled={!input.trim() || busy}>
              Preview import
            </button>
          </div>

          {error && <p className="plan-interchange-error" role="alert">{error}</p>}
          {result && (
            <div className={`plan-interchange-report${result.report.canCommit ? '' : ' is-blocked'}`} role="status">
              <strong>{result.report.canCommit ? 'Ready to import' : 'Import blocked'}</strong>
              <span>{reportText}</span>
              {result.report.blocked?.length > 0 && (
                <ul>
                  {result.report.blocked.map((item) => (
                    <li key={`${item.date || 'up-next'}:${item.title}`}>
                      {item.title}: {item.allergens.length > 0
                        ? `conflicts with ${item.allergens.join(', ')}`
                        : 'needs ingredient review before import'}
                    </li>
                  ))}
                </ul>
              )}
              {result.report.skipped?.length > 0 && (
                <details>
                  <summary>{result.report.skipped.length} skipped row{result.report.skipped.length === 1 ? '' : 's'}</summary>
                  <ul>{result.report.skipped.map((item) => <li key={`${item.sourceIndex}:${item.reason}`}>{item.reason}</li>)}</ul>
                </details>
              )}
            </div>
          )}
        </div>

        <footer className="plan-interchange-footer">
          <button type="button" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="plan-interchange-commit-btn"
            onClick={commitImport}
            disabled={!result?.report?.canCommit || result.report.mappedCount + result.report.partialCount === 0}
          >
            Replace current week
          </button>
        </footer>
      </section>
    </div>
  )
}
