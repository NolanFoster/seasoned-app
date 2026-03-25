import React, { createContext, useContext, useState, useEffect } from 'react';
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

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (isLegacyFormat(parsed)) {
      console.info('🔄 Meal plan migrated from legacy format');
      const migrated = migrateFromLegacy(parsed);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
    return parsed;
  } catch {
    return {};
  }
}

export function MealPlanProvider({ children }) {
  const [mealPlan, setMealPlan] = useState(loadFromStorage);
  const [activeRecipe, setActiveRecipe] = useState(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mealPlan));
  }, [mealPlan]);

  /**
   * Adds a recipe to a specific date and meal type slot.
   * @param {string} dateString - e.g. '2025-10-24'
   * @param {string} mealType - one of 'breakfast' | 'lunch' | 'dinner' | 'snack'
   * @param {Object} recipe - recipe object with at least { id, name }
   */
  const addMeal = (dateString, mealType, recipe) => {
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
  };

  /**
   * Removes a recipe from a specific date and meal type slot by ID.
   * @param {string} dateString
   * @param {string} mealType
   * @param {string} recipeId
   */
  const removeMeal = (dateString, mealType, recipeId) => {
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
  };

  /**
   * Moves a recipe between slots (same or different date/mealType).
   * @param {string} sourceDate
   * @param {string} sourceMealType
   * @param {string} destDate
   * @param {string} destMealType
   * @param {number} sourceIndex
   * @param {number} destIndex
   */
  const moveMeal = (sourceDate, sourceMealType, destDate, destMealType, sourceIndex, destIndex) => {
    if (!isValidMealType(sourceMealType) || !isValidMealType(destMealType)) {
      console.warn('moveMeal: invalid mealType in source or destination');
      return;
    }
    setMealPlan((prev) => {
      const sourceDay = prev[sourceDate] ?? createEmptyDay();
      const sourceMeals = sourceDay[sourceMealType] ?? [];

      if (sourceIndex < 0 || sourceIndex >= sourceMeals.length) return prev;

      const meal = sourceMeals[sourceIndex];

      const isSameSlot = sourceDate === destDate && sourceMealType === destMealType;

      if (isSameSlot) {
        if (sourceIndex === destIndex) return prev;
        const reordered = [...sourceMeals];
        reordered.splice(sourceIndex, 1);
        const clampedDest = Math.min(destIndex, reordered.length);
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
      const clampedDest = Math.min(destIndex, destMeals.length);
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
  };

  const clearActiveRecipe = () => setActiveRecipe(null);

  return (
    <MealPlanContext.Provider
      value={{ mealPlan, addMeal, removeMeal, moveMeal, activeRecipe, setActiveRecipe, clearActiveRecipe }}
    >
      {children}
    </MealPlanContext.Provider>
  );
}
