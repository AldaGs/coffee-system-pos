import React from 'react';
import { Icon } from '@iconify/react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    // Track if an error occurred, and what the error was
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render shows the fallback UI.
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Here you could log the error to a service like Sentry in the future
    console.error("🛑 TinyPOS Error Caught by Boundary:", error, errorInfo);
  }

  handleReload = () => {
    // A simple refresh completely resets the React memory state,
    // but leaves Dexie.js (the cart) perfectly intact!
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // THE FALLBACK UI
      return (
        <div style={{ 
          display: 'flex', 
          height: '100dvh', 
          width: '100vw', 
          backgroundColor: 'var(--bg-main, #f8f9fa)', 
          justifyContent: 'center', 
          alignItems: 'center', 
          fontFamily: 'system-ui',
          padding: '24px',
          boxSizing: 'border-box'
        }}>
          <div className="fade-in" style={{ 
            background: 'var(--bg-surface, #ffffff)', 
            padding: '40px', 
            borderRadius: '24px', 
            maxWidth: '500px', 
            width: '100%', 
            boxShadow: '0 20px 60px rgba(0,0,0,0.1)', 
            border: '1px solid var(--border, #e2e8f0)',
            textAlign: 'center'
          }}>
            <div style={{ 
              width: '80px', height: '80px', 
              background: 'rgba(231, 76, 60, 0.1)', 
              borderRadius: '24px', 
              display: 'flex', alignItems: 'center', justifyContent: 'center', 
              margin: '0 auto 24px auto',
              color: '#e74c3c'
            }}>
              <Icon icon="lucide:monitor-x" style={{ fontSize: '3rem' }} />
            </div>
            
            <h2 style={{ margin: '0 0 12px 0', color: 'var(--text-main, #2d3748)', fontSize: '1.8rem', fontWeight: '900' }}>
              ¡Uy! Algo salió mal.
            </h2>
            
            <p style={{ color: 'var(--text-muted, #718096)', margin: '0 0 24px 0', lineHeight: '1.6', fontSize: '1.05rem' }}>
              The register encountered an unexpected error. <strong>Don't worry, your current order is safely saved on this device.</strong>
            </p>
            
            {/* We show the exact error in a little code block so you can debug it later! */}
            <div style={{ background: '#f1f5f9', padding: '16px', borderRadius: '12px', marginBottom: '32px', textAlign: 'left', overflowX: 'auto', border: '1px solid #e2e8f0' }}>
              <code style={{ fontSize: '0.8rem', color: '#e74c3c', fontFamily: 'monospace' }}>
                {this.state.error?.toString() || "Unknown Rendering Error"}
              </code>
            </div>

            <button 
              onClick={this.handleReload} 
              style={{ 
                width: '100%', padding: '16px', 
                background: 'var(--brand-color, #e67e22)', color: 'white', 
                border: 'none', borderRadius: '16px', cursor: 'pointer', 
                fontWeight: '900', fontSize: '1.1rem', 
                boxShadow: '0 10px 25px rgba(230, 126, 34, 0.3)', 
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                transition: 'transform 0.1s'
              }}
              onMouseDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
              onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
            >
              <Icon icon="lucide:refresh-cw" />
              Reload Register
            </button>
          </div>
        </div>
      );
    }

    // If there is no error, just render the app normally!
    return this.props.children; 
  }
}

export default ErrorBoundary;