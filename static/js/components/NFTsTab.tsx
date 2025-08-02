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
      
      // Wait for confirmation with timeout
      const confirmation = await connection.confirmTransaction(signature, 'confirmed');
      
      if (confirmation.value.err) {
        console.error('[NFTsTab] Transaction confirmation error:', confirmation.value.err);
        console.error('[NFTsTab] Full error object:', JSON.stringify(confirmation.value.err, null, 2));
        
        // Check if this is a burn restriction error (Custom error 11)
        const errorMsg = confirmation.value.err;
        let isRestrictedNFT = false;
        
        // Check for instruction error with custom code 11 (burn restriction)
        if (errorMsg && (errorMsg as any).InstructionError) {
          const instructionError = (errorMsg as any).InstructionError;
          console.log('[NFTsTab] Found InstructionError:', instructionError);
          if (Array.isArray(instructionError) && instructionError.length >= 2) {
            const [instructionIndex, error] = instructionError;
            console.log('[NFTsTab] Error details:', { instructionIndex, error });
            if (error && error.Custom === 11) {
              isRestrictedNFT = true;
              console.log('[NFTsTab] Detected restricted NFT (Custom error 11)');
            }
          }
        }
        
        // If it's a restricted NFT, try fallback transfer mode
        if (isRestrictedNFT) {
          console.log('[NFTsTab] NFT burn restricted, attempting fallback transfer...');
          setError('NFT cannot be burned directly, transferring to vault...');
          
          // Retry with fallback transfer
          const fallbackResponse = await fetch('/api/burn-nft', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              mint: mint,
              tokenAccount: nft.tokenAddress,
              owner: publicKey.toString(),
              fallbackTransfer: true
            })
          });
          
          if (!fallbackResponse.ok) {
            throw new Error('Failed to prepare fallback transfer');
          }
          
          const fallbackResult = await fallbackResponse.json();
          if (!fallbackResult.success) {
            throw new Error(fallbackResult.error || 'Fallback transfer failed');
          }
          
          // Execute fallback transfer
          const fallbackTransaction = Transaction.from(Buffer.from(fallbackResult.transaction, 'base64'));
          const fallbackSignedTx = await signTransaction(fallbackTransaction);
          const fallbackSignature = await connection.sendRawTransaction(fallbackSignedTx.serialize(), {
            skipPreflight: false,
            maxRetries: 3,
            preflightCommitment: 'processed'
          });
          
          const fallbackConfirmation = await connection.confirmTransaction(fallbackSignature, 'confirmed');
          if (fallbackConfirmation.value.err) {
            throw new Error(`Fallback transfer failed: ${JSON.stringify(fallbackConfirmation.value.err)}`);
          }
          
          // Apply burn animation and show success
          const nftElement = document.querySelector(`.nft-card[data-mint="${mint}"]`) as HTMLElement;
          if (window.BurnAnimations && nftElement) {
            window.BurnAnimations.applyBurnAnimation(nftElement);
            window.BurnAnimations.createConfetti();
            window.BurnAnimations.checkAchievements('nft', 1);
          }
          
          const shortSig = fallbackSignature.substring(0, 8) + '...';
          setError(`Successfully transferred NFT "${nft.name}" to vault! Rent recovered: ${fallbackResult.rentRecovered} SOL | Tx: ${shortSig}`);
          
          // Remove the processed NFT from the list
          setNfts(nfts.filter(n => n.mint !== mint));
          return; // Exit successfully
        }
        
        // Handle other error types
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
    if (!publicKey || selectedNfts.size === 0 || !signTransaction || !connection) {
      setError('Wallet not properly connected. Please reconnect your wallet.');
      return;
    }
    
    try {
      setBurning(true);
      setError('Preparing batch burn transaction...');
      
      const selectedNftData = nfts.filter(nft => selectedNfts.has(nft.mint));
      console.log(`[NFTsTab] Starting batch burn for ${selectedNftData.length} NFTs`);
      
      // Prepare NFT data for batch burn
      const nftsToProcess = selectedNftData.map(nft => ({
        mint: nft.mint,
        tokenAccount: nft.tokenAddress,
        name: nft.name || 'Unknown NFT'
      })).filter(nft => nft.tokenAccount); // Only include NFTs with valid token accounts
      
      if (nftsToProcess.length === 0) {
        throw new Error("No valid NFTs found to burn");
      }
      
      setError(`Creating batch transaction for ${nftsToProcess.length} NFTs...`);
      
      // Call batch burn endpoint
      const response = await fetch('/api/batch-burn-nft', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nfts: nftsToProcess,
          owner: publicKey.toString()
        })
      });
      
      if (!response.ok) {
        throw new Error(`Server error: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (!result.success) {
        // Check if it's a batch size limit error
        if (result.maxBatchSize) {
          throw new Error(`${result.error} Please select ${result.maxBatchSize} or fewer NFTs.`);
        }
        
        // Check if it's an account validation error - suggest refresh
        if (result.error && result.error.includes('accounts no longer exist')) {
          throw new Error(`${result.error}\n\nPlease refresh your wallet to see current assets and try again.`);
        }
        
        throw new Error(result.error || 'Failed to prepare batch transaction');
      }
      
      setError(`Please approve the batch transaction in your wallet (${result.processedNFTs.length} NFTs)...`);
      
      // Get the prepared batch transaction
      const { transaction: transactionBase64, totalRentRecovered, totalFee, processedNFTs } = result;
      const transaction = Transaction.from(Buffer.from(transactionBase64, 'base64'));
      
      // Sign the batch transaction (single wallet confirmation)
      const signedTransaction = await signTransaction(transaction);
      
      setError("Sending batch transaction...");
      
      const signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
        preflightCommitment: 'processed'
      });
      
      setError("Confirming batch transaction...");
      
      // Wait for confirmation
      await connection.confirmTransaction(signature, 'processed');
      
      // Success! Show results
      setError(`Successfully burned ${processedNFTs.length} NFTs! Total rent recovered: ${totalRentRecovered} SOL (Fee: ${totalFee} SOL)`);
      
      // Apply burn animations for successful burns
      if (processedNFTs.length > 0 && window.BurnAnimations) {
        // Animate NFT elements that were successfully burned
        const burnedMints = processedNFTs.map(nft => nft.mint);
        const nftElements = Array.from(document.querySelectorAll('.nft-card')).filter(element => {
          const mintAttribute = (element as HTMLElement).dataset.mint;
          return mintAttribute && burnedMints.includes(mintAttribute);
        }) as HTMLElement[];
        
        // Animate each NFT with a slight delay
        nftElements.forEach((element, index) => {
          setTimeout(() => {
            window.BurnAnimations?.applyBurnAnimation(element);
          }, index * 200);
        });
        
        // Show confetti for successful bulk burn
        window.BurnAnimations.createConfetti();
        window.BurnAnimations.checkAchievements('nft', processedNFTs.length);
        
        if (processedNFTs.length >= 2) {
          window.BurnAnimations.showAchievement(
            "Bulk Burn Master!", 
            `Successfully burned ${processedNFTs.length} NFTs! Rent recovered: ${totalRentRecovered} SOL`
          );
        }
      }
      
      // Remove successfully burned NFTs from the list
      const burnedMints = processedNFTs.map(nft => nft.mint);
      setNfts(nfts.filter(nft => !burnedMints.includes(nft.mint)));
      setSelectedNfts(new Set());
      
    } catch (err: any) {
      console.error('[NFTsTab] Error in batch burn process:', err);
      setError(`Batch burn failed: ${err.message || 'Unknown error'}`);
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
                  <div 
                    key={nft.mint} 
                    className={`asset-card nft-card ${selectedNfts.has(nft.mint) ? 'selected' : ''}`}
                    data-mint={nft.mint}
                  >
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
