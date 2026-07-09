import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import './utils/icons' // Pre-load icons for offline use
import App from './App.jsx'
import { DialogProvider } from './contexts/DialogContext.jsx'
import { ThemeProvider } from './contexts/ThemeContext.jsx'
import ErrorBoundary from './components/shared/ErrorBoundary.jsx'
import { installGlobalErrorReporting } from './utils/reportError'

// Getting here means the app bundle loaded fine, so clear any one-shot
// stale-chunk reload guard and start capturing uncaught errors globally.
try { sessionStorage.removeItem('tinypos_chunk_reload'); } catch { /* ignore */ }
installGlobalErrorReporting()

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