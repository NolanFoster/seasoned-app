import React from 'react';

const Timer = ({
  floatingTimer,
  onStartTimer,
  onPauseTimer,
  onStopTimer
}) => {
  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
  };

  if (!floatingTimer) return null;

  return (
    <div className="header-timer-fab">
      <div className="header-timer-display">
        <span className="header-timer-time">{formatTime(floatingTimer.remainingSeconds)}</span>
        <span className="header-timer-label">{floatingTimer.timeText}</span>
      </div>
      <div className="header-timer-controls">
        <button 
          className="header-timer-control-btn"
          onClick={() => {
            if (floatingTimer.isRunning) {
              onPauseTimer(floatingTimer.id);
            } else {
              onStartTimer(floatingTimer.id);
            }
          }}
          title={floatingTimer.isRunning ? "Pause timer" : "Start timer"}
        >
          {floatingTimer.isRunning ? (
            <img src="/pause.svg" alt="Pause" className="timer-icon" />
          ) : (
            <img src="/play.svg" alt="Play" className="timer-icon" />
          )}
        </button>
        <button 
          className="header-timer-dismiss"
          onClick={() => onStopTimer(floatingTimer.id)}
          title="Stop timer"
        >
          ✕
        </button>
      </div>
    </div>
  );
};

export default Timer;
