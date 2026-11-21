import {
  scoreVoice,
  listNaturalVoices,
  pickNaturalVoice,
  humanizeForSpeech,
  chunkForSpeech,
  createNaturalSpeaker,
  DEFAULT_RATE,
} from '../utils/naturalVoice'

function voice(name, extra = {}) {
  return { name, voiceURI: extra.voiceURI || name, lang: 'en-US', localService: true, default: false, ...extra }
}

// ── Voice ranking ────────────────────────────────────────────────────────────

describe('scoreVoice', () => {
  test('ranks a neural voice above a legacy one', () => {
    expect(scoreVoice(voice('Microsoft Ava Online (Natural) - English (United States)')))
      .toBeGreaterThan(scoreVoice(voice('Microsoft David Desktop - English (United States)')))
  })

  test('ranks an enhanced voice above its plain sibling', () => {
    expect(scoreVoice(voice('Samantha (Enhanced)'))).toBeGreaterThan(scoreVoice(voice('Samantha')))
  })

  test('excludes novelty voices', () => {
    expect(scoreVoice(voice('Zarvox'))).toBe(-Infinity)
    expect(scoreVoice(voice('Bad News'))).toBe(-Infinity)
    expect(scoreVoice(voice('Albert'))).toBe(-Infinity)
  })

  test('excludes voices for another language', () => {
    expect(scoreVoice(voice('Amélie', { lang: 'fr-CA' }))).toBe(-Infinity)
  })

  test('prefers the exact locale over a sibling locale', () => {
    expect(scoreVoice(voice('Samantha', { lang: 'en-US' })))
      .toBeGreaterThan(scoreVoice(voice('Daniel', { lang: 'en-GB' })))
  })

  test('handles a missing voice', () => {
    expect(scoreVoice(null)).toBe(-Infinity)
    expect(scoreVoice({})).toBe(-Infinity)
  })
})

describe('listNaturalVoices', () => {
  test('sorts best first and drops unusable voices', () => {
    const names = listNaturalVoices([
      voice('Zarvox'),
      voice('Fred'),
      voice('Thomas', { lang: 'fr-FR' }),
      voice('Samantha'),
      voice('Google US English', { localService: false }),
      voice('Ava (Premium)'),
    ]).map((v) => v.name)

    expect(names).not.toContain('Zarvox')
    expect(names).not.toContain('Fred')
    expect(names).not.toContain('Thomas')
    expect(names[0]).toBe('Ava (Premium)')
    expect(names).toContain('Samantha')
  })

  test('lists a duplicated voice once', () => {
    const names = listNaturalVoices([voice('Samantha'), voice('Samantha')]).map((v) => v.name)
    expect(names).toEqual(['Samantha'])
  })

  test('returns an empty list when no voices are installed', () => {
    expect(listNaturalVoices([])).toEqual([])
    expect(listNaturalVoices(undefined)).toEqual([])
  })
})

describe('pickNaturalVoice', () => {
  const voices = [voice('Samantha'), voice('Daniel', { lang: 'en-GB' }), voice('Ava (Natural)')]

  test('picks the most natural voice by default', () => {
    expect(pickNaturalVoice(voices).name).toBe('Ava (Natural)')
  })

  test('honours a saved preference', () => {
    expect(pickNaturalVoice(voices, { preferredURI: 'Samantha' }).name).toBe('Samantha')
  })

  test('falls back to the best voice when the saved one is gone', () => {
    expect(pickNaturalVoice(voices, { preferredURI: 'Uninstalled' }).name).toBe('Ava (Natural)')
  })

  test('returns null when nothing is usable', () => {
    expect(pickNaturalVoice([voice('Zarvox')])).toBeNull()
  })
})

// ── Speech-friendly text ─────────────────────────────────────────────────────

