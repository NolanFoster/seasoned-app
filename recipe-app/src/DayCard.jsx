import React from 'react'
import { PlusIcon } from './MealPlanner.jsx'

function checkIsToday(dateStr) {
  const today = new Date()
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return dateStr === `${months[today.getMonth()]} ${today.getDate()}`
}

export default function DayCard({ day, date, meals, onAddMeal, onRemoveMeal }) {
  const todayCard = checkIsToday(date)
  const wideCard = day === 'Sunday'

  let className = 'day-card'
  if (todayCard) className += ' day-card--today'
  if (wideCard) className += ' day-card--wide'

  return (
    <div className={className}>
      <div className="day-card-header">
        <span className="day-name">{day}</span>
        <span className="day-date">{date}</span>
      </div>
      <div className="day-card-meals">
        {meals.length === 0 ? (
          <div className="meal-slot-empty">No meals planned</div>
        ) : (
          meals.map((meal) => (
            <div key={meal.id} className="meal-item">
              <span className="meal-item-name">{meal.name}</span>
              <button
                type="button"
                className="meal-item-remove"
                onClick={() => onRemoveMeal(meal.id)}
                aria-label={`Remove ${meal.name}`}
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>
      <div className="day-card-actions">
        <button
          type="button"
          className="add-meal-btn"
          onClick={() => onAddMeal(day)}
          aria-label={`Add meal for ${day}`}
        >
          <PlusIcon size={12} />
          Add meal
        </button>
      </div>
    </div>
  )
}
