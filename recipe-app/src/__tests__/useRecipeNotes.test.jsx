import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { sortNotes, useRecipeNotes } from '../useRecipeNotes.js'

const API = 'https://test-user.example.com'

function NotesHarness({ token = 'token-a', userId = 'user-a', recipeId = 'recipe-1', enabled = true, apiUrl = API }) {
  const notes = useRecipeNotes(token, userId, recipeId, enabled, apiUrl)
  return (
    <div>
      <output data-testid="count">{notes.notes.length}</output>
      <output data-testid="bodies">{notes.notes.map((note) => note.body).join('|')}</output>
      <output data-testid="error">{notes.syncError}</output>
      <output data-testid="loading">{String(notes.loading)}</output>
      <output data-testid="available">{String(notes.available)}</output>
      <button type="button" onClick={() => void notes.addNote('New note', 'Miso Soup').catch(() => {})}>Add</button>
      <button type="button" onClick={() => void notes.addNote('   ').catch(() => {})}>Add blank</button>
      <button type="button" onClick={() => void notes.updateNote(7, 'Edited').catch(() => {})}>Update</button>
      <button type="button" onClick={() => void notes.updateNote(7, '  ').catch(() => {})}>Update blank</button>
      <button type="button" onClick={() => void notes.removeNote(7).catch(() => {})}>Remove</button>
    </div>
  )
}

const listedNote = {
  id: 7,
  recipe_id: 'recipe-1',
  recipe_title: 'Miso Soup',
  body: 'Doubled the garlic.',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
}

