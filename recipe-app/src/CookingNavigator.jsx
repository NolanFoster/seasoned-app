import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useFlag } from './flaggly.js'
import useGestureMode from './useGestureMode.js'

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

// ── Equipment extraction ──────────────────────────────────────────────────────

const EQUIPMENT_KEYWORDS = [
  'oven', 'microwave', 'stove', 'stovetop', 'grill', 'broiler',
  'bowl', 'mixing bowl', 'large bowl', 'small bowl', 'medium bowl',
  'pan', 'skillet', 'frying pan', 'saucepan', 'baking pan', 'sheet pan', 'baking sheet',
  'pot', 'stockpot', 'dutch oven',
  'whisk', 'spatula', 'wooden spoon', 'ladle',
  'knife', 'cutting board', 'chopping board',
  'colander', 'strainer', 'sieve',
  'blender', 'food processor', 'stand mixer', 'hand mixer',
  'grater', 'zester', 'peeler',
  'measuring cup', 'measuring spoon',
  'wire rack', 'cooling rack',
  'roasting pan', 'casserole dish', 'baking dish',
  'thermometer',
]

function extractEquipment(instructions) {
  const allText = instructions.join(' ').toLowerCase()
  return EQUIPMENT_KEYWORDS.filter((eq) => allText.includes(eq))
}

// ── Ingredient categorization ─────────────────────────────────────────────────

const INGREDIENT_CATEGORIES = [
  {
    label: 'Chop / dice / mince',
    keywords: [
      'onion', 'shallot', 'garlic', 'leek', 'scallion', 'green onion', 'chive',
      'celery', 'carrot', 'tomato', 'cherry tomato',
      'zucchini', 'courgette', 'squash', 'pumpkin',
      'mushroom', 'shiitake', 'portobello', 'cremini',
      'bell pepper', 'jalapeño', 'jalapeno', 'serrano', 'habanero', 'poblano',
      'chili pepper', 'chilli pepper',
      'ginger', 'fennel', 'cucumber', 'eggplant', 'aubergine',
      'broccoli', 'cauliflower', 'broccolini',
      'brussels sprout', 'asparagus',
      'green bean', 'string bean', 'corn',
      'avocado', 'mango', 'pineapple', 'apple', 'pear',
      'beet', 'beetroot', 'turnip', 'parsnip',
      'cabbage', 'bok choy', 'kale', 'collard', 'chard', 'spinach',
      'parsley', 'cilantro', 'coriander leaf', 'basil', 'mint',
      'dill', 'tarragon', 'chives',
      'walnut', 'almond', 'pecan', 'cashew', 'pistachio', 'hazelnut', 'peanut',
      'chocolate', 'sun-dried tomato', 'artichoke', 'radish',
    ],
  },
  {
    label: 'Peel',
    keywords: [
      'potato', 'sweet potato', 'yam',
      'rutabaga', 'celeriac', 'kohlrabi',
    ],
  },
  {
    label: 'Wash & dry',
    keywords: [
      'lettuce', 'romaine', 'iceberg', 'arugula', 'watercress',
      'endive', 'radicchio', 'frisée',
      'berry', 'berries', 'strawberry', 'blueberry', 'raspberry',
      'blackberry', 'cranberry', 'grape', 'cherry',
    ],
  },
  {
    label: 'Marinate / temper',
    keywords: [
      'chicken', 'beef', 'pork', 'lamb', 'turkey', 'veal', 'duck',
      'fish', 'salmon', 'tuna', 'cod', 'halibut', 'tilapia', 'trout',
      'bass', 'snapper', 'swordfish', 'mackerel',
      'shrimp', 'prawn', 'scallop', 'crab', 'lobster', 'clam', 'mussel',
      'tofu', 'tempeh', 'seitan',
      'steak', 'tenderloin', 'fillet', 'loin', 'breast', 'thigh',
      'ground beef', 'ground pork', 'ground turkey', 'ground chicken',
      'egg',
    ],
  },
  {
    label: 'Measure',
    keywords: [
      'flour', 'sugar', 'brown sugar', 'powdered sugar',
      'salt', 'oil', 'olive oil', 'butter',
      'milk', 'cream', 'buttermilk', 'coconut milk', 'almond milk',
      'broth', 'stock',
      'vinegar', 'balsamic', 'soy sauce', 'fish sauce', 'worcestershire',
      'hot sauce', 'hoisin', 'oyster sauce', 'teriyaki',
      'vanilla', 'extract',
      'baking soda', 'baking powder', 'yeast',
      'honey', 'maple syrup', 'molasses', 'corn syrup',
      'water', 'wine', 'beer', 'juice',
      'cumin', 'paprika', 'turmeric', 'coriander', 'cinnamon',
      'cardamom', 'nutmeg', 'allspice', 'cayenne', 'pepper flakes',
      'chili powder', 'curry powder', 'garam masala', "za'atar",
      'bay leaf', 'star anise', 'fennel seed',
      'sauce', 'paste', 'powder', 'syrup',
    ],
  },
]

