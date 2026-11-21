import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import CookingNavigator from '../CookingNavigator.jsx'
import { liftRecipeToProcessGraph } from '../../../shared/recipe-process-graph.js'

jest.mock('../useGestureMode.js', () => ({
  __esModule: true,
  default: () => ({
    isSupported: false,
    status: 'idle',
    start: jest.fn(),
    stop: jest.fn(),
    gestureProgress: null,
  }),
}))

jest.mock('../flaggly.js', () => ({
  useFlag: (key) => key === 'recipe-process-graph-v1',
  flaggly: {},
}))

describe('CookingNavigator process graph rendering', () => {
  test('renders graph-backed instructions and only step-local ingredients', () => {
    const legacyRecipe = {
      name: 'Pasta with pan sauce',
      ingredients: ['8 oz pasta', '2 tbsp olive oil', '2 cloves garlic'],
      instructions: [
        'Boil pasta in a pot for 8 minutes.',
        'Meanwhile, heat olive oil in a skillet and sauté garlic.',
      ],
    }
    const processGraph = liftRecipeToProcessGraph(legacyRecipe)

    render(<CookingNavigator recipe={{ ...legacyRecipe, processGraph }} onClose={jest.fn()} />)
    fireEvent.click(screen.getByText('Start Cooking →'))

    expect(screen.getByText(/Boil pasta in a pot for/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /8 oz pasta/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /olive oil/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /garlic/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Next →'))
    expect(screen.getByRole('button', { name: /olive oil/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /garlic/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /8 oz pasta/i })).not.toBeInTheDocument()
  })

  test('falls back to legacy instruction matching for low-confidence graphs', () => {
    const recipe = {
      name: 'Fallback recipe',
      ingredients: ['1 cup flour', '1 cup sugar'],
      instructions: ['Mix flour.', 'Add sugar.'],
      processGraph: liftRecipeToProcessGraph({
        ingredients: ['1 cup flour'],
        instructions: ['Mix flour.'],
      }),
      graphConfidence: 'low',
    }

    render(<CookingNavigator recipe={recipe} onClose={jest.fn()} />)
    fireEvent.click(screen.getByText('Start Cooking →'))
    expect(screen.getByText('Mix flour.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /1 cup sugar/i })).not.toHaveClass('cn-ingredient-chip--active')
  })
})
