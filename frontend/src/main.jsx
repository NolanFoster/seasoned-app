
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// Modular CSS imports
import './styles/base.css'
import './styles/recipe-card.css'
import './styles/recipe-fullscreen.css'
import './styles/forms-overlays.css'
import './styles/fab.css'
import './styles/utilities.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
