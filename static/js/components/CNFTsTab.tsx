import React, { useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { CNFTHandler, CNFTMetadata } from '../cnft-handler';

const CNFTsTab: React.FC = () => {
  const { connection } = useConnection();
  const { publicKey, wallet } = useWallet();
  const [cnfts, setCNFTs] = useState<CNFTMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCNFTs = async () => {
      if (!publicKey || !connection) {
        console.log('Prerequisites not met:', { 
          hasPublicKey: !!publicKey, 
          hasConnection: !!connection
        });
        return;
      }

      setLoading(true);
      setError(null);

      try {
        console.log('Creating CNFTHandler instance...');
        const handler = new CNFTHandler(connection, wallet);

        console.log('Fetching CNFTs for wallet:', publicKey.toString());
        const fetchedCNFTs = await handler.fetchCNFTs(publicKey.toString());

        console.log('Successfully fetched CNFTs:', fetchedCNFTs);
        setCNFTs(fetchedCNFTs);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
        console.error('Error in fetchCNFTs:', errorMessage);
        setError(`Failed to fetch compressed NFTs: ${errorMessage}`);
      } finally {
        setLoading(false);
      }
    };

    fetchCNFTs();
  }, [publicKey, connection, wallet]);

  if (!publicKey) {
    return (
      <div className="cnfts-container p-4">
        <h2 className="text-2xl font-bold mb-4">Compressed NFTs</h2>
        <div className="text-center py-8">
          <p className="text-gray-600">Connect your wallet to view compressed NFTs</p>
        </div>
      </div>
    );
  }

  return (
    <div className="cnfts-container p-4">
      <h2 className="text-2xl font-bold mb-4">Compressed NFTs</h2>

      {loading && (
        <div className="text-center py-8">
          <p className="text-gray-600">Loading compressed NFTs...</p>
        </div>
      )}

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && cnfts.length === 0 && (
        <div className="text-center py-8">
          <p className="text-gray-600">No compressed NFTs found in this wallet</p>
        </div>
      )}

      {!loading && !error && cnfts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cnfts.map((cnft) => (
            <div key={cnft.mint} className="bg-white rounded-lg shadow-md overflow-hidden">
              <div className="aspect-square relative">
                <img 
                  src={cnft.image || '/static/default-nft-image.svg'} 
                  alt={cnft.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = '/static/default-nft-image.svg';
                  }}
                />
              </div>
              <div className="p-4">
                <h3 className="font-semibold text-lg mb-2">{cnft.name}</h3>
                {cnft.collection && (
                  <p className="text-sm text-gray-600 mb-2">
                    Collection: {cnft.collection}
                  </p>
                )}
                <a 
                  href={cnft.explorer_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:text-blue-700 text-sm inline-block"
                >
                  View on Explorer
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CNFTsTab;