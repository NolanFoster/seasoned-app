import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useMealPlan } from './MealPlanContext.jsx'

// ── Utility exports (preserved for backward-compatibility and tests) ──────────

/**
 * Aggregates ingredients from all recipes across mealPlan and upNext into a
 * deduplicated, counted list.
 *
 * @param {Object} mealPlan - date-keyed meal plan from MealPlanContext
 * @param {Array}  upNext   - staged recipes from MealPlanContext
 * @returns {Array<{ id: string, ingredient: string, count: number }>}
 */
export function aggregateIngredients(mealPlan, upNext) {
  const allRecipes = []

  Object.values(mealPlan || {}).forEach((day) => {
    Object.values(day || {}).forEach((slotRecipes) => {
      if (Array.isArray(slotRecipes)) allRecipes.push(...slotRecipes)
    })
  })

  if (Array.isArray(upNext)) allRecipes.push(...upNext)

  const countMap = new Map()
  allRecipes.forEach((recipe) => {
    if (!recipe || !Array.isArray(recipe.ingredients)) return
    recipe.ingredients.forEach((ing) => {
      if (typeof ing === 'string' && ing.trim() !== '') {
        countMap.set(ing, (countMap.get(ing) ?? 0) + 1)
      }
    })
  })

  return Array.from(countMap.entries()).map(([ingredient, count], idx) => ({
    id: `ingredient-${idx}`,
    ingredient,
    count,
  }))
}

/**
 * Flattens all ingredients from mealPlan and upNext into a raw string array
 * (no deduplication) for the API call.
 *
 * @param {Object} mealPlan - date-keyed meal plan from MealPlanContext
 * @param {Array}  upNext   - staged recipes from MealPlanContext
 * @returns {string[]}
 */
export function flattenIngredients(mealPlan, upNext) {
  const allRecipes = []

  Object.values(mealPlan || {}).forEach((day) => {
    Object.values(day || {}).forEach((slotRecipes) => {
      if (Array.isArray(slotRecipes)) allRecipes.push(...slotRecipes)
    })
  })

  if (Array.isArray(upNext)) allRecipes.push(...upNext)

  const result = []
  allRecipes.forEach((recipe) => {
    if (!recipe || !Array.isArray(recipe.ingredients)) return
    recipe.ingredients.forEach((ing) => {
      if (typeof ing === 'string' && ing.trim() !== '') {
        result.push(ing)
      }
    })
  })

  return result
}

// ── Category ordering ─────────────────────────────────────────────────────────

const DEFAULT_CUSTOM_CATEGORY = 'Other'

// Predefined display order for common AI-generated categories. Categories not
// in this list are sorted alphabetically and appended after.
const CATEGORY_ORDER = [
  'Produce', 'Vegetables', 'Fruits',
  'Proteins', 'Meat', 'Seafood',
  'Dairy',
  'Grains & Bread', 'Grains', 'Bread',
  'Pantry Staples', 'Pantry',
  'Frozen',
  'Beverages', 'Snacks',
  'Other',
]

const INVENTORY_STATUS_ORDER = ['buy', 'owned', 'optional_staple']
const INVENTORY_STATUS_LABELS = {
  buy: 'Buy',
  owned: 'Already have',
  optional_staple: 'Staples on hand',
}

function inventoryStatusFor(item) {
  return INVENTORY_STATUS_ORDER.includes(item?.inventoryStatus) ? item.inventoryStatus : 'buy'
}

/**
 * Groups a flat GroceryListItem array into sorted [category, items[]] pairs.
 * @param {Array} items
 * @returns {Array<[string, Array]>}
 */
function groupByCategory(items) {
  const groups = {}
  items.forEach((item) => {
    const cat = item.category || DEFAULT_CUSTOM_CATEGORY
    if (!groups[cat]) groups[cat] = []
    groups[cat].push(item)
  })
  return Object.entries(groups).sort(([a], [b]) => {
    const ia = CATEGORY_ORDER.indexOf(a)
    const ib = CATEGORY_ORDER.indexOf(b)
    if (ia === -1 && ib === -1) return a.localeCompare(b)
    if (ia === -1) return 1
    if (ib === -1) return -1
    return ia - ib
  })
}

// ── Icons ─────────────────────────────────────────────────────────────────────

const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

