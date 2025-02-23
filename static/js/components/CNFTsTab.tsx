import React from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';

const CNFTsTab: React.FC = () => {
  const { connection } = useConnection();
  const { publicKey } = useWallet();

  return (
    <div className="cnfts-container">
      <h2>Compressed NFTs</h2>
      {publicKey ? (
        <div className="cnfts-grid">
          {/* cNFT list will go here */}
          <p>Loading compressed NFTs...</p>
        </div>
      ) : (
        <p>Connect your wallet to view compressed NFTs</p>
      )}
    </div>
  );
};

export default CNFTsTab;
