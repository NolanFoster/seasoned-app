import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import CookingNavigator from '../CookingNavigator'
import useGestureMode from '../useGestureMode.js'

jest.mock('../useGestureMode.js')

// Default flag values for all tests in this file.
// voice-control: true  — keeps existing hands-free voice tests passing.
// gesture-support: false — gesture feature is off by default; enable per-test as needed.
const flagOverrides = { 'voice-control': true, 'gesture-support': false }
jest.mock('../flaggly.js', () => ({
  useFlag: (key) => flagOverrides[key] ?? false,
  flaggly: {},
}))

// Default stub for useGestureMode — overridden per-test in the gesture suite.
const defaultGestureHook = {
  isSupported: false,
  status: 'idle',
  start: jest.fn(),
  stop: jest.fn(),
  gestureProgress: null,
}
useGestureMode.mockReturnValue(defaultGestureHook)

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

// ── Gesture mode ──────────────────────────────────────────────────────────────

describe('CookingNavigator — gesture mode', () => {
  beforeEach(() => {
    flagOverrides['gesture-support'] = true
    useGestureMode.mockReturnValue({
      isSupported: true,
      status: 'idle',
      start: jest.fn(),
      stop: jest.fn(),
      gestureProgress: null,
    })
  })

  afterEach(() => {
    flagOverrides['gesture-support'] = false
  })

  test('renders gesture toggle button when flag and support are enabled', () => {
    renderNavigator()
    expect(screen.getByTitle('Wave to navigate steps')).toBeInTheDocument()
  })

  test('gesture button shows aria-pressed=false initially', () => {
    renderNavigator()
    expect(screen.getByLabelText('Start gesture mode')).toHaveAttribute('aria-pressed', 'false')
  })

  test('clicking gesture button calls start() and shows status bar', () => {
    const start = jest.fn()
    useGestureMode.mockReturnValue({
      isSupported: true, status: 'idle', start, stop: jest.fn(), gestureProgress: null,
    })
    renderNavigator()
    fireEvent.click(screen.getByTitle('Wave to navigate steps'))
    expect(start).toHaveBeenCalledTimes(1)
  })

  test('status bar shows updated instruction text when gesture mode is active', () => {
    useGestureMode.mockReturnValue({
      isSupported: true, status: 'active', start: jest.fn(), stop: jest.fn(), gestureProgress: null,
    })
    renderNavigator()
    fireEvent.click(screen.getByTitle('Wave to navigate steps'))
    expect(screen.getByText(/Hold.*for Next/i)).toBeInTheDocument()
    expect(screen.getByText(/for Prev/i)).toBeInTheDocument()
  })

  test('Target Lock overlay is not shown when gestureProgress is null', () => {
    useGestureMode.mockReturnValue({
      isSupported: true, status: 'active', start: jest.fn(), stop: jest.fn(), gestureProgress: null,
    })
    renderNavigator()
    expect(screen.queryByText('Next Step')).not.toBeInTheDocument()
    expect(screen.queryByText('Previous Step')).not.toBeInTheDocument()
  })

  test('Target Lock overlay appears with correct label for next direction', () => {
    useGestureMode.mockReturnValue({
      isSupported: true,
      status: 'active',
      start: jest.fn(),
      stop: jest.fn(),
      gestureProgress: { gestureName: 'Victory', direction: 'next', progress: 0.5 },
    })
    renderNavigator()
    expect(screen.getByText('Next Step')).toBeInTheDocument()
  })

  test('Target Lock overlay appears with correct label for prev direction', () => {
    useGestureMode.mockReturnValue({
      isSupported: true,
      status: 'active',
      start: jest.fn(),
      stop: jest.fn(),
      gestureProgress: { gestureName: 'Thumb_Down', direction: 'prev', progress: 0.4 },
    })
    renderNavigator()
    expect(screen.getByText('Previous Step')).toBeInTheDocument()
  })
})

// ── Ingredient matching (word-boundary fix) ───────────────────────────────────

describe('CookingNavigator — ingredient matching', () => {
  test('does not highlight "cheddar cheese" when step only mentions cheesecloth', () => {
    const recipe = {
      name: 'Strain Recipe',
      ingredients: ['1 cup cheddar cheese'],
      instructions: ['Strain the mixture through cheesecloth.', 'Done.'],
    }
    render(<CookingNavigator recipe={recipe} onClose={jest.fn()} />)
    const chip = screen.getByRole('button', { name: /cheddar cheese/i })
    expect(chip).not.toHaveClass('cn-ingredient-chip--active')
  })

  test('highlights "cheddar cheese" when step mentions cheese directly', () => {
    const recipe = {
      name: 'Cheese Recipe',
      ingredients: ['1 cup cheddar cheese'],
      instructions: ['Add the cheddar cheese and stir.', 'Done.'],
    }
    render(<CookingNavigator recipe={recipe} onClose={jest.fn()} />)
    const chip = screen.getByRole('button', { name: /cheddar cheese/i })
    expect(chip).toHaveClass('cn-ingredient-chip--active')
  })

  test('does not highlight "peas" when step only mentions "peanut butter"', () => {
    const recipe = {
      name: 'Peanut Recipe',
      ingredients: ['1 cup peas'],
      instructions: ['Spread peanut butter on toast.', 'Done.'],
    }
    render(<CookingNavigator recipe={recipe} onClose={jest.fn()} />)
    const chip = screen.getByRole('button', { name: /peas/i })
    expect(chip).not.toHaveClass('cn-ingredient-chip--active')
  })
})

// ── Ingredient quantity disambiguation ────────────────────────────────────────