describe('humanizeForSpeech', () => {
  test('expands measurement abbreviations', () => {
    expect(humanizeForSpeech('Add 2 tbsp olive oil')).toBe('Add 2 tablespoons olive oil')
    expect(humanizeForSpeech('Add 1 tsp salt')).toBe('Add 1 teaspoon salt')
    expect(humanizeForSpeech('Use 8 oz pasta')).toBe('Use 8 ounces pasta')
    expect(humanizeForSpeech('Sear a 1 lb steak')).toBe('Sear a 1 pound steak')
  })

  test('expands metric and time units that follow a number', () => {
    expect(humanizeForSpeech('Add 250 g flour')).toBe('Add 250 grams flour')
    expect(humanizeForSpeech('Pour in 500 ml stock')).toBe('Pour in 500 millilitres stock')
    expect(humanizeForSpeech('Bake 25 min')).toBe('Bake 25 minutes')
    expect(humanizeForSpeech('Rest 1 hr')).toBe('Rest 1 hour')
  })

  test('leaves lone letters alone', () => {
    expect(humanizeForSpeech('Shape into a g shape')).toBe('Shape into a g shape')
  })

  test('reads temperatures as degrees', () => {
    expect(humanizeForSpeech('Heat oven to 350°F')).toBe('Heat oven to 350 degrees Fahrenheit')
    expect(humanizeForSpeech('Heat oven to 180C')).toBe('Heat oven to 180 degrees Celsius')
    expect(humanizeForSpeech('Preheat to 425 F.')).toBe('Preheat to 425 degrees Fahrenheit.')
  })

  test('reads fractions as words', () => {
    expect(humanizeForSpeech('Add 1/2 cup sugar')).toBe('Add a half cup sugar')
    expect(humanizeForSpeech('Add ¾ cup milk')).toBe('Add three quarters cup milk')
    expect(humanizeForSpeech('Add 1 1/2 tsp vanilla')).toBe('Add 1 and a half teaspoons vanilla')
  })

  test('reads ranges and pan sizes the way a cook says them', () => {
    expect(humanizeForSpeech('Bake 8-10 minutes')).toBe('Bake 8 to 10 minutes')
    expect(humanizeForSpeech('Use a 9x13 pan')).toBe('Use a 9 by 13 pan')
  })

  test('expands shorthand and symbols', () => {
    expect(humanizeForSpeech('Serve w/ bread & butter')).toBe('Serve with bread and butter')
    expect(humanizeForSpeech('Reduce by ~50%')).toBe('Reduce by about 50 percent')
  })

  test('strips markdown noise', () => {
    expect(humanizeForSpeech('**Whisk** the eggs')).toBe('Whisk the eggs')
  })

  test('handles empty input', () => {
    expect(humanizeForSpeech('')).toBe('')
    expect(humanizeForSpeech(null)).toBe('')
  })
})

describe('chunkForSpeech', () => {
  test('breaks between sentences rather than mid-sentence', () => {
    expect(chunkForSpeech('Heat the pan. Add the oil. Wait.', 16))
      .toEqual(['Heat the pan.', 'Add the oil.', 'Wait.'])
  })

  test('packs short sentences together', () => {
    expect(chunkForSpeech('Heat the pan. Add oil.', 200)).toEqual(['Heat the pan. Add oil.'])
  })

  test('splits an over-long sentence at clause boundaries', () => {
    const chunks = chunkForSpeech('Whisk the eggs until pale, then fold in the flour gently', 30)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((c) => c.length <= 30)).toBe(true)
  })

  test('splits on words when a clause is still too long', () => {
    const chunks = chunkForSpeech('aaa bbb ccc ddd eee fff ggg hhh', 10)
    expect(chunks.every((c) => c.length <= 10)).toBe(true)
    expect(chunks.join(' ')).toBe('aaa bbb ccc ddd eee fff ggg hhh')
  })

  test('returns nothing for empty text', () => {
    expect(chunkForSpeech('   ')).toEqual([])
    expect(chunkForSpeech(null)).toEqual([])
  })
})

// ── Speaker ──────────────────────────────────────────────────────────────────

