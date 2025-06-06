import React, { useState } from 'react';

const UserGuide: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [activeTab, setActiveTab] = useState('getting-started');

  const tabs = [
    { id: 'getting-started', label: 'Getting Started' },
    { id: 'wallet-connection', label: 'Wallet Setup' },
    { id: 'burning-tokens', label: 'Burning Assets' },
    { id: 'rent-recovery', label: 'Rent Recovery' },
    { id: 'troubleshooting', label: 'Troubleshooting' },
    { id: 'faq', label: 'FAQ' }
  ];

  const content = {
    'getting-started': (
      <div>
        <h3>Welcome to SolBurn</h3>
        <p>SolBurn helps you recover SOL from unused tokens and NFTs in your wallet by burning them and reclaiming their rent.</p>
        
        <h4>What you can do:</h4>
        <ul>
          <li>View all tokens, NFTs, and compressed NFTs in your wallet</li>
          <li>See estimated SOL recovery amounts</li>
          <li>Burn unwanted assets to reclaim rent</li>
          <li>Transfer assets to other wallets</li>
          <li>Track your transaction history</li>
        </ul>

        <h4>Quick Start:</h4>
        <ol>
          <li>Connect your Solana wallet (Phantom or Solflare)</li>
          <li>Review your assets and rent estimates</li>
          <li>Select assets you want to burn</li>
          <li>Confirm transactions in your wallet</li>
          <li>Receive SOL back to your wallet</li>
        </ol>
      </div>
    ),
    'wallet-connection': (
      <div>
        <h3>Connecting Your Wallet</h3>
        
        <h4>Supported Wallets:</h4>
        <ul>
          <li><strong>Phantom</strong> - Most popular Solana wallet</li>
          <li><strong>Solflare</strong> - Advanced features for power users</li>
        </ul>

        <h4>Connection Steps:</h4>
        <ol>
          <li>Install your preferred wallet extension</li>
          <li>Create or import your wallet</li>
          <li>Click "Connect Wallet" in SolBurn</li>
          <li>Select your wallet from the list</li>
          <li>Approve the connection in your wallet</li>
        </ol>

        <h4>Troubleshooting:</h4>
        <ul>
          <li>Refresh the page if connection fails</li>
          <li>Make sure your wallet extension is unlocked</li>
          <li>Check that you're on the correct network (Mainnet)</li>
          <li>Disable other wallet extensions to avoid conflicts</li>
        </ul>
      </div>
    ),
    'burning-tokens': (
      <div>
        <h3>Burning Assets</h3>
        
        <h4>What Can Be Burned:</h4>
        <ul>
          <li><strong>SPL Tokens</strong> - Custom tokens with zero or small balances</li>
          <li><strong>NFTs</strong> - Digital collectibles you no longer want</li>
          <li><strong>Compressed NFTs</strong> - Space-efficient NFTs</li>
          <li><strong>Token Accounts</strong> - Empty accounts taking up space</li>
        </ul>

        <h4>Burning Process:</h4>
        <ol>
          <li>Review assets in your wallet</li>
          <li>Check estimated SOL recovery amounts</li>
          <li>Select individual assets or use bulk operations</li>
          <li>Confirm the burn transaction</li>
          <li>Wait for blockchain confirmation</li>
          <li>Receive SOL in your wallet</li>
        </ol>

        <h4>Important Notes:</h4>
        <ul>
          <li>Burning is permanent - assets cannot be recovered</li>
          <li>Small network fees apply (around 0.00004 SOL)</li>
          <li>Some assets may have transfer restrictions</li>
          <li>Always double-check before confirming</li>
        </ul>
      </div>
    ),
    'rent-recovery': (
      <div>
        <h3>Understanding Rent Recovery</h3>
        
        <h4>What is Rent?</h4>
        <p>On Solana, accounts must maintain a minimum SOL balance (rent) to stay active. When you burn assets, this rent is returned to your wallet.</p>

        <h4>Rent Amounts:</h4>
        <ul>
          <li><strong>Token Accounts</strong> - ~0.00204 SOL each</li>
          <li><strong>NFT Accounts</strong> - ~0.00204 SOL each</li>
          <li><strong>Metadata Accounts</strong> - Variable amounts</li>
          <li><strong>Program Accounts</strong> - Larger amounts</li>
        </ul>

        <h4>Recovery Process:</h4>
        <p>When you burn an asset, the blockchain automatically returns the rent to your wallet. The amount shown in estimates is what you'll receive minus small network fees.</p>

        <h4>Maximizing Recovery:</h4>
        <ul>
          <li>Focus on assets with higher rent values</li>
          <li>Use bulk operations to save on fees</li>
          <li>Prioritize empty token accounts</li>
          <li>Consider the value vs. rent ratio</li>
        </ul>
      </div>
    ),
    'troubleshooting': (
      <div>
        <h3>Common Issues</h3>
        
        <h4>Connection Problems:</h4>
        <ul>
          <li><strong>Wallet not detected:</strong> Install and enable wallet extension</li>
          <li><strong>Connection fails:</strong> Refresh page and try again</li>
          <li><strong>Wrong network:</strong> Switch to Solana Mainnet</li>
        </ul>

        <h4>Transaction Issues:</h4>
        <ul>
          <li><strong>Transaction failed:</strong> Check SOL balance for fees</li>
          <li><strong>Slow confirmation:</strong> Network congestion, wait longer</li>
          <li><strong>Asset not found:</strong> Refresh asset list</li>
        </ul>

        <h4>Display Issues:</h4>
        <ul>
          <li><strong>Assets not loading:</strong> Check internet connection</li>
          <li><strong>Missing metadata:</strong> Some assets may lack proper metadata</li>
          <li><strong>Incorrect balances:</strong> Refresh page to update</li>
        </ul>

        <h4>Getting Help:</h4>
        <p>If problems persist, check your browser console for error messages and ensure your wallet has sufficient SOL for transaction fees.</p>
      </div>
    ),
    'faq': (
      <div>
        <h3>Frequently Asked Questions</h3>
        
        <h4>Is SolBurn safe to use?</h4>
        <p>Yes, SolBurn only performs actions you explicitly approve in your wallet. We never have access to your private keys.</p>

        <h4>Can I recover burned assets?</h4>
        <p>No, burning is permanent. Assets are destroyed and cannot be recovered. Always verify before confirming.</p>

        <h4>Why do I need SOL for burning?</h4>
        <p>Small network fees (around 0.00004 SOL) are required for blockchain transactions. You'll typically receive much more SOL back from rent recovery.</p>

        <h4>What happens to valuable NFTs?</h4>
        <p>Be very careful with NFTs - check their value before burning. SolBurn shows estimated values but you should verify independently.</p>

        <h4>How long do transactions take?</h4>
        <p>Most transactions confirm within 10-30 seconds, but network congestion can cause delays.</p>

        <h4>Can I burn assets from any wallet?</h4>
        <p>You can only burn assets you own in your connected wallet. Assets in other wallets cannot be accessed.</p>

        <h4>Is there a fee for using SolBurn?</h4>
        <p>SolBurn is free to use. You only pay standard Solana network fees for transactions.</p>
      </div>
    )
  };

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        style={{
          position: 'fixed',
          top: '20px',
          left: '20px',
          backgroundColor: '#1f2937',
          color: 'white',
          border: 'none',
          borderRadius: '50%',
          width: '48px',
          height: '48px',
          fontSize: '20px',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          zIndex: 1000
        }}
        title="Help & Guide"
      >
        ?
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      top: '0',
      left: '0',
      right: '0',
      bottom: '0',
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      zIndex: 10000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: '#1a1a1a',
        borderRadius: '12px',
        width: '90%',
        maxWidth: '800px',
        height: '90%',
        maxHeight: '700px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px',
          borderBottom: '1px solid #444',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h2 style={{ margin: 0, color: 'white' }}>SolBurn User Guide</h2>
          <button
            onClick={() => setIsVisible(false)}
            style={{
              backgroundColor: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 16px',
              cursor: 'pointer'
            }}
          >
            Close
          </button>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Sidebar */}
          <div style={{
            width: '200px',
            backgroundColor: '#2d3748',
            padding: '20px 0',
            overflowY: 'auto'
          }}>
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '12px 20px',
                  backgroundColor: activeTab === tab.id ? '#4a5568' : 'transparent',
                  color: 'white',
                  border: 'none',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div style={{
            flex: 1,
            padding: '20px',
            overflowY: 'auto',
            color: 'white'
          }}>
            {content[activeTab as keyof typeof content]}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserGuide;