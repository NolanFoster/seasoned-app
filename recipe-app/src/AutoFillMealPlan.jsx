import React, { useEffect, useMemo, useState } from 'react';
import { MEAL_TYPES, MEAL_TYPE_DISPLAY } from './utils/mealPlanMigration.js';
import { useMealPlan } from './MealPlanContext.jsx';
import { buildWeekDays, getEmptySlots, useFillMealPlan } from './useFillMealPlan.js';

/**
 * AutoFillMealPlan — a confirm-before-write preview for one-tap week filling.
 *
 * Shows which slots will be filled and lets the user:
 *   - exclude whole days (skip that day's slots)
 *   - keep only selected meal types
 *   - preview the recipes that will be written
 * Then, on confirm, writes every meal via MealPlanContext.addMeal.
 *
 * @param {Object}   props
 * @param {boolean}  props.open
 * @param {() => void} props.onClose
 * @param {Object|null} props.profile - culinary profile to pass to the fill endpoint
 * @param {Object|null} props.overrides - per-fill generation overrides
 * @param {boolean}  props.usePantry
 * @param {Array}    props.pantryIngredients
 * @param {boolean}  props.prioritizeExpiring
 */
export default function AutoFillMealPlan({
  open,
  onClose,
  profile = null,
  overrides = null,
  usePantry = false,
  pantryIngredients = [],
  prioritizeExpiring = false,
}) {
  const { mealPlan, addMeal } = useMealPlan();
  const { fillMealPlan, status, error, reset } = useFillMealPlan();

  const [selectedDays, setSelectedDays] = useState(() => buildWeekDays().map((d) => d.dateString));
  const [selectedMealTypes, setSelectedMealTypes] = useState(() => [...MEAL_TYPES]);
  const [preview, setPreview] = useState(null); // { meals, warnings }

  const weekDays = useMemo(() => buildWeekDays(), []);

  const emptySlots = useMemo(
    () => getEmptySlots(mealPlan, selectedDays)
      .filter((slot) => selectedMealTypes.includes(slot.split('::')[1])),
    [mealPlan, selectedDays, selectedMealTypes]
  );

  // Escape closes the modal.
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

  useEffect(() => {
    if (!open) {
      setPreview(null);
      reset();
    }
  }, [open, reset]);

  // Reset the preview AND invalidate any in-flight fill whenever the selection
  // changes, so a stale result can never be confirmed against deselected slots.
  useEffect(() => {
    setPreview(null);
    reset();
  }, [selectedDays, selectedMealTypes, reset]);

  async function handlePreview() {
    try {
      const result = await fillMealPlan({
        slots: emptySlots,
        profile,
        overrides,
        usePantry,
        pantryIngredients,
        prioritizeExpiring,
      });
      // A selection change or reset may have invalidated this request; only
      // commit the preview when it produced real meals.
      if (result && result.meals.length > 0) setPreview(result);
    } catch {
      // Error is surfaced via status/error from the hook.
    }
  }

  function handleConfirm() {
    if (!preview || !preview.meals.length) return;
    preview.meals.forEach(({ date, mealType, recipe }) => {
      if (recipe?.id && recipe?.name) {
        addMeal(date, mealType, recipe);
      }
    });
    onClose();
  }

  function toggleDay(dateString) {
    setSelectedDays((prev) =>
      prev.includes(dateString) ? prev.filter((d) => d !== dateString) : [...prev, dateString]
    );
  }

  function toggleMealType(mealType) {
    setSelectedMealTypes((prev) =>
      prev.includes(mealType) ? prev.filter((m) => m !== mealType) : [...prev, mealType]
    );
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
        aria-labelledby="autofill-title"
      >
        <div className="autofill-header">
          <div>
            <p className="autofill-eyebrow">One tap, done</p>
            <h2 id="autofill-title">Auto-fill your week</h2>
            <p>
              We&apos;ll propose a recipe for each empty slot using your kitchen
              profile. Nothing is written until you confirm.
            </p>
          </div>
          <button type="button" className="autofill-close" onClick={onClose} aria-label="Close auto-fill">
            ×
          </button>
        </div>

        <div className="autofill-body">
          <fieldset className="autofill-section">
            <legend>Days</legend>
            <div className="autofill-chips">
              {weekDays.map((d) => (
                <label key={d.dateString} className="autofill-chip">
                  <input
                    type="checkbox"
                    checked={selectedDays.includes(d.dateString)}
                    onChange={() => toggleDay(d.dateString)}
                  />
                  <span>{d.day.slice(0, 3)} {d.date}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="autofill-section">
            <legend>Meal types</legend>
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
            {emptySlots.length} empty slot{emptySlots.length === 1 ? '' : 's'} selected
          </p>

          {preview && preview.meals.length > 0 && (
            <ul className="autofill-preview-list" aria-label="Proposed meals">
              {preview.meals.map((meal) => (
                <li key={`${meal.date}::${meal.mealType}`} className="autofill-preview-item">
                  <span className="autofill-preview-slot">
                    {meal.date} · {MEAL_TYPE_DISPLAY[meal.mealType]}
                  </span>
                  <span className="autofill-preview-name">{meal.recipe.name}</span>
                </li>
              ))}
            </ul>
          )}

          {preview && preview.warnings.length > 0 && (
            <p className="autofill-warnings" role="status">
              {preview.warnings.length} slot{preview.warnings.length === 1 ? '' : 's'} could not be
              filled automatically.
            </p>
          )}

          {error && <p className="autofill-error" role="alert">{error}</p>}
        </div>

        <div className="autofill-actions">
          <button type="button" className="autofill-secondary" onClick={onClose}>
            Cancel
          </button>
          {!preview || preview.meals.length === 0 ? (
            <button
              type="button"
              className="autofill-primary"
              onClick={handlePreview}
              disabled={status === 'loading' || emptySlots.length === 0}
            >
              {status === 'loading' ? 'Planning…' : 'Preview my week'}
            </button>
          ) : (
            <button
              type="button"
              className="autofill-primary"
              onClick={handleConfirm}
              disabled={preview.meals.length === 0}
            >
              Fill {preview.meals.length} slot{preview.meals.length === 1 ? '' : 's'}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
