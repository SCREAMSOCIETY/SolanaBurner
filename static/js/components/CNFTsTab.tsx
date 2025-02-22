import React, { useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { CNFTHandler } from '../cnft-handler';
import { PublicKey } from '@solana/web3.js';

interface CNFT {
  mint: string;
  name: string;
  symbol: string;
  description: string;
  image: string;
  collection?: string;
  attributes: Array<{trait_type: string, value: string}>;
  explorer_url: string;
  proof: any;
}

const CNFTsTab: React.FC = () => {
  const { connection } = useConnection();
  const { publicKey, wallet } = useWallet();
  const [cnfts, setCNFTs] = useState<CNFT[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCNFTs = async () => {
      if (!publicKey || !connection) return;

      setLoading(true);
      setError(null);

      try {
        const handler = new CNFTHandler(connection, wallet);
        const fetchedCNFTs = await handler.fetchCNFTs(publicKey);
        console.log('Fetched cNFTs:', fetchedCNFTs);
        setCNFTs(fetchedCNFTs);
      } catch (err) {
        console.error('Error fetching cNFTs:', err);
        setError('Failed to fetch compressed NFTs');
      } finally {
        setLoading(false);
      }
    };

    fetchCNFTs();
  }, [publicKey, connection, wallet]);

  return (
    <div className="cnfts-container">
      <h2>Compressed NFTs</h2>
      {publicKey ? (
        <>
          {loading && <p>Loading compressed NFTs...</p>}
          {error && <p className="error">{error}</p>}
          {!loading && !error && (
            <div className="cnfts-grid">
              {cnfts.length === 0 ? (
                <p>No compressed NFTs found in this wallet</p>
              ) : (
                cnfts.map((cnft) => (
                  <div key={cnft.mint} className="cnft-card">
                    <img 
                      src={cnft.image || '/default-nft-image.svg'} 
                      alt={cnft.name}
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = '/default-nft-image.svg';
                      }}
                    />
                    <div className="cnft-info">
                      <h3>{cnft.name}</h3>
                      {cnft.collection && <p>Collection: {cnft.collection}</p>}
                      <a 
                        href={cnft.explorer_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="view-on-explorer"
                      >
                        View on Explorer
                      </a>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      ) : (
        <p>Connect your wallet to view compressed NFTs</p>
      )}
    </div>
  );
};

export default CNFTsTab;