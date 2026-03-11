// gestureWorker.js — MediaPipe GestureRecognizer running in a dedicated Web Worker.
// The main thread sends ImageBitmap frames; this worker detects hand waves and posts
// WAVE messages back. Inference never blocks the UI thread.

importScripts('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.js')

const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task'

// Wave detection tuning
const BUFFER_SIZE = 8      // number of frames to accumulate before checking delta
const WAVE_THRESHOLD = 0.18 // normalised X delta (0–1 range) required to count as a wave
const COOLDOWN_MS = 1500   // ignore new waves for this many ms after one fires

// ── State ─────────────────────────────────────────────────────────────────────

let recognizer = null
let offscreen = null   // OffscreenCanvas reused every frame
let ctx2d = null
let xBuffer = []       // ring buffer of recent wrist-X readings
let inCooldown = false

// ── Initialisation ────────────────────────────────────────────────────────────

async function init() {
  try {
    const { GestureRecognizer, FilesetResolver } = self

    const vision = await FilesetResolver.forVisionTasks(WASM_CDN)

    // Try GPU first; fall back to CPU if WebGL is unavailable in this worker context.
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
    bitmap.close() // release GPU/CPU memory immediately after draw

    const results = recognizer.detectForVideo(offscreen, timestamp)

    if (!results.landmarks || results.landmarks.length === 0) {
      // No hand visible — reset tracking so the next detection starts fresh.
      xBuffer = []
      return
    }

    // Landmark 0 is the wrist — most stable X position during a wave.
    const wristX = results.landmarks[0][0].x
    xBuffer.push(wristX)
    if (xBuffer.length > BUFFER_SIZE) xBuffer.shift()

    if (xBuffer.length === BUFFER_SIZE) {
      const delta = xBuffer[BUFFER_SIZE - 1] - xBuffer[0]

      // Positive delta  → wrist moved right in the raw camera frame
      //   = left-to-right from the image's perspective → previousStep()
      // Negative delta  → wrist moved left in the raw camera frame
      //   = right-to-left from the image's perspective → nextStep()
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
    // Drop the frame but still release the transferred bitmap's memory.
    bitmap?.close()
    return
  }

  processFrame(bitmap, timestamp)
}
