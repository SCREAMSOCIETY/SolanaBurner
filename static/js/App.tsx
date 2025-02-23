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
            <h1>Solana Asset Manager</h1>
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

declare global {
  interface Window {
    App: {
      render: () => void;
    };
  }
}

// Add initialization logging
console.log('[App] Script loaded, setting up window.App');
window.App = {
  render: () => {
    console.log('[App] window.App.render called');
    initApp();
  }
};

export default App;