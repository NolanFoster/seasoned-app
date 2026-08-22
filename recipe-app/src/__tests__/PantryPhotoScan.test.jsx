import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import PantryPhotoScan, { validatePantryPhotoFile } from '../PantryPhotoScan.jsx'

describe('validatePantryPhotoFile', () => {
  test('requires a supported, non-empty image within the upload limit', () => {
    expect(validatePantryPhotoFile()).toBe('Choose a pantry photo first.')
    expect(validatePantryPhotoFile({ size: 1, type: 'image/gif' })).toBe('Use a JPG, PNG, or WebP pantry photo.')
    expect(validatePantryPhotoFile({ size: 10 * 1024 * 1024 + 1, type: 'image/jpeg' })).toBe('Pantry photos must be 10 MB or smaller.')
    expect(validatePantryPhotoFile({ size: 1, type: 'image/jpeg' })).toBe('')
  })
})

describe('PantryPhotoScan', () => {
  test('lets a cook review, edit, deselect, and save detected items', async () => {
    const onScan = jest.fn().mockResolvedValue([
      { name: 'spinach', quantity: 2, unit: 'bags', location: 'fridge', confidence: 0.9 },
      { name: 'peanuts', quantity: null, unit: null, location: 'pantry', confidence: 0.6 },
    ])
    const onAdd = jest.fn().mockResolvedValue(undefined)
    const file = new File(['image'], 'fridge.jpg', { type: 'image/jpeg' })
    render(<PantryPhotoScan open onScan={onScan} onAdd={onAdd} onClose={jest.fn()} />)

    fireEvent.change(screen.getByLabelText('Choose a fridge, freezer, or pantry photo'), { target: { files: [file] } })
    fireEvent.click(screen.getByRole('button', { name: 'Scan photo' }))
    await waitFor(() => expect(screen.getByText('Review detected items')).toBeInTheDocument())
    expect(screen.getByDisplayValue('spinach')).toBeInTheDocument()
    expect(screen.getByText('Estimate confidence: 90%')).toBeInTheDocument()

    fireEvent.change(screen.getByDisplayValue('spinach'), { target: { value: 'baby spinach' } })
    const includeControls = screen.getAllByRole('checkbox')
    fireEvent.click(includeControls[1])
    fireEvent.click(screen.getByRole('button', { name: 'Add selected items' }))

    await waitFor(() => expect(onAdd).toHaveBeenCalledWith({
      name: 'baby spinach',
      quantity: 2,
      unit: 'bags',
      location: 'fridge',
      expiresOn: null,
      tags: [],
    }))
    expect(onAdd).toHaveBeenCalledTimes(1)
  })

  test('shows scan failures without saving anything', async () => {
    const onScan = jest.fn().mockRejectedValue(new Error('Scan unavailable'))
    render(<PantryPhotoScan open onScan={onScan} onAdd={jest.fn()} onClose={jest.fn()} />)
    const file = new File(['image'], 'fridge.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('Choose a fridge, freezer, or pantry photo'), { target: { files: [file] } })
    fireEvent.click(screen.getByRole('button', { name: 'Scan photo' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Scan unavailable'))
  })
})
