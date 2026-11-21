# Live Ingredient-State Tracker (Wave 17 / #523)

## Overview
Cooking recipes are not just ordered strings of instructions; cooking is fundamentally a sequence of **state transitions on physical entities** (raw ingredients, intermediate mixtures, and kitchen tools).

The `IngredientStateV1` engine in Seasoned tracks these entities mid-cook within `CookingNavigator`, reflecting the model's belief about mise and intermediates, giving cooks 1-tap correction affordances, and providing fail-closed food safety gating.

---

## 1. Runtime Entity Model (`IngredientStateV1`)

Each entity in the state tracker conforms to:

```typescript
interface EntityState {
  id: string;                         // e.g. "ing-0-yellow-onion", "inter-0-sauce"
  name: string;                       // Cleaned entity name
  rawText?: string;                   // Original ingredient line
  type: 'ingredient' | 'intermediate' | 'tool';
  state: string;                      // Enum or free-text refinement
  location?: 'counter' | 'board' | 'bowl' | 'pan' | 'pot' | 'skillet' | 'baking-sheet' | 'oven' | 'fridge' | 'freezer' | 'grill' | 'plate';
  quantityRemaining?: string | number | null;
  source: 'step' | 'user' | 'vision' | 'infer';
  updatedAt: number;                  // Milliseconds timestamp
}
```

---

## 2. State Enum Taxonomy

### Preparation & Mise
- `raw` — Default initial state for fresh produce, proteins, dairy, dry goods.
- `frozen` — Detected from raw text or freezer storage.
- `thawed` — Transitioned after thawing or defrosting.
- `prepped`, `chopped`, `diced`, `minced`, `sliced`, `grated`, `peeled`, `seasoned`, `marinated`.

### Active Thermal & Mechanical
- `sweating`, `softened`, `caramelized`
- `seared`, `browned`, `sautéed`
- `simmering`, `boiling`, `reduced`
- `baked`, `roasted`, `steamed`, `fried`, `deep-fried`
- `melted`, `emulsified`, `mixed`, `whisked`, `kneaded`

### Post-Heat & Plating
- `rested`, `resting`, `warm`, `cooled`, `chilled`, `held`, `plated`, `garnished`, `discarded`

### Tools & Equipment
- `clean`, `preheating`, `hot`, `in-use`, `cooling`, `dirty`, `ready`

---

## 3. Deterministic Transitions & Intermediates

1. **Step Transitions (`applyStepTransition`)**:
   - Matches entity tokens against culinary verbs (e.g. `dice` -> `diced` on `board`, `caramelize` -> `caramelized` in `pan`, `reduce` -> `reduced`).
   - Automatically detects the creation of new intermediates (e.g. `butter-sugar mixture`, `egg mixture`, `roux`, `vinaigrette`, `sauce`, `batter`, `dough`).
   - Records chronological state history diffs for session analysis.

2. **Manual Corrections (`patchEntityState`)**:
   - Cooks can tap any entity chip to adjust its state, specify a custom refinement (e.g. `80% reduced`, `deep golden`), or update location.
   - Updates record `source: 'user'`.

---

## 4. Safety Gating & Validation (`validateAction`)

The runtime validator prevents hazardous or low-quality operations before execution:

- **Critical Fail-Closed Safety**: Attempting to sear, sauté, or bake protein whose state is still `frozen` triggers a high-severity Food Safety Alert warning of flare-ups and undercooked centers.
- **Soft-Gate Process Gating**: Attempting to plate or serve a dish when an accompanying `sauce` has not yet reached `reduced` or `ready` state triggers a process notice.
- **Quality Notice**: Attempting to slice hot meat before entering `resting` / `rested` state triggers a culinary tip to prevent loss of juices.

---

## 5. Offline Snapshots & Privacy

- **Snapshots (`exportStateSnapshot` / `restoreStateSnapshot`)**: The entire state board is serializable JSON, stored alongside Navigator state in local storage / KV for pause-and-resume.
- **Privacy & No Always-On Camera**: The state tracker operates 100% locally and deterministically from recipe structure and manual user taps. Camera / vision assist is completely optional, user-initiated, and never continuously streamed.