const ChevronIcon = ({ expanded }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    style={{ transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s ease' }}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
)

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * GroceryListModal
 *
 * Slide-up modal for viewing and editing the persistent grocery list stored in
 * MealPlanContext. Supports:
 *   - Adding custom items via a sticky input field
 *   - Toggling item completion (persisted to localStorage via context)
 *   - Deleting items individually
 *   - Category grouping with expand/collapse
 *
 * Generation is handled upstream by MealPlannerDrawer; this component is
 * purely for display and mutation of the already-generated list.
 *
 * @param {boolean}  props.isOpen  - Whether the modal is currently visible
 * @param {function} props.onClose - Callback fired to close the modal
 */
import { useFlag } from './flaggly.js'

export function exportGroceryToMarkdown(groceryList = [], options = { buyOnly: false }) {
  const items = options.buyOnly 
    ? groceryList.filter((item) => inventoryStatusFor(item) === 'buy')
    : groceryList

  const grouped = groupByCategory(items)
  let md = '# Grocery List\n\n'
  grouped.forEach(([category, catItems]) => {
    md += `## ${category}\n`
    catItems.forEach((item) => {
      const checkbox = item.completed ? '[x]' : '[ ]'
      const qty = item.quantity ? `${item.quantity} ${item.unit || ''} `.trim() : ''
      const statusNote = item.inventoryStatus && item.inventoryStatus !== 'buy' ? ` (${INVENTORY_STATUS_LABELS[item.inventoryStatus]})` : ''
      md += `- ${checkbox} ${qty ? `${qty} ` : ''}${item.name}${statusNote}\n`
    })
    md += '\n'
  })
  md += '> Exported from Seasoned app\n'
  return md.trim()
}

export function exportGroceryToCSV(groceryList = [], options = { buyOnly: false }) {
  const items = options.buyOnly 
    ? groceryList.filter((item) => inventoryStatusFor(item) === 'buy')
    : groceryList

  const rows = [['Category', 'Item', 'Quantity', 'Unit', 'Status', 'Completed']]
  items.forEach((item) => {
    rows.push([
      `"${(item.category || DEFAULT_CUSTOM_CATEGORY).replace(/"/g, '""')}"`,
      `"${(item.name || '').replace(/"/g, '""')}"`,
      `"${(item.quantity ?? '').toString().replace(/"/g, '""')}"`,
      `"${(item.unit || '').replace(/"/g, '""')}"`,
      `"${inventoryStatusFor(item)}"`,
      item.completed ? 'true' : 'false'
    ])
  })
  return rows.map((r) => r.join(',')).join('\n')
}

export function exportGroceryToPlainText(groceryList = [], options = { buyOnly: false }) {
  const items = options.buyOnly 
    ? groceryList.filter((item) => inventoryStatusFor(item) === 'buy')
    : groceryList

  const grouped = groupByCategory(items)
  let text = 'Grocery List:\n\n'
  grouped.forEach(([category, catItems]) => {
    text += `${category.toUpperCase()}:\n`
    catItems.forEach((item) => {
      const mark = item.completed ? '✓ ' : '• '
      const qty = item.quantity ? `${item.quantity} ${item.unit || ''} `.trim() : ''
      text += `  ${mark}${qty ? `${qty} ` : ''}${item.name}\n`
    })
    text += '\n'
  })
  return text.trim()
}

export default function GroceryListModal({
  isOpen,
  onClose,
  pantryItems = [],
  pantryPlannerEnabled = false,
}) {
  const { groceryList, toggleItemCompletion, deleteItem, addCustomItem, editItem = () => {}, clearCompletedItems = () => {} } = useMealPlan()
  const safePantryItems = Array.isArray(pantryItems) ? pantryItems : []
  const flagExport = useFlag('grocery-export-plus')

  const [customInput, setCustomInput] = useState('')
  const [inputError, setInputError] = useState('')
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [buyOnlyExport, setBuyOnlyExport] = useState(false)
  const [exportNotice, setExportNotice] = useState('')
  // Track expanded state per category; defaults to true for new categories
  const [expandedCategories, setExpandedCategories] = useState({})
  const inputRef = useRef(null)

  function downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setExportNotice(`Downloaded ${fileName}`)
    setTimeout(() => setExportNotice(''), 3000)
    setShowExportMenu(false)
  }

  async function handleCopyList() {
    const text = exportGroceryToPlainText(groceryList, { buyOnly: buyOnlyExport })
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text)
        setExportNotice('Copied to clipboard!')
      } else {
        setExportNotice('Clipboard not available')
      }
    } catch {
      setExportNotice('Failed to copy')
    }
    setTimeout(() => setExportNotice(''), 3000)
    setShowExportMenu(false)
  }

  async function handleShareList() {
    const text = exportGroceryToPlainText(groceryList, { buyOnly: buyOnlyExport })
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Grocery List - Seasoned',
          text,
        })
        setShowExportMenu(false)
      } catch {
        // User dismissed or share failed
      }
    } else {
      handleCopyList()
    }
  }

  // Keep the familiar category grouping inside the three inventory sections.
  // Old locally persisted lists have no status and safely default to Buy.
  const inventorySections = useMemo(() => INVENTORY_STATUS_ORDER
    .map((status) => ({
      status,
      items: groceryList.filter((item) => inventoryStatusFor(item) === status),
    }))
    .filter((section) => section.items.length > 0), [groceryList])
  const displaySections = pantryPlannerEnabled
    ? inventorySections
    : [{ status: null, items: groceryList }]
  const pantrySummary = pantryPlannerEnabled && safePantryItems.length > 0
    ? `Pantry matching is on for ${safePantryItems.length} item${safePantryItems.length === 1 ? '' : 's'}`
    : ''

  // Auto-expand any newly appearing categories
  useEffect(() => {
    if (groceryList.length === 0) return
    setExpandedCategories((prev) => {
      const next = { ...prev }
      groceryList.forEach((item) => {
        const cat = item.category || DEFAULT_CUSTOM_CATEGORY
        const status = pantryPlannerEnabled ? inventoryStatusFor(item) : 'all'
        const key = `${status}:${cat}`
        if (!(key in next)) next[key] = true
      })
      return next
    })
  }, [groceryList, pantryPlannerEnabled])

  // Escape key closes the modal
  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onClose()
  }

  function toggleCategoryExpanded(category) {
    setExpandedCategories((prev) => ({ ...prev, [category]: !prev[category] }))
  }

  function handleAddItem(e) {
    e.preventDefault()
    const trimmed = customInput.trim()
    if (!trimmed) {
      setInputError('Please enter an item name.')
      return
    }
    if (trimmed.length > 50) {
      setInputError('Item name must be 50 characters or fewer.')
      return
    }
    addCustomItem({
      name: trimmed,
      quantity: '',
      unit: '',
      category: DEFAULT_CUSTOM_CATEGORY,
      completed: false,
      notes: '',
    })
    setCustomInput('')
    setInputError('')
    inputRef.current?.focus()
  }


  function clearCheckedItems() {
    clearCompletedItems()
  }

  if (!isOpen) return null

  return (
    <div className="grocery-modal-overlay" onClick={handleBackdropClick}>
      <div
        className="grocery-modal-container"
        role="dialog"
        aria-modal="true"
        aria-labelledby="grocery-modal-title"
      >
        {/* ── Header ── */}
        <div className="grocery-modal-header">
          <h2 id="grocery-modal-title" className="grocery-modal-title">Grocery List</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
            {flagExport && groceryList.length > 0 && (
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  className="grocery-item__delete-btn"
                  style={{ width: 'auto', padding: '4px 8px', fontSize: '13px', border: '1px solid #ddd', borderRadius: '4px' }}
                  aria-label="Export grocery list"
                  onClick={() => setShowExportMenu((v) => !v)}
                >
                  Export ↗
                </button>
                {showExportMenu && (
                  <div
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: '100%',
                      background: '#fff',
                      border: '1px solid #ccc',
                      borderRadius: '6px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                      padding: '8px',
                      zIndex: 100,
                      width: '180px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                    }}
                  >
                    <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', borderBottom: '1px solid #eee', paddingBottom: '6px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={buyOnlyExport}
                        onChange={(e) => setBuyOnlyExport(e.target.checked)}
                      />
                      Buy items only
                    </label>
                    <button
                      type="button"
                      style={{ background: 'none', border: 'none', textAlign: 'left', padding: '4px', cursor: 'pointer', fontSize: '13px' }}
                      onClick={handleCopyList}
                    >
                      📋 Copy text
                    </button>
                    {typeof navigator !== 'undefined' && 'share' in navigator && (
                      <button
                        type="button"
                        style={{ background: 'none', border: 'none', textAlign: 'left', padding: '4px', cursor: 'pointer', fontSize: '13px' }}
                        onClick={handleShareList}
                      >
                        📤 Share…
                      </button>
                    )}
                    <button
                      type="button"
                      style={{ background: 'none', border: 'none', textAlign: 'left', padding: '4px', cursor: 'pointer', fontSize: '13px' }}
                      onClick={() => downloadFile(exportGroceryToMarkdown(groceryList, { buyOnly: buyOnlyExport }), 'grocery-list.md', 'text/markdown')}
                    >
                      📄 Download .md
                    </button>
                    <button
                      type="button"
                      style={{ background: 'none', border: 'none', textAlign: 'left', padding: '4px', cursor: 'pointer', fontSize: '13px' }}
                      onClick={() => downloadFile(exportGroceryToCSV(groceryList, { buyOnly: buyOnlyExport }), 'grocery-list.csv', 'text/csv')}
                    >
                      📊 Download .csv
                    </button>
                  </div>
                )}
              </div>
            )}
            <button
              type="button"
              className="grocery-modal-close"
              aria-label="Close grocery list"
              onClick={onClose}
            >
              <CloseIcon />
            </button>
          </div>
        </div>
        {exportNotice && (
          <div style={{ background: '#eaf4eb', color: '#1a5f2e', padding: '4px 12px', fontSize: '13px', textAlign: 'center' }}>
            {exportNotice}
          </div>
        )}

        {groceryList.some((item) => item.completed) && (
          <div className="grocery-modal-actions">
            <button
              type="button"
              className="grocery-modal-clear-completed"
              onClick={clearCheckedItems}
            >
              Clear checked items
            </button>
          </div>
        )}

        {/* ── Sticky add-item input ── */}
        <form className="grocery-modal-add" onSubmit={handleAddItem}>
          <div className="grocery-modal-add__row">
            <input
              ref={inputRef}
              type="text"
              className="grocery-modal-add__input"
              placeholder="Add an item…"
              value={customInput}
              maxLength={50}
              aria-label="Custom item name"
              onChange={(e) => {
                setCustomInput(e.target.value)
                setInputError('')
              }}
            />
            <button type="submit" className="grocery-modal-add__btn" aria-label="Add item to grocery list">
              Add
            </button>
          </div>
          {inputError && (
            <p className="grocery-modal-add__error" role="alert">{inputError}</p>
          )}
        </form>

        {/* ── Scrollable list ── */}
        <div className="grocery-modal-content">
          {groceryList.length === 0 ? (
            <p className="grocery-modal-empty">
              No items yet — generate a list from the meal planner, or add items above.
            </p>
          ) : (
            <>
            {pantrySummary && (
              <p className="grocery-pantry-summary" role="status">{pantrySummary}. Review the status before shopping.</p>
            )}
            <div className="grocery-inventory-sections">
              {displaySections.map(({ status, items: statusItems }) => (
                <section key={status || 'all'} className={status ? `grocery-inventory-section grocery-inventory-section--${status}` : ''} aria-labelledby={status ? `grocery-status-${status}` : undefined}>
                  {status && (
                    <div className="grocery-inventory-header">
                      <h3 id={`grocery-status-${status}`}>{INVENTORY_STATUS_LABELS[status]}</h3>
                      <span>{statusItems.length}</span>
                    </div>
                  )}
                  <ul className="grocery-list" role="list">
                    {groupByCategory(statusItems).map(([category, items]) => {
                      const expansionKey = `${status || 'all'}:${category}`
                      const isExpanded = !!expandedCategories[expansionKey]
                      return (
                        <li key={`${status}-${category}`}>
                          <div className="grocery-category-header">
                            <button
                              type="button"
                              className="grocery-category-toggle"
                              aria-expanded={isExpanded}
                              onClick={() => toggleCategoryExpanded(expansionKey)}
                            >
                              <ChevronIcon expanded={isExpanded} />
                              {category}
                              <span className="grocery-category-count">{items.length}</span>
                            </button>
                          </div>

                          {isExpanded && (
                            <ul className="grocery-list" role="list">
                              {items.map((item) => {
                                const itemStatus = inventoryStatusFor(item)
                                return (
                                  <li
                                    key={item.id}
                                    className={[
                                      'grocery-item',
                                      item.completed ? 'grocery-item--checked' : '',
                                      item.isCustom ? 'grocery-item--custom' : '',
                                      pantryPlannerEnabled ? `grocery-item--${itemStatus}` : '',
                                    ].filter(Boolean).join(' ')}
                                  >
                                    <label className="grocery-item__label" htmlFor={`gi-${item.id}`}>
                                      <input
                                        type="checkbox"
                                        id={`gi-${item.id}`}
                                        className="grocery-item__checkbox"
                                        aria-label={item.name}
                                        checked={!!item.completed}
                                        onChange={() => toggleItemCompletion(item.id)}
                                      />
                                      <span className="grocery-item__text">{item.name}</span>
                                      {item.quantity && (
                                        <span className="grocery-item__quantity">{item.quantity}</span>
                                      )}
                                      {item.missingQuantity && (
                                        <span className="grocery-item__pantry-note">Have {item.pantryQuantity}; buy {item.missingQuantity}</span>
                                      )}
                                      {item.isCustom && (
                                        <span className="grocery-item__custom-badge">Custom</span>
                                      )}
                                    </label>
                                    {pantryPlannerEnabled && (
                                      <select
                                        className="grocery-item__status"
                                        value={itemStatus}
                                        aria-label={`${item.name} pantry status`}
                                        onChange={(event) => editItem(item.id, { inventoryStatus: event.target.value })}
                                      >
                                        {INVENTORY_STATUS_ORDER.map((option) => (
                                          <option key={option} value={option}>{INVENTORY_STATUS_LABELS[option]}</option>
                                        ))}
                                      </select>
                                    )}
                                    <button
                                      type="button"
                                      className="grocery-item__delete-btn"
                                      aria-label={`Delete ${item.name}`}
                                      onClick={() => deleteItem(item.id)}
                                    >
                                      <CloseIcon />
                                    </button>
                                  </li>
                                )
                              })}
                            </ul>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ))}
            </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
