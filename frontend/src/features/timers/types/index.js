// Timer-related types and interfaces

export const TIMER_STATUS = {
  IDLE: 'idle',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  STOPPED: 'stopped'
};

export const TIMER_TYPES = {
  COUNTDOWN: 'countdown',
  STOPWATCH: 'stopwatch'
};

// Default timer state
export const DEFAULT_TIMER_STATE = {
  id: null,
  name: '',
  duration: 0, // in seconds
  remaining: 0, // in seconds
  status: TIMER_STATUS.IDLE,
  type: TIMER_TYPES.COUNTDOWN,
  createdAt: null,
  startedAt: null,
  pausedAt: null,
  completedAt: null
};

// Timer validation
export const TIMER_VALIDATION = {
  name: {
    maxLength: 50
  },
  duration: {
    min: 1,
    max: 86400 // 24 hours in seconds
  }
};
