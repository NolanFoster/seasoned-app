import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  isLegacyFormat,
  migrateFromLegacy,
  isValidMealType,
  createEmptyDay,
} from './utils/mealPlanMigration.js';

const STORAGE_KEY = 'seasoned_meal_plan';

const MealPlanContext = createContext();

export function useMealPlan() {
  return useContext(MealPlanContext);
}

/**
 * Loads and deserializes persisted state from localStorage.
 * Handles three storage shapes for backward compatibility:
 *   1. New envelope:  { mealPlan: {...}, upNext: [...] }
 *   2. Old direct:    { 'YYYY-MM-DD': { breakfast: [], ... } }  (no upNext)
 *   3. Legacy flat:   { 'YYYY-MM-DD': [recipe, ...] }           (pre-mealType era)
 *
 * @returns {{ mealPlan: Object, upNext: Array }}
 */
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { mealPlan: {}, upNext: [] };
    const parsed = JSON.parse(raw);

    // Shape 1 — new envelope format: { mealPlan, upNext }
    // Detected by the presence of a 'mealPlan' key that is a plain object.
    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      'mealPlan' in parsed
    ) {
      const planPart = parsed.mealPlan ?? {};
      const upNextPart = Array.isArray(parsed.upNext) ? parsed.upNext : [];
      if (isLegacyFormat(planPart)) {
        console.info('🔄 Meal plan (inside envelope) migrated from legacy format');
        return { mealPlan: migrateFromLegacy(planPart), upNext: upNextPart };
      }
      return { mealPlan: planPart, upNext: upNextPart };
    }

    // Shape 3 — legacy flat format: date keys map to plain arrays
    if (isLegacyFormat(parsed)) {
      console.info('🔄 Meal plan migrated from legacy format');
      const migrated = migrateFromLegacy(parsed);
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ mealPlan: migrated, upNext: [] }));
      return { mealPlan: migrated, upNext: [] };
    }

    // Shape 2 — old direct format: mealPlan stored at top level, no upNext
    return { mealPlan: parsed ?? {}, upNext: [] };
  } catch {
    return { mealPlan: {}, upNext: [] };
  }
}