describe('useRecipeNotes', () => {
  beforeEach(() => {
    localStorage.clear()
    global.fetch.mockImplementation((url, options = {}) => {
      if (!options.method) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true, data: [listedNote] }) })
      }
      if (options.method === 'POST') {
        return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({ success: true, data: { ...listedNote, id: 8, body: 'New note' } }) })
      }
      if (options.method === 'PATCH') {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true, data: { ...listedNote, body: 'Edited' } }) })
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true }) })
    })
  })

  test('orders notes newest first', () => {
    expect(sortNotes([
      { body: 'old', createdAt: '2026-01-01' },
      { body: 'new', createdAt: '2026-03-01' },
      { body: 'mid', createdAt: '2026-02-01' },
    ]).map((note) => note.body)).toEqual(['new', 'mid', 'old'])
  })

  test('loads the notes for one recipe and normalizes the snake_case fields', async () => {
    render(<NotesHarness />)
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'))
    expect(screen.getByTestId('bodies')).toHaveTextContent('Doubled the garlic.')
    expect(screen.getByTestId('loading')).toHaveTextContent('false')
    expect(global.fetch).toHaveBeenCalledWith(
      `${API}/me/recipe-notes?recipeId=recipe-1`,
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer token-a' }) }),
    )
  })

  test('does not fetch without a recipe id and reports itself unavailable', async () => {
    render(<NotesHarness recipeId="" />)
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(screen.getByTestId('available')).toHaveTextContent('false')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  test('does not fetch when the feature is disabled', async () => {
    render(<NotesHarness enabled={false} />)
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(global.fetch).not.toHaveBeenCalled()
  })

  test('posts a new note and replaces the optimistic row with the saved one', async () => {
    render(<NotesHarness />)
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'))

    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('2'))

    const post = global.fetch.mock.calls.find(([, options]) => options?.method === 'POST')
    expect(JSON.parse(post[1].body)).toEqual({ recipeId: 'recipe-1', recipeTitle: 'Miso Soup', body: 'New note' })
    expect(screen.getByTestId('bodies')).toHaveTextContent('New note')
  })

  test('refuses to add or update a blank note', async () => {
    render(<NotesHarness />)
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'))

    fireEvent.click(screen.getByRole('button', { name: 'Add blank' }))
    fireEvent.click(screen.getByRole('button', { name: 'Update blank' }))
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'))
    expect(global.fetch.mock.calls.filter(([, options]) => options?.method)).toHaveLength(0)
  })

  test('patches an edited note', async () => {
    render(<NotesHarness />)
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'))

    fireEvent.click(screen.getByRole('button', { name: 'Update' }))
    await waitFor(() => expect(screen.getByTestId('bodies')).toHaveTextContent('Edited'))

    const patch = global.fetch.mock.calls.find(([, options]) => options?.method === 'PATCH')
    expect(patch[0]).toBe(`${API}/me/recipe-notes/7`)
    expect(JSON.parse(patch[1].body)).toEqual({ body: 'Edited' })
  })

  test('deletes a note', async () => {
    render(<NotesHarness />)
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'))

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('0'))
    expect(global.fetch.mock.calls.some(([url, options]) => url === `${API}/me/recipe-notes/7` && options?.method === 'DELETE')).toBe(true)
  })

  test('restores the note and reports the error when a delete fails', async () => {
    render(<NotesHarness />)
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'))

    global.fetch.mockResolvedValue({ ok: false, status: 404, json: () => Promise.resolve({ success: false, message: 'Recipe note not found' }) })
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('Recipe note not found'))
    expect(screen.getByTestId('count')).toHaveTextContent('1')
  })

  test('restores the note and reports the error when an update fails', async () => {
    render(<NotesHarness />)
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'))

    global.fetch.mockRejectedValue(new Error('offline'))
    fireEvent.click(screen.getByRole('button', { name: 'Update' }))
    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('offline'))
    expect(screen.getByTestId('bodies')).toHaveTextContent('Doubled the garlic.')
  })

  test('keeps the optimistic note when the create call fails', async () => {
    render(<NotesHarness />)
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'))

    global.fetch.mockRejectedValue(new Error('offline'))
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('offline'))
    expect(screen.getByTestId('count')).toHaveTextContent('2')
  })

  test('reads the cache on mount and reports a failing sync', async () => {
    localStorage.setItem('seasoned_recipe_notes_user-a_recipe-1', JSON.stringify([{ id: 1, body: 'cached' }]))
    global.fetch.mockRejectedValue(new Error('offline'))
    render(<NotesHarness />)

    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('offline'))
    expect(screen.getByTestId('bodies')).toHaveTextContent('cached')
  })

  test('survives corrupted cache entries and unwritable storage', async () => {
    localStorage.setItem('seasoned_recipe_notes_user-a_recipe-1', 'not json')
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage full') })
    render(<NotesHarness />)

    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'))
    expect(screen.getByTestId('error')).toHaveTextContent('')
    setItem.mockRestore()
  })

  test('works offline with no API url, keeping notes local', async () => {
    render(<NotesHarness token="" apiUrl="" />)
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))

    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'))
    expect(global.fetch).not.toHaveBeenCalled()
  })

  test('edits a note that only exists locally without calling the API', async () => {
    function LocalHarness() {
      const notes = useRecipeNotes('token-a', 'user-a', 'recipe-1', true, API)
      const localId = notes.notes[0]?.id
      return (
        <div>
          <output data-testid="bodies">{notes.notes.map((note) => note.body).join('|')}</output>
          <button type="button" onClick={() => void notes.addNote('Local note').catch(() => {})}>Add</button>
          <button type="button" onClick={() => void notes.updateNote(localId, 'Local edit').catch(() => {})}>Edit local</button>
          <button type="button" onClick={() => void notes.removeNote(localId).catch(() => {})}>Remove local</button>
        </div>
      )
    }

    // An empty listing leaves the optimistic row as the only note, so its id is
    // still the client-generated `local-` one the API has never seen.
    global.fetch.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ success: true, data: [] }) })
    render(<LocalHarness />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())

    global.fetch.mockRejectedValue(new Error('should not be called'))
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(screen.getByTestId('bodies')).toHaveTextContent('Local note'))

    global.fetch.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Edit local' }))
    await waitFor(() => expect(screen.getByTestId('bodies')).toHaveTextContent('Local edit'))

    fireEvent.click(screen.getByRole('button', { name: 'Remove local' }))
    await waitFor(() => expect(screen.getByTestId('bodies')).toHaveTextContent(''))
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
