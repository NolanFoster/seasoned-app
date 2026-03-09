import React, { useState, useEffect, useRef } from 'react'

// ── Normalization helpers ─────────────────────────────────────────────────────

function normalizeIngredients(ingredients) {
  if (!Array.isArray(ingredients)) return []
  return ingredients.map((ing) => {
    if (typeof ing === 'string') return ing
    return ing.name || ing.text || JSON.stringify(ing)
  })
}

function normalizeInstructions(instructions) {
  if (!Array.isArray(instructions)) return []
  return instructions.map((inst) => {
    if (typeof inst === 'string') return inst
    return inst.text || inst.name || JSON.stringify(inst)
  })
}

// ── Timer parsing ─────────────────────────────────────────────────────────────

const TIME_REGEX = /(\d+)(?:-(\d+))?\s*(second|minute|min|hour|hr)s?/gi

function parseTimeToSeconds(value, rangeMax, unit) {
  const n = rangeMax != null ? parseInt(rangeMax) : parseInt(value)
  const u = unit.toLowerCase()
  if (u === 'second') return n
  if (u === 'minute' || u === 'min') return n * 60
  if (u === 'hour' || u === 'hr') return n * 3600
  return n * 60
}

// Returns [{startIndex, endIndex, label, seconds}]
function parseStepTimers(stepText) {
  const results = []
  TIME_REGEX.lastIndex = 0
  let m
  while ((m = TIME_REGEX.exec(stepText)) !== null) {
    const [full, val, rangeMax, unit] = m
    const seconds = parseTimeToSeconds(val, rangeMax || null, unit)
    results.push({
      startIndex: m.index,
      endIndex: m.index + full.length,
      label: full,
      seconds,
    })
  }
  return results
}

// Returns React nodes — text split around timer <button> elements
function renderStepWithTimers(stepText, stepIndex, activeTimers, onTimerStart) {
  const timers = parseStepTimers(stepText)
  if (timers.length === 0) return stepText

  const nodes = []
  let cursor = 0
  timers.forEach((t, matchIdx) => {
    if (t.startIndex > cursor) {
      nodes.push(stepText.slice(cursor, t.startIndex))
    }
    const id = `timer-${stepIndex}-${matchIdx}`
    const isActive = id in activeTimers
    nodes.push(
      <button
        key={id}
        id={id}
        className={`cn-timer-btn${isActive ? ' cn-timer-btn--active' : ''}`}
        disabled={isActive}
        onClick={() => !isActive && onTimerStart(id, t.label, t.seconds)}
        title={isActive ? 'Timer running' : `Start ${t.label} timer`}
      >
        ⏱ {t.label}
      </button>
    )
    cursor = t.endIndex
  })
  if (cursor < stepText.length) {
    nodes.push(stepText.slice(cursor))
  }
  return nodes
}

// ── Ingredient matching ───────────────────────────────────────────────────────

const QUANTITY_TOKENS = /^(\d+[\d/.,]*|[¼½¾⅓⅔⅛⅜⅝⅞]|tbsp|tsp|cup|oz|lb|g|kg|ml|l|liter|litre|tablespoon|teaspoon|pinch|handful|bunch|clove|cloves|can|cans|slice|slices|piece|pieces|sprig|sprigs)s?$/i

function matchIngredientsToStep(ingredients, stepText) {
  const lower = stepText.toLowerCase()
  return ingredients.map((ing) => {
    const tokens = ing.toLowerCase().split(/\s+/)
    // Drop leading quantity/unit tokens
    const nameTokens = tokens.filter((t) => !QUANTITY_TOKENS.test(t))
    const relevant =
      nameTokens.length > 0 &&
      nameTokens.some((token) => token.length > 2 && lower.includes(token))
    return { text: ing, relevant }
  })
}

// ── Utility ───────────────────────────────────────────────────────────────────

