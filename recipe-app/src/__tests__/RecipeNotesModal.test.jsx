import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RecipeNotesModal from '../RecipeNotesModal.jsx'

const recipe = { id: 'recipe-1', name: 'Miso Soup' }

const notes = [
  { id: 2, body: 'Doubled the garlic.', createdAt: '2026-02-02T10:00:00.000Z' },
  { id: 1, body: 'Needed 10 more minutes.', createdAt: '2026-01-01T10:00:00.000Z' },
]

function renderNotes(props = {}) {
  const onAdd = jest.fn().mockResolvedValue(undefined)
  const onUpdate = jest.fn().mockResolvedValue(undefined)
  const onRemove = jest.fn().mockResolvedValue(undefined)
  const onClose = jest.fn()
  render(
    <RecipeNotesModal
      recipe={recipe}
      notes={notes}
      onAdd={onAdd}
      onUpdate={onUpdate}
      onRemove={onRemove}
      onClose={onClose}
      {...props}
    />,
  )
  return { onAdd, onUpdate, onRemove, onClose }
}

describe('RecipeNotesModal', () => {
  it('names the recipe the notes belong to and lists them', () => {
    renderNotes()
    expect(screen.getByRole('dialog')).toHaveAccessibleName('My notes')
    expect(screen.getByText(/Miso Soup/)).toBeInTheDocument()
    expect(screen.getByText('Doubled the garlic.')).toBeInTheDocument()
    expect(screen.getByText('2 notes')).toBeInTheDocument()
  })

  it('adds a note with the recipe title for context', async () => {
    const user = userEvent.setup()
    const { onAdd } = renderNotes()
    await user.type(screen.getByLabelText('Add a note'), 'Try white miso.')
    await user.click(screen.getByRole('button', { name: 'Save note' }))

    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('Try white miso.', 'Miso Soup'))
    expect(screen.getByLabelText('Add a note')).toHaveValue('')
  })

  it('keeps the save button disabled until there is text', async () => {
    const user = userEvent.setup()
    renderNotes()
    const save = screen.getByRole('button', { name: 'Save note' })
    expect(save).toBeDisabled()
    await user.type(screen.getByLabelText('Add a note'), 'x')
    expect(save).toBeEnabled()
  })

  it('reports a failed add rather than clearing the draft', async () => {
    const user = userEvent.setup()
    const onAdd = jest.fn().mockRejectedValue(new Error('Notes sync is unavailable'))
    renderNotes({ onAdd })
    await user.type(screen.getByLabelText('Add a note'), 'Try white miso.')
    await user.click(screen.getByRole('button', { name: 'Save note' }))

    expect(await screen.findByText('Notes sync is unavailable')).toBeInTheDocument()
    expect(screen.getByLabelText('Add a note')).toHaveValue('Try white miso.')
  })

  it('edits an existing note', async () => {
    const user = userEvent.setup()
    const { onUpdate } = renderNotes()
    await user.click(screen.getByRole('button', { name: 'Edit note 1' }))
    const field = screen.getByLabelText('Edit note')
    await user.clear(field)
    await user.type(field, 'Doubled the garlic and the ginger.')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith(2, 'Doubled the garlic and the ginger.'))
    expect(screen.queryByLabelText('Edit note')).not.toBeInTheDocument()
  })

  it('refuses to save an edit that empties the note', async () => {
    const user = userEvent.setup()
    const { onUpdate } = renderNotes()
    await user.click(screen.getByRole('button', { name: 'Edit note 1' }))
    await user.clear(screen.getByLabelText('Edit note'))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('A note cannot be empty. Delete it instead.')).toBeInTheDocument()
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('leaves the editor open when the update fails', async () => {
    const user = userEvent.setup()
    const onUpdate = jest.fn().mockRejectedValue(new Error('Notes request failed: 404'))
    renderNotes({ onUpdate })
    await user.click(screen.getByRole('button', { name: 'Edit note 1' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Notes request failed: 404')).toBeInTheDocument()
    expect(screen.getByLabelText('Edit note')).toBeInTheDocument()
  })

  it('cancels an edit without saving', async () => {
    const user = userEvent.setup()
    const { onUpdate } = renderNotes()
    await user.click(screen.getByRole('button', { name: 'Edit note 1' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByLabelText('Edit note')).not.toBeInTheDocument()
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('deletes a note and reports a failed delete', async () => {
    const user = userEvent.setup()
    const onRemove = jest.fn().mockResolvedValue(undefined)
    renderNotes({ onRemove })
    await user.click(screen.getByRole('button', { name: 'Delete note 1' }))
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith(2))

    onRemove.mockRejectedValue(new Error('nope'))
    await user.click(screen.getByRole('button', { name: 'Delete note 1' }))
    expect(await screen.findByText('Could not sync the removal. The note was restored.')).toBeInTheDocument()
  })

  it('hides the row actions while that row is being edited', async () => {
    const user = userEvent.setup()
    renderNotes()
    await user.click(screen.getByRole('button', { name: 'Edit note 1' }))

    expect(screen.queryByRole('button', { name: 'Delete note 1' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete note 2' })).toBeInTheDocument()
  })

  it('keeps an open editor when a different note is deleted', async () => {
    const user = userEvent.setup()
    const { onRemove } = renderNotes()
    await user.click(screen.getByRole('button', { name: 'Edit note 1' }))
    await user.click(screen.getByRole('button', { name: 'Delete note 2' }))

    await waitFor(() => expect(onRemove).toHaveBeenCalledWith(1))
    expect(screen.getByLabelText('Edit note')).toBeInTheDocument()
  })

  it('shows the loading and empty states', () => {
    const { unmount } = render(
      <RecipeNotesModal recipe={recipe} notes={[]} loading onAdd={jest.fn()} onUpdate={jest.fn()} onRemove={jest.fn()} onClose={jest.fn()} />,
    )
    expect(screen.getByText('Loading your notes…')).toBeInTheDocument()
    unmount()

    renderNotes({ notes: [] })
    expect(screen.getByText('No notes yet')).toBeInTheDocument()
    expect(screen.getByText('0 notes')).toBeInTheDocument()
  })

  it('says it is working offline when sync is failing', () => {
    renderNotes({ syncError: 'Notes sync is unavailable' })
    expect(screen.getByText(/Working offline: Notes sync is unavailable/)).toBeInTheDocument()
  })

  it('falls back to generic wording when the recipe has no name', () => {
    renderNotes({ recipe: {} })
    expect(screen.getByText(/this recipe/)).toBeInTheDocument()
  })

  it('closes from the × and a backdrop click but not a click inside', async () => {
    const user = userEvent.setup()
    const { onClose } = renderNotes()

    await user.click(screen.getByRole('button', { name: 'Close notes' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('dialog').parentElement)
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
