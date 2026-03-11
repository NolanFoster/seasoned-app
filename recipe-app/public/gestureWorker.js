// gestureWorker.js — MediaPipe GestureRecognizer running in a dedicated Web Worker.
// Loaded as a classic worker — importScripts runs scripts in global scope,
// which is required for vision_wasm_internal.js to set ModuleFactory on self.

importScripts('/mediapipe/mediapipe.iife.js')

const { GestureRecognizer, FilesetResolver } = self.mpTasks

const WASM_CDN = '/mediapipe/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task'

// Wave detection tuning
const BUFFER_SIZE = 8
const WAVE_THRESHOLD = 0.18
const COOLDOWN_MS = 1500

// ── State ─────────────────────────────────────────────────────────────────────

let recognizer = null
let offscreen = null
let ctx2d = null
let xBuffer = []
let inCooldown = false

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

// ── Frame processing ──────────────────────────────────────────────────────────

function processFrame(bitmap, timestamp) {
  try {
    ctx2d.drawImage(bitmap, 0, 0, 320, 240)
    bitmap.close()

    const results = recognizer.recognizeForVideo(offscreen, timestamp)

    if (!results.landmarks || results.landmarks.length === 0) {
      xBuffer = []
      return
    }

    const wristX = results.landmarks[0][0].x
    xBuffer.push(wristX)
    if (xBuffer.length > BUFFER_SIZE) xBuffer.shift()

    if (xBuffer.length === BUFFER_SIZE) {
      const delta = xBuffer[BUFFER_SIZE - 1] - xBuffer[0]
      if (delta > WAVE_THRESHOLD) {
        fireWave('prev')
      } else if (delta < -WAVE_THRESHOLD) {
        fireWave('next')
      }
    }
  } catch (err) {
    self.postMessage({ type: 'ERROR', message: String(err.message ?? err) })
  }
}

function fireWave(direction) {
  xBuffer = []
  inCooldown = true
  self.postMessage({ type: 'WAVE', direction })
  setTimeout(() => { inCooldown = false }, COOLDOWN_MS)
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
