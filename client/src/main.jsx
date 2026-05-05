import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import PwaInstallPrompt from './components/PwaInstallPrompt';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import './index.css';
import { initOrientationRespect } from './orientationRespect';
import { applyUiTheme, readStoredUiTheme } from './theme/uiTheme';

applyUiTheme(readStoredUiTheme());
initOrientationRespect();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      const showDebug = import.meta.env.DEV;
      return (
        <div style={{ padding: 40, fontFamily: 'monospace' }}>
          <h1 style={{ color: 'red' }}>Error en la aplicación</h1>
          <pre style={{ background: '#fee', padding: 20, borderRadius: 8, whiteSpace: 'pre-wrap' }}>
            {showDebug ? `${this.state.error?.message}\n${this.state.error?.stack}` : 'Ocurrió un error inesperado. Recarga la página.'}
          </pre>
          <button onClick={() => window.location.reload()} style={{ marginTop: 16, padding: '8px 16px', cursor: 'pointer' }}>Recargar</button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <CartProvider>
            <App />
            <PwaInstallPrompt />
            <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
          </CartProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
