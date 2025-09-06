import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useTimersStore } from '../stores/useTimersStore';
import { TIMER_STATUS } from '../types';

describe('useTimersStore Hook', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should initialize with empty timers', () => {
    const { result } = renderHook(() => useTimersStore());
    
    expect(result.current.activeTimers).toEqual([]);
  });

  it('should create a timer', () => {
    const { result } = renderHook(() => useTimersStore());
    
    const timerData = {
      name: 'Test Timer',
      duration: 60
    };
    
    let timerId;
    act(() => {
      timerId = result.current.createTimer(timerData);
    });
    
    expect(timerId).toBeDefined();
    expect(result.current.activeTimers).toHaveLength(1);
    expect(result.current.activeTimers[0].name).toBe('Test Timer');
    expect(result.current.activeTimers[0].duration).toBe(60);
    expect(result.current.activeTimers[0].status).toBe(TIMER_STATUS.IDLE);
  });

  it('should start a timer', () => {
    const { result } = renderHook(() => useTimersStore());
    
    let timerId;
    act(() => {
      timerId = result.current.createTimer({ name: 'Test Timer', duration: 60 });
    });
    
    act(() => {
      result.current.startTimer(timerId);
    });
    
    const timer = result.current.getTimer(timerId);
    expect(timer.status).toBe(TIMER_STATUS.RUNNING);
    expect(timer.startedAt).toBeDefined();
  });

  it('should pause a timer', () => {
    const { result } = renderHook(() => useTimersStore());
    
    let timerId;
    act(() => {
      timerId = result.current.createTimer({ name: 'Test Timer', duration: 60 });
      result.current.startTimer(timerId);
    });
    
    act(() => {
      result.current.pauseTimer(timerId);
    });
    
    const timer = result.current.getTimer(timerId);
    expect(timer.status).toBe(TIMER_STATUS.PAUSED);
    expect(timer.pausedAt).toBeDefined();
  });

  it('should resume a timer', () => {
    const { result } = renderHook(() => useTimersStore());
    
    let timerId;
    act(() => {
      timerId = result.current.createTimer({ name: 'Test Timer', duration: 60 });
      result.current.startTimer(timerId);
      result.current.pauseTimer(timerId);
    });
    
    act(() => {
      result.current.resumeTimer(timerId);
    });
    
    const timer = result.current.getTimer(timerId);
    expect(timer.status).toBe(TIMER_STATUS.RUNNING);
    expect(timer.pausedAt).toBe(null);
  });

  it('should stop a timer', () => {
    const { result } = renderHook(() => useTimersStore());
    
    let timerId;
    act(() => {
      timerId = result.current.createTimer({ name: 'Test Timer', duration: 60 });
      result.current.startTimer(timerId);
    });
    
    act(() => {
      result.current.stopTimer(timerId);
    });
    
    const timer = result.current.getTimer(timerId);
    expect(timer.status).toBe(TIMER_STATUS.STOPPED);
    expect(timer.remaining).toBe(60);
  });

  it('should reset a timer', () => {
    const { result } = renderHook(() => useTimersStore());
    
    let timerId;
    act(() => {
      timerId = result.current.createTimer({ name: 'Test Timer', duration: 60 });
      result.current.startTimer(timerId);
    });
    
    act(() => {
      result.current.resetTimer(timerId);
    });
    
    const timer = result.current.getTimer(timerId);
    expect(timer.status).toBe(TIMER_STATUS.IDLE);
    expect(timer.remaining).toBe(60);
    expect(timer.startedAt).toBe(null);
    expect(timer.pausedAt).toBe(null);
  });

  it('should delete a timer', () => {
    const { result } = renderHook(() => useTimersStore());
    
    let timerId;
    act(() => {
      timerId = result.current.createTimer({ name: 'Test Timer', duration: 60 });
    });
    
    expect(result.current.activeTimers).toHaveLength(1);
    
    act(() => {
      result.current.deleteTimer(timerId);
    });
    
    expect(result.current.activeTimers).toHaveLength(0);
    expect(result.current.getTimer(timerId)).toBeUndefined();
  });

  it('should update timer properties', () => {
    const { result } = renderHook(() => useTimersStore());
    
    let timerId;
    act(() => {
      timerId = result.current.createTimer({ name: 'Test Timer', duration: 60 });
    });
    
    act(() => {
      result.current.updateTimer(timerId, { name: 'Updated Timer', duration: 120 });
    });
    
    const timer = result.current.getTimer(timerId);
    expect(timer.name).toBe('Updated Timer');
    expect(timer.duration).toBe(120);
    expect(timer.remaining).toBe(120);
  });

  it('should get running timers', () => {
    const { result } = renderHook(() => useTimersStore());
    
    let timerId1, timerId2;
    act(() => {
      timerId1 = result.current.createTimer({ name: 'Timer 1', duration: 60 });
      timerId2 = result.current.createTimer({ name: 'Timer 2', duration: 120 });
      result.current.startTimer(timerId1);
    });
    
    const runningTimers = result.current.getRunningTimers();
    expect(runningTimers).toHaveLength(1);
    expect(runningTimers[0].name).toBe('Timer 1');
  });

  it('should clear all timers', () => {
    const { result } = renderHook(() => useTimersStore());
    
    act(() => {
      result.current.createTimer({ name: 'Timer 1', duration: 60 });
      result.current.createTimer({ name: 'Timer 2', duration: 120 });
    });
    
    expect(result.current.activeTimers).toHaveLength(2);
    
    act(() => {
      result.current.clearAllTimers();
    });
    
    expect(result.current.activeTimers).toHaveLength(0);
  });
});
