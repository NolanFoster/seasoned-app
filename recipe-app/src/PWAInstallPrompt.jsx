import React, { useState, useEffect } from 'react'

/**
 * PWAInstallPrompt
 *
 * Displays a dismissible install banner when the browser fires
 * `beforeinstallprompt` (Chrome/Edge/Android), and a small fixed
 * offline indicator whenever `navigator.onLine` is false.
 *
 * No props required — fully self-contained.
 */
export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showInstallBanner, setShowInstallBanner] = useState(false)
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      // Don't show banner if already running as installed standalone PWA
      if (!window.matchMedia('(display-mode: standalone)').matches) {
        setShowInstallBanner(true)
      }
    }

    const handleOnline  = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('online',  handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('online',  handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Show browser install UI; prompt can only be used once
  const handleInstallClick = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    console.log(`[PWA] Install prompt outcome: ${outcome}`)
    setDeferredPrompt(null)
    setShowInstallBanner(false)
  }

  // Hide for this session; deferred prompt is kept so page-reload re-shows it
  const handleDismissClick = () => setShowInstallBanner(false)

  return (
    <>
      {showInstallBanner && deferredPrompt && (
        <div className="pwa-install-banner" role="region" aria-label="Install app prompt" aria-live="polite">
          <div className="pwa-install-content">
            <div className="pwa-install-text">
              <h3>Install Seasoned</h3>
              <p>Get instant access to your recipe clips, even offline</p>
            </div>
            <div className="pwa-install-actions">
              <button
                className="pwa-install-button"
                onClick={handleInstallClick}
                aria-label="Install Seasoned app"
              >
                Install
              </button>
              <button
                className="pwa-dismiss-button"
                onClick={handleDismissClick}
                aria-label="Dismiss install prompt"
                title="Dismiss"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {!isOnline && (
        <div className="offline-indicator" role="status" aria-live="polite" aria-label="You are offline">
          <span className="offline-icon" aria-hidden="true">⚠️</span>
          <span className="offline-text">Offline</span>
        </div>
      )}
    </>
  )
}
