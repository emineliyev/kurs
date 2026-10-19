import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import AppToaster from './components/common/AppToaster'
import './i18n'
import './index.css'
import { reloadForNewVersion } from './utils/lazyPage'
import { initPwa } from './utils/pwa'

// A script the current page depends on is gone (the site was updated meanwhile): reload once
window.addEventListener('vite:preloadError', (event) => {
  if (reloadForNewVersion()) event.preventDefault()
})

// Installable app: the browser's install offer + the service worker (production)
initPwa()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
      <AppToaster />
    </BrowserRouter>
  </React.StrictMode>
)
