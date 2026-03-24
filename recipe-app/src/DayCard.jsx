import React from 'react'
import { PlusIcon } from './MealPlanner.jsx'

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner']

function checkIsToday(dateStr) {
  const today = new Date()
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return dateStr === `${months[today.getMonth()]} ${today.getDate()}`
}

export default function DayCard({ day, date, meals, onAddMeal, onRemoveMeal }) {
  const todayCard = checkIsToday(date)
  const wideCard = day === 'Sunday'

  const mealsByType = {}
  for (const type of MEAL_TYPES) {
    mealsByType[type] = meals.filter((m) => m.type === type)
  }

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
        {MEAL_TYPES.map((type) => (
          <div key={type} className="meal-slot">
            <span className="meal-slot-label">{type}</span>
            {mealsByType[type].length > 0
              ? mealsByType[type].map((meal) => (
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
              : <div className="meal-slot-empty" aria-hidden="true" />}
          </div>
        ))}
      </div>
      <div className="day-card-actions">
        {MEAL_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            className="add-meal-btn"
            onClick={() => onAddMeal(day, type)}
            aria-label={`Add ${type} for ${day}`}
          >
            <PlusIcon size={12} />
            {type}
          </button>
        ))}
      </div>
    </div>
  )
}
