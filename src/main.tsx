import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import VerificationPage from './pages/VerificationPage'
import './index.css'

// Check if the current path is a verification page
const isVerificationPath = window.location.pathname.startsWith('/verify/')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isVerificationPath ? <VerificationPage /> : <App />}
  </React.StrictMode>,
)
