import { renderToStaticMarkup } from 'react-dom/server.browser'
import React from 'react'
import RecipeCardDisplay from '../../recipe-app/src/RecipeCardDisplay.jsx'

export function renderRecipeCard(recipe) {
  return renderToStaticMarkup(
    <div className="recipe-card">
      <RecipeCardDisplay recipe={recipe} cookBtnId="cook-btn" />
    </div>
  )
}
