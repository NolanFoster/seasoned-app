import React, { useEffect, useState } from 'react';
import { parseTimeString } from './TimerUtils.jsx';

const TimerManager = ({ children }) => {
  // Timer state management
  const [activeTimers, setActiveTimers] = useState(new Map()); // Map of timer ID to timer state
  const [timerIntervals, setTimerIntervals] = useState(new Map()); // Map of timer ID to interval reference
  const [floatingTimer, setFloatingTimer] = useState(null); // Currently active floating timer

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      timerIntervals.forEach(interval => clearInterval(interval));
    };
  }, [timerIntervals]);

  const startNewTimer = (timerId, timeText) => {
    const totalSeconds = parseTimeString(timeText);
    if (totalSeconds <= 0) return;
    
    const newTimer = {
      id: timerId,
      timeText: timeText,
      totalSeconds: totalSeconds,
      remainingSeconds: totalSeconds,
      isRunning: true,
      startTime: Date.now()
    };
    
    setActiveTimers(prev => new Map(prev).set(timerId, newTimer));
    setFloatingTimer(newTimer); // Set as floating timer
    
    // Start the interval
    const interval = setInterval(() => {
      setActiveTimers(prev => {
        const currentTimer = prev.get(timerId);
        if (!currentTimer) return prev;
        
        const elapsed = Math.floor((Date.now() - currentTimer.startTime) / 1000);
        const remaining = Math.max(0, currentTimer.totalSeconds - elapsed);
        
        if (remaining <= 0) {
          // Timer finished
          clearInterval(interval);
          setTimerIntervals(prev => {
            const newIntervals = new Map(prev);
            newIntervals.delete(timerId);
            return newIntervals;
          });
          
          // Show notification
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Timer Finished!', {
              body: `Your timer for ${timeText} is complete!`,
              icon: '/timer.svg'
            });
          }
          
          // Remove timer after a delay
          setTimeout(() => {
            setActiveTimers(prev => {
              const newTimers = new Map(prev);
              newTimers.delete(timerId);
              return newTimers;
            });
            setFloatingTimer(null); // Clear floating timer
          }, 3000);
          
          return prev;
        }
        
        const updatedTimer = { ...currentTimer, remainingSeconds: remaining };
        const newTimers = new Map(prev);
        newTimers.set(timerId, updatedTimer);
        
        // Update floating timer if this is the active one
        setFloatingTimer(prevFloating => {
          if (prevFloating && prevFloating.id === timerId) {
            return updatedTimer;
          }
          return prevFloating;
        });
        
        return newTimers;
      });
    }, 1000);
    
    setTimerIntervals(prev => new Map(prev).set(timerId, interval));
  };

  const startTimer = (timerId) => {
    // Clear any existing interval first
    const existingInterval = timerIntervals.get(timerId);
    if (existingInterval) {
      clearInterval(existingInterval);
      setTimerIntervals(prev => {
        const newIntervals = new Map(prev);
        newIntervals.delete(timerId);
        return newIntervals;
      });
    }
    
    setActiveTimers(prev => {
      const currentTimer = prev.get(timerId);
      if (!currentTimer) return prev;
      
      const updatedTimer = { 
        ...currentTimer, 
        isRunning: true,
        startTime: Date.now() - ((currentTimer.totalSeconds - currentTimer.remainingSeconds) * 1000)
      };
      
      const newTimers = new Map(prev);
      newTimers.set(timerId, updatedTimer);
      
      // Update floating timer if this is the active one
      if (floatingTimer && floatingTimer.id === timerId) {
        setFloatingTimer(updatedTimer);
      }
      
      return newTimers;
    });
    
    // Start the interval
    const interval = setInterval(() => {
      setActiveTimers(prev => {
        const currentTimer = prev.get(timerId);
        if (!currentTimer || !currentTimer.isRunning) return prev;
        
        const elapsed = Math.floor((Date.now() - currentTimer.startTime) / 1000);
        const remaining = Math.max(0, currentTimer.totalSeconds - elapsed);
        
        if (remaining <= 0) {
          // Timer finished
          clearInterval(interval);
          setTimerIntervals(prev => {
            const newIntervals = new Map(prev);
            newIntervals.delete(timerId);
            return newIntervals;
          });
          
          // Show notification
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Timer Finished!', {
              body: `Your timer for ${currentTimer.timeText} is complete!`,
              icon: '/timer.svg'
            });
          }
          
          // Remove timer after a delay
          setTimeout(() => {
            setActiveTimers(prev => {
              const newTimers = new Map(prev);
              newTimers.delete(timerId);
              return newTimers;
            });
          }, 3000);
          
          return prev;
        }
        
        const updatedTimer = { ...currentTimer, remainingSeconds: remaining };
        const newTimers = new Map(prev);
        newTimers.set(timerId, updatedTimer);
        
        // Update floating timer if this is the active one
        setFloatingTimer(prevFloating => {
          if (prevFloating && prevFloating.id === timerId) {
            return updatedTimer;
          }
          return prevFloating;
        });
        
        return newTimers;
      });
    }, 1000);
    
    setTimerIntervals(prev => new Map(prev).set(timerId, interval));
  };

  const pauseTimer = (timerId) => {
    // Clear the interval
    const interval = timerIntervals.get(timerId);
    if (interval) {
      clearInterval(interval);
      setTimerIntervals(prev => {
        const newIntervals = new Map(prev);
        newIntervals.delete(timerId);
        return newIntervals;
      });
    }
    
    setActiveTimers(prev => {
      const currentTimer = prev.get(timerId);
      if (!currentTimer) return prev;
      
      const updatedTimer = { ...currentTimer, isRunning: false };
      const newTimers = new Map(prev);
      newTimers.set(timerId, updatedTimer);
      
      // Update floating timer if this is the active one
      setFloatingTimer(prevFloating => {
        if (prevFloating && prevFloating.id === timerId) {
          return updatedTimer;
        }
        return prevFloating;
      });
      
      return newTimers;
    });
  };

  const stopTimer = (timerId) => {
    // Clear interval
    const interval = timerIntervals.get(timerId);
    if (interval) {
      clearInterval(interval);
      setTimerIntervals(prev => {
        const newIntervals = new Map(prev);
        newIntervals.delete(timerId);
        return newIntervals;
      });
    }
    
    // Remove timer
    setActiveTimers(prev => {
      const newTimers = new Map(prev);
      newTimers.delete(timerId);
      return newTimers;
    });
    
    // Clear floating timer if this was the active one
    if (floatingTimer && floatingTimer.id === timerId) {
      setFloatingTimer(null);
    }
  };

  // Request notification permission for timer notifications
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const timerContext = {
    activeTimers,
    floatingTimer,
    startNewTimer,
    startTimer,
    pauseTimer,
    stopTimer
  };

  return children(timerContext);
};

export default TimerManager;
