import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import IngredientStateBoard from '../IngredientStateBoard.jsx'
import { createIngredientStateTracker } from '../../../shared/ingredient-state.js'

describe('IngredientStateBoard UI Component', () => {
  const sampleTracker = createIngredientStateTracker({
    ingredients: ['1 large yellow onion', '500g frozen chicken breast'],
    steps: ['Dice onion and sauté in pan.'],
    equipment: ['skillet'],
  })

  it('renders entity chips and groups', () => {
    render(
      <IngredientStateBoard
        tracker={sampleTracker}
        onPatchState={jest.fn()}
        onAddEntity={jest.fn()}
      />
    )

    expect(screen.getByText('Live Ingredient State')).toBeInTheDocument()
    expect(screen.getByText(/tracked/i)).toBeInTheDocument()
    expect(screen.getByText('yellow onion')).toBeInTheDocument()
    expect(screen.getByText('frozen chicken breast')).toBeInTheDocument()
    expect(screen.getByText('skillet')).toBeInTheDocument()
  })

  it('renders validation warnings when provided', () => {
    const warning = {
      severity: 'critical',
      warning: 'Food Safety Warning: Chicken is marked as frozen.',
    }

    render(
      <IngredientStateBoard
        tracker={sampleTracker}
        warning={warning}
        onPatchState={jest.fn()}
        onAddEntity={jest.fn()}
      />
    )

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/Food Safety Warning: Chicken is marked as frozen/i)).toBeInTheDocument()
  })

  it('opens state editor on chip click and triggers onPatchState', () => {
    const onPatchState = jest.fn()
    render(
      <IngredientStateBoard
        tracker={sampleTracker}
        onPatchState={onPatchState}
        onAddEntity={jest.fn()}
      />
    )

    const onionChip = screen.getByText('yellow onion')
    fireEvent.click(onionChip)

    expect(screen.getByText(/Correct state for: yellow onion/i)).toBeInTheDocument()

    const saveBtn = screen.getByText('Apply Update')
    fireEvent.click(saveBtn)

    expect(onPatchState).toHaveBeenCalled()
  })

  it('allows adding a new entity', () => {
    const onAddEntity = jest.fn()
    render(
      <IngredientStateBoard
        tracker={sampleTracker}
        onPatchState={jest.fn()}
        onAddEntity={onAddEntity}
      />
    )

    const addBtn = screen.getByTitle('Add intermediate or tool')
    fireEvent.click(addBtn)

    expect(screen.getByText('Track New Kitchen Entity')).toBeInTheDocument()

    const input = screen.getByPlaceholderText(/e.g. pan sauce/i)
    fireEvent.change(input, { target: { value: 'pan sauce' } })

    const submitBtn = screen.getByText('Add Entity')
    fireEvent.click(submitBtn)

    expect(onAddEntity).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'pan sauce',
        type: 'intermediate',
        source: 'user',
      })
    )
  })

  it('toggles collapse state', () => {
    const onToggleCollapse = jest.fn()
    const { rerender } = render(
      <IngredientStateBoard
        tracker={sampleTracker}
        isCollapsed={false}
        onToggleCollapse={onToggleCollapse}
      />
    )

    const collapseBtn = screen.getByText('Hide ▲')
    fireEvent.click(collapseBtn)
    expect(onToggleCollapse).toHaveBeenCalled()

    rerender(
      <IngredientStateBoard
        tracker={sampleTracker}
        isCollapsed={true}
        onToggleCollapse={onToggleCollapse}
      />
    )
    expect(screen.getByText('Show ▼')).toBeInTheDocument()
    expect(screen.queryByText('Ingredients')).not.toBeInTheDocument()
  })
})
