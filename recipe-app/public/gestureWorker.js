// gestureWorker.js — MediaPipe GestureRecognizer running in a dedicated Web Worker.
// The main thread sends ImageBitmap frames; this worker classifies static hand gestures,
// applies hold-to-confirm timing and Z-axis filtering, then posts GESTURE_CONFIRMED
// messages back. Inference never blocks the UI thread.

importScripts('/mediapipe/mediapipe.iife.js')

const { GestureRecognizer, FilesetResolver } = self.mpTasks

const WASM_CDN = '/mediapipe/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task'

// Hold-to-confirm tuning
const HOLD_FRAMES   = 15    // consecutive matching frames required to fire (~1.25 s at 12 fps)
const COOLDOWN_MS   = 2500  // ignore all gestures for this many ms after one fires
const MIN_HAND_SIZE = 0.15  // min wrist→middle-finger-tip distance (normalised 0–1); filters far-away hands

// Gesture → navigation direction mapping.
// Uses MediaPipe's built-in static gesture names.
const GESTURE_MAP = {
  Victory:     'next',   // ✌️
  Thumb_Up:    'next',   // 👍
  Thumb_Down:  'prev',   // 👎
  Pointing_Up: 'prev',   // ☝️
}

// ── State ─────────────────────────────────────────────────────────────────────

let recognizer  = null
let offscreen   = null   // OffscreenCanvas reused every frame
let ctx2d       = null
let holdGesture = null   // name of the gesture currently being held
let holdCount   = 0      // consecutive frames with the same gesture
let inCooldown  = false

// ── Initialisation ────────────────────────────────────────────────────────────

async function init() {
  try {
    const vision = await FilesetResolver.forVisionTasks(WASM_CDN)

    let opts = {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numHands: 1,
    }
    try {
      recognizer = await GestureRecognizer.createFromOptions(vision, opts)
    } catch {
      opts.baseOptions.delegate = 'CPU'
      recognizer = await GestureRecognizer.createFromOptions(vision, opts)
    }

    offscreen = new OffscreenCanvas(320, 240)
    ctx2d = offscreen.getContext('2d')

    self.postMessage({ type: 'READY' })
  } catch (err) {
    self.postMessage({ type: 'ERROR', message: String(err.message ?? err) })
  }
}

// ── Hold-to-confirm helpers ───────────────────────────────────────────────────

function resetHold() {
  if (holdGesture !== null) {
    holdGesture = null
    holdCount   = 0
    self.postMessage({ type: 'GESTURE_CANCELLED' })
  }
}

function fireGesture(direction) {
  holdGesture = null
  holdCount   = 0
  inCooldown  = true
  self.postMessage({ type: 'GESTURE_CONFIRMED', direction })
  setTimeout(() => { inCooldown = false }, COOLDOWN_MS)
}

// ── Frame processing ──────────────────────────────────────────────────────────

let _debugFrameCount = 0
let _lastDebugLog = 0

function processFrame(bitmap, timestamp) {
  try {
    ctx2d.drawImage(bitmap, 0, 0, 320, 240)
    bitmap.close()

    const results = recognizer.recognizeForVideo(offscreen, timestamp)

    _debugFrameCount++
    const now = Date.now()

    // No hand detected — cancel any in-progress hold.
    if (!results.landmarks || results.landmarks.length === 0) {
      resetHold()
      return
    }

    // Z-axis filter: compute approximate hand size as the normalised distance
    // between the wrist (landmark 0) and the middle finger tip (landmark 12).
    // Hands that are too far from the camera appear small and should be ignored.
    const wrist  = results.landmarks[0][0]
    const midTip = results.landmarks[0][12]
    const dx = midTip.x - wrist.x
    const dy = midTip.y - wrist.y
    const handSize = Math.sqrt(dx * dx + dy * dy)
    if (handSize < MIN_HAND_SIZE) {
      resetHold()
      return
    }

    // Read MediaPipe's built-in static gesture classification.
    const detectedName = results.gestures[0]?.[0]?.categoryName ?? null
    const direction    = detectedName ? (GESTURE_MAP[detectedName] ?? null) : null

    // Unrecognised or irrelevant gesture — cancel hold.
    if (!direction) {
      resetHold()
      return
    }

    // Gesture changed mid-hold — restart counter from scratch.
    if (detectedName !== holdGesture) {
      holdCount   = 0
      holdGesture = detectedName
    }

    holdCount++
    const progress = Math.min(holdCount / HOLD_FRAMES, 1)
    self.postMessage({ type: 'GESTURE_PROGRESS', gestureName: holdGesture, direction, progress })

    if (holdCount >= HOLD_FRAMES) {
      fireGesture(direction)
    }
  } catch (err) {
    self.postMessage({ type: 'ERROR', message: String(err.message ?? err) })
  }
}

// ── Message handler ───────────────────────────────────────────────────────────

self.onmessage = async (e) => {
  const { type, bitmap, timestamp } = e.data

  if (type === 'INIT') {
    await init()
    return
  }

  if (type !== 'FRAME') return

  if (!recognizer || inCooldown) {
    bitmap?.close()
    return
  }

  processFrame(bitmap, timestamp)
}
