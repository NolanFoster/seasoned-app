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
 * Convert a decimal number to a fraction string
 * @param {number} decimal - Decimal number to convert
 * @returns {string} Fraction string (e.g., "1/3")
 */
export function decimalToFraction(decimal) {
  if (decimal === null || decimal === undefined || isNaN(decimal)) return '';
  
  // Handle zero explicitly
  if (decimal === 0) return '0';
  
  // Handle whole numbers
  const whole = Math.floor(decimal);
  const fractionalPart = decimal - whole;
  
  // If it's a whole number, return it as is
  if (fractionalPart < 0.01) {
    return whole.toString();
  }
  
  // Common fractions mapping for better accuracy
  const commonFractions = [
    { decimal: 0.125, fraction: '1/8' },
    { decimal: 0.2, fraction: '1/5' },
    { decimal: 0.25, fraction: '1/4' },
    { decimal: 0.333, fraction: '1/3' },
    { decimal: 0.375, fraction: '3/8' },
    { decimal: 0.4, fraction: '2/5' },
    { decimal: 0.5, fraction: '1/2' },
    { decimal: 0.6, fraction: '3/5' },
    { decimal: 0.625, fraction: '5/8' },
    { decimal: 0.666, fraction: '2/3' },
    { decimal: 0.75, fraction: '3/4' },
    { decimal: 0.8, fraction: '4/5' },
    { decimal: 0.875, fraction: '7/8' }
  ];
  
  // Check for common fractions (within tolerance)
  for (const { decimal: commonDec, fraction } of commonFractions) {
    if (Math.abs(fractionalPart - commonDec) < 0.01) {
      return whole > 0 ? `${whole} ${fraction}` : fraction;
    }
  }
  
  // Calculate fraction using continued fractions algorithm
  const tolerance = 0.01;
  let numerator = 1;
  let denominator = 1;
  let previousNumerator = 0;
  let previousDenominator = 1;
  let currentValue = fractionalPart;
  
  for (let i = 0; i < 10; i++) {
    if (currentValue === 0) break;
    
    const integerPart = Math.floor(currentValue);
    const temp = numerator;
    numerator = integerPart * numerator + previousNumerator;
    previousNumerator = temp;
    
    const temp2 = denominator;
    denominator = integerPart * denominator + previousDenominator;
    previousDenominator = temp2;
    
    if (Math.abs(fractionalPart - numerator / denominator) < tolerance) {
      break;
    }
    
    const remainder = currentValue - integerPart;
    if (remainder < 0.0001) break; // Avoid division by very small numbers
    
    currentValue = 1 / remainder;
  }
  
  // Format the result
  if (whole > 0) {
    return `${whole} ${numerator}/${denominator}`;
  } else {
    return `${numerator}/${denominator}`;
  }
}

/**
 * Format an ingredient string, converting decimals and unicode fractions to consistent ASCII fractions
 * @param {string} ingredient - Ingredient string that may contain decimal amounts or unicode fractions
 * @returns {string} Formatted ingredient string with consistent ASCII fractions
 */
export function formatIngredientAmount(ingredient) {
  if (!ingredient || typeof ingredient !== 'string') return '';
  
  // First, replace Unicode fractions with ASCII equivalents
  const unicodeFractionMap = {
    '½': '1/2',
    '⅓': '1/3',
    '⅔': '2/3',
    '¼': '1/4',
    '¾': '3/4',
    '⅕': '1/5',
    '⅖': '2/5',
    '⅗': '3/5',
    '⅘': '4/5',
    '⅙': '1/6',
    '⅚': '5/6',
    '⅐': '1/7',
    '⅛': '1/8',
    '⅜': '3/8',
    '⅝': '5/8',
    '⅞': '7/8',
    '⅑': '1/9',
    '⅒': '1/10'
  };
  
  // Replace Unicode fractions - handle both standalone and those adjacent to numbers
  let formattedIngredient = ingredient;
  
  // Handle mixed numbers with Unicode fractions first (e.g., "1⅓" should become "1 1/3")
  formattedIngredient = formattedIngredient.replace(/(\d+)([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅐⅛⅜⅝⅞⅑⅒])/g, (match, whole, unicode) => {
    const ascii = unicodeFractionMap[unicode] || unicode;
    return `${whole} ${ascii}`;
  });
  
  // Then replace standalone Unicode fractions
  for (const [unicode, ascii] of Object.entries(unicodeFractionMap)) {
    formattedIngredient = formattedIngredient.replace(new RegExp(unicode, 'g'), ascii);
  }
  
  // Then, convert decimal numbers to fractions
  const decimalPattern = /\b(\d+\.?\d*)\b/g;
  
  return formattedIngredient.replace(decimalPattern, (match) => {
    const decimal = parseFloat(match);
    if (isNaN(decimal)) return match;
    
    // Only convert if it looks like it should be a fraction
    // (has decimal places or is a common fraction value)
    if (decimal % 1 === 0) {
      return match; // Keep whole numbers as is
    }
    
    return decimalToFraction(decimal);
  });
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
