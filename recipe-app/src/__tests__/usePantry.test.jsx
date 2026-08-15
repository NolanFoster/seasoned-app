import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { sortPantryItems, usePantry } from '../usePantry.js'

function PantryHarness() {
  const pantry = usePantry('token-a', 'user-a', true, 'https://test-user.example.com')
  return (
    <div>
      <output data-testid="count">{pantry.items.length}</output>
      <output data-testid="error">{pantry.syncError}</output>
      <button type="button" onClick={() => pantry.addItem({ name: 'Rice', location: 'pantry' })}>Add rice</button>
      <button type="button" onClick={() => void pantry.updateItem(7, { name: 'Brown rice', location: 'pantry' }).catch(() => {})}>Rename rice</button>
      <button type="button" onClick={() => void pantry.removeItem(7).catch(() => {})}>Remove rice</button>
    </div>
  )
}

describe('usePantry', () => {
  beforeEach(() => {
    localStorage.clear()
    global.fetch.mockImplementation((url, options = {}) => {
      if (!options.method) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true, data: [{
          id: 7, name: 'Rice', quantity: 1, unit: 'bag', location: 'pantry', tags: [], expires_on: null,
        }] }) })
      }
      if (options.method === 'POST') {
        return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({ success: true, data: {
          id: 8, name: 'Rice', quantity: null, unit: null, location: 'pantry', tags: [],
        } }) })
      }
      if (options.method === 'PATCH') {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true, data: {
          id: 7, name: 'Brown rice', quantity: null, unit: null, location: 'pantry', tags: [],
        } }) })
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true }) })
    })
  })

  test('sorts expiring items before items without an expiry', () => {
    expect(sortPantryItems([{ name: 'open', expiresOn: null }, { name: 'soon', expiresOn: '2026-01-01' }, { name: 'later', expiresOn: '2026-02-01' }]).map((item) => item.name)).toEqual(['soon', 'later', 'open'])
  })

  test('keeps local state and reports sync errors when the API is unavailable', async () => {
    global.fetch.mockRejectedValue(new Error('offline'))
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage full') })
    render(<PantryHarness />)
    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('offline'))
    fireEvent.click(screen.getByRole('button', { name: 'Add rice' }))
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'))
    fireEvent.click(screen.getByRole('button', { name: 'Rename rice' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove rice' }))
    setItem.mockRestore()
  })

  test('uses local-only mode when no token is available', async () => {
    function LocalHarness() {
      const pantry = usePantry(null, 'local-user', true, 'https://test-user.example.com')
      return <button type="button" onClick={() => pantry.addItem({ name: 'Beans' })}>Add local</button>
    }
    render(<LocalHarness />)
    fireEvent.click(screen.getByRole('button', { name: 'Add local' }))
    expect(global.fetch).not.toHaveBeenCalled()
  })

  test('loads, adds, updates, and removes user-scoped items through the API', async () => {
    render(<PantryHarness />)
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'))

    fireEvent.click(screen.getByRole('button', { name: 'Add rice' }))
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('2'))
    expect(global.fetch).toHaveBeenCalledWith('https://test-user.example.com/me/pantry-items', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer token-a' }),
    }))

    fireEvent.click(screen.getByRole('button', { name: 'Rename rice' }))
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('https://test-user.example.com/me/pantry-items/7', expect.objectContaining({ method: 'PATCH' })))
    fireEvent.click(screen.getByRole('button', { name: 'Remove rice' }))
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'))
  })
})
