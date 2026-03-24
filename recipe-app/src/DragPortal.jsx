import { createPortal } from 'react-dom'

/**
 * DragPortal
 *
 * Conditionally renders children via a React portal when a drag is active.
 *
 * WHY THIS FIXES THE CURSOR OFFSET
 * ---------------------------------
 * @hello-pangea/dnd positions the drag ghost with `position: fixed` and
 * sets its `top`/`left` via inline style transforms. Any ancestor element
 * that has a CSS `transform` applied (including `translateX(0)`) creates a
 * new "containing block" for fixed-position children, causing the ghost to
 * be positioned relative to that ancestor rather than the viewport.
 *
 * By rendering the dragged element into `document.body` via createPortal,
 * it escapes every transformed ancestor in the drawer's stacking context.
 * The `position: fixed` coordinates are now viewport-relative, so the ghost
 * tracks the cursor accurately.
 *
 * This is a belt-and-suspenders complement to the CSS `transform: none` rule
 * on `.meal-planner-drawer.is-open.is-dragging` (see MealPlanner.css). Both
 * fixes together cover edge cases where one alone might not be sufficient
 * (e.g. drawer animating while drag starts, or future CSS additions).
 *
 * REF: https://github.com/atlassian/react-beautiful-dnd/issues/499
 *
 * @param {React.ReactNode} children      - The draggable element to render
 * @param {boolean}         isActive      - When true, renders via portal to document.body
 * @param {HTMLElement}     [portalContainer=document.body] - Optional custom portal target
 */
export default function DragPortal({ children, isActive, portalContainer }) {
  if (!isActive) return children
  return createPortal(children, portalContainer ?? document.body)
}
