import React from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';

const TokensTab: React.FC = () => {
  const { connection } = useConnection();
  const { publicKey } = useWallet();

  return (
    <div className="tokens-container">
      <h2>Tokens</h2>
      {publicKey ? (
        <div className="tokens-grid">
          {/* Token list will go here */}
          <p>Loading tokens...</p>
        </div>
      ) : (
        <p>Connect your wallet to view tokens</p>
      )}
    </div>
  );
};

export default TokensTab;
