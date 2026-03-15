import { useRef, useState, useEffect } from 'react'

// Throttle: capture one frame every ~83 ms ≈ 12 fps.
// Low enough to save battery/compute; high enough for smooth wave detection.
const FRAME_INTERVAL_MS = 83

export default function useGestureMode({ videoRef, onNext, onPrev }) {
  // Keep callbacks in a ref so the worker's onmessage closure always calls
  // the latest versions without needing to re-create the worker.
  const callbacksRef = useRef({ onNext, onPrev })
  useEffect(() => { callbacksRef.current = { onNext, onPrev } }, [onNext, onPrev])

  // Feature-detect synchronously — no async needed.
  const isSupported = !!(
    typeof navigator !== 'undefined' &&
    navigator.mediaDevices?.getUserMedia &&
    typeof Worker !== 'undefined' &&
    typeof createImageBitmap !== 'undefined'
  )

  const [status, setStatus] = useState('idle')
  // 'idle' | 'requesting' | 'active' | 'denied' | 'unsupported'

  const [gestureProgress, setGestureProgress] = useState(null)
  // null when idle; { gestureName, direction, progress } while user holds a gesture

  const workerRef    = useRef(null)
  const streamRef    = useRef(null)
  const intervalRef  = useRef(null)
  const wakeLockRef  = useRef(null)
  const pendingRef   = useRef(false) // prevents interval backpressure

  // ── start ────────────────────────────────────────────────────────────────

  async function start() {
    if (!isSupported) { setStatus('unsupported'); return }

    setStatus('requesting')

    // 1. Request camera — low resolution keeps createImageBitmap cheap.
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } },
      })
    } catch (err) {
      const denied = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
      setStatus(denied ? 'denied' : 'unsupported')
      return
    }

    streamRef.current = stream

    // 2. Pipe stream into the hidden <video> element.
    const video = videoRef.current
    video.srcObject = stream
    await video.play()

    // 3. Spawn the worker and wait for its READY signal before sampling frames.
    const worker = new Worker('/gestureWorker.js')
    workerRef.current = worker

    worker.onerror = (e) => { console.error('[gesture] worker error:', e.message); stop(); setStatus('unsupported') }
    worker.onmessage = (e) => {
      const { type, direction, gestureName, progress } = e.data
      if (type === 'READY') {
        setStatus('active')
        startInterval()
      } else if (type === 'GESTURE_PROGRESS') {
        setGestureProgress({ gestureName, direction, progress })
      } else if (type === 'GESTURE_CONFIRMED') {
        setGestureProgress(null)
        direction === 'next'
          ? callbacksRef.current.onNext()
          : callbacksRef.current.onPrev()
      } else if (type === 'GESTURE_CANCELLED') {
        setGestureProgress(null)
      } else if (type === 'ERROR') {
        console.error('[gesture] worker init error:', message)
        stop()
        setStatus('unsupported')
      }
    }

    worker.postMessage({ type: 'INIT' })

    // 4. Acquire wake lock so the screen stays on while cooking.
    //    Failures (e.g. tab not focused) are silently ignored.
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen')
      }
    } catch {}
  }

  // ── frame capture loop ───────────────────────────────────────────────────

  function startInterval() {
    intervalRef.current = setInterval(async () => {
      const video = videoRef.current
      // readyState 2 = HAVE_CURRENT_DATA — video has at least one decodable frame.
      if (!video || video.readyState < 2 || pendingRef.current) return

      pendingRef.current = true
      try {
        // createImageBitmap creates a decoded, GPU-ready snapshot of the current frame.
        // Transferring as a Transferable avoids a pixel-data copy across the thread boundary.
        const bitmap = await createImageBitmap(video)
        workerRef.current?.postMessage(
          { type: 'FRAME', bitmap, timestamp: performance.now() },
          [bitmap],
        )
      } catch {
        // Video not ready or worker gone — skip frame silently.
      } finally {
        pendingRef.current = false
      }
    }, FRAME_INTERVAL_MS)
  }

  // ── stop ─────────────────────────────────────────────────────────────────

  function stop() {
    clearInterval(intervalRef.current)
    intervalRef.current = null

    workerRef.current?.terminate()
    workerRef.current = null

    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null

    if (videoRef.current) videoRef.current.srcObject = null

    try { wakeLockRef.current?.release() } catch {}
    wakeLockRef.current = null

    setGestureProgress(null)
    setStatus('idle')
  }

  // Release all resources on unmount regardless of mode state.
  useEffect(() => () => stop(), []) // eslint-disable-line react-hooks/exhaustive-deps

  return { isSupported, status, start, stop, gestureProgress }
}
