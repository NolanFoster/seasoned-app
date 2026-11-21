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

  it('cancels an in-progress edit without patching', () => {
    const onPatchState = jest.fn()
    render(
      <IngredientStateBoard
        tracker={sampleTracker}
        onPatchState={onPatchState}
        onAddEntity={jest.fn()}
      />
    )
    fireEvent.click(screen.getByText('yellow onion'))
    expect(screen.getByText(/Correct state for: yellow onion/i)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByText(/Correct state for:/i)).toBeNull()
    expect(onPatchState).not.toHaveBeenCalled()
  })

  it('renders soft-gate, info, and default-severity warnings with distinct icons', () => {
    const { rerender } = render(
      <IngredientStateBoard
        tracker={sampleTracker}
        warning={{ severity: 'soft_gate', warning: 'Reduce the sauce.' }}
        onPatchState={jest.fn()}
        onAddEntity={jest.fn()}
      />
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Reduce the sauce.')
    expect(screen.getByText('⚠️')).toBeInTheDocument()

    rerender(
      <IngredientStateBoard
        tracker={sampleTracker}
        warning={{ severity: 'info', warning: 'Rest the meat.' }}
        onPatchState={jest.fn()}
        onAddEntity={jest.fn()}
      />
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Rest the meat.')
    expect(screen.getByText('💡')).toBeInTheDocument()

    rerender(
      <IngredientStateBoard
        tracker={sampleTracker}
        warning={{ warning: 'No severity supplied.' }}
        onPatchState={jest.fn()}
        onAddEntity={jest.fn()}
      />
    )
    expect(screen.getByRole('alert')).toHaveTextContent('No severity supplied.')
  })

  it('renders the intermediates group when intermediates exist', () => {
    const tracker = createIngredientStateTracker({
      ingredients: ['1 onion'],
      processGraph: { intermediates: [{ name: 'roux', state: 'simmering' }] },
    })
    render(
      <IngredientStateBoard
        tracker={tracker}
        onPatchState={jest.fn()}
        onAddEntity={jest.fn()}
      />
    )
    expect(screen.getByText('Intermediates & Mixtures')).toBeInTheDocument()
    expect(screen.getByText('roux')).toBeInTheDocument()
  })

  it('lets the user change state, custom refinement, and location before applying', () => {
    const onPatchState = jest.fn()
    render(
      <IngredientStateBoard
        tracker={sampleTracker}
        onPatchState={onPatchState}
        onAddEntity={jest.fn()}
      />
    )
    fireEvent.click(screen.getByText('yellow onion'))
    fireEvent.change(screen.getByLabelText('Select state'), { target: { value: 'caramelized' } })
    fireEvent.change(screen.getByLabelText('Custom state refinement'), { target: { value: 'golden brown' } })
    fireEvent.change(screen.getByLabelText('Select location'), { target: { value: 'pan' } })
    fireEvent.click(screen.getByText('Apply Update'))
    expect(onPatchState).toHaveBeenCalledWith(expect.any(String), { state: 'golden brown', location: 'pan' })
  })

  it('changes type, state, and location in the add modal', () => {
    const onAddEntity = jest.fn()
    render(
      <IngredientStateBoard
        tracker={sampleTracker}
        onPatchState={jest.fn()}
        onAddEntity={onAddEntity}
      />
    )
    fireEvent.click(screen.getByTitle('Add intermediate or tool'))
    fireEvent.change(screen.getByPlaceholderText(/e.g. pan sauce/i), { target: { value: 'herb butter' } })
    fireEvent.change(screen.getByRole('combobox', { name: /Type:/i }), { target: { value: 'tool' } })
    fireEvent.change(screen.getByRole('combobox', { name: /State:/i }), { target: { value: 'dirty' } })
    fireEvent.change(screen.getByRole('combobox', { name: /Location:/i }), { target: { value: 'fridge' } })
    fireEvent.click(screen.getByText('Add Entity'))
    expect(onAddEntity).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'herb butter', type: 'tool', state: 'dirty', location: 'fridge' })
    )
  })

  it('cancels the add modal', () => {
    render(
      <IngredientStateBoard
        tracker={sampleTracker}
        onPatchState={jest.fn()}
        onAddEntity={jest.fn()}
      />
    )
    fireEvent.click(screen.getByTitle('Add intermediate or tool'))
    expect(screen.getByText('Track New Kitchen Entity')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByText('Track New Kitchen Entity')).toBeNull()
  })

  it('opens the editor from keyboard Enter and Space on a chip', () => {
    const { unmount } = render(
      <IngredientStateBoard
        tracker={sampleTracker}
        onPatchState={jest.fn()}
        onAddEntity={jest.fn()}
      />
    )
    let chip = screen.getByText('yellow onion').closest('[role="button"]')
    fireEvent.keyDown(chip, { key: 'Enter' })
    expect(screen.getByText(/Correct state for: yellow onion/i)).toBeInTheDocument()
    unmount()

    render(
      <IngredientStateBoard
        tracker={sampleTracker}
        onPatchState={jest.fn()}
        onAddEntity={jest.fn()}
      />
    )
    chip = screen.getByText('yellow onion').closest('[role="button"]')
    fireEvent.keyDown(chip, { key: ' ' })
    expect(screen.getByText(/Correct state for: yellow onion/i)).toBeInTheDocument()
  })

  it('shows a user-edited badge on user-sourced entities', () => {
    const tracker = createIngredientStateTracker({ ingredients: ['1 onion'] })
    tracker.entities[0].source = 'user'
    render(
      <IngredientStateBoard
        tracker={tracker}
        onPatchState={jest.fn()}
        onAddEntity={jest.fn()}
      />
    )
    expect(screen.getByTitle('Manually edited')).toBeInTheDocument()
  })
})
