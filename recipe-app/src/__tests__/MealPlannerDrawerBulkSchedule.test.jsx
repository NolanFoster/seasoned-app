import React from 'react'
import { render, screen } from '@testing-library/react'
import MealPlannerDrawer from '../MealPlannerDrawer.jsx'

let mockUpNext = []

jest.mock('../useDragContext.js', () => ({
  useDragContext: () => ({ isDragging: false }),
}))

jest.mock('../MealPlanContext.jsx', () => ({
  useMealPlan: () => ({
    mealPlan: {},
    upNext: mockUpNext,
    addUpNext: jest.fn(),
    groceryList: [],
    isGeneratingList: false,
    listGenerationError: null,
    generateGroceryListStart: jest.fn(),
    generateGroceryListError: jest.fn(),
    setGroceryList: jest.fn(),
    clearGroceryList: jest.fn(),
  }),
}))

const RECENTS = [{ id: 'a', name: 'Miso Soup' }]

function renderDrawer(props = {}) {
  return render(
    <MealPlannerDrawer isOpen onClose={() => {}} {...props}>
      <div>week grid</div>
    </MealPlannerDrawer>
  )
}

describe('MealPlannerDrawer — bulk schedule entry point', () => {
  beforeEach(() => {
    mockUpNext = [{ id: 'r1', name: 'Staged One' }]
  })

  test('is absent when the flag is off', () => {
    renderDrawer({ onOpenBulkSchedule: jest.fn(), recentRecipes: RECENTS })

    expect(screen.queryByRole('button', { name: /schedule all staged recipes/i })).toBeNull()
    expect(screen.queryByLabelText('Recent recipes')).toBeNull()
  })

  test('shows the button and the recents strip when the flag is on', () => {
    renderDrawer({
      bulkScheduleEnabled: true,
      onOpenBulkSchedule: jest.fn(),
      recentRecipes: RECENTS,
    })

    expect(screen.getByRole('button', { name: /schedule all staged recipes/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Add Miso Soup to Up Next' })).toBeInTheDocument()
  })

  test('disables the button while nothing is staged', () => {
    mockUpNext = []
    renderDrawer({ bulkScheduleEnabled: true, onOpenBulkSchedule: jest.fn() })

    expect(screen.getByRole('button', { name: /schedule all staged recipes/i })).toBeDisabled()
  })
})
