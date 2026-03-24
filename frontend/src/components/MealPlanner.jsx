import React from 'react';

// ── Data ──────────────────────────────────────────────────────────────────────

const WEEK_DAYS = [
  { id: 'monday',    label: 'Monday',    abbreviation: 'Mon' },
  { id: 'tuesday',   label: 'Tuesday',   abbreviation: 'Tue' },
  { id: 'wednesday', label: 'Wednesday', abbreviation: 'Wed' },
  { id: 'thursday',  label: 'Thursday',  abbreviation: 'Thu' },
  { id: 'friday',    label: 'Friday',    abbreviation: 'Fri' },
  { id: 'saturday',  label: 'Saturday',  abbreviation: 'Sat' },
  { id: 'sunday',    label: 'Sunday',    abbreviation: 'Sun' },
];

const MEAL_TYPES = [
  { id: 'breakfast', label: 'Breakfast', icon: '🌅' },
  { id: 'lunch',     label: 'Lunch',     icon: '🍽️' },
  { id: 'dinner',    label: 'Dinner',    icon: '🌙' },
];

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * MealPlanner — displays a seven-day weekly meal planning grid.
 *
 * Presentation-only at this stage. Each day card renders empty meal slots
 * (breakfast, lunch, dinner) ready for future meal CRUD integration.
 */
const MealPlanner = () => (
  <section className="meal-planner" aria-label="Weekly meal planner">
    <header className="meal-planner__header">
      <h2>Meal Planner</h2>
    </header>

    <div className="meal-week">
      {WEEK_DAYS.map((day) => (
        <article
          key={day.id}
          className="day-card"
          aria-label={`${day.label} meal plan`}
        >
          <header className="day-header">
            <h3>{day.label}</h3>
            <span className="day-date">{day.abbreviation}</span>
          </header>

          <div className="meal-slots-container">
            {MEAL_TYPES.map((meal) => (
              <div
                key={`${day.id}-${meal.id}`}
                className="meal-slot"
                aria-label={`${day.label} ${meal.label}`}
              >
                <span className="meal-type-label">
                  {meal.icon} {meal.label}
                </span>
                <div className="meal-content" />
              </div>
            ))}
          </div>
        </article>
      ))}
    </div>
  </section>
);

export default MealPlanner;
