import { useCallback, useEffect, useRef, useState } from 'react';
import { MEAL_TYPES } from './utils/mealPlanMigration.js';

const RECIPE_GENERATION_URL = import.meta.env.VITE_RECIPE_GENERATION_URL;

/**
 * Generates the same 7-day scaffold as MealPlanner so the auto-fill preview
 * covers exactly the week the user is looking at.
 */
export function buildWeekDays(now = new Date()) {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const today = new Date(now);
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    return {
      day: dayNames[date.getDay()],
      date: `${months[date.getMonth()]} ${date.getDate()}`,
      dateString: date.toISOString().split('T')[0],
    };
  });
}

/**
 * Returns the slots from the current plan that are empty and eligible to fill.
 * A slot is eligible when its array is missing or empty.
 *
 * @param {Object} mealPlan - mealPlan state from MealPlanContext
 * @param {string[]} [dates] - ISO date strings to consider. `null`/`undefined`
 *   means "the upcoming week"; an empty array means "no dates" (zero slots).
 * @returns {string[]} slot strings in "YYYY-MM-DD::mealType" form
 */
export function getEmptySlots(mealPlan, dates) {
  const plan = mealPlan || {};
  const targets = dates != null ? dates : buildWeekDays().map((d) => d.dateString);
  const slots = [];
  for (const dateString of targets) {
    const day = plan[dateString] || {};
    for (const mealType of MEAL_TYPES) {
      if (!Array.isArray(day[mealType]) || day[mealType].length === 0) {
        slots.push(`${dateString}::${mealType}`);
      }
    }
  }
  return slots;
}

/**
 * Normalizes a fill endpoint meal into the app's canonical recipe shape
 * (matching what doGenerate / doAdapt produce in App.jsx).
 */
function normalizeMealRecipe(meal) {
  const r = meal?.recipe || {};
  return {
    id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source: 'ai_generated',
    name: r.name || 'Generated recipe',
    description: r.description || '',
    image: r.image_url || r.image || '',
    prep_time: r.prepTime || r.prep_time || null,
    cook_time: r.cookTime || r.cook_time || null,
    total_time: r.totalTime || r.total_time || null,
    recipe_yield: r.servings || r.recipe_yield || null,
    cuisine: r.cuisine || '',
    dietary: Array.isArray(r.dietary) ? r.dietary : [],
    difficulty: r.difficulty || '',
    ingredients: r.ingredients || [],
    instructions: r.instructions || [],
    nutrition: r.nutrition || null,
    tips: Array.isArray(r.tips) ? r.tips : [],
    appliedConstraints: r.appliedConstraints || null,
    allergenSummary: r.allergenSummary || null,
    allergenValidation: r.allergenValidation || null,
    processSafetySummary: r.processSafetySummary || null,
    processSafetyValidation: r.processSafetyValidation || null,
  };
}

/**
 * Hook that fills empty meal-plan slots via the generation worker.
 *
 * Returns:
 *  - fillMealPlan({ slots, profile, overrides, usePantry, pantryIngredients, prioritizeExpiring })
 *      → resolves with { meals: [{ date, mealType, recipe }], warnings }
 *  - status: 'idle' | 'loading' | 'success' | 'error'
 *  - error: string|null
 *  - reset
 */
export function useFillMealPlan() {
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);

  const reset = useCallback(() => {
    requestIdRef.current += 1;
    setStatus('idle');
    setError(null);
  }, []);

  // Ignore responses from stale in-flight requests if a new one starts or the
  // consumer unmounts.
  useEffect(() => () => { requestIdRef.current += 1; }, []);

  const fillMealPlan = useCallback(async ({
    slots,
    profile = null,
    overrides = null,
    usePantry = false,
    pantryIngredients = [],
    prioritizeExpiring = false,
  } = {}) => {
    if (!RECIPE_GENERATION_URL) {
      setError('Recipe generation is not configured.');
      setStatus('error');
      throw new Error('Recipe generation is not configured.');
    }

    const requestId = ++requestIdRef.current;
    setStatus('loading');
    setError(null);

    try {
      const res = await fetch(`${RECIPE_GENERATION_URL}/meal-plan-fill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slots,
          culinaryProfile: profile || undefined,
          overrides: overrides || undefined,
          usePantry,
          pantryIngredients,
          prioritizeExpiring,
          generateImage: true,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (requestId !== requestIdRef.current) return { meals: [], warnings: [] };
      if (!res.ok || !data.success) {
        const message = data.error || `Auto-fill failed (${res.status})`;
        setError(message);
        setStatus('error');
        throw new Error(message);
      }

      const meals = (data.meals || []).map((meal) => ({
        date: meal.date,
        mealType: meal.mealType,
        recipe: normalizeMealRecipe(meal),
      }));
      setStatus('success');
      return { meals, warnings: data.warnings || [] };
    } catch (err) {
      if (requestId === requestIdRef.current) {
        const message = err?.message || 'Unable to auto-fill your meal plan.';
        setError(message);
        setStatus('error');
      }
      throw err;
    }
  }, []);

  return { fillMealPlan, status, error, reset };
}
