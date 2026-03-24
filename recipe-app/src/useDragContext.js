import { useContext } from 'react'
import { DragContext } from './DragContext.jsx'

/**
 * useDragContext
 *
 * Returns the current drag state and control functions from the nearest
 * DragProvider ancestor.
 *
 * @returns {{ isDragging: boolean, dragSourceId: string|null, setDragging: Function, clearDrag: Function }}
 * @throws {Error} if called outside a DragProvider
 */
export function useDragContext() {
  const ctx = useContext(DragContext)
  if (!ctx) {
    throw new Error('useDragContext must be called inside a <DragProvider>')
  }
  return ctx
}