const CATEGORY_PREP_MINUTES = {
  'Chop / dice / mince': 3,
  'Peel':                2,
  'Wash & dry':          1,
  'Marinate / temper':   5,
  'Measure':             0.5,
  'Other':               1,
}

function estimatePrepMinutes(ingredients) {
  const total = ingredients.reduce((sum, ing) => {
    const label = categorizeIngredient(ing)
    return sum + (CATEGORY_PREP_MINUTES[label] ?? 1)
  }, 0)
  return Math.max(1, Math.round(total))
}

function categorizeIngredient(text) {
  const lower = text.toLowerCase()
  for (const { label, keywords } of INGREDIENT_CATEGORIES) {
    if (keywords.some((kw) => lower.includes(kw))) return label
  }
  const hasUnit = lower.split(/\s+/).some((t) => QUANTITY_TOKENS.test(t))
  return hasUnit ? 'Measure' : 'Other'
}

function groupIngredients(ingredients) {
  const buckets = new Map()
  ingredients.forEach((text, index) => {
    const label = categorizeIngredient(text)
    if (!buckets.has(label)) buckets.set(label, [])
    buckets.get(label).push({ text, index })
  })
  const order = [...INGREDIENT_CATEGORIES.map((c) => c.label), 'Other']
  return order.filter((label) => buckets.has(label)).map((label) => ({
    label,
    items: buckets.get(label),
  }))
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

  const [currentStep, setCurrentStep] = useState(-1)
  const [usedIngredients, setUsedIngredients] = useState(new Set())
  const [activeTimers, setActiveTimers] = useState({}) // { id: { label, totalSeconds, remainingSeconds, isPaused, isDone } }
  const timerIntervalsRef = useRef({}) // { id: countdownIntervalId }
  const soundIntervalsRef = useRef({})  // { id: soundRepeatIntervalId }

  const voiceControlEnabled = useFlag('voice-control')
  const gestureSupportEnabled = useFlag('gesture-support')
  const dictationEnabled = useFlag('dictation')

  const [handsFreeModeActive, setHandsFreeModeActive] = useState(false)
  const [voiceStatus, setVoiceStatus] = useState('idle') // 'idle' | 'listening' | 'unsupported'
  const recognitionRef = useRef(null)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const currentStepRef = useRef(currentStep)
  useEffect(() => { currentStepRef.current = currentStep }, [currentStep])

  const [gestureModeActive, setGestureModeActive] = useState(false)

  const [cookMenuOpen, setCookMenuOpen] = useState(false)
  const cookMenuRef = useRef(null)

  const TEXT_SIZES = ['normal', 'large', 'xl']
  const [textSize, setTextSize] = useState(() => {
    const saved = localStorage.getItem('cn-text-size')
    return TEXT_SIZES.includes(saved) ? saved : 'normal'
  })
  function cycleTextSize() {
    setTextSize((prev) => {
      const next = TEXT_SIZES[(TEXT_SIZES.indexOf(prev) + 1) % TEXT_SIZES.length]
      localStorage.setItem('cn-text-size', next)
      return next
    })
  }
  const videoRef = useRef(null)
  const { isSupported: gestureSupported, status: gestureStatus, start: startGesture,
          stop: stopGesture, gestureProgress } =
    useGestureMode({
      videoRef,
      onNext: () => { autoMarkCurrentStepIngredients(); setCurrentStep((s) => Math.min(s + 1, total - 1)); playBeep() },
      onPrev: () => { setCurrentStep((s) => Math.max(s - 1, -1)); playBeepBack() },
    })

  useEffect(() => {
    if (!cookMenuOpen) return
    function handleClick(e) {
      if (cookMenuRef.current && !cookMenuRef.current.contains(e.target)) {
        setCookMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [cookMenuOpen])

  function handleIngredientToggle(index) {
    setUsedIngredients((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  function autoMarkCurrentStepIngredients() {
    const chips = matchIngredientsToStep(ingredients, instructions[currentStepRef.current] || '')
    const relevantIndices = chips.reduce((acc, chip, i) => { if (chip.relevant) acc.push(i); return acc }, [])
    if (relevantIndices.length > 0) {
      setUsedIngredients((prev) => {
        const next = new Set(prev)
        relevantIndices.forEach((i) => next.add(i))
        return next
      })
    }
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
      autoMarkCurrentStepIngredients()
      setCurrentStep((s) => Math.min(s + 1, total - 1))
    } else if (cmd.includes('back') || cmd.includes('prev')) {
      setCurrentStep((s) => Math.max(s - 1, -1))
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
    if (step === -1) {
      const utterance = new SpeechSynthesisUtterance(
        'Mise en place. Gather and prepare all your ingredients and equipment before you start cooking.'
      )
      utterance.onstart = () => setIsSpeaking(true)
      utterance.onend = () => setIsSpeaking(false)
      utterance.onerror = () => setIsSpeaking(false)
      window.speechSynthesis.speak(utterance)
      return
    }
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
  const equipment = extractEquipment(instructions)

  return (
    <div className="cn-overlay" role="dialog" aria-label="Cooking navigator">
      <div className={`cn-card${textSize !== 'normal' ? ` cn-card--text-${textSize}` : ''}`}>

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
            style={{ width: `${currentStep === -1 ? 0 : ((currentStep + 1) / total) * 100}%` }}
          />
        </div>

        {/* Header */}
        <div className="cn-header">
          <span className="cn-step-counter">
            {currentStep === -1 ? <>Mise en Place <span className="cn-mise-translation">— everything in its place</span></> : `Step ${currentStep + 1} of ${total}`}
          </span>
          <div className="cn-header-actions">
            <div className="action-menu" ref={cookMenuRef}>
              <button
                className="cn-hands-free-btn"
                onClick={() => setCookMenuOpen(o => !o)}
                title="Options"
                aria-label="Open options menu"
                aria-expanded={cookMenuOpen}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
                </svg>
              </button>
              {cookMenuOpen && (
                <div className="action-menu-dropdown">
                  <button
                    className="action-menu-item"
                    onClick={() => { setCookMenuOpen(false); onClose(); }}
                    title="Exit cooking mode"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                    Close
                  </button>
                  <button
                    className={`action-menu-item${isSpeaking ? ' active' : ''}`}
                    onClick={() => { setCookMenuOpen(false); isSpeaking ? stopSpeaking() : speakCurrentStep(); }}
                    title={isSpeaking ? 'Stop reading' : 'Read step aloud'}
                    aria-pressed={isSpeaking}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                    </svg>
                    {isSpeaking ? 'Stop reading' : 'Read aloud'}
                  </button>
                  <button
                    className={`action-menu-item${textSize !== 'normal' ? ' active' : ''}`}
                    onClick={() => { cycleTextSize(); setCookMenuOpen(false); }}
                    title={`Text size: ${textSize}. Click to increase.`}
                    aria-label={`Text size ${textSize}, click to cycle`}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 7V4h16v3M9 20h6M12 4v16"/>
                    </svg>
                    Text size: {textSize === 'normal' ? 'A' : textSize === 'large' ? 'A+' : 'A++'}
                  </button>
                  {voiceControlEnabled && dictationEnabled && (
                    <button
                      className={`action-menu-item${handsFreeModeActive ? ' active' : ''}`}
                      onClick={() => { setCookMenuOpen(false); toggleHandsFreeMode(); }}
                      title={handsFreeModeActive ? 'Stop hands-free mode' : 'Start hands-free voice navigation'}
                      aria-pressed={handsFreeModeActive}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                        <line x1="12" y1="19" x2="12" y2="23"/>
                        <line x1="8" y1="23" x2="16" y2="23"/>
                      </svg>
                      {handsFreeModeActive ? 'Stop hands-free' : 'Hands-free voice'}
                    </button>
                  )}
                  {gestureSupportEnabled && gestureSupported && (
                    <button
                      className={`action-menu-item${gestureModeActive ? ' active' : ''}`}
                      onClick={() => { setCookMenuOpen(false); toggleGestureMode(); }}
                      title={gestureModeActive ? 'Stop gesture mode' : 'Wave to navigate steps'}
                      aria-pressed={gestureModeActive}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 11V6a2 2 0 00-4 0v5"/>
                        <path d="M14 10V4a2 2 0 00-4 0v6"/>
                        <path d="M10 10.5V6a2 2 0 00-4 0v8"/>
                        <path d="M18 11a2 2 0 012 2v1a8 8 0 01-16 0v-3"/>
                      </svg>
                      {gestureModeActive ? 'Stop gestures' : 'Gesture mode'}
                    </button>
                  )}
                </div>
              )}
            </div>
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
        {voiceControlEnabled && dictationEnabled && handsFreeModeActive && (
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

        <div className="cn-scroll-body">
        {currentStep === -1 ? (
          <div className="cn-mise-en-place">
            <div className="cn-step-body">
              <p className="cn-step-text">
                Before you start cooking, read through the full recipe, then gather and prepare all
                ingredients and equipment below.
              </p>
            </div>
            {ingredients.length > 0 && (() => {
              const prepMins = estimatePrepMinutes(ingredients)
              const pct = Math.round((usedIngredients.size / ingredients.length) * 100)
              return (
                <div className="cn-mise-progress">
                  <div className="cn-mise-progress-label">
                    <span>Prep Time: ~{prepMins} min</span>
                    <span>{pct}% complete</span>
                  </div>
                  <div className="cn-mise-progress-track">
                    <div className="cn-mise-progress-fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })()}
            {ingredients.length > 0 &&
              groupIngredients(ingredients).map(({ label, items }) => (
                <div key={label} className="cn-ingredients">
                  <span className="cn-ingredients-label">{label}</span>
                  <div className="cn-ingredient-chips">
                    {items.map(({ text, index }) => {
                      const isUsed = usedIngredients.has(index)
                      const className = [
                        'cn-ingredient-chip',
                        !isUsed ? 'cn-ingredient-chip--active' : '',
                        isUsed ? 'cn-ingredient-chip--used' : '',
                      ].filter(Boolean).join(' ')
                      return (
                        <button
                          key={index}
                          type="button"
                          className={className}
                          onClick={() => handleIngredientToggle(index)}
                          title={isUsed ? 'Mark as not prepared' : 'Mark as prepared'}
                          aria-pressed={isUsed}
                        >
                          {text}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))
            }
            {equipment.length > 0 && (
              <div className="cn-ingredients">
                <span className="cn-ingredients-label">Equipment needed</span>
                <ul className="cn-equipment-list">
                  {equipment.map((eq, i) => <li key={i}>{eq}</li>)}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <>
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
                      chip.relevant && !isUsed ? 'cn-ingredient-chip--active' : '',
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
          </>
        )}
        </div>

        {/* Navigation */}
        <div className="cn-nav">
          <button
            className="cn-nav-btn cn-nav-btn--prev"
            disabled={currentStep === -1}
            onClick={() => setCurrentStep((s) => s - 1)}
          >
            ← Prev
          </button>
          <button
            className="cn-nav-btn cn-nav-btn--next"
            disabled={currentStep === total - 1}
            onClick={() => {
              if (currentStep === -1) {
                setUsedIngredients(new Set())
              } else {
                autoMarkCurrentStepIngredients()
              }
              setCurrentStep((s) => s + 1)
            }}
          >
            {currentStep === -1 ? 'Start Cooking →' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  )
}
