import React, { createContext, useContext, useState, useEffect } from 'react';

const MealPlanContext = createContext();

export function useMealPlan() {
  return useContext(MealPlanContext);
}

export function MealPlanProvider({ children }) {
  const [mealPlan, setMealPlan] = useState(() => {
    try {
      const localData = localStorage.getItem('seasoned_meal_plan');
      return localData ? JSON.parse(localData) : {};
    } catch (e) {
      return {};
    }
  });

  const [activeRecipe, setActiveRecipe] = useState(null);

  useEffect(() => {
    localStorage.setItem('seasoned_meal_plan', JSON.stringify(mealPlan));
  }, [mealPlan]);

  const addMeal = (dateString, recipe) => {
    setMealPlan((prev) => {
      const dayMeals = prev[dateString] || [];
      return {
        ...prev,
        [dateString]: [...dayMeals, { ...recipe, id: crypto.randomUUID() }],
      };
    });
  };

  const removeMeal = (dateString, recipeId) => {
    setMealPlan((prev) => {
      const dayMeals = prev[dateString] || [];
      return {
        ...prev,
        [dateString]: dayMeals.filter((r) => r.id !== recipeId),
      };
    });
  };

  const moveMeal = (recipeId, sourceDate, destinationDate, destinationIndex) => {
    setMealPlan((prev) => {
      const sourceMeals = prev[sourceDate] || [];
      const meal = sourceMeals.find((r) => r.id === recipeId);

      // Meal not found in source; no-op
      if (!meal) return prev;

      if (sourceDate === destinationDate) {
        // Same-day reorder: remove then insert at destination index
        const withoutMeal = sourceMeals.filter((r) => r.id !== recipeId);
        const clampedIndex = Math.min(destinationIndex, withoutMeal.length);
        const reordered = [...withoutMeal];
        reordered.splice(clampedIndex, 0, meal);
        return { ...prev, [sourceDate]: reordered };
      }

      // Cross-day move
      const newSourceMeals = sourceMeals.filter((r) => r.id !== recipeId);
      const destMeals = prev[destinationDate] || [];
      const clampedIndex = Math.min(destinationIndex, destMeals.length);
      const newDestMeals = [...destMeals];
      newDestMeals.splice(clampedIndex, 0, meal);

      return {
        ...prev,
        [sourceDate]: newSourceMeals,
        [destinationDate]: newDestMeals,
      };
    });
  };

  const clearActiveRecipe = () => setActiveRecipe(null);

  return (
    <MealPlanContext.Provider value={{ mealPlan, addMeal, removeMeal, moveMeal, activeRecipe, setActiveRecipe, clearActiveRecipe }}>
      {children}
    </MealPlanContext.Provider>
  );
}
