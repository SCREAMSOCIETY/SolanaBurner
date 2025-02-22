import React, { useState } from 'react';
import TokensTab from './TokensTab';
import NFTsTab from './NFTsTab';
import CNFTsTab from './CNFTsTab';

const TabsContainer: React.FC = () => {
  const [activeTab, setActiveTab] = useState('tokens');

  return (
    <div className="tabs-container">
      <div className="tabs-header">
        <button 
          className={`tab-button ${activeTab === 'tokens' ? 'active' : ''}`}
          onClick={() => setActiveTab('tokens')}
        >
          Tokens
        </button>
        <button 
          className={`tab-button ${activeTab === 'nfts' ? 'active' : ''}`}
          onClick={() => setActiveTab('nfts')}
        >
          NFTs
        </button>
        <button 
          className={`tab-button ${activeTab === 'cnfts' ? 'active' : ''}`}
          onClick={() => setActiveTab('cnfts')}
        >
          Compressed NFTs
        </button>
      </div>
      <div className="tab-content">
        {activeTab === 'tokens' && <TokensTab />}
        {activeTab === 'nfts' && <NFTsTab />}
        {activeTab === 'cnfts' && <CNFTsTab />}
      </div>
    </div>
  );
};

export default TabsContainer;
