import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import PlannerSuggestions from '../PlannerSuggestions.jsx'

const mockAddUpNext = jest.fn()
let mockUpNext = []

jest.mock('../MealPlanContext.jsx', () => ({
  useMealPlan: () => ({
    upNext: mockUpNext,
    addUpNext: mockAddUpNext,
  }),
}))

const RECENTS = [
  { id: 'a', name: 'Miso Soup', image: 'https://example.com/a.jpg' },
  { id: 'b', name: 'Chili' },
]

describe('PlannerSuggestions', () => {
  beforeEach(() => {
    mockAddUpNext.mockClear()
    mockUpNext = []
  })

  test('renders nothing without usable recipes', () => {
    const { container } = render(<PlannerSuggestions recipes={[]} />)
    expect(container).toBeEmptyDOMElement()

    const { container: partial } = render(<PlannerSuggestions recipes={[{ name: 'no id' }]} />)
    expect(partial).toBeEmptyDOMElement()
  })

  test('one tap stages a recent recipe and announces it', () => {
    jest.useFakeTimers()
    render(<PlannerSuggestions recipes={RECENTS} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add Miso Soup to Up Next' }))

    expect(mockAddUpNext).toHaveBeenCalledWith(RECENTS[0])
    expect(screen.getByRole('status')).toHaveTextContent('Miso Soup added to Up Next')

    act(() => { jest.advanceTimersByTime(2000) })
    expect(screen.getByRole('status')).toHaveTextContent('')
    jest.useRealTimers()
  })

  test('marks recipes already staged in Up Next', () => {
    mockUpNext = [{ id: 'b', name: 'Chili' }]
    render(<PlannerSuggestions recipes={RECENTS} />)

    expect(screen.getByTestId('planner-suggestion-b').className).toContain('--staged')
    expect(screen.getByTestId('planner-suggestion-a').className).not.toContain('--staged')
  })

  test('caps the number of suggestions', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ id: `r${i}`, name: `Recipe ${i}` }))
    render(<PlannerSuggestions recipes={many} limit={3} />)

    expect(screen.getAllByRole('button')).toHaveLength(3)
  })
})
