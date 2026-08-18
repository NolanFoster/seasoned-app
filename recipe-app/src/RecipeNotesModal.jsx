import React, { useState } from 'react'

function formatTimestamp(value) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)
  return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

/**
 * A private notebook for one recipe. Notes belong to the signed-in user, so
 * this sheet stays available for recipes the app did not write — a clipped
 * page can be annotated without its published text being touched.
 */
export default function RecipeNotesModal({
  recipe,
  notes = [],
  loading = false,
  syncError = '',
  onAdd,
  onUpdate,
  onRemove,
  onClose,
}) {
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editingDraft, setEditingDraft] = useState('')
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    const text = draft.trim()
    if (!text) {
      setMessage('Write something before saving the note.')
      return
    }
    setWorking(true)
    setMessage('')
    try {
      await onAdd(text, recipe?.name)
      setDraft('')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save the note.')
    } finally {
      setWorking(false)
    }
  }

  function beginEdit(note) {
    setEditingId(note.id)
    setEditingDraft(note.body)
    setMessage('')
  }

  function cancelEdit() {
    setEditingId(null)
    setEditingDraft('')
  }

  async function saveEdit(event) {
    event.preventDefault()
    const text = editingDraft.trim()
    if (!text) {
      setMessage('A note cannot be empty. Delete it instead.')
      return
    }
    setWorking(true)
    setMessage('')
    try {
      await onUpdate(editingId, text)
      cancelEdit()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save the change.')
    } finally {
      setWorking(false)
    }
  }

  // A row being edited renders the edit form in place of its Delete button, so
  // this only ever removes a note other than the one open in the editor.
  async function handleRemove(note) {
    setMessage('')
    try {
      await onRemove(note.id)
    } catch {
      setMessage('Could not sync the removal. The note was restored.')
    }
  }

  return (
    <div className="recipe-notes-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="recipe-notes-sheet" role="dialog" aria-modal="true" aria-labelledby="recipe-notes-title">
        <div className="recipe-notes-header">
          <div>
            <h2 id="recipe-notes-title">My notes</h2>
            <p>
              Private to you on “{recipe?.name || 'this recipe'}” — what you changed, what to try next time.
            </p>
          </div>
          <button type="button" className="recipe-notes-close" aria-label="Close notes" onClick={onClose}>×</button>
        </div>

        {syncError && (
          <p className="recipe-notes-status recipe-notes-status--offline" role="status">
            Working offline: {syncError}
          </p>
        )}
        {message && <p className="recipe-notes-status" role="status">{message}</p>}

        <form className="recipe-notes-form" onSubmit={handleSubmit}>
          <label className="recipe-notes-field" htmlFor="recipe-note-draft">Add a note</label>
          <textarea
            id="recipe-note-draft"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Doubled the garlic. Needed 10 more minutes in my oven."
            maxLength={4000}
            rows={3}
          />
          <button type="submit" className="recipe-notes-primary" disabled={working || !draft.trim()}>
            {working ? 'Saving…' : 'Save note'}
          </button>
        </form>

        <div className="recipe-notes-list" aria-live="polite">
          <div className="recipe-notes-list-heading">
            <h3>Saved notes</h3>
            <span>{notes.length} note{notes.length === 1 ? '' : 's'}</span>
          </div>
          {loading ? (
            <p className="recipe-notes-empty">Loading your notes…</p>
          ) : notes.length === 0 ? (
            <div className="recipe-notes-empty">
              <strong>No notes yet</strong>
              <p>Jot down what you changed so the next cook starts where this one left off.</p>
            </div>
          ) : (
            <ul>
              {notes.map((note, index) => (
                <li key={note.id} className="recipe-note">
                  {editingId === note.id ? (
                    <form className="recipe-note-edit" onSubmit={saveEdit}>
                      <label className="recipe-notes-field" htmlFor={`recipe-note-edit-${note.id}`}>Edit note</label>
                      <textarea
                        id={`recipe-note-edit-${note.id}`}
                        value={editingDraft}
                        onChange={(event) => setEditingDraft(event.target.value)}
                        maxLength={4000}
                        rows={3}
                        autoFocus
                      />
                      <div className="recipe-note-actions">
                        <button type="submit" disabled={working}>{working ? 'Saving…' : 'Save'}</button>
                        <button type="button" onClick={cancelEdit}>Cancel</button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="recipe-note-copy">
                        <p>{note.body}</p>
                        <small>{formatTimestamp(note.createdAt)}</small>
                      </div>
                      <div className="recipe-note-actions">
                        <button type="button" onClick={() => beginEdit(note)} aria-label={`Edit note ${index + 1}`}>Edit</button>
                        <button type="button" onClick={() => handleRemove(note)} aria-label={`Delete note ${index + 1}`}>Delete</button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
