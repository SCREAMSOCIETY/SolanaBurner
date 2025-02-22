import React from 'react';
import { createRoot } from 'react-dom/client';
import WalletProvider from './WalletProvider';

const App: React.FC = () => {
  return (
    <div className="app-container">
      <WalletProvider>
        <div className="content">
          <h1>Solana Asset Manager</h1>
          {/* Additional components will go here */}
        </div>
      </WalletProvider>
    </div>
  );
};

function initApp() {
  const container = document.getElementById('root');
  if (!container) {
    console.error('Root element not found');
    return;
  }

  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

// Export for window access
declare global {
  interface Window {
    App: {
      render: () => void;
    };
  }
}

window.App = {
  render: initApp
};

export default App;