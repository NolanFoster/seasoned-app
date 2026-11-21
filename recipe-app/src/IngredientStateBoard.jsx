import React, { useState } from 'react'
import {
  VALID_STATE_ENUM,
  VALID_LOCATIONS,
  VALID_ENTITY_TYPES,
} from '../../shared/ingredient-state.js'

export default function IngredientStateBoard({
  tracker,
  onPatchState,
  onAddEntity,
  warning,
  isCollapsed = false,
  onToggleCollapse,
}) {
  const [editingEntityId, setEditingEntityId] = useState(null)
  const [selectedState, setSelectedState] = useState('')
  const [selectedLocation, setSelectedLocation] = useState('')
  const [customStateInput, setCustomStateInput] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [newEntityName, setNewEntityName] = useState('')
  const [newEntityType, setNewEntityType] = useState('intermediate')
  const [newEntityState, setNewEntityState] = useState('mixed')
  const [newEntityLocation, setNewEntityLocation] = useState('bowl')

  if (!tracker || !Array.isArray(tracker.entities)) return null

  const entities = tracker.entities
  const ingredients = entities.filter((e) => e.type === 'ingredient')
  const intermediates = entities.filter((e) => e.type === 'intermediate')
  const tools = entities.filter((e) => e.type === 'tool')

  function handleStartEdit(entity) {
    setEditingEntityId(entity.id)
    setSelectedState(entity.state || 'raw')
    setSelectedLocation(entity.location || 'counter')
    setCustomStateInput('')
  }

  function handleSaveEdit(entityId) {
    const finalState = customStateInput.trim() || selectedState
    if (onPatchState) {
      onPatchState(entityId, {
        state: finalState,
        location: selectedLocation,
      })
    }
    setEditingEntityId(null)
  }

  function handleCancelEdit() {
    setEditingEntityId(null)
  }

  function handleCreateEntity(e) {
    e.preventDefault()
    if (!newEntityName.trim()) return
    if (onAddEntity) {
      onAddEntity({
        id: `custom-${Date.now()}-${newEntityName.trim().replace(/\s+/g, '-').slice(0, 16)}`,
        name: newEntityName.trim().toLowerCase(),
        type: newEntityType,
        state: newEntityState,
        location: newEntityLocation,
        source: 'user',
        updatedAt: Date.now(),
      })
    }
    setNewEntityName('')
    setShowAddModal(false)
  }

  return (
    <div className="cn-state-board" role="region" aria-label="Ingredient & process state board">
      <div className="cn-state-board-header">
        <div className="cn-state-board-title-wrap">
          <span className="cn-state-board-icon" aria-hidden="true">🔄</span>
          <span className="cn-state-board-title">Live Ingredient State</span>
          <span className="cn-state-board-count-pill">
            {entities.length} tracked
          </span>
        </div>
        <div className="cn-state-board-header-actions">
          <button
            type="button"
            className="cn-state-board-add-btn"
            onClick={() => setShowAddModal(true)}
            title="Add intermediate or tool"
            aria-label="Add intermediate or tool"
          >
            + Add
          </button>
          {onToggleCollapse && (
            <button
              type="button"
              className="cn-state-board-collapse-btn"
              onClick={onToggleCollapse}
              aria-label={isCollapsed ? 'Expand state board' : 'Collapse state board'}
              aria-expanded={!isCollapsed}
            >
              {isCollapsed ? 'Show ▼' : 'Hide ▲'}
            </button>
          )}
        </div>
      </div>

      {warning && (
        <div
          className={`cn-state-board-warning cn-state-board-warning--${warning.severity || 'info'}`}
          role="alert"
        >
          <span className="cn-state-warning-icon">
            {warning.severity === 'critical' ? '🛑' : warning.severity === 'soft_gate' ? '⚠️' : '💡'}
          </span>
          <span className="cn-state-warning-text">{warning.warning}</span>
        </div>
      )}

      {!isCollapsed && (
        <div className="cn-state-board-content">
          {/* Intermediates */}
          {intermediates.length > 0 && (
            <div className="cn-state-group">
              <span className="cn-state-group-label">Intermediates & Mixtures</span>
              <div className="cn-state-chip-grid">
                {intermediates.map((entity) => (
                  <EntityChip
                    key={entity.id}
                    entity={entity}
                    isEditing={editingEntityId === entity.id}
                    onStartEdit={handleStartEdit}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Ingredients */}
          {ingredients.length > 0 && (
            <div className="cn-state-group">
              <span className="cn-state-group-label">Ingredients</span>
              <div className="cn-state-chip-grid">
                {ingredients.map((entity) => (
                  <EntityChip
                    key={entity.id}
                    entity={entity}
                    isEditing={editingEntityId === entity.id}
                    onStartEdit={handleStartEdit}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Equipment / Tools */}
          {tools.length > 0 && (
            <div className="cn-state-group">
              <span className="cn-state-group-label">Tools & Equipment</span>
              <div className="cn-state-chip-grid">
                {tools.map((entity) => (
                  <EntityChip
                    key={entity.id}
                    entity={entity}
                    isEditing={editingEntityId === entity.id}
                    onStartEdit={handleStartEdit}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Entity Edit Drawer / Popover */}
          {editingEntityId && (
            <div className="cn-state-edit-popover" role="dialog" aria-modal="true" aria-label="Edit entity state">
              <div className="cn-state-edit-header">
                <strong>Correct state for: {entities.find((e) => e.id === editingEntityId)?.name}</strong>
                <button type="button" className="cn-state-edit-close" onClick={handleCancelEdit} aria-label="Close edit">✕</button>
              </div>
              <div className="cn-state-edit-body">
                <label className="cn-state-edit-label">
                  State:
                  <select
                    value={selectedState}
                    onChange={(e) => setSelectedState(e.target.value)}
                    className="cn-state-select"
                    aria-label="Select state"
                  >
                    {VALID_STATE_ENUM.map((st) => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </label>

                <label className="cn-state-edit-label">
                  Custom refinement (optional):
                  <input
                    type="text"
                    placeholder="e.g. golden-brown, 80% reduced"
                    value={customStateInput}
                    onChange={(e) => setCustomStateInput(e.target.value)}
                    className="cn-state-input"
                    aria-label="Custom state refinement"
                  />
                </label>

                <label className="cn-state-edit-label">
                  Location:
                  <select
                    value={selectedLocation}
                    onChange={(e) => setSelectedLocation(e.target.value)}
                    className="cn-state-select"
                    aria-label="Select location"
                  >
                    {VALID_LOCATIONS.map((loc) => (
                      <option key={loc} value={loc}>{loc}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="cn-state-edit-actions">
                <button
                  type="button"
                  className="cn-state-save-btn"
                  onClick={() => handleSaveEdit(editingEntityId)}
                >
                  Apply Update
                </button>
                <button
                  type="button"
                  className="cn-state-cancel-btn"
                  onClick={handleCancelEdit}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Add Custom Entity Modal */}
          {showAddModal && (
            <div className="cn-state-add-modal-overlay" role="dialog" aria-modal="true" aria-label="Add new entity">
              <div className="cn-state-add-modal">
                <h3>Track New Kitchen Entity</h3>
                <form onSubmit={handleCreateEntity}>
                  <label className="cn-state-edit-label">
                    Name:
                    <input
                      type="text"
                      placeholder="e.g. pan sauce, herb butter"
                      value={newEntityName}
                      onChange={(e) => setNewEntityName(e.target.value)}
                      className="cn-state-input"
                      required
                      autoFocus
                    />
                  </label>
                  <label className="cn-state-edit-label">
                    Type:
                    <select
                      value={newEntityType}
                      onChange={(e) => setNewEntityType(e.target.value)}
                      className="cn-state-select"
                    >
                      {VALID_ENTITY_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </label>
                  <label className="cn-state-edit-label">
                    State:
                    <select
                      value={newEntityState}
                      onChange={(e) => setNewEntityState(e.target.value)}
                      className="cn-state-select"
                    >
                      {VALID_STATE_ENUM.map((st) => (
                        <option key={st} value={st}>{st}</option>
                      ))}
                    </select>
                  </label>
                  <label className="cn-state-edit-label">
                    Location:
                    <select
                      value={newEntityLocation}
                      onChange={(e) => setNewEntityLocation(e.target.value)}
                      className="cn-state-select"
                    >
                      {VALID_LOCATIONS.map((loc) => (
                        <option key={loc} value={loc}>{loc}</option>
                      ))}
                    </select>
                  </label>
                  <div className="cn-state-add-actions">
                    <button type="submit" className="cn-state-save-btn">Add Entity</button>
                    <button type="button" className="cn-state-cancel-btn" onClick={() => setShowAddModal(false)}>Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function EntityChip({ entity, isEditing, onStartEdit }) {
  const stateColorClass = getStateColorClass(entity.state)

  return (
    <div
      className={`cn-state-entity-chip${isEditing ? ' cn-state-entity-chip--editing' : ''}`}
      onClick={() => onStartEdit(entity)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onStartEdit(entity)
        }
      }}
      title={`Click to update state for ${entity.name}`}
      aria-label={`${entity.name}: ${entity.state} at ${entity.location}`}
    >
      <span className="cn-state-entity-name">{entity.name}</span>
      <span className={`cn-state-pill ${stateColorClass}`}>
        {entity.state}
      </span>
      {entity.location && (
        <span className="cn-state-location-pill">
          📍 {entity.location}
        </span>
      )}
      {entity.source === 'user' && (
        <span className="cn-state-user-badge" title="Manually edited">✎</span>
      )}
    </div>
  )
}

function getStateColorClass(state) {
  if (!state) return 'cn-state-pill--neutral'
  const st = state.toLowerCase()
  if (['frozen'].includes(st)) return 'cn-state-pill--frozen'
  if (['raw', 'prepped', 'thawed'].includes(st)) return 'cn-state-pill--raw'
  if (['chopped', 'diced', 'minced', 'sliced', 'grated'].includes(st)) return 'cn-state-pill--prep'
  if (['sweating', 'softened', 'sautéed', 'simmering', 'boiling', 'in-use', 'hot'].includes(st)) return 'cn-state-pill--cooking'
  if (['caramelized', 'seared', 'browned', 'reduced', 'baked', 'roasted', 'fried'].includes(st)) return 'cn-state-pill--browned'
  if (['emulsified', 'mixed', 'whisked'].includes(st)) return 'cn-state-pill--emulsion'
  if (['resting', 'rested', 'held', 'warm'].includes(st)) return 'cn-state-pill--resting'
  if (['plated', 'garnished', 'ready'].includes(st)) return 'cn-state-pill--ready'
  return 'cn-state-pill--neutral'
}
