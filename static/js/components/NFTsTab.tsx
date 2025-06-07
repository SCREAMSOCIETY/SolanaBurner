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
  const { publicKey, signTransaction } = useWallet();
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
    if (!publicKey || !signTransaction || !connection) {
      setError('Wallet not properly connected. Please reconnect your wallet.');
      return;
    }
    
    try {
      setBurning(true);
      setError('Preparing burn transaction...');
      
      // Find the NFT data
      const nft = nfts.find(n => n.mint === mint);
      if (!nft || !nft.tokenAddress) {
        setError('Failed to burn NFT: Missing token data');
        setBurning(false);
        return;
      }
      
      console.log('[NFTsTab] Starting NFT burn for:', mint);
      
      // Use server-side burn endpoint for better reliability
      const response = await fetch('/api/burn-nft', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mint: mint,
          tokenAccount: nft.tokenAddress,
          owner: publicKey.toString()
        })
      });
      
      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Server error: ${errorData}`);
      }
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Unknown server error');
      }
      
      console.log('[NFTsTab] Transaction prepared, requesting wallet signature...');
      setError('Please sign the transaction in your wallet...');
      
      // Get the prepared transaction from server
      const { transaction: transactionBase64, rentRecovered } = result;
      
      // Deserialize the transaction
      const transaction = Transaction.from(Buffer.from(transactionBase64, 'base64'));
      
      // Sign the transaction with wallet
      const signedTransaction = await signTransaction(transaction);
      
      console.log('[NFTsTab] Transaction signed, broadcasting to network...');
      setError('Broadcasting transaction...');
      
      // Send the signed transaction
      const signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
        preflightCommitment: 'processed'
      });
      
      console.log('[NFTsTab] Transaction sent with signature:', signature);
      setError('Waiting for confirmation...');
      
      // Wait for confirmation
      const confirmation = await connection.confirmTransaction(signature, 'confirmed');
      
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }
      
      console.log('[NFTsTab] NFT burn confirmed successfully');
      
      // Apply burn animation if available
      const nftElement = document.querySelector(`.nft-card[data-mint="${mint}"]`) as HTMLElement;
      if (window.BurnAnimations && nftElement) {
        window.BurnAnimations.applyBurnAnimation(nftElement);
        window.BurnAnimations.createConfetti();
        window.BurnAnimations.checkAchievements('nft', 1);
      }
      
      // Show success message with actual rent amount from server
      const shortSig = signature.substring(0, 8) + '...';
      setError(`Successfully burned NFT "${nft.name}"! Rent returned: ${rentRecovered} SOL | Tx: ${shortSig}`);
      
      // Remove the burned NFT from the list
      setNfts(nfts.filter(n => n.mint !== mint));
      
    } catch (err: any) {
      console.error('[NFTsTab] Error burning NFT:', err);
      
      let errorMessage = 'Unknown error occurred';
      if (err?.message) {
        if (err.message.includes('User rejected') || err.message.includes('cancelled')) {
          errorMessage = 'Transaction was cancelled by the user';
        } else if (err.message.includes('insufficient')) {
          errorMessage = 'Insufficient SOL for transaction fees. Please add more SOL to your wallet.';
        } else {
          errorMessage = err.message;
        }
      }
      
      setError(`Failed to burn NFT: ${errorMessage}`);
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
      
      // Import required modules for real NFT burning
      const { ComputeBudgetProgram, SystemProgram } = await import('@solana/web3.js');
      const { createBurnCheckedInstruction, createCloseAccountInstruction } = await import('@solana/spl-token');
      
      // Create a single transaction for all NFT burns
      const transaction = new Transaction();
      
      // Add compute budget instructions (scaled for multiple NFTs)
      const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ 
        units: 200000 * Math.min(5, selectedNftData.length)
      });
      const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 1
      });
      transaction.add(modifyComputeUnits, addPriorityFee);
      
      // Process each selected NFT
      const nftRentPerAsset = 0.0077;
      const feePercentage = 0.01;
      let totalFeeAmount = 0;
      
      for (const nft of selectedNftData) {
        if (!nft.tokenAddress) {
          console.warn(`[NFTsTab] Skipping NFT ${nft.mint} - missing token address`);
          continue;
        }
        
        // Add burn instruction
        transaction.add(
          createBurnCheckedInstruction(
            new PublicKey(nft.tokenAddress),
            new PublicKey(nft.mint),
            publicKey,
            1,
            0
          )
        );
        
        // Add close account instruction
        transaction.add(
          createCloseAccountInstruction(
            new PublicKey(nft.tokenAddress),
            publicKey,
            publicKey,
            []
          )
        );
        
        // Calculate fee for this NFT
        totalFeeAmount += Math.floor(nftRentPerAsset * feePercentage * 1e9);
      }
      
      // Add single fee transfer for all NFTs
      if (totalFeeAmount > 0) {
        const feeRecipient = new PublicKey('EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK');
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: feeRecipient,
            lamports: totalFeeAmount,
          })
        );
      }
      
      // Get recent blockhash and sign transaction
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash({
        commitment: 'processed'
      });
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;
      
      // Check if wallet supports signing
      if (!signTransaction) {
        throw new Error('Wallet does not support transaction signing');
      }
      
      // Sign the transaction
      const signedTx = await signTransaction(transaction);
      
      console.log(`[NFTsTab] Bulk burn transaction signed, sending to network...`);
      
      // Send the signed transaction
      const signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: true,
        maxRetries: 3,
        preflightCommitment: 'processed'
      });
      
      console.log(`[NFTsTab] Bulk burn transaction sent, waiting for confirmation...`);
      
      // Wait for confirmation
      const confirmation = await connection.confirmTransaction({
        signature: signature,
        blockhash: blockhash,
        lastValidBlockHeight: lastValidBlockHeight
      }, 'processed');
      
      if (confirmation.value.err) {
        console.error('[NFTsTab] Error confirming bulk NFT burn transaction:', confirmation.value.err);
        setError(`Error burning NFTs: ${confirmation.value.err}`);
        return;
      }
      
      console.log('[NFTsTab] Bulk NFT burn successful with signature:', signature);
      
      // Show success message
      const totalRent = selectedNftData.length * nftRentPerAsset;
      const shortSig = signature.substring(0, 8) + '...';
      setError(`Successfully burned ${selectedNftData.length} NFTs! Total rent returned: ${totalRent.toFixed(4)} SOL | Signature: ${shortSig}`);
      
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
