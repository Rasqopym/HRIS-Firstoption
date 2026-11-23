import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import VerificationPage from './pages/VerificationPage'
import ErrorBoundary from './components/ErrorBoundary'
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

// Register Service Worker for PWA capabilities with auto-update
if ('serviceWorker' in navigator && process.env.NODE_ENV !== 'test') {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('PWA ServiceWorker registered with scope:', registration.scope)
        // Check for updates to guarantee iOS devices get newest compatible version
        registration.update().catch(() => {})
      })
      .catch((err) => {
        console.warn('PWA ServiceWorker registration failed:', err)
      })
  })
}

const rootElement = document.getElementById('root')
if (rootElement) {
  try {
    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <ErrorBoundary fallbackTitle="HRIS Application Initialization">
          {isVerificationPath ? <VerificationPage /> : <App />}
        </ErrorBoundary>
      </React.StrictMode>,
    )
  } catch (mountErr: any) {
    console.error('Fatal mount error:', mountErr)
    rootElement.innerHTML = `
      <div style="font-family: -apple-system, sans-serif; padding: 24px; text-align: center; background: #0f172a; color: #fff; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center;">
        <h2 style="font-size: 18px; margin-bottom: 8px;">HRIS Initialization Notice</h2>
        <p style="font-size: 13px; color: #94a3b8; max-width: 320px; margin-bottom: 20px;">The app encountered an initial start issue on this device.</p>
        <button onclick="window.location.reload(true)" style="padding: 10px 20px; background: #2563eb; color: #fff; border: none; border-radius: 10px; font-weight: 600; font-size: 14px; cursor: pointer;">Refresh App</button>
      </div>
    `
  }
}
