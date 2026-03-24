import React from 'react';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

/**
 * Returns the Monday-anchored dates for the current week.
 * Monday is index 0, Sunday is index 6.
 */
function getCurrentWeekDates() {
  const today = new Date();
  // getDay() → 0=Sun … 6=Sat; convert to Mon=0 … Sun=6
  const dayOfWeek = (today.getDay() + 6) % 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - dayOfWeek);

  return DAYS.map((_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function formatDate(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isToday(date) {
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

const MealPlanner = () => {
  const weekDates = getCurrentWeekDates();

  return (
    <div className="meal-planner">
      <div className="meal-planner__header">
        <h2>Meal Planner</h2>
      </div>

      <div className="week-container">
        {DAYS.map((day, i) => {
          const date = weekDates[i];
          const today = isToday(date);

          return (
            <div
              key={day}
              className={`day-card${today ? ' day-card--today' : ''}`}
            >
              <div className="day-header">
                <h3>{day}</h3>
                <div className="day-date">{formatDate(date)}</div>
              </div>

              <div className="meal-slots-container">
                {MEALS.map((meal) => (
                  <div key={meal} className="meal-slot">
                    <div className="meal-label">{meal}</div>
                    <div className="meal-content" />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MealPlanner;
