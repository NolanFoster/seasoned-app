import { formatDuration, formatIngredientAmount } from '../../shared/utility-functions.js';

// Generate the HTML template for the recipe page
export function generateRecipeHTML(recipe) {
  // Extract recipe data
  const name = recipe.name || 'Untitled Recipe';
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

  // Generate styles
  const styles = generateStyles();

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
  <div class="recipe-fullscreen">
    <!-- Background Image -->
    <div class="recipe-full-background">
      ${imageUrl ? 
        `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(name)}" class="recipe-full-background-image" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
         <div class="recipe-full-background-placeholder" style="display:none;"><div class="placeholder-gradient"></div></div>` : 
        `<div class="recipe-full-background-placeholder"><div class="placeholder-gradient"></div></div>`
      }
    </div>

    <!-- Title Section -->
    <div class="recipe-title-section">
      <h1 class="recipe-fullscreen-title">${escapeHtml(name)}</h1>
      
      <!-- Recipe Timing Info -->
      ${(prepTime || cookTime || totalTime || recipeYield) ? `
        <div class="recipe-timing-info">
          ${prepTime ? `
            <div class="timing-item">
              <span class="timing-icon">⏱️</span>
              <span class="timing-label">Prep:<span class="timing-value">${formatDuration(prepTime)}</span></span>
            </div>
          ` : ''}
          ${cookTime ? `
            <div class="timing-item">
              <span class="timing-icon">🔥</span>
              <span class="timing-label">Cook:<span class="timing-value">${formatDuration(cookTime)}</span></span>
            </div>
          ` : ''}
          ${totalTime ? `
            <div class="timing-item">
              <span class="timing-icon">⏰</span>
              <span class="timing-label">Total:<span class="timing-value">${formatDuration(totalTime)}</span></span>
            </div>
          ` : ''}
          ${recipeYield ? `
            <div class="timing-item">
              <span class="timing-icon">🍽️</span>
              <span class="timing-label">Servings:<span class="timing-value">${escapeHtml(recipeYield)}</span></span>
            </div>
          ` : ''}
        </div>
      ` : ''}
      
      <!-- Recipe Links -->
      <div class="recipe-links">
        ${sourceUrl ? `
          <a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer" class="recipe-link source-link">
            <span>🔗</span>
            <span>View Original</span>
          </a>
        ` : ''}
        ${videoUrl ? `
          <a href="${escapeHtml(videoUrl)}" target="_blank" rel="noopener noreferrer" class="recipe-link video-link">
            <span>🎥</span>
            <span>Watch Video</span>
          </a>
        ` : ''}
      </div>
    </div>
    
    <!-- Recipe Content -->
    <div class="recipe-fullscreen-content">
      <!-- Ingredients Panel -->
      <div class="recipe-panel">
        <h2>Ingredients</h2>
        <ul class="ingredients-list">
          ${ingredients.map(ingredient => {
            const formatted = formatIngredientAmount(ingredient);
            return `<li>${escapeHtml(formatted)}</li>`;
          }).join('')}
        </ul>
      </div>
      
      <!-- Instructions Panel -->
      <div class="recipe-panel">
        <h2>Instructions</h2>
        <ol class="instructions-list">
          ${instructions.map((instruction, index) => {
            const text = typeof instruction === 'string' ? instruction : 
                       (instruction.text || instruction.name || String(instruction));
            return `<li>${renderInstructionWithTimers(escapeHtml(text))}</li>`;
          }).join('')}
        </ol>
      </div>
    </div>
  </div>
  
  <script>
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
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
      line-height: 1.6;
      color: #333;
      background: #000;
      overflow-x: hidden;
    }

    /* Full Screen Recipe View */
    .recipe-fullscreen {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: transparent;
      overflow-y: auto;
      color: white;
      display: flex;
      flex-direction: column;
    }

    /* Recipe Title Section */
    .recipe-title-section {
      display: flex;
      flex-direction: column;
      align-items: center;
      position: relative;
      padding-top: 60px;
      z-index: 2;
      text-align: center;
      padding-left: 40px;
      padding-right: 40px;
      padding-bottom: 20px;
    }

    .recipe-fullscreen-title {
      color: white;
      font-size: 2.5em;
      font-weight: 600;
      margin: 0 auto;
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
      padding: 15px 25px;
      display: inline-block;
      width: fit-content;
      filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.6));
    }

    /* Recipe Timing Info */
    .recipe-timing-info {
      display: flex;
      gap: 2rem;
      justify-content: center;
      align-items: center;
      margin-top: 1rem;
      margin-bottom: 0.5rem;
      flex-wrap: wrap;
    }

    .timing-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      background: rgba(255, 255, 255, 0.1);
      padding: 0.5rem 1rem;
      border-radius: 20px;
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.2);
    }

    .timing-icon {
      font-size: 1.2em;
    }

    .timing-label {
      font-size: 0.9em;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      opacity: 0.9;
      font-weight: 500;
    }

    .timing-value {
      font-weight: 600;
      margin-left: 0.25rem;
    }

    /* Recipe Links */
    .recipe-links {
      display: flex;
      gap: 1rem;
      margin-top: 0.5rem;
      flex-wrap: wrap;
      justify-content: center;
    }

    .recipe-link {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      background: rgba(255, 255, 255, 0.1);
      color: white;
      text-decoration: none;
      border-radius: 25px;
      font-size: 0.9rem;
      font-weight: 500;
      transition: all 0.3s ease;
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25), 0 2px 8px rgba(0, 0, 0, 0.15);
      cursor: pointer;
    }

    .recipe-link:hover {
      background: rgba(255, 255, 255, 0.2);
      transform: translateY(-2px);
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35), 0 4px 12px rgba(0, 0, 0, 0.25);
    }

    .recipe-link.source-link {
      background: rgba(52, 152, 219, 0.2);
      border: 1px solid rgba(52, 152, 219, 0.3);
    }

    .recipe-link.source-link:hover {
      background: rgba(52, 152, 219, 0.4);
      border-color: rgba(52, 152, 219, 0.5);
    }

    .recipe-link.video-link {
      background: rgba(231, 76, 60, 0.2);
      border: 1px solid rgba(231, 76, 60, 0.3);
    }

    .recipe-link.video-link:hover {
      background: rgba(231, 76, 60, 0.4);
      border-color: rgba(231, 76, 60, 0.5);
    }

    /* Recipe Content */
    .recipe-fullscreen-content {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 30px;
      padding: 40px;
      max-width: 1200px;
      margin: 0 auto;
      margin-top: 30px;
      position: relative;
      z-index: 1;
      width: 100%;
      box-sizing: border-box;
    }

    /* Recipe Panels */
    .recipe-panel {
      padding: 30px;
      background: rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 15px;
      box-shadow: 0 12px 48px rgba(0, 0, 0, 0.3), 0 4px 16px rgba(0, 0, 0, 0.2);
      overflow: hidden;
      word-wrap: break-word;
      overflow-wrap: break-word;
      min-width: 0;
    }

    .recipe-panel h2 {
      color: white;
      margin: 0 0 20px 0;
      font-size: 1.5em;
      font-weight: 600;
    }

    .ingredients-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .ingredients-list li {
      padding: 12px 0;
      border-bottom: 1px solid rgba(0, 0, 0, 0.1);
      color: white;
      font-size: 1.1em;
      word-wrap: break-word;
      overflow-wrap: break-word;
      hyphens: auto;
    }

    .ingredients-list li:last-child {
      border-bottom: none;
    }

    .instructions-list {
      padding-left: 20px;
      margin: 0;
    }

    .instructions-list li {
      padding: 15px 0;
      color: white;
      font-size: 1.1em;
      line-height: 1.6;
      border-bottom: 1px solid rgba(0, 0, 0, 0.1);
      word-wrap: break-word;
      overflow-wrap: break-word;
      hyphens: auto;
    }

    .instructions-list li:last-child {
      border-bottom: none;
    }

    /* Full Background Image */
    .recipe-full-background {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: -1;
    }

    .recipe-full-background::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.3);
      z-index: 1;
      pointer-events: none;
    }

    .recipe-full-background-image {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .recipe-full-background-placeholder {
      width: 100%;
      height: 100%;
      position: relative;
    }

    .placeholder-gradient {
      width: 100%;
      height: 100%;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }

    /* Mobile responsiveness */
    @media (max-width: 1024px) {
      .recipe-fullscreen-content {
        grid-template-columns: 1fr;
        gap: 25px;
        padding: 30px;
        max-width: 800px;
      }
    }

    @media (max-width: 768px) {
      .recipe-fullscreen-content {
        padding: 0 20px 20px;
        margin-top: 20px;
        gap: 20px;
        max-width: 600px;
      }
      
      .recipe-title-section {
        padding: 40px 20px 20px 20px;
      }
      
      .recipe-fullscreen-title {
        font-size: 1.8em;
        line-height: 1.2;
      }
      
      .recipe-timing-info {
        gap: 1.5rem;
        margin-top: 0.8rem;
        margin-bottom: 0.4rem;
      }
      
      .timing-item {
        padding: 0.4rem 0.8rem;
        font-size: 0.9em;
      }
      
      .timing-icon {
        font-size: 1em;
      }
      
      .timing-label {
        font-size: 0.85em;
      }
      
      .recipe-links {
        margin-top: 0.5rem;
      }
      
      .recipe-link {
        padding: 0.5rem 1rem;
        font-size: 0.85rem;
      }
    }

    @media (max-width: 480px) {
      .recipe-fullscreen-title {
        font-size: 1.5em;
      }
      
      .recipe-title-section {
        padding: 30px 15px 15px 15px;
      }
      
      .recipe-timing-info {
        gap: 1rem;
        margin-top: 0.6rem;
      }
      
      .timing-item {
        padding: 0.3rem 0.6rem;
        font-size: 0.8em;
      }
      
      .timing-icon {
        font-size: 0.9em;
      }
      
      .timing-label {
        font-size: 0.8em;
      }
      
      .recipe-fullscreen-content {
        padding: 0 15px 15px;
        margin-top: 15px;
        gap: 15px;
        max-width: 100%;
        width: 100%;
      }
      
      .recipe-panel {
        padding: 20px;
        margin: 0 auto;
        width: 100%;
        max-width: 500px;
      }
      
      .recipe-panel h2 {
        font-size: 1.3em;
        margin-bottom: 15px;
      }
      
      .ingredients-list li,
      .instructions-list li {
        font-size: 1em;
        padding: 10px 0;
      }
      
      .instructions-list {
        padding-left: 15px;
      }
    }

    /* Timer Button Styles */

    .timer-button-inline {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 4px 8px;
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.15);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
      cursor: pointer;
      transition: all 0.3s ease;
      vertical-align: middle;
      color: white;
      margin-left: 4px;
    }

    .timer-button-inline:hover {
      background: rgba(255, 255, 255, 0.25);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }

    .timer-button-inline:active {
      transform: translateY(0);
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
    }

    .timer-icon-inline {
      width: 16px;
      height: 16px;
      fill: white;
    }

    /* Active Timer Styles */
    .timer-active-container {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(255, 255, 255, 0.2);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-radius: 20px;
      padding: 6px 12px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
      animation: timer-pulse 2s ease-in-out infinite;
      margin-left: 8px;
    }

    @keyframes timer-pulse {
      0%, 100% {
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
      }
      50% {
        box-shadow: 0 4px 20px rgba(255, 255, 255, 0.2), 0 0 20px rgba(255, 255, 255, 0.1);
      }
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
      color: white;
      font-variant-numeric: tabular-nums;
    }

    .timer-label {
      font-size: 0.75em;
      color: rgba(255, 255, 255, 0.8);
      white-space: nowrap;
    }

    .timer-control-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.3);
      cursor: pointer;
      transition: all 0.2s ease;
      padding: 0;
    }

    .timer-control-btn:hover {
      background: rgba(255, 255, 255, 0.3);
      transform: scale(1.1);
    }

    .timer-control-btn svg {
      width: 16px;
      height: 16px;
      fill: white;
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
      background: rgba(76, 175, 80, 0.3);
      border-color: rgba(76, 175, 80, 0.5);
      animation: timer-complete 0.5s ease;
    }

    @keyframes timer-complete {
      0% {
        transform: scale(1);
      }
      50% {
        transform: scale(1.1);
      }
      100% {
        transform: scale(1);
      }
    }

    .timer-complete .timer-time {
      color: #4CAF50;
      text-shadow: 0 0 10px rgba(76, 175, 80, 0.5);
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

    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
      .recipe-panel {
        background: rgba(0, 0, 0, 0.4);
        border: 1px solid rgba(255, 255, 255, 0.1);
      }
      
      .recipe-link {
        background: rgba(0, 0, 0, 0.3);
        border-color: rgba(255, 255, 255, 0.2);
      }
      
      .recipe-link:hover {
        background: rgba(0, 0, 0, 0.4);
        border-color: rgba(255, 255, 255, 0.3);
      }
    }
  `;
}