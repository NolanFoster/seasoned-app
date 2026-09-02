import { renderRecipeCard } from './renderRecipeCard.js';

// Generate the HTML template for the recipe page
export function generateRecipeHTML(recipe) {
  // Normalise field aliases so RecipeCardDisplay always gets the canonical names
  const normalised = {
    ...recipe,
    name: recipe.name || recipe.title || 'Untitled Recipe',
    prep_time: recipe.prep_time || recipe.prepTime,
    cook_time: recipe.cook_time || recipe.cookTime,
    recipe_yield: recipe.recipe_yield || recipe.recipeYield || recipe.yield,
    image: recipe.image || recipe.image_url || recipe.imageUrl,
    source_url: recipe.source_url || recipe.sourceUrl || recipe.url,
  };

  const name = normalised.name;
  const description = normalised.description || '';
  const imageUrl = normalised.image || '';
  const prepTime = normalised.prep_time;
  const cookTime = normalised.cook_time;
  const videoUrl = recipe.video_url || recipe.videoUrl || '';

  // Compute total cook duration for wake lock auto-off
  const recipeDurationMins = parseDurationToMinutes(prepTime) + parseDurationToMinutes(cookTime);

  // SSR the recipe card using the shared React component
  const cardHTML = renderRecipeCard(normalised);

  // Generate the HTML
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(name)} - Recipe</title>
  <meta name="description" content="${escapeHtml(description || `View the recipe for ${name}`)}">

  <!-- Open Graph meta tags for social sharing -->
  <meta property="og:title" content="${escapeHtml(name)}">
  <meta property="og:description" content="${escapeHtml(description || `View the recipe for ${name}`)}">
  <meta property="og:type" content="website">
  ${imageUrl ? `<meta property="og:image" content="${escapeHtml(imageUrl)}">` : ''}

  <!-- Twitter Card meta tags -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(name)}">
  <meta name="twitter:description" content="${escapeHtml(description || `View the recipe for ${name}`)}">
  ${imageUrl ? `<meta name="twitter:image" content="${escapeHtml(imageUrl)}">` : ''}

  <style>${generateStyles()}</style>
</head>
<body>
  <div class="page-wrapper">
    ${cardHTML}
    ${videoUrl ? `<div class="page-video-link"><a href="${escapeHtml(videoUrl)}" target="_blank" rel="noopener noreferrer">Watch Video ↗</a></div>` : ''}
    <!-- Wake lock: floating button, touch devices only (CSS media query) -->
    <button class="wake-lock-float" id="wake-lock-btn" title="Keep screen on while cooking" aria-label="Keep screen on">
      <span id="wake-lock-icon">🌙</span>
    </button>
  </div>
  
  <script>
    // Wake Lock
    (function() {
      var btn = document.getElementById('wake-lock-btn');
      var icon = document.getElementById('wake-lock-icon');
      if (!btn) return;

      if (!('wakeLock' in navigator)) {
        btn.style.display = 'none';
        return;
      }

      var wakeLock = null;
      var wakeLockTimer = null;
      var recipeDurationMins = ${recipeDurationMins};

      function setActive(active) {
        if (active) {
          btn.classList.add('active');
          btn.title = 'Screen is staying on – tap to disable';
          icon.textContent = '☀️';
        } else {
          btn.classList.remove('active');
          btn.title = 'Keep screen on while cooking';
          icon.textContent = '🌙';
        }
      }

      function releaseWakeLock() {
        clearTimeout(wakeLockTimer);
        wakeLockTimer = null;
        if (wakeLock) { wakeLock.release(); wakeLock = null; }
        setActive(false);
      }

      async function acquireWakeLock() {
        try {
          wakeLock = await navigator.wakeLock.request('screen');
          setActive(true);
          var autoOff = recipeDurationMins > 0 ? recipeDurationMins + 15 : 0;
          if (autoOff > 0) {
            wakeLockTimer = setTimeout(releaseWakeLock, autoOff * 60 * 1000);
          }
          wakeLock.addEventListener('release', function() {
            wakeLock = null;
            setActive(false);
          });
        } catch(e) {
          console.error('Wake Lock failed:', e);
          setActive(false);
        }
      }

      btn.addEventListener('click', function() {
        if (wakeLock) { releaseWakeLock(); } else { acquireWakeLock(); }
      });

      document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'visible' && !wakeLock && btn.classList.contains('active')) {
          acquireWakeLock();
        }
      });
    })();
  </script>
