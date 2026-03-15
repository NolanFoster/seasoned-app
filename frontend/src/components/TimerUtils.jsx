import React from 'react';

// Timer utility functions
export const parseTimeString = (timeString) => {
  // Handle ranges like "5-10 minutes" by using the lower value
  const rangeMatch = timeString.match(/(\d+)\s*[-–—]\s*(\d+)/);
  if (rangeMatch) {
    const min = parseInt(rangeMatch[1]);
    const max = parseInt(rangeMatch[2]);
    timeString = timeString.replace(/\d+\s*[-–—]\s*\d+/, min.toString());
  }
  
  // Handle "X to Y" format
  const toMatch = timeString.match(/(\d+)\s+to\s+(\d+)/);
  if (toMatch) {
    const min = parseInt(toMatch[1]);
    const max = parseInt(toMatch[2]);
    timeString = timeString.replace(/\d+\s+to\s+\d+/, min.toString());
  }
  
  // Extract number and unit
  const match = timeString.match(/(\d+)\s*(minutes?|mins?|hours?|hrs?|seconds?|secs?)/i);
  if (!match) return 0;
  
  const number = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  
  // Convert to seconds
  if (unit.includes('hour') || unit.includes('hr')) {
    return number * 60 * 60;
  } else if (unit.includes('minute') || unit.includes('min')) {
    return number * 60;
  } else if (unit.includes('second') || unit.includes('sec')) {
    return number;
  }
  
  return 0;
};

export const formatTime = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }
};

// Function to parse time mentions in text and render with timer buttons at the end
export const renderInstructionWithTimers = (text, activeTimers, onStartNewTimer) => {
  // Regex to match various time formats:
  // - X minute(s), X min(s), X hour(s), X hr(s), X second(s), X sec(s)
  // - X-Y minutes, X to Y minutes, etc.
  const timeRegex = /(\d+(?:\s*[-–—]\s*\d+|\s+to\s+\d+)?)\s*(minutes?|mins?|hours?|hrs?|seconds?|secs?)\b/gi;
  
  const timers = [];
  let match;
  
  // Find all time mentions
  while ((match = timeRegex.exec(text)) !== null) {
    const timeText = match[0];
    timers.push({
      text: timeText,
      index: match.index
    });
  }
  
  // If no timers found, return the original text
  if (timers.length === 0) {
    return text;
  }
  
  // Return the full text followed by timer buttons
  return (
    <div className="instruction-with-timers">
      <div className="instruction-text">{text}</div>
      <div className="timer-buttons-container">
        {timers.map((timer, index) => {
          const timerId = `timer-${timer.index}-${index}`;
          const activeTimer = activeTimers.get(timerId);
          
          // Show disabled button when timer is active
          return (
            <button 
              key={timerId}
              className={`timer-button-inline ${activeTimer ? 'timer-button-disabled' : ''}`}
              title={activeTimer ? `Timer active: ${activeTimer.timeText}` : `Set timer for ${timer.text}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!activeTimer) {
                  onStartNewTimer(timerId, timer.text);
                }
              }}
              disabled={activeTimer}
            >
              <img 
                src="/timer.svg" 
                alt="Timer" 
                className="timer-icon-inline"
              />
              <span className="timer-text">
                {activeTimer ? `Timer: ${formatTime(activeTimer.remainingSeconds)}` : `Set timer for ${timer.text}`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default {
  parseTimeString,
  formatTime,
  renderInstructionWithTimers
};
