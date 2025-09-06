import React, { useEffect, useState } from 'react';
import { parseTimeString } from './TimerUtils.jsx';

const TimerManager = ({ 
  activeTimers: externalActiveTimers,
  onCreateTimer,
  onStartTimer,
  onPauseTimer,
  onResumeTimer,
  onStopTimer,
  onResetTimer,
  onDeleteTimer
}) => {
  // Use external state if provided, otherwise manage internal state
  const [internalActiveTimers, setInternalActiveTimers] = useState(new Map());
  const [timerIntervals, setTimerIntervals] = useState(new Map()); // Map of timer ID to interval reference
  const [floatingTimer, setFloatingTimer] = useState(null); // Currently active floating timer
  
  // Use external timers if provided, otherwise use internal
  const activeTimers = externalActiveTimers || internalActiveTimers;
  const setActiveTimers = externalActiveTimers ? () => {} : setInternalActiveTimers;

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
    if (onStartTimer) {
      onStartTimer(timerId);
      return;
    }
    
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
    if (onPauseTimer) {
      onPauseTimer(timerId);
      return;
    }
    
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
    if (onStopTimer) {
      onStopTimer(timerId);
      return;
    }
    
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

  // Render the timer UI directly
  return (
    <div className="timer-manager">
      {/* Timer controls and display would go here */}
      <div className="active-timers">
        {Array.from(activeTimers.values()).map(timer => (
          <div key={timer.id} className="timer-item">
            <span>{timer.name || timer.timeText}</span>
            <span>{Math.floor(timer.remainingSeconds / 60)}:{(timer.remainingSeconds % 60).toString().padStart(2, '0')}</span>
            <button onClick={() => startTimer(timer.id)}>Start</button>
            <button onClick={() => pauseTimer(timer.id)}>Pause</button>
            <button onClick={() => stopTimer(timer.id)}>Stop</button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TimerManager;
