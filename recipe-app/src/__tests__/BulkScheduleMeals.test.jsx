import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import BulkScheduleMeals from '../BulkScheduleMeals.jsx'

const mockAddMeal = jest.fn()
const mockRemoveUpNext = jest.fn()
let mockMealPlan = {}
let mockUpNext = []

jest.mock('../MealPlanContext.jsx', () => ({
  useMealPlan: () => ({
    mealPlan: mockMealPlan,
    upNext: mockUpNext,
    addMeal: mockAddMeal,
    removeUpNext: mockRemoveUpNext,
  }),
}))

function isoDay(offset) {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toISOString().split('T')[0]
}

function renderModal(props = {}) {
  return render(<BulkScheduleMeals open onClose={() => {}} {...props} />)
}

describe('BulkScheduleMeals', () => {
  beforeEach(() => {
    mockAddMeal.mockClear()
    mockRemoveUpNext.mockClear()
    mockMealPlan = {}
    mockUpNext = [
      { id: 'r1', name: 'Staged One' },
      { id: 'r2', name: 'Staged Two' },
    ]
  })

  test('renders nothing when closed', () => {
    const { container } = render(<BulkScheduleMeals open={false} onClose={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  test('previews one dinner per staged recipe without writing', () => {
    renderModal()

    expect(screen.getByText('Staged One')).toBeInTheDocument()
    expect(screen.getByText('Staged Two')).toBeInTheDocument()
    expect(screen.getByText(/2 staged recipes · 7 open slots this week/i)).toBeInTheDocument()
    expect(mockAddMeal).not.toHaveBeenCalled()
  })

  test('confirm writes each assignment and unstages the scheduled recipes', () => {
    const onClose = jest.fn()
    renderModal({ onClose })

    fireEvent.click(screen.getByRole('button', { name: /schedule 2 recipes/i }))

    expect(mockAddMeal).toHaveBeenCalledTimes(2)
    expect(mockAddMeal).toHaveBeenNthCalledWith(1, isoDay(0), 'dinner', mockUpNext[0])
    expect(mockAddMeal).toHaveBeenNthCalledWith(2, isoDay(1), 'dinner', mockUpNext[1])
    expect(mockRemoveUpNext).toHaveBeenCalledWith('r1')
    expect(mockRemoveUpNext).toHaveBeenCalledWith('r2')
    expect(onClose).toHaveBeenCalled()
  })

  test('never targets a slot that already has a recipe', () => {
    mockMealPlan = { [isoDay(0)]: { dinner: [{ id: 'existing', name: 'Already planned' }] } }
    renderModal()

    fireEvent.click(screen.getByRole('button', { name: /schedule 2 recipes/i }))

    expect(mockAddMeal).toHaveBeenNthCalledWith(1, isoDay(1), 'dinner', mockUpNext[0])
    expect(mockAddMeal).toHaveBeenNthCalledWith(2, isoDay(2), 'dinner', mockUpNext[1])
  })

  test('names the recipes that do not fit and leaves them staged', () => {
    mockUpNext = Array.from({ length: 8 }, (_, i) => ({ id: `r${i}`, name: `Recipe ${i}` }))
    renderModal()

    expect(screen.getByText(/No open slot for Recipe 7/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /schedule 7 recipes/i }))
    expect(mockAddMeal).toHaveBeenCalledTimes(7)
    expect(mockRemoveUpNext).not.toHaveBeenCalledWith('r7')
  })

  test('selecting another meal type widens the schedule', () => {
    mockUpNext = Array.from({ length: 8 }, (_, i) => ({ id: `r${i}`, name: `Recipe ${i}` }))
    renderModal()

    fireEvent.click(screen.getByLabelText('Breakfast'))

    expect(screen.getByRole('button', { name: /schedule 8 recipes/i })).toBeEnabled()
    expect(screen.getByText(/8 staged recipes · 14 open slots this week/i)).toBeInTheDocument()
  })

  test('disables confirm and explains the empty staging area', () => {
    mockUpNext = []
    renderModal()

    expect(screen.getByText(/Nothing is staged yet/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /schedule 0 recipes/i })).toBeDisabled()
  })

  test('clicking the backdrop closes the modal, clicking the sheet does not', () => {
    const onClose = jest.fn()
    renderModal({ onClose })

    fireEvent.mouseDown(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.mouseDown(screen.getByRole('dialog').parentElement)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('deselecting every meal type schedules nothing', () => {
    renderModal()

    fireEvent.click(screen.getByLabelText('Dinner'))

    expect(screen.getByRole('button', { name: /schedule 0 recipes/i })).toBeDisabled()
    expect(screen.getByText(/No open slot for Staged One, Staged Two/i)).toBeInTheDocument()
  })

  test('Escape closes the modal', () => {
    const onClose = jest.fn()
    renderModal({ onClose })

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
