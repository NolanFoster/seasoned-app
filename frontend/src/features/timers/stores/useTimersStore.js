import { useState, useCallback, useRef } from 'react';
import { TIMER_STATUS, DEFAULT_TIMER_STATE } from '../types/index.js';

/**
 * Custom hook for timer state management
 */
export const useTimersStore = () => {
  const [activeTimers, setActiveTimers] = useState(new Map());
  const [timerIntervals, setTimerIntervals] = useState(new Map());
  const intervalsRef = useRef(new Map());

  // Actions
  const actions = {
    // Create a new timer
    createTimer: useCallback((timerData) => {
      const timerId = `timer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const newTimer = {
        ...DEFAULT_TIMER_STATE,
        ...timerData,
        id: timerId,
        createdAt: new Date().toISOString()
      };

      setActiveTimers(prev => new Map(prev).set(timerId, newTimer));
      return timerId;
    }, []),

    // Start a timer
    startTimer: useCallback((timerId) => {
      setActiveTimers(prev => {
        const newTimers = new Map(prev);
        const timer = newTimers.get(timerId);
        
        if (!timer || timer.status === TIMER_STATUS.RUNNING) {
          return prev;
        }

        const now = Date.now();
        const updatedTimer = {
          ...timer,
          status: TIMER_STATUS.RUNNING,
          startedAt: timer.startedAt || now,
          pausedAt: null
        };

        newTimers.set(timerId, updatedTimer);

        // Set up interval
        const interval = setInterval(() => {
          setActiveTimers(currentTimers => {
            const currentTimer = currentTimers.get(timerId);
            if (!currentTimer || currentTimer.status !== TIMER_STATUS.RUNNING) {
              return currentTimers;
            }

            const elapsed = Math.floor((now - (currentTimer.startedAt || now)) / 1000);
            const remaining = Math.max(0, currentTimer.duration - elapsed);

            if (remaining <= 0) {
              // Timer completed
              const completedTimer = {
                ...currentTimer,
                status: TIMER_STATUS.COMPLETED,
                remaining: 0,
                completedAt: now
              };
              
              // Clear interval
              const currentInterval = intervalsRef.current.get(timerId);
              if (currentInterval) {
                clearInterval(currentInterval);
                intervalsRef.current.delete(timerId);
              }

              return new Map(currentTimers).set(timerId, completedTimer);
            }

            return new Map(currentTimers).set(timerId, {
              ...currentTimer,
              remaining
            });
          });
        }, 1000);

        intervalsRef.current.set(timerId, interval);
        return newTimers;
      });
    }, []),

    // Pause a timer
    pauseTimer: useCallback((timerId) => {
      setActiveTimers(prev => {
        const newTimers = new Map(prev);
        const timer = newTimers.get(timerId);
        
        if (!timer || timer.status !== TIMER_STATUS.RUNNING) {
          return prev;
        }

        // Clear interval
        const interval = intervalsRef.current.get(timerId);
        if (interval) {
          clearInterval(interval);
          intervalsRef.current.delete(timerId);
        }

        const updatedTimer = {
          ...timer,
          status: TIMER_STATUS.PAUSED,
          pausedAt: Date.now()
        };

        return newTimers.set(timerId, updatedTimer);
      });
    }, []),

    // Resume a timer
    resumeTimer: useCallback((timerId) => {
      setActiveTimers(prev => {
        const newTimers = new Map(prev);
        const timer = newTimers.get(timerId);
        
        if (!timer || timer.status !== TIMER_STATUS.PAUSED) {
          return prev;
        }

        const now = Date.now();
        const pausedDuration = timer.pausedAt ? (now - timer.pausedAt) / 1000 : 0;
        const adjustedStartedAt = (timer.startedAt || now) + pausedDuration;

        const updatedTimer = {
          ...timer,
          status: TIMER_STATUS.RUNNING,
          startedAt: adjustedStartedAt,
          pausedAt: null
        };

        newTimers.set(timerId, updatedTimer);

        // Set up new interval
        const interval = setInterval(() => {
          setActiveTimers(currentTimers => {
            const currentTimer = currentTimers.get(timerId);
            if (!currentTimer || currentTimer.status !== TIMER_STATUS.RUNNING) {
              return currentTimers;
            }

            const elapsed = Math.floor((Date.now() - adjustedStartedAt) / 1000);
            const remaining = Math.max(0, currentTimer.duration - elapsed);

            if (remaining <= 0) {
              // Timer completed
              const completedTimer = {
                ...currentTimer,
                status: TIMER_STATUS.COMPLETED,
                remaining: 0,
                completedAt: Date.now()
              };
              
              // Clear interval
              const currentInterval = intervalsRef.current.get(timerId);
              if (currentInterval) {
                clearInterval(currentInterval);
                intervalsRef.current.delete(timerId);
              }

              return new Map(currentTimers).set(timerId, completedTimer);
            }

            return new Map(currentTimers).set(timerId, {
              ...currentTimer,
              remaining
            });
          });
        }, 1000);

        intervalsRef.current.set(timerId, interval);
        return newTimers;
      });
    }, []),

    // Stop a timer
    stopTimer: useCallback((timerId) => {
      setActiveTimers(prev => {
        const newTimers = new Map(prev);
        const timer = newTimers.get(timerId);
        
        if (!timer) {
          return prev;
        }

        // Clear interval
        const interval = intervalsRef.current.get(timerId);
        if (interval) {
          clearInterval(interval);
          intervalsRef.current.delete(timerId);
        }

        const updatedTimer = {
          ...timer,
          status: TIMER_STATUS.STOPPED,
          remaining: timer.duration
        };

        return newTimers.set(timerId, updatedTimer);
      });
    }, []),

    // Reset a timer
    resetTimer: useCallback((timerId) => {
      setActiveTimers(prev => {
        const newTimers = new Map(prev);
        const timer = newTimers.get(timerId);
        
        if (!timer) {
          return prev;
        }

        // Clear interval
        const interval = intervalsRef.current.get(timerId);
        if (interval) {
          clearInterval(interval);
          intervalsRef.current.delete(timerId);
        }

        const updatedTimer = {
          ...timer,
          status: TIMER_STATUS.IDLE,
          remaining: timer.duration,
          startedAt: null,
          pausedAt: null,
          completedAt: null
        };

        return newTimers.set(timerId, updatedTimer);
      });
    }, []),

    // Update timer properties
    updateTimer: useCallback((timerId, updates) => {
      setActiveTimers(prev => {
        const newTimers = new Map(prev);
        const timer = newTimers.get(timerId);
        
        if (!timer) {
          return prev;
        }

        const updatedTimer = {
          ...timer,
          ...updates,
          remaining: updates.duration !== undefined ? updates.duration : timer.remaining
        };

        return newTimers.set(timerId, updatedTimer);
      });
    }, []),

    // Delete a timer
    deleteTimer: useCallback((timerId) => {
      // Clear interval
      const interval = intervalsRef.current.get(timerId);
      if (interval) {
        clearInterval(interval);
        intervalsRef.current.delete(timerId);
      }

      setActiveTimers(prev => {
        const newTimers = new Map(prev);
        newTimers.delete(timerId);
        return newTimers;
      });
    }, []),

    // Get timer by ID
    getTimer: useCallback((timerId) => {
      return activeTimers.get(timerId);
    }, [activeTimers]),

    // Get all timers
    getAllTimers: useCallback(() => {
      return Array.from(activeTimers.values());
    }, [activeTimers]),

    // Get running timers
    getRunningTimers: useCallback(() => {
      return Array.from(activeTimers.values()).filter(
        timer => timer.status === TIMER_STATUS.RUNNING
      );
    }, [activeTimers]),

    // Clear all timers
    clearAllTimers: useCallback(() => {
      // Clear all intervals
      intervalsRef.current.forEach(interval => clearInterval(interval));
      intervalsRef.current.clear();
      
      setActiveTimers(new Map());
    }, []),

    // Cleanup on unmount
    cleanup: useCallback(() => {
      intervalsRef.current.forEach(interval => clearInterval(interval));
      intervalsRef.current.clear();
    }, [])
  };

  return {
    activeTimers: Array.from(activeTimers.values()),
    ...actions
  };
};
