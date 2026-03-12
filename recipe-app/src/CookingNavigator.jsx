import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useFlag } from './flaggly.js'

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

// ── Gesture emoji map ─────────────────────────────────────────────────────────

const GESTURE_EMOJI = {
  Victory:     '✌️',
  Thumb_Up:    '👍',
  Thumb_Down:  '👎',
  Pointing_Up: '☝️',
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

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Parse a single token to a numeric quantity value, or return null.
function parseQuantityToken(token) {
  const unicode = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1/3, '⅔': 2/3, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875 }
  if (Object.prototype.hasOwnProperty.call(unicode, token)) return unicode[token]
  const frac = token.match(/^(\d+)\/(\d+)$/)
  if (frac) return parseInt(frac[1]) / parseInt(frac[2])
  // Handles "0.5", ".5", ".25", "200", "2", etc.
  const n = parseFloat(token)
  return isNaN(n) ? null : n
}

// Return the first numeric quantity found in an ingredient's token list, or null.
function extractIngredientQuantity(tokens) {
  for (const t of tokens) {
    const q = parseQuantityToken(t)
    if (q !== null) return q
  }
  return null
}

// Return the set of all numeric quantities mentioned in a step's text.
function extractStepQuantities(stepText) {
  const quantities = new Set()
  const unicode = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1/3, '⅔': 2/3, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875 }
  for (const [ch, val] of Object.entries(unicode)) {
    if (stepText.includes(ch)) quantities.add(val)
  }
  // Match fractions (1/2), dot-led decimals (.5), and regular numbers (200, 2.5)
  const re = /\d+\/\d+|\.\d+|\d+(?:\.\d+)?/g
  let m
  while ((m = re.exec(stepText)) !== null) {
    const q = parseQuantityToken(m[0])
    if (q !== null) quantities.add(q)
  }
  return quantities
}

