import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <Toaster
      position="bottom-right"
      toastOptions={{
        duration: 4000,
        style: {
          fontFamily: 'Inter, sans-serif',
          fontSize: '13px',
          fontWeight: '600',
          background: '#1a1d27',
          color: '#e2e8f0',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '12px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        },
        success: { iconTheme: { primary: '#10B981', secondary: '#1a1d27' } },
        error:   { iconTheme: { primary: '#EF4444', secondary: '#1a1d27' } },
      }}
    />
  </React.StrictMode>
)
