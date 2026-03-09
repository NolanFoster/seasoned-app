import { formatDuration, formatIngredientAmount } from '../../shared/utility-functions.js';

// Generate the HTML template for the recipe page
export function generateRecipeHTML(recipe) {
  // Extract recipe data
  const name = recipe.name || recipe.title || 'Untitled Recipe';
  const description = recipe.description || '';
  const prepTime = recipe.prep_time || recipe.prepTime;
  const cookTime = recipe.cook_time || recipe.cookTime;
  const totalTime = recipe.total_time || recipe.totalTime;
  const recipeYield = recipe.recipe_yield || recipe.recipeYield || recipe.yield;
  const ingredients = recipe.ingredients || [];
  const instructions = recipe.instructions || [];
  const imageUrl = recipe.image_url || recipe.imageUrl || recipe.image || '';
  const sourceUrl = recipe.source_url || recipe.sourceUrl || recipe.url || '';
  const videoUrl = recipe.video_url || recipe.videoUrl || '';
  const nutrition = recipe.nutrition || {};

  // Compute total cook duration for wake lock auto-off
  const recipeDurationMins = parseDurationToMinutes(prepTime) + parseDurationToMinutes(cookTime);

  // Generate styles
  const styles = generateStyles();

  // Determine source badge
  const source = recipe.source || 'recipe';
  const sourceBadgeMap = {
    clipped: { label: 'Clipped', color: '#5bb87a' },
    ai_generated: { label: 'AI Generated', color: '#c8a96e' },
    elevated: { label: 'Elevated', color: '#e8c87a' },
  };
  const sourceBadge = sourceBadgeMap[source] || { label: 'Recipe', color: '#4a6e52' };

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

  <style>${styles}</style>
</head>
<body>
  <div class="page-wrapper">
    <div class="recipe-card">
      <!-- Header -->
      <div class="recipe-card-header">
        <h2 class="recipe-title">${escapeHtml(name)}</h2>
        <div class="recipe-header-actions">
          ${sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer" class="source-link">Source ↗</a>` : ''}
          <button class="wake-lock-btn" id="wake-lock-btn" title="Keep screen on while cooking">
            <span class="wake-lock-icon" id="wake-lock-icon">🌙</span>
            <span class="wake-lock-label" id="wake-lock-label"></span>
          </button>
        </div>
      </div>

      ${imageUrl ? `<img class="recipe-image" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(name)}">` : ''}

      ${description ? `<p class="recipe-description">${escapeHtml(description)}</p>` : ''}

      <!-- Meta -->
      <div class="recipe-meta">
        ${prepTime ? `<span class="recipe-meta-pill"><strong>Prep</strong> ${escapeHtml(formatDuration(prepTime))}</span>` : ''}
        ${cookTime ? `<span class="recipe-meta-pill"><strong>Cook</strong> ${escapeHtml(formatDuration(cookTime))}</span>` : ''}
        ${recipeYield ? `<span class="recipe-meta-pill"><strong>Serves</strong> ${escapeHtml(recipeYield)}</span>` : ''}
        ${videoUrl ? `<a href="${escapeHtml(videoUrl)}" target="_blank" rel="noopener noreferrer" class="meta-link">Watch Video ↗</a>` : ''}
      </div>

      <!-- Body -->
      <div class="recipe-body">
        <div class="recipe-section">
          <h3>Ingredients</h3>
          <ul>
            ${ingredients.map(ingredient => {
              const formatted = formatIngredientAmount(ingredient);
              return `<li>${escapeHtml(formatted)}</li>`;
            }).join('')}
          </ul>
        </div>
        <div class="recipe-section">
          <h3>Instructions</h3>
          <ol>
            ${instructions.map((instruction) => {
              const text = typeof instruction === 'string' ? instruction :
                         (instruction.text || instruction.name || String(instruction));
              return `<li>${renderInstructionWithTimers(escapeHtml(text))}</li>`;
            }).join('')}
          </ol>
        </div>
      </div>
    </div>
  </div>
  
  <script>
    // Wake Lock
    (function() {
      var btn = document.getElementById('wake-lock-btn');
      var icon = document.getElementById('wake-lock-icon');
      var label = document.getElementById('wake-lock-label');
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
          label.textContent = '';
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
            label.textContent = autoOff + 'm';
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

    // Timer state management
    window.activeTimers = new Map();
    
    // Handle timer button clicks
    window.handleTimerClick = function(button) {
      const timerId = button.getAttribute('data-timer-id');
      const duration = parseInt(button.getAttribute('data-duration'));
      const timeText = button.getAttribute('data-time-text');
      
      if (window.activeTimers.has(timerId)) {
        // Timer is active, toggle play/pause
        const timer = window.activeTimers.get(timerId);
        if (timer.isPaused) {
          resumeTimer(timerId);
        } else {
          pauseTimer(timerId);
        }
      } else {
        // Start new timer
        startTimer(button, timerId, duration, timeText);
      }
    };
    
    // Toggle timer play/pause
    window.toggleTimer = function(timerId) {
      const timer = window.activeTimers.get(timerId);
      if (timer) {
        if (timer.isPaused) {
          resumeTimer(timerId);
        } else {
          pauseTimer(timerId);
        }
      }
    };
    
    function startTimer(button, timerId, duration, timeText) {
      // Transform button into timer display
      const timerContainer = document.createElement('div');
      timerContainer.className = 'timer-active-container';
      timerContainer.innerHTML = \\\`
        <div class="timer-display">
          <span class="timer-time">\\\${formatTime(duration)}</span>
          <span class="timer-label">\\\${timeText}</span>
        </div>
        <button class="timer-control-btn play-pause-btn" data-timer-id="\\\${timerId}" onclick="window.toggleTimer('\\\${timerId}')">
          <svg viewBox="0 0 24 24" fill="currentColor" class="pause-icon">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
          </svg>
        </button>
        <button class="timer-control-btn stop-btn" onclick="window.stopTimer('\\\${timerId}')">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 6h12v12H6z"/>
          </svg>
        </button>
      \\\`;
      
      // Store reference to original button in container
      const hiddenButton = button.cloneNode(true);
      hiddenButton.style.display = 'none';
      timerContainer.appendChild(hiddenButton);
      
      button.parentNode.replaceChild(timerContainer, button);
      
      // Create timer object
      const timer = {
        id: timerId,
        duration: duration,
        remaining: duration,
        isPaused: false,
        container: timerContainer,
        originalButton: hiddenButton,
        interval: undefined
      };
      
      window.activeTimers.set(timerId, timer);
      
      // Start countdown
      timer.interval = setInterval(() => updateTimer(timerId), 1000);
    }
    
    function updateTimer(timerId) {
      const timer = window.activeTimers.get(timerId);
      if (!timer || timer.isPaused) return;
      
      timer.remaining--;
      
      // Update display
      const timeDisplay = timer.container.querySelector('.timer-time');
      timeDisplay.textContent = formatTime(timer.remaining);
      
      if (timer.remaining <= 0) {
        // Timer finished
        clearInterval(timer.interval);
        playTimerSound();
        showTimerComplete(timerId);
      }
    }
    
    function pauseTimer(timerId) {
      const timer = window.activeTimers.get(timerId);
      if (!timer) return;
      
      timer.isPaused = true;
      clearInterval(timer.interval);
      
      // Update button icon to play
      const playPauseBtn = timer.container.querySelector('.play-pause-btn');
      playPauseBtn.innerHTML = \\\`
        <svg viewBox="0 0 24 24" fill="currentColor" class="play-icon">
          <path d="M8 5v14l11-7z"/>
        </svg>
      \\\`;
    }
    
    function resumeTimer(timerId) {
      const timer = window.activeTimers.get(timerId);
      if (!timer) return;
      
      timer.isPaused = false;
      timer.interval = setInterval(() => updateTimer(timerId), 1000);
      
      // Update button icon to pause
      const playPauseBtn = timer.container.querySelector('.play-pause-btn');
      playPauseBtn.innerHTML = \\\`
        <svg viewBox="0 0 24 24" fill="currentColor" class="pause-icon">
          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
        </svg>
      \\\`;
    }
    
    window.stopTimer = function(timerId) {
      const timer = window.activeTimers.get(timerId);
      if (!timer) return;
      
      clearInterval(timer.interval);
      
      // Restore original button
      timer.container.parentNode.replaceChild(timer.originalButton, timer.container);
      timer.originalButton.style.display = '';
      
      window.activeTimers.delete(timerId);
    }
    
    function showTimerComplete(timerId) {
      const timer = window.activeTimers.get(timerId);
      if (!timer) return;
      
      // Flash completion state
      timer.container.classList.add('timer-complete');
      const timeDisplay = timer.container.querySelector('.timer-time');
      timeDisplay.textContent = 'Done!';
      
      // Auto-remove after 3 seconds
      setTimeout(() => window.stopTimer(timerId), 3000);
    }
    
    function formatTime(seconds) {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      
      if (hours > 0) {
        return \\\`\\\${hours}:\\\${minutes.toString().padStart(2, '0')}:\\\${secs.toString().padStart(2, '0')}\\\`;
      } else {
        return \\\`\\\${minutes}:\\\${secs.toString().padStart(2, '0')}\\\`;
      }
    }
    
    function playTimerSound() {
      // Create a simple beep sound using Web Audio API
      try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
      } catch (e) {
        // Fallback if Web Audio API is not supported
        console.log('Timer complete!');
      }
    }
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

// Render instruction text with timer buttons
function renderInstructionWithTimers(text) {
  if (!text) return '';
  
  // Pattern to match time expressions (e.g., "5 minutes", "1 hour", "30 seconds", "1-2 minutes")
  const timePattern = /(\d+(?:-\d+)?)\s*(hours?|minutes?|mins?|seconds?|secs?)/gi;
  let lastIndex = 0;
  let result = '';
  let match;
  let timerCount = 0;
  
  while ((match = timePattern.exec(text)) !== null) {
    // Add text before the match
    result += text.slice(lastIndex, match.index);
    
    // Extract time value and unit
    const timeValue = match[1];
    const timeUnit = match[2].toLowerCase();
    
    // Normalize unit
    let normalizedUnit = timeUnit;
    if (timeUnit.startsWith('hour')) normalizedUnit = 'hour';
    else if (timeUnit.startsWith('min')) normalizedUnit = 'min';
    else if (timeUnit.startsWith('sec')) normalizedUnit = 'sec';
    
    // Calculate duration in seconds (use max value for ranges)
    const maxValue = timeValue.includes('-') ? 
      parseInt(timeValue.split('-')[1]) : 
      parseInt(timeValue);
    
    let durationInSeconds = maxValue;
    if (normalizedUnit === 'hour') durationInSeconds *= 3600;
    else if (normalizedUnit === 'min') durationInSeconds *= 60;
    
    // Add the time text with a timer button
    timerCount++;
    result += match[0] + ` <button class="timer-button-inline" 
              data-duration="${durationInSeconds}" 
              data-timer-id="timer-${Date.now()}-${timerCount}"
              data-time-text="${match[0]}"
              onclick="window.handleTimerClick(this)">
        <svg class="timer-icon-inline" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.2 3.2.8-1.3-4.5-2.7V7z"/>
        </svg>
      </button>`;
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  result += text.slice(lastIndex);
  
  return result;
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

    @media (max-width: 480px) {
      .recipe-title { width: 100%; flex-basis: 100%; }
    }

    .recipe-badge {
      flex-shrink: 0;
      margin-top: 3px;
      padding: 3px 10px;
      border-radius: 99px;
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #fff;
      border-left: 3px solid rgba(255,255,255,0.3);
    }

    .recipe-title {
      flex: 1;
      font-size: 1.375rem;
      font-weight: 700;
      line-height: 1.3;
      color: var(--text);
    }

    .recipe-header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .source-link {
      color: var(--accent);
      text-decoration: none;
      font-size: 0.875rem;
      font-weight: 500;
      padding: 4px 8px;
    }
    .source-link:hover {
      text-decoration: underline;
    }

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

    /* Wake Lock Button */
    .wake-lock-btn {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      cursor: pointer;
      transition: background 0.2s, box-shadow 0.2s;
      padding: 0;
      line-height: 1;
    }
    .wake-lock-btn:hover {
      background: var(--border);
    }
    .wake-lock-btn.active {
      background: rgba(255, 200, 0, 0.15);
      border-color: rgba(255, 200, 0, 0.4);
      box-shadow: 0 0 8px rgba(255, 200, 0, 0.3);
    }
    .wake-lock-icon {
      font-size: 0.95em;
      line-height: 1;
    }
    .wake-lock-label {
      font-size: 0.5em;
      font-weight: 600;
      color: var(--text-muted);
      line-height: 1;
      margin-top: 1px;
    }

    /* Timer Button Styles */

    .timer-button-inline {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 4px 8px;
      border-radius: 16px;
      background: var(--surface2);
      border: 1px solid var(--border);
      cursor: pointer;
      transition: background 0.15s;
      vertical-align: middle;
      color: var(--accent);
      margin-left: 4px;
    }

    .timer-button-inline:hover {
      background: var(--border);
    }

    .timer-button-inline:active {
      opacity: 0.8;
    }

    .timer-icon-inline {
      width: 16px;
      height: 16px;
      fill: var(--accent);
    }

    /* Active Timer Styles */
    .timer-active-container {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: var(--surface2);
      border: 1px solid var(--accent);
      border-radius: 20px;
      padding: 6px 12px;
      animation: timer-pulse 2s ease-in-out infinite;
      margin-left: 8px;
    }

    @keyframes timer-pulse {
      0%, 100% { box-shadow: 0 0 0 1px rgba(200,169,110,0.2); }
      50%       { box-shadow: 0 0 0 2px rgba(200,169,110,0.4); }
    }

    .timer-display {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
    }

    .timer-time {
      font-size: 1.1em;
      font-weight: 600;
      color: var(--text);
      font-variant-numeric: tabular-nums;
    }

    .timer-label {
      font-size: 0.75em;
      color: var(--text-muted);
      white-space: nowrap;
    }

    .timer-control-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--border);
      border: 1px solid var(--border);
      cursor: pointer;
      transition: background 0.15s;
      padding: 0;
    }

    .timer-control-btn:hover {
      background: var(--accent);
    }

    .timer-control-btn svg {
      width: 16px;
      height: 16px;
      fill: var(--text);
    }

    .play-pause-btn svg {
      width: 14px;
      height: 14px;
    }

    .stop-btn svg {
      width: 12px;
      height: 12px;
    }

    /* Timer Complete State */
    .timer-active-container.timer-complete {
      border-color: #4CAF50;
    }

    @keyframes timer-complete {
      0%   { transform: scale(1); }
      50%  { transform: scale(1.1); }
      100% { transform: scale(1); }
    }

    .timer-complete .timer-time {
      color: #4CAF50;
    }

    /* Mobile Timer Styles */
    @media (max-width: 480px) {
      .timer-button-inline {
        padding: 3px 6px;
        font-size: 12px;
      }

      .timer-icon-inline {
        width: 14px;
        height: 14px;
      }

      .timer-active-container {
        padding: 4px 8px;
        gap: 6px;
      }

      .timer-time {
        font-size: 0.9em;
      }

      .timer-label {
        font-size: 0.7em;
      }

      .timer-control-btn {
        width: 24px;
        height: 24px;
      }

      .timer-control-btn svg {
        width: 14px;
        height: 14px;
      }
    }
  `;
}