function matchIngredientsToStep(ingredients, stepText) {
  const lower = stepText.toLowerCase()
  const stepQuantities = extractStepQuantities(lower)
  return ingredients.map((ing) => {
    const tokens = ing.toLowerCase().split(/\s+/)
    // Drop leading quantity/unit tokens to get the ingredient name
    const nameTokens = tokens.filter((t) => !QUANTITY_TOKENS.test(t))
    const nameMatch =
      nameTokens.length > 0 &&
      nameTokens.some((token) => token.length > 2 && new RegExp(`\\b${escapeRegex(token)}\\b`).test(lower))
    if (!nameMatch) return { text: ing, relevant: false }
    // When the ingredient has a quantity AND the step mentions quantities,
    // only match if the ingredient's quantity appears among the step's quantities.
    // If the step mentions no quantities at all, accept all name matches (e.g. "add the sugar").
    const ingQuantity = extractIngredientQuantity(tokens)
    if (ingQuantity !== null && stepQuantities.size > 0) {
      const found = [...stepQuantities].some(q => Math.abs(q - ingQuantity) < 0.01)
      if (!found) return { text: ing, relevant: false }
    }
    return { text: ing, relevant: true }
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
  const [usedIngredients, setUsedIngredients] = useState(new Set())
  const [activeTimers, setActiveTimers] = useState({}) // { id: { label, totalSeconds, remainingSeconds, isPaused, isDone } }
  const timerIntervalsRef = useRef({}) // { id: countdownIntervalId }
  const soundIntervalsRef = useRef({})  // { id: soundRepeatIntervalId }

  const voiceControlEnabled = useFlag('voice-control')

  const [handsFreeModeActive, setHandsFreeModeActive] = useState(false)
  const [voiceStatus, setVoiceStatus] = useState('idle') // 'idle' | 'listening' | 'unsupported'
  const recognitionRef = useRef(null)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const currentStepRef = useRef(currentStep)
  useEffect(() => { currentStepRef.current = currentStep }, [currentStep])

  const [gestureModeActive, setGestureModeActive] = useState(false)
  const videoRef = useRef(null)
  const { isSupported: gestureSupported, status: gestureStatus, start: startGesture,
          stop: stopGesture, gestureProgress } =
    useGestureMode({
      videoRef,
      onNext: () => { setCurrentStep((s) => Math.min(s + 1, total - 1)); playBeep() },
      onPrev: () => { setCurrentStep((s) => Math.max(s - 1, 0)); playBeepBack() },
    })

  function handleIngredientToggle(index) {
    setUsedIngredients((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  function toggleGestureMode() {
    if (gestureModeActive) {
      stopGesture()
      setGestureModeActive(false)
    } else {
      startGesture()
      setGestureModeActive(true)
    }
  }

  // Cleanup all intervals on unmount
  useEffect(() => {
    return () => {
      Object.values(timerIntervalsRef.current).forEach(clearInterval)
      Object.values(soundIntervalsRef.current).forEach(clearInterval)
    }
  }, [])

  function playBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 800
      osc.type = 'sine'
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.6)
    } catch {}
  }

  function playBeepBack() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(600, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.4)
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.4)
    } catch {}
  }

  function startRepeatingSound(id) {
    clearInterval(soundIntervalsRef.current[id])
    playBeep()
    soundIntervalsRef.current[id] = setInterval(playBeep, 2000)
    // Auto-stop after 2 minutes
    setTimeout(() => {
      clearInterval(soundIntervalsRef.current[id])
      delete soundIntervalsRef.current[id]
    }, 120000)
  }

  function stopSound(id) {
    clearInterval(soundIntervalsRef.current[id])
    delete soundIntervalsRef.current[id]
  }

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
          startRepeatingSound(id)
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
    stopSound(id)
    setActiveTimers((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  function handleVoiceResult(transcript) {
    const cmd = transcript.toLowerCase().trim()
    if (cmd.includes('next')) {
      setCurrentStep((s) => Math.min(s + 1, total - 1))
    } else if (cmd.includes('back') || cmd.includes('prev')) {
      setCurrentStep((s) => Math.max(s - 1, 0))
    } else if (cmd.includes('read')) {
      speakCurrentStep()
    } else if (cmd.includes('stop') || cmd.includes('close') || cmd.includes('exit') || cmd.includes('done')) {
      stopHandsFreeMode()
      onClose()
    }
  }

  function startHandsFreeMode() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setVoiceStatus('unsupported')
      setHandsFreeModeActive(true)
      return
    }
    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = false
    recognition.lang = 'en-US'
    recognition.onresult = (e) => {
      const transcript = Array.from(e.results)
        .slice(e.resultIndex)
        .map((r) => r[0].transcript)
        .join(' ')
      handleVoiceResult(transcript)
    }
    recognition.onerror = () => {
      setVoiceStatus('idle')
    }
    recognition.onend = () => {
      // Auto-restart if still active (browser stops after silence)
      if (recognitionRef.current === recognition) {
        try { recognition.start() } catch {}
      }
    }
    recognitionRef.current = recognition
    try {
      recognition.start()
      setVoiceStatus('listening')
      setHandsFreeModeActive(true)
    } catch {
      setVoiceStatus('unsupported')
      setHandsFreeModeActive(true)
    }
  }

  function stopHandsFreeMode() {
    if (recognitionRef.current) {
      recognitionRef.current.onend = null
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    setVoiceStatus('idle')
    setHandsFreeModeActive(false)
  }

  function toggleHandsFreeMode() {
    if (handsFreeModeActive) {
      stopHandsFreeMode()
    } else {
      startHandsFreeMode()
    }
  }

  // Stop voice on unmount
  useEffect(() => () => stopHandsFreeMode(), [])

  function stopSpeaking() {
    if (window.speechSynthesis) window.speechSynthesis.cancel()
    setIsSpeaking(false)
  }

  function speakCurrentStep() {
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const step = currentStepRef.current
    const stepInstructions = instructions[step] || ''
    const relevantIngredients = matchIngredientsToStep(ingredients, stepInstructions)
      .filter((c) => c.relevant)
      .map((c) => c.text)
    const ingredientLine = relevantIngredients.length > 0
      ? ` Ingredients for this step: ${relevantIngredients.join(', ')}.`
      : ''
    const text = `Step ${step + 1} of ${total}. ${stepInstructions}.${ingredientLine}`
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.onstart = () => setIsSpeaking(true)
    utterance.onend = () => setIsSpeaking(false)
    utterance.onerror = () => setIsSpeaking(false)
    window.speechSynthesis.speak(utterance)
  }

  // Cancel speech when navigating steps
  useEffect(() => { stopSpeaking() }, [currentStep]) // eslint-disable-line react-hooks/exhaustive-deps

  // Stop speech on unmount
  useEffect(() => () => stopSpeaking(), [])

  const stepText = instructions[currentStep] || ''
  const timerEntries = Object.entries(activeTimers)
  const chipData = matchIngredientsToStep(ingredients, stepText)
  const relevantChips = chipData.filter((c) => c.relevant)
  const allChips = chipData

  return (
    <div className="cn-overlay" role="dialog" aria-label="Cooking navigator">
      <div className="cn-card">

        {/* Hidden video element for gesture-mode camera capture */}
        <video ref={videoRef} className="cn-gesture-video" autoPlay playsInline muted aria-hidden="true" />

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
                  <button className="cn-timer-pill-action" onClick={() => handleTimerResume(id)} title="Resume">{'▶\uFE0E'}</button>
                ) : (
                  <button className="cn-timer-pill-action" onClick={() => handleTimerPause(id)} title="Pause">{'⏸\uFE0E'}</button>
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
          <div className="cn-header-actions">
            {voiceControlEnabled && (
              <button
                className={`cn-hands-free-btn${handsFreeModeActive ? ' cn-hands-free-btn--active' : ''}`}
                onClick={toggleHandsFreeMode}
                title={handsFreeModeActive ? 'Stop hands-free mode' : 'Start hands-free voice navigation'}
                aria-pressed={handsFreeModeActive}
                aria-label={handsFreeModeActive ? 'Stop hands-free mode' : 'Start hands-free mode'}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                  <line x1="12" y1="19" x2="12" y2="23"/>
                  <line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
              </button>
            )}
            <button
              className={`cn-hands-free-btn${isSpeaking ? ' cn-speak-btn--active' : ''}`}
              onClick={isSpeaking ? stopSpeaking : speakCurrentStep}
              title={isSpeaking ? 'Stop reading' : 'Read step aloud'}
              aria-pressed={isSpeaking}
              aria-label={isSpeaking ? 'Stop reading aloud' : 'Read step aloud'}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
              </svg>
            </button>
            <button className="cn-close-btn" onClick={onClose} title="Exit cooking mode">✕</button>
          </div>
        </div>

        {/* Gesture Target Lock overlay — shown while user holds a recognised gesture */}
        {gestureSupportEnabled && gestureStatus === 'active' && gestureProgress && (
          <div className="cn-gesture-lock" aria-live="assertive" aria-atomic="true">
            <div className="cn-gesture-lock-ring-wrap">
              <svg className="cn-gesture-lock-ring" viewBox="0 0 56 56" aria-hidden="true">
                <circle cx="28" cy="28" r="24" className="cn-gesture-lock-track" />
                <circle
                  cx="28" cy="28" r="24"
                  className="cn-gesture-lock-fill"
                  style={{ strokeDashoffset: 150.8 * (1 - gestureProgress.progress) }}
                />
              </svg>
              <span className="cn-gesture-lock-icon" aria-hidden="true">
                {GESTURE_EMOJI[gestureProgress.gestureName] ?? '🖐️'}
              </span>
            </div>
            <span className="cn-gesture-lock-label">
              {gestureProgress.direction === 'next' ? 'Next Step' : 'Previous Step'}
            </span>
          </div>
        )}

        {/* Gesture mode status bar */}
        {gestureSupportEnabled && gestureModeActive && (
          <div
            className={`cn-gesture-bar${gestureStatus === 'active' ? ' cn-gesture-bar--active' : ''}`}
            role="status"
            aria-live="polite"
          >
            {gestureStatus === 'requesting' && <span>Allowing camera access…</span>}
            {gestureStatus === 'active' && (
              <>
                <span className="cn-gesture-dot" aria-hidden="true" />
                <span>Hold ✌️ or 👍 for Next · 👎 or ☝️ for Prev</span>
              </>
            )}
            {gestureStatus === 'denied' && <span>Camera access denied — use Prev / Next buttons</span>}
            {gestureStatus === 'unsupported' && <span>Gesture mode unavailable in this browser</span>}
          </div>
        )}

        {/* Hands-free status bar */}
        {voiceControlEnabled && handsFreeModeActive && (
          <div className={`cn-hands-free-bar${voiceStatus === 'listening' ? ' cn-hands-free-bar--listening' : ''}`} role="status" aria-live="polite">
            {voiceStatus === 'unsupported' ? (
              <span>Voice not supported — use Prev / Next buttons</span>
            ) : (
              <>
                <span className="cn-hands-free-dot" aria-hidden="true"/>
                <span>Listening — say &ldquo;next&rdquo;, &ldquo;back&rdquo;, &ldquo;read&rdquo;, or &ldquo;stop&rdquo;</span>
              </>
            )}
          </div>
        )}

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
              {allChips.map((chip, i) => {
                const isUsed = usedIngredients.has(i)
                const className = [
                  'cn-ingredient-chip',
                  chip.relevant ? 'cn-ingredient-chip--active' : '',
                  isUsed ? 'cn-ingredient-chip--used' : '',
                ].filter(Boolean).join(' ')
                return (
                  <button
                    key={i}
                    type="button"
                    className={className}
                    onClick={() => handleIngredientToggle(i)}
                    title={isUsed ? 'Mark as not used' : 'Mark as used'}
                    aria-pressed={isUsed}
                  >
                    {chip.text}
                  </button>
                )
              })}
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