</body>
</html>`;
}

// Server-side duration parser (minutes) for wake lock auto-off
function parseDurationToMinutes(val) {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  const str = String(val).trim().toUpperCase();
  if (!str.startsWith('PT') && !str.startsWith('P')) return 0;
  let mins = 0;
  const h = str.match(/(\d+)H/); if (h) mins += parseInt(h[1]) * 60;
  const m = str.match(/(\d+)M/); if (m) mins += parseInt(m[1]);
  return mins;
}

// Server-side HTML escaping
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Generate the complete CSS styles
function generateStyles() {
  return `
    /* Reset and Base Styles */
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    :root {
      --bg: #0d1a0f;
      --surface: #142016;
      --surface2: #1b2c1d;
      --border: #2a3d2c;
      --text: #e8f0e4;
      --text-muted: #7a9b80;
      --accent: #c8a96e;
      --radius: 14px;
      --radius-sm: 8px;
    }

    html, body {
      min-height: 100%;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 15px;
      line-height: 1.5;
    }

    /* Page wrapper — centers the card like the recipe-app */
    .page-wrapper {
      min-height: 100vh;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding: 40px 16px 60px;
      background:
        radial-gradient(ellipse 60% 40% at 50% -10%, rgba(91,184,122,0.08) 0%, transparent 70%),
        var(--bg);
    }

    /* Recipe Card */
    .recipe-card {
      width: 100%;
      max-width: 720px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
      position: relative;
    }

    /* Card Header */
    .recipe-card-header {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 20px 20px 16px;
      border-bottom: 1px solid var(--border);
      flex-wrap: wrap;
    }

    /* Title row — matches RecipeCardDisplay structure */
    .recipe-title-row {
      display: flex;
      align-items: center;
      gap: 10px;
      flex: 1;
      min-width: 0;
      flex-wrap: wrap;
    }

    .recipe-title {
      font-size: 1.375rem;
      font-weight: 700;
      line-height: 1.3;
      color: var(--text);
      min-width: 0;
    }

    .recipe-source-badge {
      flex-shrink: 0;
      padding: 2px 10px;
      border-radius: 99px;
      font-size: 0.75rem;
      font-weight: 600;
      color: #fff;
      white-space: nowrap;
    }

    /* Source link inside recipe-meta */
    .recipe-meta a {
      color: var(--accent);
      text-decoration: none;
      font-size: 0.875rem;
      font-weight: 500;
      padding: 3px 8px;
    }
    .recipe-meta a:hover {
      text-decoration: underline;
    }

    /* Page-level video link */
    .page-video-link {
      max-width: 720px;
      margin: 8px auto 0;
      padding: 0 16px;
      text-align: right;
    }
    .page-video-link a {
      color: var(--accent);
      text-decoration: none;
      font-size: 0.875rem;
    }
    .page-video-link a:hover { text-decoration: underline; }

    /* Recipe Image */
    .recipe-image {
      width: 100%;
      max-height: 300px;
      object-fit: cover;
      display: block;
    }

    /* Description */
    .recipe-description {
      padding: 16px 20px 0;
      font-size: 0.9375rem;
      color: var(--text-muted);
      line-height: 1.6;
    }

    /* Meta pills */
    .recipe-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 12px;
      padding: 14px 20px;
      font-size: 0.875rem;
      color: var(--text-muted);
      border-bottom: 1px solid var(--border);
    }

    .recipe-meta-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: var(--surface2);
      border-radius: 99px;
      padding: 3px 10px;
      font-size: 0.85rem;
    }

    .recipe-meta-pill strong {
      color: var(--text);
    }

    .meta-link {
      color: var(--accent);
      text-decoration: none;
      padding: 3px 10px;
    }
    .meta-link:hover {
      text-decoration: underline;
    }

    /* Recipe Body — two-column grid */
    .recipe-body {
      display: grid;
      grid-template-columns: 1fr 2fr;
    }

    @media (max-width: 560px) {
      .recipe-body {
        grid-template-columns: 1fr;
      }
    }

    .recipe-section {
      padding: 20px;
    }
    .recipe-section + .recipe-section {
      border-left: 1px solid var(--border);
    }

    @media (max-width: 560px) {
      .recipe-section + .recipe-section {
        border-left: none;
        border-top: 1px solid var(--border);
      }
    }

    .recipe-section h3 {
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: var(--text-muted);
      margin-bottom: 12px;
      border-top: 1px solid var(--border);
      padding-top: 12px;
    }

    .recipe-section:first-child h3 {
      border-top: none;
      padding-top: 0;
    }

    .recipe-section ul,
    .recipe-section ol {
      padding-left: 18px;
    }

    .recipe-section li {
      font-size: 0.9rem;
      line-height: 1.75;
      color: var(--text);
      margin-bottom: 6px;
    }

    /* Wake Lock — floating button, touch devices only */
    .wake-lock-float {
      display: none;
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 50;
      width: 44px;
      height: 44px;
      align-items: center;
      justify-content: center;
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 50%;
      cursor: pointer;
      font-size: 1.25rem;
      box-shadow: 0 2px 12px rgba(0,0,0,0.4);
      transition: background 0.2s, box-shadow 0.2s;
    }
    @media (hover: none) and (pointer: coarse) {
      .wake-lock-float { display: flex; }
    }
    .wake-lock-float.active {
      background: rgba(255, 200, 0, 0.15);
      border-color: rgba(255, 200, 0, 0.4);
      box-shadow: 0 0 12px rgba(255, 200, 0, 0.4);
    }
  `;
}