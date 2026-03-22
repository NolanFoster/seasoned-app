import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { registerSW } from 'virtual:pwa-register'

// Register service worker with lifecycle callbacks
// onOfflineReady: fires when app can work offline
// onNeedRefresh: fires when a new version is available
registerSW({
  onOfflineReady: () => console.log('[PWA] Service worker ready: app can work offline'),
  onNeedRefresh: () => console.log('[PWA] New version available: prompt user to refresh')
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
