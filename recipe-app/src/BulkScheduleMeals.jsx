import React, { useEffect, useMemo, useState } from 'react';
import { MEAL_TYPES, MEAL_TYPE_DISPLAY } from './utils/mealPlanMigration.js';
import { useMealPlan } from './MealPlanContext.jsx';
import { buildWeekDays } from './useFillMealPlan.js';
import { buildScheduleAssignments, countOpenSlots } from './utils/bulkSchedule.js';

/**
 * BulkScheduleMeals — schedules every recipe staged in Up Next in one action.
 *
 * Part 2 of the auto-fill work (#459). Where AutoFillMealPlan generates new
 * recipes for empty slots, this places the recipes the user already staged,
 * replacing one drag per card with a single confirm.
 *
 * The assignment is computed locally (no network), so the list rendered here
 * *is* the preview: nothing is written until "Schedule" is pressed, and then
 * each assignment goes through MealPlanContext.addMeal while the scheduled
 * recipe leaves the staging strip.
 *
 * @param {Object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 */
export default function BulkScheduleMeals({ open, onClose }) {
  const { mealPlan, upNext, addMeal, removeUpNext } = useMealPlan();
  const [selectedMealTypes, setSelectedMealTypes] = useState(['dinner']);

  const weekDays = useMemo(() => buildWeekDays(), []);
  const dates = useMemo(() => weekDays.map((d) => d.dateString), [weekDays]);
  const dateLabels = useMemo(
    () => Object.fromEntries(weekDays.map((d) => [d.dateString, `${d.day.slice(0, 3)} ${d.date}`])),
    [weekDays]
  );

  const { assignments, unassigned } = useMemo(
    () => buildScheduleAssignments({
      recipes: upNext,
      mealPlan,
      dates,
      mealTypes: selectedMealTypes,
    }),
    [upNext, mealPlan, dates, selectedMealTypes]
  );

  const openSlots = useMemo(
    () => countOpenSlots(mealPlan, dates, selectedMealTypes),
    [mealPlan, dates, selectedMealTypes]
  );

  // Escape closes the modal (matches AutoFillMealPlan).
  useEffect(() => {
    if (!open) return undefined;
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Reopening should not inherit the previous session's meal-type tweak.
  useEffect(() => {
    if (!open) setSelectedMealTypes(['dinner']);
  }, [open]);

  function toggleMealType(mealType) {
    setSelectedMealTypes((prev) =>
      prev.includes(mealType) ? prev.filter((m) => m !== mealType) : [...prev, mealType]
    );
  }

  function handleConfirm() {
    if (!assignments.length) return;
    assignments.forEach(({ date, mealType, recipe }) => {
      addMeal(date, mealType, recipe);
      // addMeal re-keys the scheduled copy, so the staged original is removed
      // by its own id — leaving any unassigned duplicates in place.
      removeUpNext(recipe.id);
    });
    onClose();
  }

  if (!open) return null;

  return (
    <div
      className="autofill-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="autofill-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-schedule-title"
      >
        <div className="autofill-header">
          <div>
            <p className="autofill-eyebrow">Up Next</p>
            <h2 id="bulk-schedule-title">Schedule your staged recipes</h2>
            <p>
              Each staged recipe goes into the next open slot this week. Nothing
              is scheduled until you confirm.
            </p>
          </div>
          <button
            type="button"
            className="autofill-close"
            onClick={onClose}
            aria-label="Close bulk scheduling"
          >
            ×
          </button>
        </div>

        <div className="autofill-body">
          <fieldset className="autofill-section">
            <legend>Fill which meals?</legend>
            <div className="autofill-chips">
              {MEAL_TYPES.map((mealType) => (
                <label key={mealType} className="autofill-chip">
                  <input
                    type="checkbox"
                    checked={selectedMealTypes.includes(mealType)}
                    onChange={() => toggleMealType(mealType)}
                  />
                  <span>{MEAL_TYPE_DISPLAY[mealType]}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <p className="autofill-count" aria-live="polite">
            {upNext.length} staged recipe{upNext.length === 1 ? '' : 's'} · {openSlots} open slot
            {openSlots === 1 ? '' : 's'} this week
          </p>

          {assignments.length > 0 && (
            <ul className="autofill-preview-list" aria-label="Proposed schedule">
              {assignments.map(({ date, mealType, recipe }) => (
                <li key={`${date}::${mealType}`} className="autofill-preview-item">
                  <span className="autofill-preview-slot">
                    {dateLabels[date] || date} · {MEAL_TYPE_DISPLAY[mealType]}
                  </span>
                  <span className="autofill-preview-name">{recipe.name}</span>
                </li>
              ))}
            </ul>
          )}

          {upNext.length === 0 && (
            <p className="autofill-warnings" role="status">
              Nothing is staged yet. Use &quot;Save to Up Next&quot; on a recipe card first.
            </p>
          )}

          {unassigned.length > 0 && (
            <p className="autofill-warnings" role="status">
              No open slot for {unassigned.map((r) => r.name).join(', ')} — {unassigned.length === 1 ? 'it stays' : 'they stay'} in
              Up Next. Pick more meal types to fit {unassigned.length === 1 ? 'it' : 'them'} in.
            </p>
          )}
        </div>

        <div className="autofill-actions">
          <button type="button" className="autofill-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="autofill-primary"
            onClick={handleConfirm}
            disabled={assignments.length === 0}
          >
            Schedule {assignments.length} recipe{assignments.length === 1 ? '' : 's'}
          </button>
        </div>
      </section>
    </div>
  );
}
