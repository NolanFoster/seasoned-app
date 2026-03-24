import React from 'react'

export const DragContext = React.createContext(null)

/**
 * DragProvider
 *
 * Exposes global drag state to the component tree so that:
 *  - MealPlannerDrawer can apply `.is-dragging` to remove its CSS transform
 *    (transform: none prevents position:fixed ghost-element offset — see
 *    MealPlanner.css for the full explanation)
 *  - DragPortal can conditionally portal dragged items to document.body,
 *    completely bypassing any transformed ancestor stacking contexts
 *
 * Wrap the MealPlanner subtree with this provider so all drag-aware
 * descendants share the same source of truth without prop drilling.
 */
export function DragProvider({ children }) {
  const [isDragging, setIsDragging] = React.useState(false)
  const [dragSourceId, setDragSourceId] = React.useState(null)

  // Stable setter — won't cause consumers to re-render on every parent render
  const setDragging = React.useCallback((dragging, sourceId = null) => {
    setIsDragging(dragging)
    setDragSourceId(sourceId)
  }, [])

  const clearDrag = React.useCallback(() => {
    setIsDragging(false)
    setDragSourceId(null)
  }, [])

  const value = React.useMemo(
    () => ({ isDragging, dragSourceId, setDragging, clearDrag }),
    [isDragging, dragSourceId, setDragging, clearDrag],
  )

  return <DragContext.Provider value={value}>{children}</DragContext.Provider>
}
