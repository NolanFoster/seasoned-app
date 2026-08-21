import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createNaturalSpeaker,
  listNaturalVoices,
  pickNaturalVoice,
} from './utils/naturalVoice'

export const VOICE_STORAGE_KEY = 'cn-voice-uri'

function getSynth() {
  return typeof window !== 'undefined' ? window.speechSynthesis : null
}

function readSavedVoiceURI() {
  try {
    return localStorage.getItem(VOICE_STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

/**
 * Read-aloud backed by the most natural-sounding voice the device has.
 *
 * Platforms populate `getVoices()` asynchronously, so the list is re-read on
 * `voiceschanged` — the first render usually sees nothing and settles a beat
 * later on the real set.
 */
export default function useNaturalVoice({ lang = 'en-US' } = {}) {
  const supported = typeof window !== 'undefined'
    && !!window.speechSynthesis
    && typeof window.SpeechSynthesisUtterance === 'function'

  const [allVoices, setAllVoices] = useState([])
  const [voiceURI, setVoiceURI] = useState(readSavedVoiceURI)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const speakerRef = useRef(null)
  if (!speakerRef.current) speakerRef.current = createNaturalSpeaker(getSynth)

  useEffect(() => {
    if (!supported) return undefined
    const synth = getSynth()
    const refresh = () => {
      const next = typeof synth.getVoices === 'function' ? synth.getVoices() : []
      setAllVoices(Array.isArray(next) ? next : [])
    }
    refresh()
    synth.addEventListener?.('voiceschanged', refresh)
    return () => synth.removeEventListener?.('voiceschanged', refresh)
  }, [supported])

  const voices = useMemo(() => listNaturalVoices(allVoices, { lang }), [allVoices, lang])
  const voice = useMemo(
    () => pickNaturalVoice(allVoices, { lang, preferredURI: voiceURI }),
    [allVoices, lang, voiceURI],
  )

  // Voices arrive after the first render, and hands-free listeners are bound
  // once — reading through a ref keeps `speak` stable and always current.
  const voiceRef = useRef(null)
  useEffect(() => { voiceRef.current = voice }, [voice])

  const stop = useCallback(() => {
    speakerRef.current.cancel()
    setIsSpeaking(false)
  }, [])

  const speak = useCallback((text) => {
    if (!supported) return false
    return speakerRef.current.speak(text, {
      voice: voiceRef.current,
      lang,
      onStart: () => setIsSpeaking(true),
      onEnd: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    })
  }, [supported, lang])

  const selectVoice = useCallback((uri) => {
    setVoiceURI(uri || '')
    try {
      if (uri) localStorage.setItem(VOICE_STORAGE_KEY, uri)
      else localStorage.removeItem(VOICE_STORAGE_KEY)
    } catch {
      // Private-mode storage failures shouldn't break read-aloud.
    }
  }, [])

  // A voice speaking after its screen is gone is jarring.
  useEffect(() => () => speakerRef.current.cancel(), [])

  return { supported, voices, voice, voiceURI, selectVoice, speak, stop, isSpeaking }
}
