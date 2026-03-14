import React, { useState, useRef, useEffect } from 'react'
import CookingNavigator from './CookingNavigator.jsx'
import { useFlag } from './flaggly.js'
import RecipeCardDisplay, { parseDuration } from './RecipeCardDisplay.jsx'

export { parseDuration }

function parseDurationToMinutes(val) {
  if (!val) return 0
  if (typeof val === 'number') return val
  const str = String(val).trim().toUpperCase()
  if (!str.startsWith('PT') && !str.startsWith('P')) return 0
  let mins = 0
  const h = str.match(/(\d+)H/); if (h) mins += parseInt(h[1]) * 60
  const m = str.match(/(\d+)M/); if (m) mins += parseInt(m[1])
  return mins
}

export default function RecipeCard({ recipe, onClose, onElevate, isElevating, onSave, saveState, shareUrl }) {
  const elevateRecipeEnabled = useFlag('elevate-recipe')
  const [shareCopied, setShareCopied] = useState(false)
  const [isCooking, setIsCooking] = useState(false)
  const [wakeLockActive, setWakeLockActive] = useState(false)
  // null | 'remix' | 'options'
  const [openMenu, setOpenMenu] = useState(null)
  const wakeLockRef = useRef(null)
  const wakeLockTimerRef = useRef(null)
  const menusRef = useRef(null)

  const recipeDurationMins =
    parseDurationToMinutes(recipe.prep_time) + parseDurationToMinutes(recipe.cook_time)

  async function acquireWakeLock(autoOffMinutes = 0) {
    try {
      if (!('wakeLock' in navigator)) return
      wakeLockRef.current = await navigator.wakeLock.request('screen')
      setWakeLockActive(true)
      wakeLockRef.current.addEventListener('release', () => {
        setWakeLockActive(false)
        wakeLockRef.current = null
      })
      if (autoOffMinutes > 0) {
        clearTimeout(wakeLockTimerRef.current)
        wakeLockTimerRef.current = setTimeout(() => releaseWakeLock(), autoOffMinutes * 60 * 1000)
      }
    } catch {
      // Permission denied or API unavailable
    }
  }

  function releaseWakeLock() {
    clearTimeout(wakeLockTimerRef.current)
    wakeLockTimerRef.current = null
    if (wakeLockRef.current) {
      wakeLockRef.current.release()
      wakeLockRef.current = null
    }
    setWakeLockActive(false)
  }

  function handleWakeLockToggle() {
    if (wakeLockActive) {
      releaseWakeLock()
    } else {
      const autoOff = recipeDurationMins > 0 ? recipeDurationMins + 15 : 0
      acquireWakeLock(autoOff)
    }
  }

  // Release on unmount
  useEffect(() => () => releaseWakeLock(), [])

  // Re-acquire after tab switch
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && wakeLockActive && !wakeLockRef.current) {
        acquireWakeLock()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [wakeLockActive])

  // Close menus on outside click
  useEffect(() => {
    if (!openMenu) return
    function handleClick(e) {
      if (menusRef.current && !menusRef.current.contains(e.target)) {
        setOpenMenu(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [openMenu])

  return (
    <div className="recipe-card">
      <div className="card-menus" ref={menusRef}>
        {/* Remix menu */}
        {elevateRecipeEnabled && (
        <div className="action-menu">
          <button
            className="action-menu-btn"
            onClick={() => setOpenMenu(o => o === 'remix' ? null : 'remix')}
            title="Remix with AI"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 1l2.5 8.5L23 12l-8.5 2.5L12 23l-2.5-8.5L1 12l8.5-2.5z"/>
            </svg>
          </button>
          {openMenu === 'remix' && (
            <div className="action-menu-dropdown">
              <button
                className="action-menu-item elevate-item"
                onClick={() => { if (!isElevating) { onElevate(); setOpenMenu(null); } }}
                disabled={isElevating}
                title="Elevate this recipe with AI — improve instructions, suggest variations, add tips"
              >
                {isElevating ? (
                  <svg className="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 11-6.219-8.56"/>
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 3l14 9-14 9V3z"/>
                  </svg>
                )}
                {isElevating ? 'Elevating…' : 'Elevate'}
              </button>
            </div>
          )}
        </div>
        )}

        {/* More options menu */}
        <div className="action-menu">
          <button
            className="action-menu-btn"
            onClick={() => setOpenMenu(o => o === 'options' ? null : 'options')}
            title="More options"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
            </svg>
          </button>
          {openMenu === 'options' && (
            <div className="action-menu-dropdown">
              <button
                className="action-menu-item"
                onClick={() => { setOpenMenu(null); onClose(); }}
                title="Close"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
                Close
              </button>
              <button
                className={`action-menu-item${saveState === 'saved' ? ' saved' : saveState === 'error' ? ' error' : ''}`}
                onClick={() => { if (saveState !== 'saving' && saveState !== 'saved') { onSave(); setOpenMenu(null); } }}
                disabled={saveState === 'saving' || saveState === 'saved'}
                title={saveState === 'saved' ? 'Recipe saved' : 'Save recipe'}
              >
                {saveState === 'saving' ? (
                  <svg className="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 11-6.219-8.56"/>
                  </svg>
                ) : saveState === 'saved' ? (
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M5 3a2 2 0 00-2 2v16l9-4 9 4V5a2 2 0 00-2-2H5z"/>
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 21l-7-3-7 3V5a2 2 0 012-2h10a2 2 0 012 2v16z"/>
                  </svg>
                )}
                {saveState === 'saved' ? 'Saved' : saveState === 'saving' ? 'Saving…' : 'Save'}
              </button>
              {shareUrl && (
                <button
                  className={`action-menu-item${shareCopied ? ' copied' : ''}`}
                  onClick={() => {
                    const copyToClipboard = () => {
                      navigator.clipboard.writeText(shareUrl).then(() => {
                        setShareCopied(true)
                        setTimeout(() => setShareCopied(false), 2000)
                      })
                    }
                    if (navigator.share) {
                      navigator.share({ title: recipe.name, url: shareUrl }).catch(copyToClipboard)
                    } else {
                      copyToClipboard()
                    }
                  }}
                  title={shareCopied ? 'Copied!' : 'Share recipe'}
                >
                  {shareCopied ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M20 6L9 17l-5-5"/>
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"/>
                    </svg>
                  )}
                  {shareCopied ? 'Copied!' : 'Share'}
                </button>
              )}
              {'wakeLock' in navigator && (
                <button
                  className={`action-menu-item${wakeLockActive ? ' active' : ''}`}
                  onClick={handleWakeLockToggle}
                  title={wakeLockActive ? 'Screen is staying on – tap to disable' : 'Keep screen on while cooking'}
                >
                  <span className="wake-lock-icon">{wakeLockActive ? '☀️' : '🌙'}</span>
                  {wakeLockActive ? (
                    <>
                      Screen on
                      {recipeDurationMins > 0 && <span className="wake-lock-label">{recipeDurationMins + 15}m</span>}
                    </>
                  ) : 'Keep awake'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <RecipeCardDisplay recipe={recipe} onCookClick={() => setIsCooking(true)} />

      {isCooking && <CookingNavigator recipe={recipe} onClose={() => setIsCooking(false)} />}
    </div>
  )
}
