import React from 'react';
import { createRoot } from 'react-dom/client';
import WalletProvider from './WalletProvider';
import TabsContainer from './components/TabsContainer';
import ErrorBoundary from './components/ErrorBoundary';

const App: React.FC = () => {
  console.log('[App] Rendering main App component');

  return (
    <ErrorBoundary>
      <div className="app-container">
        <WalletProvider>
          <div className="content">
            <div className="main-header">
              <img 
                src="/static/solburnt-logo-pixel.png" 
                alt="Solburnt" 
                className="main-logo"
                style={{
                  height: '150px',
                  marginRight: '25px',
                  filter: 'drop-shadow(0 0 15px rgba(255, 100, 0, 0.4))',
                  imageRendering: 'pixelated'
                }}
              />
              <div className="brand-text">
                <h1 className="brand-title">Solburnt</h1>
                <p className="brand-slogan">helping you get your sol back</p>
              </div>
            </div>
            <TabsContainer />
          </div>
        </WalletProvider>
      </div>
    </ErrorBoundary>
  );
};

function initApp() {
  console.log('[App] Initializing application');
  const container = document.getElementById('app');

  if (!container) {
    console.error('[App] Fatal: Root element #app not found in DOM');
    return;
  }

  try {
    console.log('[App] Creating React root');
    const root = createRoot(container);

    console.log('[App] Rendering React application');
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
    console.log('[App] React application rendered successfully');
  } catch (error) {
    console.error('[App] Fatal: Failed to render React application:', error);
  }
}

// Add initialization logging
console.log('[App] Script loaded, setting up window.App');

// Define global window interfaces
declare global {
  interface Window {
    App: {
      render: () => void;
    };
    debugInfo: {
      lastCnftError: any;
      lastCnftData: any;
      cnftBurnTriggered: boolean;
      walletInfo: any;
    };
  }
}

// Initialize debug info object
window.debugInfo = {
  lastCnftError: null,
  lastCnftData: null,
  cnftBurnTriggered: false,
  walletInfo: null
};
console.log('[App] Debug object initialized');

window.App = {
  render: () => {
    console.log('[App] window.App.render called');
    initApp();
  }
};

export default App;