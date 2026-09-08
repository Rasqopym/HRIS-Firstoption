import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import VerificationPage from './pages/VerificationPage'
import './index.css'

// Check if the current path is a verification page
const isVerificationPath = window.location.pathname.startsWith('/verify/')

// Capture PWA install prompt globally as early as possible
declare global {
  interface Window {
    __pwaInstallPrompt?: any
    __pwaInstallListeners?: Array<(prompt: any) => void>
  }
}

window.__pwaInstallListeners = window.__pwaInstallListeners || []
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  window.__pwaInstallPrompt = e
  if (window.__pwaInstallListeners) {
    window.__pwaInstallListeners.forEach((cb) => cb(e))
  }
})

// Register Service Worker for PWA capabilities
if ('serviceWorker' in navigator && process.env.NODE_ENV !== 'test') {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('PWA ServiceWorker registered with scope:', registration.scope)
      })
      .catch((err) => {
        console.warn('PWA ServiceWorker registration failed:', err)
      })
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isVerificationPath ? <VerificationPage /> : <App />}
  </React.StrictMode>,
)
