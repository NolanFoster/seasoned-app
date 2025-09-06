// Shared utility functions

/**
 * Format duration in seconds to human readable format
 */
export const formatDuration = (seconds) => {
  if (!seconds || seconds === 0) return '0 min';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  
  let result = '';
  
  if (hours > 0) {
    result += `${hours}h `;
  }
  
  if (minutes > 0) {
    result += `${minutes}m `;
  }
  
  if (remainingSeconds > 0 && hours === 0) {
    result += `${remainingSeconds}s`;
  }
  
  return result.trim() || '0 min';
};

/**
 * Check if a string is a valid URL
 */
export const isValidUrl = (string) => {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
};

/**
 * Format ingredient amount for display
 */
export const formatIngredientAmount = (ingredient) => {
  if (typeof ingredient === 'string') return ingredient;
  if (ingredient && ingredient.text) return ingredient.text;
  if (ingredient && ingredient.name) return ingredient.name;
  return ingredient;
};

/**
 * Debounce function
 */
export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

/**
 * Throttle function
 */
export const throttle = (func, limit) => {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

/**
 * Generate a unique ID
 */
export const generateId = () => {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Deep clone an object
 */
export const deepClone = (obj) => {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (obj instanceof Array) return obj.map(item => deepClone(item));
  if (typeof obj === 'object') {
    const clonedObj = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        clonedObj[key] = deepClone(obj[key]);
      }
    }
    return clonedObj;
  }
};

/**
 * Check if two objects are equal (shallow comparison)
 */
export const isEqual = (obj1, obj2) => {
  if (obj1 === obj2) return true;
  if (obj1 == null || obj2 == null) return false;
  if (typeof obj1 !== typeof obj2) return false;
  
  if (typeof obj1 === 'object') {
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);
    
    if (keys1.length !== keys2.length) return false;
    
    for (const key of keys1) {
      if (!keys2.includes(key)) return false;
      if (obj1[key] !== obj2[key]) return false;
    }
    
    return true;
  }
  
  return obj1 === obj2;
};

/**
 * Capitalize first letter of a string
 */
export const capitalize = (str) => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
};

/**
 * Convert string to kebab-case
 */
export const kebabCase = (str) => {
  if (!str) return '';
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
};

/**
 * Convert string to camelCase
 */
export const camelCase = (str) => {
  if (!str) return '';
  return str
    .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => {
      return index === 0 ? word.toLowerCase() : word.toUpperCase();
    })
    .replace(/\s+/g, '');
};

/**
 * Parse time string to seconds
 */
export const parseTimeToSeconds = (timeString) => {
  if (!timeString) return 0;
  
  const time = timeString.toLowerCase().trim();
  const number = parseInt(time.match(/\d+/)?.[0] || '0');
  
  if (time.includes('hour')) {
    return number * 3600;
  }
  
  return number * 60;
};

/**
 * Format time in seconds to readable format
 */
export const formatTime = (seconds) => {
  if (!seconds || seconds === 0) return '0 min';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  
  return `${minutes}m`;
};
