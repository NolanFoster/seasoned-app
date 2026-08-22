// Natural voice support for read-aloud.
//
// The Web Speech API hands back whatever voice the platform considers the
// default, which is usually the oldest, most robotic one installed. Modern
// platforms also ship neural voices (Microsoft "Natural", Apple "Enhanced" /
// "Premium" / Siri, Google's network voices) — this module finds the best one
// available, and rewrites recipe text so it is read the way a person would say
// it ("2 tbsp" → "2 tablespoons", not "two tee bee ess pee").

// Voices that exist purely as novelties. They are never a good read-aloud
// choice, so they are excluded outright rather than merely ranked low.
const NOVELTY_VOICES = [
  'albert', 'bad news', 'bahh', 'bells', 'boing', 'bubbles', 'cellos',
  'deranged', 'good news', 'jester', 'organ', 'superstar', 'trinoids',
  'whisper', 'wobble', 'zarvox', 'bruce', 'fred', 'hysterical', 'junior',
  'kathy', 'pipe organ', 'princess', 'ralph', 'grandma', 'grandpa', 'rocko',
  'sandy', 'shelley', 'eddy', 'flo', 'reed',
]

// Legacy formant-synthesis engines — intelligible, but audibly synthetic.
const LEGACY_ENGINES = ['espeak', 'pico', 'festival', 'sapi', 'compact']

/**
 * Rank a voice by how natural it is likely to sound.
 *
 * Higher is better. Voices that are unusable for read-aloud (novelty voices,
 * or a language the text is not in) score `-Infinity` so callers can drop them.
 */
export function scoreVoice(voice, { lang = 'en-US' } = {}) {
  if (!voice || !voice.name) return -Infinity
  const name = String(voice.name).toLowerCase()
  const uri = String(voice.voiceURI || '').toLowerCase()
  const voiceLang = String(voice.lang || '').replace('_', '-')

  if (NOVELTY_VOICES.some((n) => name === n || name.startsWith(`${n} `))) return -Infinity

  // Only offer voices that speak the language of the content.
  const base = (l) => String(l || '').split('-')[0].toLowerCase()
  if (voiceLang && base(voiceLang) !== base(lang)) return -Infinity

  let score = 0

  // Explicit neural-voice markers, in rough order of how good they sound.
  if (/\bnatural\b/.test(name)) score += 100
  if (/\bneural\b/.test(name) || /neural/.test(uri)) score += 100
  if (/\bsiri\b/.test(name)) score += 80
  if (/\bpremium\b/.test(name)) score += 70
  if (/\benhanced\b/.test(name)) score += 60
  if (/\bgoogle\b/.test(name)) score += 50
  if (/\bonline\b/.test(name)) score += 20

  // Cloud voices are generally the newer, higher-quality models.
  if (voice.localService === false) score += 15

  // Legacy engines: usable fallback, but only if nothing better exists.
  if (LEGACY_ENGINES.some((e) => name.includes(e) || uri.includes(e))) score -= 60

  // Prefer the exact locale (en-US) over a sibling one (en-GB, en-AU).
  if (voiceLang.toLowerCase() === String(lang).toLowerCase()) score += 40
  else if (voiceLang) score += 10

  if (voice.default) score += 5

  return score
}

/**
 * All voices worth offering the user, best first.
 */
