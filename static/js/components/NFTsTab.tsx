import React, { useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction } from '@solana/web3.js';
import axios from 'axios';

// Helper function to find Metadata PDA
function findMetadataPda(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s').toBuffer(),
      mint.toBuffer(),
    ],
    new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s')
  )[0];
}

// Define the window interface with our BurnAnimations object for TypeScript
declare global {
  interface Window {
    BurnAnimations?: {
      createConfetti: () => void;
      toggleDarkMode: () => void;
      applyBurnAnimation: (element: HTMLElement) => void;
      showAchievement: (title: string, description: string) => void;
      updateProgress: (currentVal: number, maxVal: number, level: number) => void;
      checkAchievements: (type: string, value: number) => void;
      initUIEnhancements: () => void;
    };
  }
}

interface NFTData {
  mint: string;
  name: string;
  image: string;
  collection?: string;
  selected?: boolean;
  metadataAddress?: string;
  tokenAddress?: string;
}

const NFTsTab: React.FC = () => {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [nfts, setNfts] = useState<NFTData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [burning, setBurning] = useState(false);
  const [selectedNfts, setSelectedNfts] = useState<Set<string>>(new Set());

  // Fun animation for loading - returns a different loading message each time
  const getLoadingMessage = () => {
    const messages = [
      "Scanning the blockchain for NFTs...",
      "Finding your digital collectibles...",
      "Looking for NFTs in your wallet...",
      "Searching through the Solana network...",
      "Hunting for NFTs...",
      "Scouting for digital treasures...",
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  };

  // Fetch real NFTs from the wallet using Helius API
  const fetchNFTs = async () => {
    if (!publicKey) return;
    
    try {
      setLoading(true);
      setError(null);
      
      console.log('[NFTsTab] Fetching NFTs for wallet:', publicKey.toString());
      
      // Use the same Helius API endpoint that works correctly in the tokens tab
      const response = await axios.get(`/api/helius/wallet/nfts/${publicKey.toString()}`);
      
      if (response.data && response.data.success) {
        const { regularNfts } = response.data.data;
        
        console.log('[NFTsTab] Found NFTs via Helius API:', regularNfts.length);
        
        if (regularNfts.length > 0) {
          // Show special achievement for discovering NFTs
          if (window.BurnAnimations) {
            window.BurnAnimations.showAchievement(
              "NFT Explorer", 
              "You've discovered your NFT collection!"
            );
          }
          
          // Convert to our NFTData format
          const nftData: NFTData[] = regularNfts.map((nft: any) => ({
            mint: nft.mint,
            name: nft.name || `NFT ${nft.mint.slice(0, 4)}...${nft.mint.slice(-4)}`,
            image: nft.image || "/default-nft-image.svg",
            collection: nft.collection || "Unknown Collection",
            tokenAddress: nft.tokenAddress,
            metadataAddress: nft.metadataAddress
          }));
          
          console.log('[NFTsTab] Processed NFTs:', nftData.length);
          setNfts(nftData);
        } else {
          setNfts([]);
        }
      } else {
        console.warn('[NFTsTab] Invalid response from Helius API:', response.data);
        setNfts([]);
      }
    } catch (err: any) {
      console.error('[NFTsTab] Error fetching NFTs:', err);
      setError('Failed to fetch NFTs. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    if (publicKey) {
      fetchNFTs();
    } else {
      setNfts([]);
      setLoading(false);
    }
  }, [publicKey, connection]);
  
  const toggleNftSelection = (mint: string) => {
    const newSelected = new Set(selectedNfts);
    if (newSelected.has(mint)) {
      newSelected.delete(mint);
    } else {
      newSelected.add(mint);
    }
    setSelectedNfts(newSelected);
  };
  
  const handleBurnNft = async (mint: string) => {
    if (!publicKey) return;
    
    try {
      setBurning(true);
      
      // Find the NFT data and NFT element for animation
      const nft = nfts.find(n => n.mint === mint);
      const nftElement = document.querySelector(`.nft-card[data-mint="${mint}"]`) as HTMLElement;
      
      if (!nft || !nft.tokenAddress) {
        console.error('[NFTsTab] NFT data or token address not found for mint:', mint);
        setError('Failed to burn NFT: Missing token data');
        setBurning(false);
        return;
      }
      
      console.log('[NFTsTab] Burning NFT:', mint);
      
      // In a real implementation, we would create and send a burn transaction here
      // For now, we'll just simulate it with a timeout for the demo
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Apply burn animation if element exists
      if (nftElement && window.BurnAnimations) {
        window.BurnAnimations.applyBurnAnimation(nftElement);
      }
      
      // Show confetti for successful burn
      if (window.BurnAnimations) {
        window.BurnAnimations.createConfetti();
        
        // Track achievement progress
        window.BurnAnimations.checkAchievements('nft', 1);
      }
      
      // Remove the burned NFT from the list
      setNfts(nfts.filter(n => n.mint !== mint));
    } catch (err) {
      console.error('[NFTsTab] Error burning NFT:', err);
      setError('Failed to burn NFT. Please try again.');
    } finally {
      setBurning(false);
    }
  };
  
  const handleBulkBurn = async () => {
    if (!publicKey || selectedNfts.size === 0) return;
    
    try {
      setBurning(true);
      
      // Get all NFT elements for animation
      const nftElements: HTMLElement[] = [];
      const selectedNftData = nfts.filter(nft => selectedNfts.has(nft.mint));
      
      document.querySelectorAll('.nft-card').forEach(element => {
        const mintAttribute = (element as HTMLElement).dataset.mint;
        if (mintAttribute && selectedNfts.has(mintAttribute)) {
          nftElements.push(element as HTMLElement);
        }
      });
      
      console.log(`[NFTsTab] Burning ${selectedNftData.length} NFTs in bulk`);
      
      // In a real implementation, we would create and send a burn transaction for each NFT here
      // For now, we'll just simulate it with a timeout for the demo
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Apply burn animations in sequence
      if (window.BurnAnimations && nftElements.length > 0) {
        // Animate each NFT with a slight delay between them
        nftElements.forEach((element, index) => {
          setTimeout(() => {
            window.BurnAnimations?.applyBurnAnimation(element);
          }, index * 300);
        });
      }
      
      // Show mega confetti for bulk burn
      if (window.BurnAnimations) {
        // Create double confetti for bulk burn
        window.BurnAnimations.createConfetti();
        setTimeout(() => {
          window.BurnAnimations?.createConfetti();
        }, 300);
        
        // Track achievement progress for all NFTs
        window.BurnAnimations.checkAchievements('nft', selectedNftData.length);
        
        // Show special achievement for bulk burning
        if (selectedNftData.length >= 2) {
          window.BurnAnimations.showAchievement(
            "NFT Purge Master!", 
            `You've burned ${selectedNftData.length} NFTs at once. Making history!`
          );
        }
      }
      
      // Remove all burned NFTs from the list
      setNfts(nfts.filter(nft => !selectedNfts.has(nft.mint)));
      setSelectedNfts(new Set());
    } catch (err) {
      console.error('[NFTsTab] Error bulk burning NFTs:', err);
      setError('Failed to burn NFTs. Please try again.');
    } finally {
      setBurning(false);
    }
  };
  
  // Group NFTs by collection
  const groupedNfts = nfts.reduce((acc, nft) => {
    const collection = nft.collection || 'Uncategorized';
    if (!acc[collection]) {
      acc[collection] = [];
    }
    acc[collection].push(nft);
    return acc;
  }, {} as Record<string, NFTData[]>);

  if (!publicKey) {
    return (
      <div className="container">
        <h2>NFTs</h2>
        <p className="connect-message">Connect your wallet to view NFTs</p>
      </div>
    );
  }

  return (
    <div className="container">
      <h2>NFTs</h2>
      {selectedNfts.size > 0 && (
        <div className="bulk-actions">
          <button 
            className="burn-button bulk-burn"
            onClick={handleBulkBurn}
            disabled={burning}
          >
            {burning ? 'Burning...' : `Burn Selected (${selectedNfts.size})`}
          </button>
        </div>
      )}
      {loading ? (
        <div className="loading-message">
          <div className="loading-spinner"></div>
          <p>{getLoadingMessage()}</p>
        </div>
      ) : error ? (
        <div className="error-message">{error}</div>
      ) : nfts.length === 0 ? (
        <div className="no-assets">
          <p>No NFTs found in your wallet</p>
          <p className="no-assets-subtitle">Your connected wallet doesn't have any NFTs yet</p>
        </div>
      ) : (
        <div className="nfts-collections">
          {Object.entries(groupedNfts).map(([collection, collectionNfts]) => (
            <div key={collection} className="nft-collection">
              <h3 className="collection-title">{collection}</h3>
              <div className="nfts-grid">
                {collectionNfts.map((nft) => (
                  <div key={nft.mint} className="asset-card nft-card" data-mint={nft.mint}>
                    <div className="nft-header">
                      <input
                        type="checkbox"
                        checked={selectedNfts.has(nft.mint)}
                        onChange={() => toggleNftSelection(nft.mint)}
                        className="nft-select"
                      />
                    </div>
                    <div className="nft-image-wrapper">
                      <img 
                        src={nft.image} 
                        alt={nft.name} 
                        className="nft-image"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = '/default-nft-image.svg';
                        }}
                      />
                    </div>
                    <div className="nft-info">
                      <h4 className="nft-name">{nft.name}</h4>
                      <span className="nft-collection">{nft.collection}</span>
                    </div>
                    <div className="nft-actions">
                      <button 
                        className="burn-button"
                        onClick={() => handleBurnNft(nft.mint)}
                        disabled={burning}
                      >
                        {burning ? 'Burning...' : 'Burn'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default NFTsTab;