describe('CookingNavigator — ingredient quantity disambiguation', () => {
  test('highlights only .5 cup sugar when step mentions .5', () => {
    const recipe = {
      name: 'Sugar Test',
      ingredients: ['.5 cup of sugar', '.25 cup sugar'],
      instructions: ['Add .5 cup sugar to bowl.', 'Done.'],
    }
    render(<CookingNavigator recipe={recipe} onClose={jest.fn()} />)
    expect(screen.getByRole('button', { name: /\.5 cup of sugar/i })).toHaveClass('cn-ingredient-chip--active')
    expect(screen.getByRole('button', { name: /\.25 cup sugar/i })).not.toHaveClass('cn-ingredient-chip--active')
  })

  test('highlights only .25 cup sugar when step mentions .25', () => {
    const recipe = {
      name: 'Sugar Test',
      ingredients: ['.5 cup of sugar', '.25 cup sugar'],
      instructions: ['Add .25 cup sugar to bowl.', 'Done.'],
    }
    render(<CookingNavigator recipe={recipe} onClose={jest.fn()} />)
    expect(screen.getByRole('button', { name: /\.5 cup of sugar/i })).not.toHaveClass('cn-ingredient-chip--active')
    expect(screen.getByRole('button', { name: /\.25 cup sugar/i })).toHaveClass('cn-ingredient-chip--active')
  })

  test('highlights both sugar ingredients when step specifies no quantity', () => {
    const recipe = {
      name: 'Sugar Test',
      ingredients: ['.5 cup of sugar', '.25 cup sugar'],
      instructions: ['Add the sugar to the bowl.', 'Done.'],
    }
    render(<CookingNavigator recipe={recipe} onClose={jest.fn()} />)
    expect(screen.getByRole('button', { name: /\.5 cup of sugar/i })).toHaveClass('cn-ingredient-chip--active')
    expect(screen.getByRole('button', { name: /\.25 cup sugar/i })).toHaveClass('cn-ingredient-chip--active')
  })

  test('handles fraction notation: 1/2 cup matches .5 cup ingredient', () => {
    const recipe = {
      name: 'Fraction Test',
      ingredients: ['1/2 cup butter', '1/4 cup butter'],
      instructions: ['Melt 1/2 cup butter in a pan.', 'Done.'],
    }
    render(<CookingNavigator recipe={recipe} onClose={jest.fn()} />)
    expect(screen.getByRole('button', { name: /1\/2 cup butter/i })).toHaveClass('cn-ingredient-chip--active')
    expect(screen.getByRole('button', { name: /1\/4 cup butter/i })).not.toHaveClass('cn-ingredient-chip--active')
  })
})

// ── Ingredient usage tracking ─────────────────────────────────────────────────

describe('CookingNavigator — ingredient usage tracking', () => {
  const trackingRecipe = {
    name: 'Tracking Recipe',
    ingredients: ['200g flour', '2 eggs'],
    instructions: ['Mix flour and eggs.', 'Add more flour and knead.'],
  }

  test('ingredient chips render as buttons', () => {
    render(<CookingNavigator recipe={trackingRecipe} onClose={jest.fn()} />)
    const chips = screen.getAllByRole('button', { name: /flour|eggs/i })
    expect(chips.length).toBeGreaterThan(0)
  })

  test('chips start with aria-pressed=false', () => {
    render(<CookingNavigator recipe={trackingRecipe} onClose={jest.fn()} />)
    const flourChip = screen.getAllByRole('button', { name: /flour/i })[0]
    expect(flourChip).toHaveAttribute('aria-pressed', 'false')
  })

  test('clicking a chip marks it as used (aria-pressed=true and --used class)', () => {
    render(<CookingNavigator recipe={trackingRecipe} onClose={jest.fn()} />)
    const flourChip = screen.getAllByRole('button', { name: /flour/i })[0]
    fireEvent.click(flourChip)
    expect(flourChip).toHaveAttribute('aria-pressed', 'true')
    expect(flourChip).toHaveClass('cn-ingredient-chip--used')
  })

  test('clicking a used chip toggles it back to unused', () => {
    render(<CookingNavigator recipe={trackingRecipe} onClose={jest.fn()} />)
    const flourChip = screen.getAllByRole('button', { name: /flour/i })[0]
    fireEvent.click(flourChip)
    fireEvent.click(flourChip)
    expect(flourChip).toHaveAttribute('aria-pressed', 'false')
    expect(flourChip).not.toHaveClass('cn-ingredient-chip--used')
  })

  test('used ingredient chip is not highlighted even when relevant to current step', () => {
    // Step 1: "Mix flour and eggs." — flour is relevant
    render(<CookingNavigator recipe={trackingRecipe} onClose={jest.fn()} />)
    const flourChip = screen.getAllByRole('button', { name: /flour/i })[0]
    // Mark flour as used manually on step 1
    fireEvent.click(flourChip)
    // Advance to step 2: "Add more flour and knead." — flour is still relevant but already used
    fireEvent.click(screen.getByText('Next →'))
    const flourChipStep2 = screen.getAllByRole('button', { name: /flour/i })[0]
    expect(flourChipStep2).toHaveClass('cn-ingredient-chip--used')
    expect(flourChipStep2).not.toHaveClass('cn-ingredient-chip--active')
  })

  test('auto-marks relevant ingredients as used when advancing to next step', () => {
    // Step 1: "Mix flour and eggs." — both are relevant
    render(<CookingNavigator recipe={trackingRecipe} onClose={jest.fn()} />)
    // Advance without manually clicking anything
    fireEvent.click(screen.getByText('Next →'))
    // Both should now be marked as used (auto-crossed from step 1)
    const flourChip = screen.getAllByRole('button', { name: /flour/i })[0]
    expect(flourChip).toHaveClass('cn-ingredient-chip--used')
    expect(flourChip).not.toHaveClass('cn-ingredient-chip--active')
  })
})
