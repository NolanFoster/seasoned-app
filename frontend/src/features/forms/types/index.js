// Form-related types and interfaces

export const FORM_STATUS = {
  IDLE: 'idle',
  SUBMITTING: 'submitting',
  SUCCESS: 'success',
  ERROR: 'error'
};

export const FORM_TYPES = {
  RECIPE: 'recipe',
  CLIP_RECIPE: 'clip_recipe',
  SEARCH: 'search',
  TIMER: 'timer'
};

export const VALIDATION_TYPES = {
  REQUIRED: 'required',
  EMAIL: 'email',
  URL: 'url',
  MIN_LENGTH: 'min_length',
  MAX_LENGTH: 'max_length',
  PATTERN: 'pattern',
  CUSTOM: 'custom'
};

// Default form state
export const DEFAULT_FORM_STATE = {
  values: {},
  errors: {},
  touched: {},
  status: FORM_STATUS.IDLE,
  isSubmitting: false,
  isValid: false,
  isDirty: false
};

// Form validation rules
export const FORM_VALIDATION_RULES = {
  required: (value) => {
    if (typeof value === 'string') {
      return value.trim().length > 0;
    }
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    return value !== null && value !== undefined;
  },
  
  email: (value) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  },
  
  url: (value) => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  },
  
  minLength: (value, min) => {
    if (typeof value === 'string') {
      return value.length >= min;
    }
    if (Array.isArray(value)) {
      return value.length >= min;
    }
    return false;
  },
  
  maxLength: (value, max) => {
    if (typeof value === 'string') {
      return value.length <= max;
    }
    if (Array.isArray(value)) {
      return value.length <= max;
    }
    return false;
  },
  
  pattern: (value, regex) => {
    if (typeof value === 'string') {
      return regex.test(value);
    }
    return false;
  }
};
