import React from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';

const NFTsTab: React.FC = () => {
  const { connection } = useConnection();
  const { publicKey } = useWallet();

  return (
    <div className="nfts-container">
      <h2>NFTs</h2>
      {publicKey ? (
        <div className="nfts-grid">
          {/* NFT list will go here */}
          <p>Loading NFTs...</p>
        </div>
      ) : (
        <p>Connect your wallet to view NFTs</p>
      )}
    </div>
  );
};

export default NFTsTab;