function mockSynth() {
  const spoken = []
  const synth = {
    speaking: false,
    speak: jest.fn((u) => { spoken.push(u); synth.speaking = true; u.onstart?.() }),
    cancel: jest.fn(() => { synth.speaking = false }),
    resume: jest.fn(),
  }
  window.SpeechSynthesisUtterance = function (text) {
    this.text = text
    this.onstart = null
    this.onend = null
    this.onerror = null
  }
  return { synth, spoken }
}

// Long enough that chunking splits it between the two sentences.
const TWO_CHUNKS = `Heat the pan ${'gently '.repeat(20)}now. Then add the oil ${'slowly '.repeat(20)}now.`

describe('createNaturalSpeaker', () => {
  afterEach(() => { delete window.SpeechSynthesisUtterance })

  test('speaks one chunk at a time, in order', () => {
    const { synth, spoken } = mockSynth()
    const speaker = createNaturalSpeaker(() => synth)

    speaker.speak(TWO_CHUNKS, { rate: 1 })
    expect(spoken).toHaveLength(1)
    expect(spoken[0].text.startsWith('Heat')).toBe(true)

    spoken[0].onend()
    expect(spoken).toHaveLength(2)
    expect(spoken[1].text.startsWith('Then')).toBe(true)
  })

  test('reports start once and end after the final chunk', () => {
    const { synth, spoken } = mockSynth()
    const speaker = createNaturalSpeaker(() => synth)
    const onStart = jest.fn()
    const onEnd = jest.fn()

    speaker.speak(TWO_CHUNKS, { onStart, onEnd })
    expect(onStart).toHaveBeenCalledTimes(1)
    spoken[0].onend()
    expect(onStart).toHaveBeenCalledTimes(1)
    expect(onEnd).not.toHaveBeenCalled()
    spoken[1].onend()
    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  test('humanizes the text before speaking it', () => {
    const { synth, spoken } = mockSynth()
    createNaturalSpeaker(() => synth).speak('Add 2 tbsp oil')
    expect(spoken[0].text).toBe('Add 2 tablespoons oil')
  })

  test('applies the chosen voice and a natural default rate', () => {
    const { synth, spoken } = mockSynth()
    const chosen = voice('Ava (Natural)', { lang: 'en-GB' })
    createNaturalSpeaker(() => synth).speak('Stir.', { voice: chosen })
    expect(spoken[0].voice).toBe(chosen)
    expect(spoken[0].lang).toBe('en-GB')
    expect(spoken[0].rate).toBe(DEFAULT_RATE)
  })

  test('cancel stops the queue and suppresses stale callbacks', () => {
    const { synth, spoken } = mockSynth()
    const speaker = createNaturalSpeaker(() => synth)
    const onEnd = jest.fn()

    speaker.speak(TWO_CHUNKS, { onEnd })
    speaker.cancel()
    spoken[0].onend()

    expect(synth.cancel).toHaveBeenCalled()
    expect(spoken).toHaveLength(1)
    expect(onEnd).not.toHaveBeenCalled()
  })

  test('a new speak call supersedes the one in flight', () => {
    const { synth, spoken } = mockSynth()
    const speaker = createNaturalSpeaker(() => synth)
    const onEnd = jest.fn()

    speaker.speak(TWO_CHUNKS, { onEnd })
    speaker.speak('Three.')
    spoken[0].onend()

    expect(onEnd).not.toHaveBeenCalled()
    expect(spoken[spoken.length - 1].text).toBe('Three.')
  })

  test('reports errors', () => {
    const { synth, spoken } = mockSynth()
    const onError = jest.fn()
    createNaturalSpeaker(() => synth).speak('Stir.', { onError })
    spoken[0].onerror()
    expect(onError).toHaveBeenCalled()
  })

  test('does nothing without speech synthesis', () => {
    window.SpeechSynthesisUtterance = function () {}
    expect(createNaturalSpeaker(() => null).speak('Stir.')).toBe(false)
  })

  test('does nothing for empty text', () => {
    const { synth } = mockSynth()
    expect(createNaturalSpeaker(() => synth).speak('   ')).toBe(false)
  })
})
