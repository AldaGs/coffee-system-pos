import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import './utils/icons' // Pre-load icons for offline use
import App from './App.jsx'
import { DialogProvider } from './contexts/DialogContext.jsx'
import { ThemeProvider } from './contexts/ThemeContext.jsx'
import ErrorBoundary from './components/shared/ErrorBoundary.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <DialogProvider>
          <App />
        </DialogProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
)