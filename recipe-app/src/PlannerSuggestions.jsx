import React, { useEffect, useRef, useState } from 'react';
import { useMealPlan } from './MealPlanContext.jsx';

/**
 * PlannerSuggestions — one-tap access to recently viewed recipes inside the
 * planner drawer.
 *
 * Part 2 of the auto-fill work (#459). `recentRecipes` previously lived only in
 * the omnibox dropdown, so re-planning something the user just looked at meant
 * searching for it again. Tapping a suggestion stages it into Up Next, which
 * then feeds the bulk "Schedule all" flow — no drag required.
 *
 * @param {Object} props
 * @param {Array<Object>} props.recipes - recent recipes, newest first
 * @param {number} [props.limit] - how many suggestions to show
 */
export default function PlannerSuggestions({ recipes = [], limit = 6 }) {
  const { upNext, addUpNext } = useMealPlan();
  const [justAdded, setJustAdded] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const suggestions = recipes.filter((recipe) => recipe?.id && recipe?.name).slice(0, limit);
  if (suggestions.length === 0) return null;

  function handleAdd(recipe) {
    addUpNext(recipe);
    setJustAdded(recipe.id);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setJustAdded(null), 2000);
  }

  return (
    <section className="planner-suggestions" aria-label="Recent recipes">
      <h3 className="planner-suggestions__heading">Recent</h3>
      <div className="planner-suggestions__row">
        {suggestions.map((recipe) => {
          const staged = upNext.some((r) => r.id === recipe.id);
          const image = recipe.image || recipe.imageUrl || recipe.image_url || '';
          return (
            <button
              key={recipe.id}
              type="button"
              className={`planner-suggestions__chip${staged ? ' planner-suggestions__chip--staged' : ''}`}
              onClick={() => handleAdd(recipe)}
              aria-label={`Add ${recipe.name} to Up Next`}
              data-testid={`planner-suggestion-${recipe.id}`}
            >
              {image && (
                <img src={image} alt="" className="planner-suggestions__image" aria-hidden="true" />
              )}
              <span className="planner-suggestions__name">{recipe.name}</span>
              <span className="planner-suggestions__action" aria-hidden="true">
                {staged ? '✓' : '+'}
              </span>
            </button>
          );
        })}
      </div>
      <p className="planner-suggestions__status" role="status" aria-live="polite">
        {justAdded
          ? `${suggestions.find((r) => r.id === justAdded)?.name || 'Recipe'} added to Up Next`
          : ''}
      </p>
    </section>
  );
}