export function MealPlanProvider({ children }) {
  const [mealPlan, setMealPlan] = useState(() => loadFromStorage().mealPlan);
  const [upNext, setUpNext] = useState(() => loadFromStorage().upNext);
  const [activeRecipe, setActiveRecipe] = useState(null);

  // Persist both mealPlan and upNext together under a single key
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ mealPlan, upNext }));
  }, [mealPlan, upNext]);

  /**
   * Adds a recipe to a specific date and meal type slot.
   * @param {string} dateString - e.g. '2025-10-24'
   * @param {string} mealType - one of 'breakfast' | 'lunch' | 'dinner' | 'snack'
   * @param {Object} recipe - recipe object with at least { id, name }
   */
  const addMeal = useCallback((dateString, mealType, recipe) => {
    if (!isValidMealType(mealType)) {
      console.warn(`Invalid mealType: "${mealType}". Allowed: breakfast, lunch, dinner, snack`);
      return;
    }
    if (!recipe?.id || !recipe?.name) {
      console.warn('Recipe missing id or name; skipping');
      return;
    }
    setMealPlan((prev) => {
      const day = prev[dateString] ?? createEmptyDay();
      return {
        ...prev,
        [dateString]: {
          ...day,
          [mealType]: [...day[mealType], { ...recipe, id: crypto.randomUUID() }],
        },
      };
    });
  }, []);

  /**
   * Appends a recipe to the upNext staging area.
   * Adding the same recipe twice is allowed (e.g. to schedule it multiple times).
   * @param {Object} recipe - recipe object with at least { id, name, ingredients }
   */
  const addUpNext = useCallback((recipe) => {
    if (!recipe?.id || !recipe?.name) {
      console.warn('addUpNext: recipe missing id or name; skipping');
      return;
    }
    setUpNext((prev) => [...prev, recipe]);
  }, []);

  /**
   * Removes the first recipe matching recipeId from the upNext staging area.
   * If the ID does not exist, the call is a no-op (no error thrown).
   * @param {string} recipeId - the id of the recipe to remove
   */
  const removeUpNext = useCallback((recipeId) => {
    if (!recipeId) return;
    setUpNext((prev) => {
      const idx = prev.findIndex((r) => r.id === recipeId);
      if (idx === -1) return prev; // graceful no-op
      return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
    });
  }, []);

  /**
   * Removes a recipe from a specific date and meal type slot by ID.
   * @param {string} dateString
   * @param {string} mealType
   * @param {string} recipeId
   */
  const removeMeal = useCallback((dateString, mealType, recipeId) => {
    if (!isValidMealType(mealType)) {
      console.warn(`Invalid mealType: "${mealType}". Allowed: breakfast, lunch, dinner, snack`);
      return;
    }
    setMealPlan((prev) => {
      const day = prev[dateString];
      if (!day) return prev;
      return {
        ...prev,
        [dateString]: {
          ...day,
          [mealType]: day[mealType].filter((r) => r.id !== recipeId),
        },
      };
    });
  }, []);

  /**
   * Moves a recipe between any combination of droppable zones, including the
   * upNext staging area and date/meal-type slots.
   *
   * Handles four scenarios:
   *   1. upNext → upNext  : reorder within the staging area
   *   2. upNext → slot    : move from staging into a date/meal slot
   *   3. slot  → upNext   : move from a date/meal slot back to staging
   *   4. slot  → slot     : move within the scheduled meal plan (existing behaviour)
   *
   * droppableId format for date/meal slots: "${dateString}::${mealType}"
   * (e.g. "2025-10-24::breakfast").  The upNext zone uses the literal id "upNext".
   *
   * @param {{ droppableId: string, index: number }} source      - drag source from @hello-pangea/dnd
   * @param {{ droppableId: string, index: number }} destination - drag destination from @hello-pangea/dnd
   * @param {number} sourceIndex      - source position (mirrors source.index; kept for call-site convenience)
   * @param {number} destinationIndex - destination position (mirrors destination.index)
   */
  const moveMeal = useCallback((source, destination, sourceIndex, destinationIndex) => {
    // No-op if dropped outside any droppable
    if (!destination) return;

    // No-op if dropped back onto the exact same position
    if (source.droppableId === destination.droppableId && sourceIndex === destinationIndex) return;

    const isSourceUpNext = source.droppableId === 'upNext';
    const isDestUpNext = destination.droppableId === 'upNext';

    /**
     * Parses a slot droppableId of the form "YYYY-MM-DD::mealType" into
     * { date, mealType }.  Returns null for "upNext" or malformed ids.
     */
    function parseSlotId(droppableId) {
      if (droppableId === 'upNext') return null;
      const sep = droppableId.lastIndexOf('::');
      if (sep === -1) return null;
      const date = droppableId.slice(0, sep);
      const mealType = droppableId.slice(sep + 2);
      if (!date || !isValidMealType(mealType)) return null;
      return { date, mealType };
    }

    // ── Scenario 1: upNext → upNext (reorder within staging area) ──────────
    if (isSourceUpNext && isDestUpNext) {
      setUpNext((prev) => {
        if (sourceIndex < 0 || sourceIndex >= prev.length) return prev;
        const reordered = [...prev];
        const [moved] = reordered.splice(sourceIndex, 1);
        const clampedDest = Math.min(destinationIndex, reordered.length);
        reordered.splice(clampedDest, 0, moved);
        return reordered;
      });
      return;
    }

    // ── Scenario 2: upNext → slot (move from staging to schedule) ──────────
    if (isSourceUpNext && !isDestUpNext) {
      const destSlot = parseSlotId(destination.droppableId);
      if (!destSlot) {
        console.warn('moveMeal: malformed destination droppableId:', destination.droppableId);
        return;
      }
      const { date: destDate, mealType: destMealType } = destSlot;

      // Capture recipe from current upNext before any state mutation
      if (sourceIndex < 0 || sourceIndex >= upNext.length) return;
      const recipe = upNext[sourceIndex];

      // Remove from upNext
      setUpNext([...upNext.slice(0, sourceIndex), ...upNext.slice(sourceIndex + 1)]);

      // Insert into mealPlan slot
      setMealPlan((prev) => {
        const destDay = prev[destDate] ?? createEmptyDay();
        const destMeals = destDay[destMealType] ?? [];
        const clampedDest = Math.min(destinationIndex, destMeals.length);
        const newDestMeals = [...destMeals];
        newDestMeals.splice(clampedDest, 0, recipe);
        return {
          ...prev,
          [destDate]: { ...destDay, [destMealType]: newDestMeals },
        };
      });
      return;
    }

    // ── Scenario 3: slot → upNext (move from schedule back to staging) ──────
    if (!isSourceUpNext && isDestUpNext) {
      const srcSlot = parseSlotId(source.droppableId);
      if (!srcSlot) {
        console.warn('moveMeal: malformed source droppableId:', source.droppableId);
        return;
      }
      const { date: srcDate, mealType: srcMealType } = srcSlot;

      // Capture recipe from current mealPlan before any state mutation
      const srcDay = mealPlan[srcDate];
      if (!srcDay) return;
      const srcMeals = srcDay[srcMealType] ?? [];
      if (sourceIndex < 0 || sourceIndex >= srcMeals.length) return;
      const recipe = srcMeals[sourceIndex];

      // Remove from mealPlan slot
      setMealPlan((prev) => {
        const day = prev[srcDate];
        if (!day) return prev;
        const meals = day[srcMealType] ?? [];
        return {
          ...prev,
          [srcDate]: { ...day, [srcMealType]: meals.filter((_, i) => i !== sourceIndex) },
        };
      });

      // Insert into upNext at destination index
      setUpNext((prev) => {
        const clampedDest = Math.min(destinationIndex, prev.length);
        const newUpNext = [...prev];
        newUpNext.splice(clampedDest, 0, recipe);
        return newUpNext;
      });
      return;
    }

    // ── Scenario 4: slot → slot (existing behaviour) ────────────────────────
    const srcSlot = parseSlotId(source.droppableId);
    const destSlot = parseSlotId(destination.droppableId);

    if (!srcSlot || !destSlot) {
      console.warn('moveMeal: malformed droppableId in slot→slot move');
      return;
    }

    const { date: sourceDate, mealType: sourceMealType } = srcSlot;
    const { date: destDate, mealType: destMealType } = destSlot;

    setMealPlan((prev) => {
      const sourceDay = prev[sourceDate] ?? createEmptyDay();
      const sourceMeals = sourceDay[sourceMealType] ?? [];

      if (sourceIndex < 0 || sourceIndex >= sourceMeals.length) return prev;

      const meal = sourceMeals[sourceIndex];
      const isSameSlot = sourceDate === destDate && sourceMealType === destMealType;

      if (isSameSlot) {
        if (sourceIndex === destinationIndex) return prev;
        const reordered = [...sourceMeals];
        reordered.splice(sourceIndex, 1);
        const clampedDest = Math.min(destinationIndex, reordered.length);
        reordered.splice(clampedDest, 0, meal);
        return {
          ...prev,
          [sourceDate]: { ...sourceDay, [sourceMealType]: reordered },
        };
      }

      // Remove from source
      const newSourceMeals = sourceMeals.filter((_, i) => i !== sourceIndex);

      // Insert into destination
      const destDay = prev[destDate] ?? createEmptyDay();
      const destMeals = destDay[destMealType] ?? [];
      const clampedDest = Math.min(destinationIndex, destMeals.length);
      const newDestMeals = [...destMeals];
      newDestMeals.splice(clampedDest, 0, meal);

      if (sourceDate === destDate) {
        // Same date, different meal type — update both in one day object
        const updatedDay = {
          ...sourceDay,
          [sourceMealType]: newSourceMeals,
          [destMealType]: newDestMeals,
        };
        return { ...prev, [sourceDate]: updatedDay };
      }

      return {
        ...prev,
        [sourceDate]: { ...sourceDay, [sourceMealType]: newSourceMeals },
        [destDate]: { ...destDay, [destMealType]: newDestMeals },
      };
    });
  }, [mealPlan, upNext]);

  const clearActiveRecipe = useCallback(() => setActiveRecipe(null), []);

  const contextValue = useMemo(
    () => ({
      mealPlan,
      upNext,
      addMeal,
      addUpNext,
      removeUpNext,
      removeMeal,
      moveMeal,
      activeRecipe,
      setActiveRecipe,
      clearActiveRecipe,
    }),
    [mealPlan, upNext, addMeal, addUpNext, removeUpNext, removeMeal, moveMeal, activeRecipe, clearActiveRecipe]
  );

  return (
    <MealPlanContext.Provider value={contextValue}>
      {children}
    </MealPlanContext.Provider>
  );
}
