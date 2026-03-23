# Root Cause Investigation: Search Dropdown Blocking Recipe Card on Load

## Summary

When a recipe finishes generating or clipping, the search dropdown immediately
appears over the newly-loaded recipe card. This is caused by an unconditional
`focus()` call in a `useEffect` that fires when the loading state clears, which
triggers `handleInputFocus`, which opens the dropdown whenever recent recipes
exist — with no guard checking whether a recipe card is already displayed.

---

## 1. Problematic `useEffect` — `App.jsx:192-197`

```js
// App.jsx:190-197
// Restore focus after a blocking async action completes, but don't steal focus
// from elements the user has intentionally focused.
useEffect(() => {
  if (!inputBusy) {
    const active = document.activeElement
    if (!active || active === document.body) inputRef.current?.focus()
  }
}, [inputBusy])
```

- **Dependency array:** `[inputBusy]`
- **`inputBusy` derivation (App.jsx:188):**
  ```js
  const inputBusy = status === 'clipping' || status === 'generating' || status === 'elevating'
  ```
- The effect fires every time `inputBusy` transitions. Critically, it fires when
  `inputBusy` goes from `true` → `false`, i.e., immediately after a clip or
  generation completes.
- **Missing guard:** The condition `!inputBusy` does **not** check `recipe`. It
  has no awareness that a recipe card is now displayed. The dependency array also
  omits `recipe`.

---

## 2. `handleInputFocus` Logic — `App.jsx:369-371`

```js
// App.jsx:369-371
function handleInputFocus() {
  if (!input.trim() && (recentRecipes.length > 0 || searchResults.length > 0)) setShowDropdown(true)
}
```

- Wired to the `<input>` element via `onFocus={handleInputFocus}` (`App.jsx:454`).
- Opens the dropdown whenever:
  1. The search input is empty (`!input.trim()`), **AND**
  2. There is at least one recent recipe or cached search result.
- **Missing guard:** No check for whether `recipe` (the displayed recipe card) is
  currently set. If a recipe is showing, the dropdown should not open.

---

## 3. State at the Moment the Bug Triggers

| State variable  | Value when bug fires     | Why                                                          |
|-----------------|--------------------------|--------------------------------------------------------------|
| `status`        | `'idle'`                 | Just set by `setStatus('idle')` at end of `doClip`/`doGenerate` |
| `inputBusy`     | `false`                  | Derived from `status`; was `true` during generation/clip     |
| `recipe`        | Non-null recipe object   | Set by `setRecipe(...)` just before `setStatus('idle')`      |
| `input`         | `''` (empty string)      | Cleared by `setInput('')` early in `doClip`/`doGenerate`     |
| `recentRecipes` | Length ≥ 1               | `addRecentRecipe(...)` was called before `setStatus('idle')` |
| `showDropdown`  | `false` → **`true`**     | Set by `handleInputFocus` after the unwanted focus event     |

---

## 4. Step-by-Step Causal Chain

```
1. User submits a URL or dish name.

2. doClip() / doGenerate() begins:
     setStatus('clipping' | 'generating')   → inputBusy = true
     setShowDropdown(false)
     setInput('')

3. Async fetch completes successfully.

4. setRecipe(clippedRecipe | generatedRecipe)   → recipe is now non-null
   addRecentRecipe(...)                          → recentRecipes.length >= 1

5. setStatus('idle')                            → inputBusy flips to false
   (doClip: App.jsx:276 / doGenerate: App.jsx:327)

6. React re-renders. The useEffect([inputBusy]) at App.jsx:192 runs because
   inputBusy changed (true → false).

7. Inside the effect:
     !inputBusy   → true  ✓
     document.activeElement is document.body  (input was disabled during step 2,
       so focus was released to body)        → true  ✓
   → inputRef.current.focus() is called unconditionally.

8. The focus event fires on <input onFocus={handleInputFocus}> (App.jsx:454).

9. handleInputFocus() runs (App.jsx:369):
     !input.trim()              → true  (input was cleared in step 2)
     recentRecipes.length > 0  → true  (recipe added in step 4)
   → setShowDropdown(true)

10. showDropdown = true → dropdown renders (App.jsx:517).
    The dropdown overlays the recipe card that also rendered in step 4.
```

---

## 5. State Transition Diagram

```
status: 'generating'        status: 'idle'
inputBusy: true    ──────►  inputBusy: false
recipe: null                recipe: <RecipeObject>
input: ''                   input: ''
recentRecipes: [r1]         recentRecipes: [r1]
showDropdown: false         showDropdown: false
                                    │
                          useEffect([inputBusy]) fires
                                    │
                          inputRef.current.focus()
                                    │
                          onFocus → handleInputFocus()
                                    │
                          !input.trim() && recentRecipes.length > 0
                                    │ (both true)
                                    ▼
                            setShowDropdown(true)
                                    │
                                    ▼
                          showDropdown: true  ← BUG
                          (dropdown renders over recipe card)
```

---

## 6. Missing Guards Identified

### In the `useEffect` (App.jsx:192-197)
- **Does not check `recipe`:** The condition `if (!inputBusy)` blindly restores
  focus after any loading state ends, even when a recipe card is now visible.
- **`recipe` not in dependency array:** The effect cannot react to recipe state.

### In `handleInputFocus` (App.jsx:369-371)
- **Does not check `recipe`:** There is no `&& !recipe` guard. When the input
  receives focus while a recipe card is shown, the dropdown should remain closed.

---

## 7. Recommended Guard Condition

The narrowest fix is to add a `recipe` check in the `useEffect` so that focus is
only restored when no recipe card is displayed:

```js
// App.jsx:192 — proposed guard (do not implement during investigation phase)
useEffect(() => {
  if (!inputBusy && !recipe) {   // ← add !recipe
    const active = document.activeElement
    if (!active || active === document.body) inputRef.current?.focus()
  }
}, [inputBusy, recipe])          // ← add recipe to deps
```

An equivalent or complementary guard can be placed in `handleInputFocus`:

```js
// App.jsx:369 — proposed guard (do not implement during investigation phase)
function handleInputFocus() {
  if (!recipe && !input.trim() && (recentRecipes.length > 0 || searchResults.length > 0))
    setShowDropdown(true)
}
```

---

## 8. Files Referenced

| File                              | Line(s)   | Relevance                                      |
|-----------------------------------|-----------|------------------------------------------------|
| `recipe-app/src/App.jsx`          | 188       | `inputBusy` derivation                         |
| `recipe-app/src/App.jsx`          | 192-197   | Problematic `useEffect` that calls `.focus()`  |
| `recipe-app/src/App.jsx`          | 369-371   | `handleInputFocus` — opens dropdown on focus   |
| `recipe-app/src/App.jsx`          | 446-458   | `<input onFocus={handleInputFocus}>` wiring    |
| `recipe-app/src/App.jsx`          | 268-276   | `doClip` — sets recipe then `status('idle')`   |
| `recipe-app/src/App.jsx`          | 319-328   | `doGenerate` — sets recipe then `status('idle')` |
| `recipe-app/src/App.jsx`          | 517       | Conditional render of dropdown (`showDropdown`) |
| `recipe-app/src/App.jsx`          | 590-600   | Conditional render of `<RecipeCard>`           |
| `recipe-app/src/RecipeCard.jsx`   | 19        | `RecipeCard` component — displayed when recipe set |