function formatTime(secs) {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CookingNavigator({ recipe, onClose }) {
  const instructions = normalizeInstructions(recipe.instructions)
  const ingredients = normalizeIngredients(recipe.ingredients)
  const total = instructions.length

  const [currentStep, setCurrentStep] = useState(0)
  const [activeTimers, setActiveTimers] = useState({}) // { id: { label, totalSeconds, remainingSeconds, isPaused, isDone } }
  const timerIntervalsRef = useRef({}) // { id: intervalId }

  // Cleanup all intervals on unmount
  useEffect(() => {
    return () => {
      Object.values(timerIntervalsRef.current).forEach(clearInterval)
    }
  }, [])

  function startInterval(id) {
    clearInterval(timerIntervalsRef.current[id])
    timerIntervalsRef.current[id] = setInterval(() => {
      setActiveTimers((prev) => {
        const timer = prev[id]
        if (!timer) return prev
        const next = timer.remainingSeconds - 1
        if (next <= 0) {
          clearInterval(timerIntervalsRef.current[id])
          delete timerIntervalsRef.current[id]
          return { ...prev, [id]: { ...timer, remainingSeconds: 0, isDone: true, isPaused: false } }
        }
        return { ...prev, [id]: { ...timer, remainingSeconds: next } }
      })
    }, 1000)
  }

  function handleTimerStart(id, label, seconds) {
    setActiveTimers((prev) => ({
      ...prev,
      [id]: { label, totalSeconds: seconds, remainingSeconds: seconds, isPaused: false, isDone: false },
    }))
    startInterval(id)
  }

  function handleTimerPause(id) {
    clearInterval(timerIntervalsRef.current[id])
    delete timerIntervalsRef.current[id]
    setActiveTimers((prev) => ({ ...prev, [id]: { ...prev[id], isPaused: true } }))
  }

  function handleTimerResume(id) {
    setActiveTimers((prev) => ({ ...prev, [id]: { ...prev[id], isPaused: false } }))
    startInterval(id)
  }

  function handleTimerStop(id) {
    clearInterval(timerIntervalsRef.current[id])
    delete timerIntervalsRef.current[id]
    setActiveTimers((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  const stepText = instructions[currentStep] || ''
  const timerEntries = Object.entries(activeTimers)
  const chipData = matchIngredientsToStep(ingredients, stepText)
  const relevantChips = chipData.filter((c) => c.relevant)
  const allChips = chipData

  return (
    <div className="cn-overlay" role="dialog" aria-label="Cooking navigator">
      <div className="cn-card">

        {/* Floating timer strip */}
        {timerEntries.length > 0 && (
          <div className="cn-timer-strip">
            {timerEntries.map(([id, timer]) => (
              <div
                key={id}
                className={`cn-timer-pill${timer.isPaused ? ' cn-timer-pill--paused' : ''}${timer.isDone ? ' cn-timer-pill--done' : ''}`}
              >
                <span className="cn-timer-pill-label">{timer.label}</span>
                <span className="cn-timer-pill-time">{formatTime(timer.remainingSeconds)}</span>
                {timer.isDone ? (
                  <button className="cn-timer-pill-action" onClick={() => handleTimerStop(id)} title="Dismiss">✓</button>
                ) : timer.isPaused ? (
                  <button className="cn-timer-pill-action" onClick={() => handleTimerResume(id)} title="Resume">▶</button>
                ) : (
                  <button className="cn-timer-pill-action" onClick={() => handleTimerPause(id)} title="Pause">⏸</button>
                )}
                <button className="cn-timer-pill-stop" onClick={() => handleTimerStop(id)} title="Stop timer">✕</button>
              </div>
            ))}
          </div>
        )}

        {/* Progress bar */}
        <div className="cn-progress-bar">
          <div
            className="cn-progress-fill"
            style={{ width: `${((currentStep + 1) / total) * 100}%` }}
          />
        </div>

        {/* Header */}
        <div className="cn-header">
          <span className="cn-step-counter">Step {currentStep + 1} of {total}</span>
          <button className="cn-close-btn" onClick={onClose} title="Exit cooking mode">✕</button>
        </div>

        {/* Step text */}
        <div className="cn-step-body">
          <p className="cn-step-text">
            {renderStepWithTimers(stepText, currentStep, activeTimers, handleTimerStart)}
          </p>
        </div>

        {/* Ingredient chips */}
        {allChips.length > 0 && (
          <div className="cn-ingredients">
            <span className="cn-ingredients-label">Ingredients this step</span>
            <div className="cn-ingredient-chips">
              {allChips.map((chip, i) => (
                <span
                  key={i}
                  className={`cn-ingredient-chip${chip.relevant ? ' cn-ingredient-chip--active' : ''}`}
                >
                  {chip.text}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="cn-nav">
          <button
            className="cn-nav-btn cn-nav-btn--prev"
            disabled={currentStep === 0}
            onClick={() => setCurrentStep((s) => s - 1)}
          >
            ← Prev
          </button>
          <button
            className="cn-nav-btn cn-nav-btn--next"
            disabled={currentStep === total - 1}
            onClick={() => setCurrentStep((s) => s + 1)}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  )
}
