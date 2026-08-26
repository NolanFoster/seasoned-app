import { MEAL_TYPES } from './mealPlanMigration.js';

/**
 * Bulk scheduling for staged ("Up Next") recipes.
 *
 * Part 2 of the auto-fill work (#459): part 1 fills empty slots with *new* AI
 * recipes; this places recipes the user already has, without a drag per card.
 *
 * The assignment is deliberately a pure function so the preview the user
 * confirms is exactly what gets written — the modal renders these assignments
 * and then replays them through MealPlanContext.addMeal.
 */

/**
 * True when a day/mealType slot has no recipes in it yet.
 *
 * @param {Object} mealPlan - mealPlan state from MealPlanContext
 * @param {string} dateString - 'YYYY-MM-DD'
 * @param {string} mealType - one of MEAL_TYPES
 * @returns {boolean}
 */
export function isSlotEmpty(mealPlan, dateString, mealType) {
  const slot = (mealPlan || {})[dateString]?.[mealType];
  return !Array.isArray(slot) || slot.length === 0;
}

/**
 * Assigns staged recipes to empty slots, one recipe per slot, in date-major
 * order (Mon breakfast, Mon dinner, Tue breakfast, …). Occupied slots are
 * skipped rather than overwritten, and recipes that find no slot are returned
 * as `unassigned` so the caller can leave them staged.
 *
 * @param {Object} args
 * @param {Array<Object>} args.recipes - staged recipes, in the order they should be placed
 * @param {Object} args.mealPlan - mealPlan state from MealPlanContext
 * @param {string[]} args.dates - ISO date strings for the week being planned
 * @param {string[]} [args.mealTypes] - meal types eligible to receive a recipe
 * @returns {{ assignments: Array<{ date: string, mealType: string, recipe: Object }>, unassigned: Array<Object> }}
 */
export function buildScheduleAssignments({ recipes, mealPlan, dates, mealTypes = ['dinner'] }) {
  const queue = Array.isArray(recipes) ? recipes.filter((r) => r?.id && r?.name) : [];
  const targetDates = Array.isArray(dates) ? dates : [];
  // Keep the canonical meal order (breakfast → snack) regardless of the order
  // the user ticked the chips, so the preview reads chronologically.
  const targetMealTypes = MEAL_TYPES.filter((mealType) => (mealTypes || []).includes(mealType));

  const assignments = [];
  let next = 0;

  for (const date of targetDates) {
    for (const mealType of targetMealTypes) {
      if (next >= queue.length) break;
      if (!isSlotEmpty(mealPlan, date, mealType)) continue;
      assignments.push({ date, mealType, recipe: queue[next] });
      next += 1;
    }
    if (next >= queue.length) break;
  }

  return { assignments, unassigned: queue.slice(next) };
}

/**
 * Counts the slots that are still open for the given dates and meal types.
 * Drives the "n open slots" copy in the preview.
 *
 * @param {Object} mealPlan
 * @param {string[]} dates
 * @param {string[]} mealTypes
 * @returns {number}
 */
export function countOpenSlots(mealPlan, dates, mealTypes = ['dinner']) {
  let count = 0;
  for (const date of Array.isArray(dates) ? dates : []) {
    for (const mealType of MEAL_TYPES) {
      if (!(mealTypes || []).includes(mealType)) continue;
      if (isSlotEmpty(mealPlan, date, mealType)) count += 1;
    }
  }
  return count;
}
