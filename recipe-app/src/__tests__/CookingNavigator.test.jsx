import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import CookingNavigator from '../CookingNavigator'

// Default flag values for all tests in this file.
// voice-control: true  — keeps existing hands-free voice tests passing.
// gesture-support: false — gesture feature is off by default; enable per-test as needed.
const flagOverrides = { 'voice-control': true, 'gesture-support': false }
jest.mock('../flaggly.js', () => ({
  useFlag: (key) => flagOverrides[key] ?? false,
  flaggly: {},
}))

const baseRecipe = {
  name: 'Test Recipe',
  ingredients: ['200g flour', '2 eggs', '100ml milk'],
  instructions: ['Mix flour and eggs.', 'Add milk and stir.', 'Cook for 5 minutes.'],
}

function renderNavigator(overrides = {}, props = {}) {
  const recipe = { ...baseRecipe, ...overrides }
  const onClose = jest.fn()
  render(<CookingNavigator recipe={recipe} onClose={onClose} {...props} />)
  return { onClose }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockSpeechRecognition() {
  const instance = {
    continuous: false,
    interimResults: false,
    lang: '',
    onresult: null,
    onerror: null,
    onend: null,
    start: jest.fn(),
    stop: jest.fn(),
  }
  const Constructor = jest.fn(() => instance)
  window.SpeechRecognition = Constructor
  return { Constructor, instance }
}

function fireSpeechResult(instance, transcript) {
  act(() => {
    instance.onresult({
      resultIndex: 0,
      results: [
        [{ transcript }],
      ],
    })
  })
}

// ── Rendering ─────────────────────────────────────────────────────────────────

describe('CookingNavigator — rendering', () => {
  test('shows step 1 of 3 on initial render', () => {
    renderNavigator()
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument()
  })

  test('shows first instruction text', () => {
    renderNavigator()
    expect(screen.getByText('Mix flour and eggs.')).toBeInTheDocument()
  })

  test('renders Prev and Next navigation buttons', () => {
    renderNavigator()
    expect(screen.getByText('← Prev')).toBeInTheDocument()
    expect(screen.getByText('Next →')).toBeInTheDocument()
  })

  test('Prev button is disabled on first step', () => {
    renderNavigator()
    expect(screen.getByText('← Prev')).toBeDisabled()
  })

  test('Next button is disabled on last step', () => {
    renderNavigator()
    fireEvent.click(screen.getByText('Next →'))
    fireEvent.click(screen.getByText('Next →'))
    expect(screen.getByText('Next →')).toBeDisabled()
  })

  test('calls onClose when close button is clicked', () => {
    const { onClose } = renderNavigator()
    fireEvent.click(screen.getByTitle('Exit cooking mode'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

// ── Navigation ────────────────────────────────────────────────────────────────

describe('CookingNavigator — step navigation', () => {
  test('advances to next step on Next click', () => {
    renderNavigator()
    fireEvent.click(screen.getByText('Next →'))
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument()
    expect(screen.getByText('Add milk and stir.')).toBeInTheDocument()
  })

  test('goes back to previous step on Prev click', () => {
    renderNavigator()
    fireEvent.click(screen.getByText('Next →'))
    fireEvent.click(screen.getByText('← Prev'))
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument()
  })
})

// ── Hands-free mode — button ──────────────────────────────────────────────────

describe('CookingNavigator — hands-free button', () => {
  test('renders hands-free mic button', () => {
    renderNavigator()
    expect(screen.getByTitle('Start hands-free voice navigation')).toBeInTheDocument()
  })

  test('mic button has aria-pressed=false initially', () => {
    renderNavigator()
    expect(screen.getByLabelText('Start hands-free mode')).toHaveAttribute('aria-pressed', 'false')
  })

  test('mic button toggles aria-pressed when clicked (unsupported env)', () => {
    delete window.SpeechRecognition
    delete window.webkitSpeechRecognition
    renderNavigator()
    fireEvent.click(screen.getByTitle('Start hands-free voice navigation'))
    expect(screen.getByLabelText('Stop hands-free mode')).toHaveAttribute('aria-pressed', 'true')
  })

  test('shows unsupported message when Speech API unavailable', () => {
    delete window.SpeechRecognition
    delete window.webkitSpeechRecognition
    renderNavigator()
    fireEvent.click(screen.getByTitle('Start hands-free voice navigation'))
    expect(screen.getByText(/Voice not supported/i)).toBeInTheDocument()
  })

  test('clicking mic button again deactivates hands-free mode', () => {
    delete window.SpeechRecognition
    delete window.webkitSpeechRecognition
    renderNavigator()
    fireEvent.click(screen.getByTitle('Start hands-free voice navigation'))
    fireEvent.click(screen.getByTitle('Stop hands-free mode'))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

// ── Hands-free mode — with SpeechRecognition ─────────────────────────────────

describe('CookingNavigator — voice commands', () => {
  afterEach(() => {
    delete window.SpeechRecognition
    delete window.webkitSpeechRecognition
  })

  test('starts recognition when hands-free mode activated', () => {
    const { instance } = mockSpeechRecognition()
    renderNavigator()
    fireEvent.click(screen.getByTitle('Start hands-free voice navigation'))
    expect(instance.start).toHaveBeenCalledTimes(1)
  })

  test('shows listening status bar when voice is active', () => {
    mockSpeechRecognition()
    renderNavigator()
    fireEvent.click(screen.getByTitle('Start hands-free voice navigation'))
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText(/Listening/i)).toBeInTheDocument()
  })

  test('"next" voice command advances to next step', () => {
    const { instance } = mockSpeechRecognition()
    renderNavigator()
    fireEvent.click(screen.getByTitle('Start hands-free voice navigation'))
    fireSpeechResult(instance, 'next')
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument()
  })

  test('"back" voice command goes to previous step', () => {
    const { instance } = mockSpeechRecognition()
    renderNavigator()
    fireEvent.click(screen.getByTitle('Start hands-free voice navigation'))
    fireSpeechResult(instance, 'next')
    fireSpeechResult(instance, 'back')
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument()
  })

  test('"previous" voice command goes to previous step', () => {
    const { instance } = mockSpeechRecognition()
    renderNavigator()
    fireEvent.click(screen.getByTitle('Start hands-free voice navigation'))
    fireSpeechResult(instance, 'next')
    fireSpeechResult(instance, 'previous')
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument()
  })

  test('"next" does not advance past last step', () => {
    const { instance } = mockSpeechRecognition()
    renderNavigator()
    fireEvent.click(screen.getByTitle('Start hands-free voice navigation'))
    fireSpeechResult(instance, 'next')
    fireSpeechResult(instance, 'next')
    fireSpeechResult(instance, 'next') // already on last step
    expect(screen.getByText('Step 3 of 3')).toBeInTheDocument()
  })

  test('"back" does not go before first step', () => {
    const { instance } = mockSpeechRecognition()
    renderNavigator()
    fireEvent.click(screen.getByTitle('Start hands-free voice navigation'))
    fireSpeechResult(instance, 'back') // already on first step
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument()
  })

  test('"stop" voice command calls onClose', () => {
    const { instance } = mockSpeechRecognition()
    const { onClose } = renderNavigator()
    fireEvent.click(screen.getByTitle('Start hands-free voice navigation'))
    fireSpeechResult(instance, 'stop')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('"close" voice command calls onClose', () => {
    const { instance } = mockSpeechRecognition()
    const { onClose } = renderNavigator()
    fireEvent.click(screen.getByTitle('Start hands-free voice navigation'))
    fireSpeechResult(instance, 'close')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('stops recognition when hands-free mode deactivated', () => {
    const { instance } = mockSpeechRecognition()
    renderNavigator()
    fireEvent.click(screen.getByTitle('Start hands-free voice navigation'))
    fireEvent.click(screen.getByTitle('Stop hands-free mode'))
    expect(instance.stop).toHaveBeenCalledTimes(1)
  })

  test('sets recognition to continuous mode', () => {
    const { instance } = mockSpeechRecognition()
    renderNavigator()
    fireEvent.click(screen.getByTitle('Start hands-free voice navigation'))
    expect(instance.continuous).toBe(true)
  })
})
