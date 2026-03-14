// Pure JS HTML generator — mirrors RecipeCardDisplay.jsx without React.
// Avoids cross-package module resolution issues in the worker build.

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseDuration(val) {
  if (!val) return null;
  if (typeof val === 'number') return `${val} min`;
  const str = String(val).trim().toUpperCase();
  if (!str.startsWith('PT') && !str.startsWith('P')) return val;
  const hours = str.match(/(\d+)H/)?.[1];
  const minutes = str.match(/(\d+)M/)?.[1];
  const parts = [];
  if (hours) parts.push(`${hours} hr`);
  if (minutes) parts.push(`${minutes} min`);
  return parts.length ? parts.join(' ') : val;
}

const sourceBadgeMap = {
  clipped: { label: 'Clipped', color: '#5bb87a' },
  ai_generated: { label: 'AI Generated', color: '#c8a96e' },
  elevated: { label: 'Elevated', color: '#e8c87a' },
};

export function renderRecipeCard(recipe) {
  const instructions = (recipe.instructions || []).map((inst) => {
    if (typeof inst === 'string') return inst;
    return inst.text || inst.name || JSON.stringify(inst);
  });

  const sourceBadge = sourceBadgeMap[recipe.source];

  const ingredientItems = (recipe.ingredients || [])
    .map((ing) => {
      const text = typeof ing === 'string' ? ing : (ing.name || JSON.stringify(ing));
      return `<li>${escapeHtml(text)}</li>`;
    })
    .join('');

  const instructionItems = instructions
    .map((step) => `<li>${escapeHtml(step)}</li>`)
    .join('');

  return `<div class="recipe-card">
  <div class="recipe-card-header">
    <div class="recipe-title-row">
      <h2 class="recipe-title">${escapeHtml(recipe.name)}</h2>
      ${sourceBadge ? `<span class="recipe-source-badge" style="background-color:${escapeHtml(sourceBadge.color)}">${escapeHtml(sourceBadge.label)}</span>` : ''}
    </div>
  </div>

  ${recipe.image ? `<img class="recipe-image" src="${escapeHtml(recipe.image)}" alt="${escapeHtml(recipe.name)}" />` : ''}

  ${recipe.description ? `<p class="recipe-description">${escapeHtml(recipe.description)}</p>` : ''}

  <div class="recipe-meta">
    ${recipe.prep_time ? `<span class="recipe-meta-pill"><strong>Prep</strong> ${escapeHtml(parseDuration(recipe.prep_time))}</span>` : ''}
    ${recipe.cook_time ? `<span class="recipe-meta-pill"><strong>Cook</strong> ${escapeHtml(parseDuration(recipe.cook_time))}</span>` : ''}
    ${recipe.recipe_yield ? `<span class="recipe-meta-pill"><strong>Serves</strong> ${escapeHtml(String(recipe.recipe_yield))}</span>` : ''}
    ${recipe.source_url && recipe.source !== 'ai_generated' ? `<a class="source-link" href="${escapeHtml(recipe.source_url)}" target="_blank" rel="noopener noreferrer">Source ↗</a>` : ''}
    ${instructions.length > 0 ? `<button id="cook-btn" class="cook-btn" title="Step-by-step cooking mode" style="margin-left:auto">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M5 3l14 9-14 9V3z"/>
      </svg>
      Cook
    </button>` : ''}
  </div>

  <div class="recipe-body">
    ${ingredientItems.length > 0 ? `<div class="recipe-section"><h3>Ingredients</h3><ul>${ingredientItems}</ul></div>` : ''}
    ${instructionItems.length > 0 ? `<div class="recipe-section"><h3>Instructions</h3><ol>${instructionItems}</ol></div>` : ''}
  </div>
</div>`;
}
