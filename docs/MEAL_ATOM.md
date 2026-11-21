# Meal-as-Atom Hybrid Plates (Wave 18 #530)

## 1. Problem
Traditional AI meal planning apps treat the **recipe** as the atomic unit of the meal plan. In mixed-diet households (e.g. one vegetarian, one omnivore, picky kids), scheduling single recipes leads to either cooking multiple disconnected dinners or defaulting to lowest-common-denominator meals.

## 2. MealV1 Architecture
- **Meal as Atom**: The planning atom is a `MealV1` entity with `mode: 'shared' | 'individual' | 'hybrid'`.
- **Components**: Each meal carries distinct components (`hero`, `side`, `sauce`, `garnish`), assigned to either `'all'` diners or specific subsets.
  - *Shared Base*: Tortillas, rice, grain bowls, sauces.
  - *Divergent Proteins/Finishes*: Ground beef for omnivores vs black beans & mushrooms for vegetarians.
- **Unified Grocery List**: `extractMealGroceryLines` extracts and deduplicates ingredients across all components into a single coherent shopping list.
