/**
 * Utility functions for the recipe app
 */

/**
 * Convert ISO 8601 duration to human readable format
 * @param {string} duration - ISO 8601 duration string (e.g., "PT1H30M")
 * @returns {string} Human readable duration (e.g., "1 h 30 m")
 */
export function formatDuration(duration) {
  if (!duration) return '';
  
  // Attempt to coerce non-string durations to string safely
  if (typeof duration !== 'string') {
    try {
      const coerced = duration.toString();
      if (typeof coerced !== 'string') return '';
      duration = coerced;
    } catch (error) {
      return '';
    }
  }
  
  // If it's already in a readable format (doesn't start with PT), return as is
  if (!duration.startsWith('PT')) return duration;
  
  try {
    // Remove the PT prefix
    let remaining = duration.substring(2);
    
    let hours = 0;
    let minutes = 0;
    
    // Extract hours if present
    const hourMatch = remaining.match(/(\d+)H/);
    if (hourMatch) {
      hours = parseInt(hourMatch[1], 10);
      remaining = remaining.replace(hourMatch[0], '');
    }
    
    // Extract minutes if present
    const minuteMatch = remaining.match(/(\d+)M/);
    if (minuteMatch) {
      minutes = parseInt(minuteMatch[1], 10);
    }
    
    // Format the output
    let result = '';
    if (hours > 0) {
      result += `${hours} h`;
      if (minutes > 0) {
        result += ` ${minutes} m`;
      }
    } else if (minutes > 0) {
      result += `${minutes} m`;
    } else {
      // If no hours or minutes found, return empty for fallback
      return duration;
    }
    
    return result;
  } catch (error) {
    console.error('Error parsing duration:', error);
    return duration;
  }
}

/**
 * Check if a string is a valid URL
 * @param {string} string - String to validate as URL
 * @returns {boolean} True if valid URL, false otherwise
 */
export function isValidUrl(string) {
  try {
    // Check if it starts with http://, https://, or www.
    if (string.match(/^(https?:\/\/)/i)) {
      new URL(string);
      return true;
    }
    
    if (string.match(/^www\./i)) {
      new URL(`https://${string}`);
      return true;
    }
    
    // Check if it looks like a domain with TLD
    // Must have at least one dot and a valid TLD (2+ chars)
    // Must not contain spaces
    if (!string.includes(' ') && string.match(/^[a-zA-Z0-9][a-zA-Z0-9-]*(\.[a-zA-Z0-9][a-zA-Z0-9-]*)*\.[a-zA-Z]{2,}$/)) {
      // Additional check: the part before the last dot should have at least 2 characters
      const parts = string.split('.');
      if (parts.length >= 2 && parts[parts.length - 2].length >= 2) {
        new URL(`https://${string}`);
        return true;
      }
    }
    
    return false;
  } catch (e) {
    return false;
  }
}
