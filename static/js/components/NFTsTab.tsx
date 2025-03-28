import React, { useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';

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
}

const NFTsTab: React.FC = () => {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
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

  // For demo purposes, we'll generate some placeholder NFTs
  // In a real app, you would fetch actual NFT data from the wallet
  const generateDemoNFTs = () => {
    setLoading(true);
    
    // Show special achievement for discovering NFTs
    if (window.BurnAnimations) {
      window.BurnAnimations.showAchievement(
        "NFT Explorer", 
        "You've discovered your NFT collection!"
      );
    }
    
    setTimeout(() => {
      const demoNfts: NFTData[] = [
        {
          mint: "nft1",
          name: "Solana Monkey",
          image: "/default-nft-image.svg",
          collection: "Solana Monkeys"
        },
        {
          mint: "nft2",
          name: "Degenerate Ape",
          image: "/default-nft-image.svg",
          collection: "Degenerate Ape Academy"
        },
        {
          mint: "nft3",
          name: "Okay Bear #123",
          image: "/default-nft-image.svg",
          collection: "Okay Bears"
        }
      ];
      setNfts(demoNfts);
      setLoading(false);
    }, 2000); // Simulate loading delay
  };
  
  useEffect(() => {
    if (publicKey) {
      generateDemoNFTs();
    } else {
      setNfts([]);
      setLoading(false);
    }
  }, [publicKey]);
  
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
    setBurning(true);
    
    // Find the NFT card element for animation
    const nftElement = document.querySelector(`.nft-card[data-mint="${mint}"]`) as HTMLElement;
    
    // Simulate burning transaction with a delay
    setTimeout(() => {
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
      setNfts(nfts.filter(nft => nft.mint !== mint));
      setBurning(false);
    }, 1500);
  };
  
  const handleBulkBurn = async () => {
    if (selectedNfts.size === 0) return;
    
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
    
    // Simulate burning transaction with a delay
    setTimeout(() => {
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
      setBurning(false);
    }, 2000);
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
