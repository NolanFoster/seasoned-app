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

  useEffect(() => {
    localStorage.setItem('seasoned_meal_plan', JSON.stringify(mealPlan));
  }, [mealPlan]);

  const addMeal = (dateString, recipe) => {
    setMealPlan((prev) => {
      const dayMeals = prev[dateString] || [];
      return {
        ...prev,
        [dateString]: [...dayMeals, recipe],
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

  return (
    <MealPlanContext.Provider value={{ mealPlan, addMeal, removeMeal }}>
      {children}
    </MealPlanContext.Provider>
  );
}