export function listNaturalVoices(voices, { lang = 'en-US' } = {}) {
  const seen = new Set()
  return (voices || [])
    .map((voice) => ({ voice, score: scoreVoice(voice, { lang }) }))
    .filter(({ voice, score }) => {
      // Some platforms list the same voice twice; a picker should show it once.
      const key = voice?.voiceURI || voice?.name
      if (score === -Infinity || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => b.score - a.score || a.voice.name.localeCompare(b.voice.name))
    .map(({ voice }) => voice)
}

/**
 * Pick the voice to speak with: the user's saved choice when it is still
 * installed, otherwise the most natural-sounding one available.
 */
export function pickNaturalVoice(voices, { lang = 'en-US', preferredURI = '' } = {}) {
  const ranked = listNaturalVoices(voices, { lang })
  const saved = preferredURI && ranked.find((v) => v.voiceURI === preferredURI)
  return saved || ranked[0] || null
}

// ── Speech-friendly text ─────────────────────────────────────────────────────

const UNICODE_FRACTIONS = {
  '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4',
  '⅕': '1/5', '⅖': '2/5', '⅗': '3/5', '⅘': '4/5', '⅙': '1/6', '⅚': '5/6',
  '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8',
}

const FRACTION_WORDS = {
  '1/2': 'a half', '1/3': 'a third', '2/3': 'two thirds',
  '1/4': 'a quarter', '3/4': 'three quarters',
  '1/5': 'a fifth', '2/5': 'two fifths', '3/5': 'three fifths', '4/5': 'four fifths',
  '1/6': 'a sixth', '5/6': 'five sixths',
  '1/8': 'an eighth', '3/8': 'three eighths', '5/8': 'five eighths', '7/8': 'seven eighths',
}

const MIXED_FRACTION_WORDS = {
  '1/2': 'a half', '1/3': 'a third', '2/3': 'two thirds',
  '1/4': 'a quarter', '3/4': 'three quarters',
  '1/8': 'an eighth', '3/8': 'three eighths', '5/8': 'five eighths', '7/8': 'seven eighths',
}

// Abbreviations that are safe to expand anywhere, even without a number.
const UNITS = [
  [/\btbsps?\b\.?/gi, 'tablespoon'],
  [/\btbs\b\.?/gi, 'tablespoon'],
  [/\btablespoons?\b/gi, 'tablespoon'],
  [/\btsps?\b\.?/gi, 'teaspoon'],
  [/\bteaspoons?\b/gi, 'teaspoon'],
  [/\bfl\.?\s?ozs?\b\.?/gi, 'fluid ounce'],
  [/\bozs?\b\.?/gi, 'ounce'],
  [/\blbs?\b\.?/gi, 'pound'],
  [/\bqts?\b\.?/gi, 'quart'],
  [/\bpts?\b\.?/gi, 'pint'],
  [/\bgals?\b\.?/gi, 'gallon'],
]

// Short unit symbols only expand when they directly follow a number, so words
// like "a g" or a stray "l" are never mangled.
const NUMERIC_UNITS = [
  [/(\d)\s*kgs?\b\.?/gi, 'kilogram'],
  [/(\d)\s*mls?\b\.?/gi, 'millilitre'],
  [/(\d)\s*grams?\b/gi, 'gram'],
  [/(\d)\s*gs?\b\.?/gi, 'gram'],
  [/(\d)\s*ltrs?\b\.?/gi, 'litre'],
  [/(\d)\s*mins?\b\.?/gi, 'minute'],
  [/(\d)\s*minutes?\b/gi, 'minute'],
  [/(\d)\s*hrs?\b\.?/gi, 'hour'],
  [/(\d)\s*secs?\b\.?/gi, 'second'],
  [/(\d)\s*cms?\b\.?/gi, 'centimetre'],
  [/(\d)\s*mms?\b\.?/gi, 'millimetre'],
  [/(\d)\s*ins?\b\.?/gi, 'inch'],
  [/(\d)\s*"/g, 'inch'],
]

function pluralize(word, plural) {
  if (!plural) return word
  if (word === 'inch') return 'inches'
  return `${word}s`
}

const FRACTION_WORD_TAIL = Object.values(FRACTION_WORDS)
  .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|')

// Decide singular vs plural from whatever amount sits in front of the unit.
// "1 tsp" is one teaspoon, "2 tsp" is two, and a mixed number like
// "1 and a half tsp" is plural even though no digit immediately precedes it.
function isPluralAmount(text, index) {
  const before = text.slice(0, index).trimEnd()
  const digits = before.match(/(\d+(?:\.\d+)?)$/)
  if (digits) return parseFloat(digits[1]) !== 1
  return new RegExp(`\\band (?:${FRACTION_WORD_TAIL})$`).test(before)
}

/**
 * Rewrite recipe text so a speech engine pronounces it the way a cook would
 * say it out loud. Purely a speech transform — the on-screen text is untouched.
 */
export function humanizeForSpeech(text) {
  if (!text) return ''
  let out = String(text)

  // Markdown leftovers and bullets read as noise.
  out = out.replace(/[*_`#]+/g, ' ').replace(/^\s*[-•–]\s+/gm, ' ')

  // Unicode fractions → ASCII, so one set of rules handles both.
  out = out.replace(/[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, (c) => ` ${UNICODE_FRACTIONS[c]} `)

  // Temperatures, before ranges so "350-375°F" keeps its unit.
  out = out.replace(/(\d+)\s*°\s*F\b\.?/gi, '$1 degrees Fahrenheit')
  out = out.replace(/(\d+)\s*°\s*C\b\.?/gi, '$1 degrees Celsius')
  out = out.replace(/(\d{2,3})\s*(?:°|deg\.?|degrees)\s*F\b\.?/gi, '$1 degrees Fahrenheit')
  out = out.replace(/(\d{2,3})\s*(?:°|deg\.?|degrees)\s*C\b\.?/gi, '$1 degrees Celsius')
  out = out.replace(/(\d{2,3})\s?F\b(?!\w)/g, '$1 degrees Fahrenheit')
  out = out.replace(/(\d{2,3})\s?C\b(?!\w)/g, '$1 degrees Celsius')
  out = out.replace(/(\d+)\s*°/g, '$1 degrees')

  // Mixed numbers: "1 1/2 cups" → "1 and a half cups".
  out = out.replace(/\b(\d+)\s+(\d\/\d)\b/g, (whole, n, frac) =>
    MIXED_FRACTION_WORDS[frac] ? `${n} and ${MIXED_FRACTION_WORDS[frac]}` : whole)

  // Bare fractions: "1/2 tsp" → "a half tsp" (the unit is expanded below).
  out = out.replace(/\b(\d\/\d)\b/g, (whole, frac) => FRACTION_WORDS[frac] || whole)

  // Ranges and pan dimensions.
  out = out.replace(/(\d)\s*[-–—]\s*(\d)/g, '$1 to $2')
  out = out.replace(/(\d)\s*[xX×]\s*(\d)/g, '$1 by $2')

  // Units, pluralized from the number in front of them.
  for (const [pattern, word] of NUMERIC_UNITS) {
    out = out.replace(pattern, (match, digit, offset) => {
      const end = offset + match.indexOf(digit) + digit.length
      return `${digit} ${pluralize(word, isPluralAmount(out, end))}`
    })
  }
  for (const [pattern, word] of UNITS) {
    out = out.replace(pattern, (match, offset) => pluralize(word, isPluralAmount(out, offset)))
  }

  // Symbols and shorthand.
  out = out.replace(/~\s*/g, 'about ')
  out = out.replace(/\s*&\s*/g, ' and ')
  out = out.replace(/(\d)\s*%/g, '$1 percent')
  out = out.replace(/\bw\/o\b/gi, 'without')
  out = out.replace(/\bw\/(?=\s|\w)/gi, 'with ')
  out = out.replace(/\bapprox\.?\b/gi, 'approximately')
  out = out.replace(/\be\.g\.\s*/gi, 'for example ')
  out = out.replace(/\bi\.e\.\s*/gi, 'that is ')
  out = out.replace(/\bvs\.?\b/gi, 'versus')

  return out.replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim()
}

/**
 * Break text into utterance-sized pieces.
 *
 * Speaking sentence by sentence gives the pauses a listener expects, and keeps
 * each utterance short enough that Chrome does not cut it off mid-sentence.
 */
export function chunkForSpeech(text, maxChars = 200) {
  const clean = String(text || '').trim()
  if (!clean) return []

  const sentences = clean.match(/[^.!?]+[.!?]*\s*/g) || [clean]
  const chunks = []
  let current = ''

  const push = () => {
    const trimmed = current.trim()
    if (trimmed) chunks.push(trimmed)
    current = ''
  }

  for (const raw of sentences) {
    const sentence = raw.trim()
    if (!sentence) continue
    if (sentence.length > maxChars) {
      push()
      for (const part of splitLongSentence(sentence, maxChars)) chunks.push(part)
      continue
    }
    if ((current ? `${current} ${sentence}` : sentence).length > maxChars) push()
    current = current ? `${current} ${sentence}` : sentence
  }
  push()
  return chunks
}

function splitLongSentence(sentence, maxChars) {
  const parts = []
  let current = ''
  // Clauses first, so a break lands where a speaker would breathe anyway.
  for (const clause of sentence.split(/(?<=[,;:])\s+/)) {
    if (clause.length > maxChars) {
      if (current.trim()) parts.push(current.trim())
      current = ''
      let words = ''
      for (const word of clause.split(/\s+/)) {
        if ((words ? `${words} ${word}` : word).length > maxChars) {
          if (words) parts.push(words)
          words = word
        } else {
          words = words ? `${words} ${word}` : word
        }
      }
      if (words) parts.push(words)
      continue
    }
    if ((current ? `${current} ${clause}` : clause).length > maxChars) {
      if (current.trim()) parts.push(current.trim())
      current = clause
    } else {
      current = current ? `${current} ${clause}` : clause
    }
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

// ── Speaking ─────────────────────────────────────────────────────────────────

// Slightly under real time: natural voices read recipe steps too briskly to
// follow while your hands are busy.
export const DEFAULT_RATE = 0.95

/**
 * A speaker that reads text one chunk at a time and can be cancelled cleanly.
 *
 * Each `speak()` claims a new session id; callbacks from a superseded session
 * are ignored, so a cancel mid-sentence never reports the old text as finished.
 */
export function createNaturalSpeaker(getSynth = () =>
  (typeof window !== 'undefined' ? window.speechSynthesis : null)) {
  let session = 0
  let keepAlive = null

  const stopKeepAlive = () => {
    if (keepAlive != null) {
      clearInterval(keepAlive)
      keepAlive = null
    }
  }

  // Chrome stops speaking after ~15 seconds unless it is nudged.
  const startKeepAlive = (synth) => {
    stopKeepAlive()
    if (typeof setInterval !== 'function') return
    keepAlive = setInterval(() => {
      if (!synth.speaking) return stopKeepAlive()
      if (typeof synth.resume === 'function') synth.resume()
    }, 10000)
  }

  function cancel() {
    session += 1
    stopKeepAlive()
    const synth = getSynth()
    if (synth && typeof synth.cancel === 'function') synth.cancel()
  }

  function speak(text, {
    voice = null,
    rate = DEFAULT_RATE,
    pitch = 1,
    volume = 1,
    lang = 'en-US',
    onStart,
    onEnd,
    onError,
  } = {}) {
    const synth = getSynth()
    const Utterance = typeof window !== 'undefined' ? window.SpeechSynthesisUtterance : null
    if (!synth || !Utterance) return false

    const chunks = chunkForSpeech(humanizeForSpeech(text))
    if (chunks.length === 0) return false

    cancel()
    const mySession = session
    const isCurrent = () => mySession === session

    let started = false
    const speakChunk = (index) => {
      if (!isCurrent() || index >= chunks.length) return
      const utterance = new Utterance(chunks[index])
      if (voice) {
        utterance.voice = voice
        if (voice.lang) utterance.lang = voice.lang
      } else {
        utterance.lang = lang
      }
      utterance.rate = rate
      utterance.pitch = pitch
      utterance.volume = volume
      utterance.onstart = () => {
        if (!isCurrent() || started) return
        started = true
        startKeepAlive(synth)
        onStart?.()
      }
      utterance.onend = () => {
        if (!isCurrent()) return
        if (index + 1 < chunks.length) {
          speakChunk(index + 1)
          return
        }
        stopKeepAlive()
        onEnd?.()
      }
      utterance.onerror = () => {
        if (!isCurrent()) return
        stopKeepAlive()
        onError?.()
      }
      synth.speak(utterance)
    }

    speakChunk(0)
    return true
  }

  return { speak, cancel }
}
