import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import PantryModal, { parsePantryIngredient } from '../PantryModal.jsx'

describe('parsePantryIngredient', () => {
  test('separates a quantity and known unit from an ingredient line', () => {
    expect(parsePantryIngredient('1 1/2 cups chickpeas')).toEqual({
      name: 'chickpeas',
      quantity: 1.5,
      unit: 'cups',
    })
  })

  test('parses a simple fraction quantity', () => {
    expect(parsePantryIngredient('1/2 cup oats')).toEqual({ name: 'oats', quantity: 0.5, unit: 'cup' })
  })

  test('keeps free-form ingredients intact', () => {
    expect(parsePantryIngredient('salt and pepper to taste')).toEqual({
      name: 'salt and pepper to taste',
      quantity: '',
      unit: '',
    })
  })
})

describe('PantryModal', () => {
  const baseProps = {
    open: true,
    items: [],
    loading: false,
    syncError: '',
    activeRecipe: null,
    onAdd: jest.fn(() => Promise.resolve()),
    onUpdate: jest.fn(() => Promise.resolve()),
    onRemove: jest.fn(() => Promise.resolve()),
    onClose: jest.fn(),
  }

  beforeEach(() => jest.clearAllMocks())

  test('explains an empty pantry and adds a manually entered item', async () => {
    render(<PantryModal {...baseProps} />)

    expect(screen.getByText('Your pantry is empty')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Ingredient'), { target: { value: 'chickpeas' } })
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'cans' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add to pantry' }))

    await waitFor(() => expect(baseProps.onAdd).toHaveBeenCalledWith({
      name: 'chickpeas',
      quantity: 2,
      unit: 'cans',
      location: 'pantry',
      expiresOn: null,
      tags: [],
    }))
  })

  test('renders expiry and exposes edit and remove actions', async () => {
    render(<PantryModal {...baseProps} items={[{
      id: 12,
      name: 'spinach',
      quantity: 1,
      unit: 'bag',
      location: 'fridge',
      expiresOn: '2099-01-01',
      tags: ['greens'],
    }]} />)

    expect(screen.getByRole('heading', { name: 'Fridge' })).toBeInTheDocument()
    expect(screen.getByText('1 bag spinach')).toBeInTheDocument()
    expect(screen.getByText('greens')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit spinach' }))
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Ingredient'), { target: { value: 'baby spinach' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(baseProps.onUpdate).toHaveBeenCalledWith(12, expect.objectContaining({ name: 'baby spinach' })))

    fireEvent.click(screen.getByRole('button', { name: 'Remove spinach' }))
    await waitFor(() => expect(baseProps.onRemove).toHaveBeenCalledWith(12))
  })

  test('adds parsed ingredients from the active recipe', async () => {
    render(<PantryModal {...baseProps} activeRecipe={{ name: 'Bean bowl', ingredients: ['1 cup rice', 'lime juice'] }} />)

    fireEvent.click(screen.getByRole('button', { name: /Add leftovers from/ }))
    await waitFor(() => expect(baseProps.onAdd).toHaveBeenNthCalledWith(1, {
      name: 'rice', quantity: 1, unit: 'cup', location: 'pantry',
    }))
    expect(baseProps.onAdd).toHaveBeenNthCalledWith(2, {
      name: 'lime juice', quantity: '', unit: '', location: 'pantry',
    })
  })

  test('handles optional fields, loading state, validation, and offline failures', async () => {
    const onAdd = jest.fn(() => Promise.reject(new Error('offline')))
    const onUpdate = jest.fn(() => Promise.reject(new Error('offline')))
    const onRemove = jest.fn(() => Promise.reject(new Error('offline')))
    const onClose = jest.fn()
    const { rerender } = render(<PantryModal
      {...baseProps}
      onAdd={onAdd}
      onUpdate={onUpdate}
      onRemove={onRemove}
      onClose={onClose}
      syncError="sync unavailable"
      loading
    />)
    expect(screen.getByText('Working offline: sync unavailable')).toBeInTheDocument()
    expect(screen.getByText('Loading your pantry…')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add to pantry' }))
    expect(screen.getByText('Add an ingredient name first.')).toBeInTheDocument()

    rerender(<PantryModal
      {...baseProps}
      onAdd={onAdd}
      onUpdate={onUpdate}
      onRemove={onRemove}
      onClose={onClose}
      activeRecipe={{ ingredients: [{ ingredient: '1/2 cup oats' }] }}
      items={[{ id: 2, name: 'salt', quantity: null, unit: null, location: 'other', tags: [], expiresOn: '2000-01-01' }]}
    />)
    expect(screen.getByRole('heading', { name: 'Other' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit salt' }))
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'fridge' } })
    fireEvent.change(screen.getByLabelText('Use by'), { target: { value: '2099-02-02' } })
    fireEvent.change(screen.getByLabelText(/Tags/), { target: { value: 'staple, baking' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(screen.getByText('Could not sync that pantry change. It is still available locally.')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /Add leftovers from/ }))
    await waitFor(() => expect(screen.getByText('Some ingredients were saved locally and will sync when available.')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Remove salt' }))
    await waitFor(() => expect(screen.getByText('Could not sync the removal. The item was restored.')).toBeInTheDocument())
    fireEvent.mouseDown(screen.getByRole('presentation'), { target: screen.getByRole('presentation') })
    expect(onClose).toHaveBeenCalled()
  })

})
