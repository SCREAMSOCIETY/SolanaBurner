import React, { useEffect, useState } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import axios from 'axios';

interface RentEstimateData {
  totalAccounts: number;
  nftAccounts: number;
  tokenAccounts: number;
  vacantAccounts: number;
  rentPerAccount: number;
  nftRentPerAsset: number;
  totalRentEstimate: number;
  breakdown: {
    nftRent: number;
    tokenRent: number;
    vacantRent: number;
  };
  fees?: {
    vacantAccountBurningFee: number;
    totalBurningFees: number;
  };
  actualBalances?: {
    totalActualRent: number;
    avgTokenRent: number;
    avgNftRent: number;
    avgVacantRent: number;
  };
}

interface RentEstimateProps {
  selectedTokens?: any[];
  selectedNFTs?: any[];
  selectedCNFTs?: any[];
}

const RentEstimate: React.FC<RentEstimateProps> = ({ 
  selectedTokens = [], 
  selectedNFTs = [], 
  selectedCNFTs = [] 
}) => {
  const { publicKey, signMessage, signTransaction, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const [rentData, setRentData] = useState<RentEstimateData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processId, setProcessId] = useState(0);

  // Reset processing state and data when wallet changes
  React.useEffect(() => {
    setIsProcessing(false);
    setProcessId(prev => prev + 1);
    setRentData(null);
    setError(null);
    setLoading(false);
  }, [publicKey]);

  // Emergency reset function
  const resetProcessingState = React.useCallback(() => {
    setIsProcessing(false);
    setProcessId(prev => prev + 1);
  }, []);

  const handleBurnVacantAccounts = async () => {
    if (!publicKey || !signTransaction) {
      alert('Please connect your wallet first');
      return;
    }
    
    // Prevent double-clicking
    if (isProcessing) {
      return;
    }
    
    setIsProcessing(true);
    console.log('[RentEstimate] Starting vacant account burning process');
    console.log('[RentEstimate] Wallet:', publicKey.toString());
    console.log('[RentEstimate] Mobile device detected:', window.navigator?.userAgent?.includes('Mobile'));
    
    try {
      // First, get the list of vacant accounts from the server
      console.log('[RentEstimate] Fetching vacant accounts from server');
      const response = await fetch('/api/burn-vacant-accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ownerAddress: publicKey.toString(),
          signedMessage: 'identify' // Just to identify accounts
        })
      });
      
      const result = await response.json();
      console.log('[RentEstimate] Server response:', result);
      
      if (!result.success) {
        console.error('[RentEstimate] Failed to fetch vacant accounts:', result.error);
        alert(`Error: ${result.error || 'Failed to fetch vacant accounts'}`);
        return;
      }
      
      if (result.accountCount === 0) {
        console.log('[RentEstimate] No vacant accounts found');
        alert('No vacant accounts found to burn.');
        return;
      }
      
      console.log('[RentEstimate] Found vacant accounts:', result.accountCount);
      
      // Skip confirmation dialog for mobile compatibility - proceed directly to burning
      console.log('[RentEstimate] Proceeding directly to burn without confirmation dialog for mobile compatibility');
      
      // Prepare burn transactions on the server
      console.log('[RentEstimate] Preparing burn transactions on server');
      const burnResponse = await fetch('/api/prepare-burn-transactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ownerAddress: publicKey.toString(),
          vacantAccounts: result.vacantAccounts
        })
      });
      
      const burnResult = await burnResponse.json();
      console.log('[RentEstimate] Burn preparation response:', burnResult);
      
      if (!burnResult.success) {
        console.error('[RentEstimate] Failed to prepare burn transactions:', burnResult.error);
        alert(`Error preparing transactions: ${burnResult.error || 'Failed to prepare burn transactions'}`);
        return;
      }
      
      console.log('[RentEstimate] Transaction prepared successfully, account count:', burnResult.accountCount);
      
      // Import necessary Solana web3 components
      console.log('[RentEstimate] Importing Solana web3 Transaction');
      const { Transaction } = await import('@solana/web3.js');
      
      // Deserialize the transaction from the server
      console.log('[RentEstimate] Deserializing transaction from base64');
      let transaction;
      try {
        transaction = Transaction.from(Buffer.from(burnResult.transaction, 'base64'));
        console.log('[RentEstimate] Transaction deserialized successfully');
      } catch (deserializeError: any) {
        console.error('[RentEstimate] Error deserializing transaction:', deserializeError);
        throw new Error(`Failed to deserialize transaction: ${deserializeError?.message || 'Unknown error'}`);
      }
      
      // For mobile wallets, we need to handle transaction signing differently
      let signedTransaction;
      try {
        // Check if we're on mobile and use sendTransaction if available
        const isMobile = window.navigator?.userAgent?.includes('Mobile');
        console.log('[RentEstimate] Mobile device:', isMobile);
        
        // Always use the traditional signing method for all wallets to ensure compatibility
        console.log('[RentEstimate] Using traditional wallet signing method for all devices');
        console.log('[RentEstimate] SignTransaction function available:', !!signTransaction);
        
        if (!signTransaction) {
          throw new Error('signTransaction function not available from wallet');
        }
        
        console.log('[RentEstimate] Calling signTransaction...');
        
        // Use the same signing approach as successful NFT/token burning
        try {
          signedTransaction = await signTransaction(transaction);
          console.log('[RentEstimate] Transaction signed successfully');
        } catch (walletSignError: any) {
          console.error('[RentEstimate] Wallet signing failed:', walletSignError);
          
          // Check if it's a user cancellation
          if (walletSignError?.message?.includes('User rejected') || 
              walletSignError?.message?.includes('cancelled') ||
              walletSignError?.code === 4001) {
            console.log('[RentEstimate] User cancelled transaction');
            alert('Transaction was cancelled.');
            return;
          }
          
          // For other errors, try to provide more context
          console.error('[RentEstimate] Unexpected wallet error:', walletSignError);
          throw new Error(`Wallet signing failed: ${walletSignError?.message || 'Unknown wallet error'}`);
        }
      } catch (signError: any) {
        // User cancelled the transaction
        if (signError?.message?.includes('User rejected') || signError?.code === 4001) {
          alert('Transaction was cancelled by user.');
          return;
        }
        throw signError;
      }
      
      // Submit the signed transaction
      console.log('[RentEstimate] Submitting signed transaction to server');
      let submitResponse;
      try {
        submitResponse = await fetch('/api/submit-burn-transaction', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            signedTransaction: signedTransaction.serialize().toString('base64'),
            accountCount: result.accountCount
          })
        });
        console.log('[RentEstimate] Submit response status:', submitResponse.status);
      } catch (fetchError: any) {
        console.error('[RentEstimate] Error submitting transaction:', fetchError);
        throw new Error(`Failed to submit transaction: ${fetchError?.message || 'Unknown error'}`);
      }
      
      const submitResult = await submitResponse.json();
      console.log('[RentEstimate] Submit result:', submitResult);
      
      if (submitResult.success) {
        console.log('[RentEstimate] Transaction submitted successfully:', submitResult.signature);
        const avgVacantRent = rentData?.actualBalances?.avgVacantRent || 0.00204;
        const actualRecoveredSOL = submitResult.recoveredRent || ((submitResult.accountCount || result.accountCount) * avgVacantRent);
        alert(
          `🎉 Success! Burned ${submitResult.accountCount || result.accountCount} vacant accounts!\n\n` +
          `💰 Recovered ${actualRecoveredSOL.toFixed(6)} SOL in rent\n` +
          `🔗 Transaction: ${submitResult.signature}\n\n` +
          `The rent has been returned to your wallet. The page will refresh to show your updated balance.`
        );
        // Refresh the page to show updated balances
        window.location.reload();
      } else {
        console.error('[RentEstimate] Transaction submission failed:', submitResult.error);
        alert(`Transaction failed: ${submitResult.error || 'Unknown error occurred'}`);
      }
      
    } catch (error: any) {
      console.error('[RentEstimate] Error during vacant account burning:', error);
      console.error('[RentEstimate] Error details:', {
        message: error?.message,
        code: error?.code,
        name: error?.name,
        stack: error?.stack
      });
      
      // Handle different types of errors
      if (error?.message?.includes('User rejected') || error?.code === 4001) {
        console.log('[RentEstimate] Transaction was cancelled by user');
        alert('Transaction was cancelled by user.');
      } else if (error?.message?.includes('insufficient funds')) {
        console.error('[RentEstimate] Insufficient funds error');
        alert('Insufficient SOL to pay for transaction fees.');
      } else if (error?.message?.includes('blockhash')) {
        console.error('[RentEstimate] Blockhash expired error');
        alert('Transaction expired. Please try again.');
      } else {
        console.error('[RentEstimate] Unknown error:', error?.message || 'Unknown error');
        alert(`Failed to burn vacant accounts: ${error?.message || 'Please try again.'}`);
      }
    } finally {
      // Always reset the processing state
      console.log('[RentEstimate] Resetting processing state');
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    const fetchRentEstimate = async () => {
      if (!publicKey) {
        setRentData(null);
        setError(null);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        setRentData(null); // Clear previous data immediately

        // Add timeout to prevent long waits
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

        // First try to get accurate rent estimates using the enhanced calculator
        const response = await axios.get(`/api/rent-estimate/${publicKey.toString()}`, {
          params: { useAccurateCalculator: true },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.data && response.data.success) {
          setRentData(response.data.data);
        } else {
          setError('Failed to calculate rent estimate');
        }
      } catch (err: any) {
        console.error('Error fetching rent estimate:', err);
        if (err.name === 'AbortError' || err.code === 'ECONNABORTED') {
          setError('Request timed out - please try again');
        } else if (err.response?.status === 404) {
          setError('Wallet address not found');
        } else {
          setError('Unable to fetch rent estimate');
        }
      } finally {
        setLoading(false);
      }
    };

    // Add a small delay to prevent rapid-fire requests when switching wallets
    const timeoutId = setTimeout(fetchRentEstimate, 500);
    
    return () => clearTimeout(timeoutId);
  }, [publicKey]);

  // Calculate live rent estimate based on selected assets
  // Note: cNFTs don't return rent because they don't have individual token accounts
  const calculateSelectedRent = () => {
    if (!rentData) return null;
    
    const selectedTokenCount = selectedTokens.length;
    const selectedNFTCount = selectedNFTs.length;
    const selectedCNFTCount = selectedCNFTs.length;
    
    // Maximum batch size limits (based on optimized transaction structure)
    const MAX_NFTS_PER_BATCH = 10;
    const MAX_TOKENS_PER_BATCH = 10;
    
    // Check for batch size limits
    const nftBatchWarning = selectedNFTCount > MAX_NFTS_PER_BATCH;
    const tokenBatchWarning = selectedTokenCount > MAX_TOKENS_PER_BATCH;
    
    // Only tokens and NFTs return rent, not cNFTs (they don't have token accounts)
    const totalSelected = selectedTokenCount + selectedNFTCount + selectedCNFTCount;
    
    // Calculate rent based on asset type - NFTs return enhanced rent including metadata
    const tokenRent = selectedTokenCount * rentData.rentPerAccount;
    const nftRent = selectedNFTCount * (rentData.nftRentPerAsset || rentData.rentPerAccount);
    const selectedRent = tokenRent + nftRent;
    
    // Calculate 1% fee and net amount
    const feePercentage = 0.01; // 1% fee
    const feeAmount = selectedRent * feePercentage;
    const netSelectedRent = selectedRent - feeAmount;
    
    return {
      totalSelected,
      selectedTokenCount,
      selectedNFTCount,
      selectedCNFTCount,
      selectedRent,
      feeAmount,
      netSelectedRent,
      nftBatchWarning,
      tokenBatchWarning,
      maxNftsPerBatch: MAX_NFTS_PER_BATCH,
      maxTokensPerBatch: MAX_TOKENS_PER_BATCH
    };
  };

  const selectedRentData = calculateSelectedRent();

  if (!publicKey) {
    return null;
  }

  if (loading) {
    return (
      <div className="rent-estimate-card">
        <h3>💰 Rent Return Estimate</h3>
        <div className="loading-message">Calculating potential returns...</div>
      </div>
    );
  }

  if (error || !rentData) {
    return (
      <div className="rent-estimate-card">
        <h3>💰 Rent Return Estimate</h3>
        <div className="error-message">{error || 'Unable to calculate estimate'}</div>
      </div>
    );
  }

  return (
    <div className="rent-estimate-card">
      <h3>💰 Rent Return Estimate</h3>

      <div className="rent-summary">
        {selectedRentData && selectedRentData.totalSelected > 0 ? (
          <div className="selected-estimate">
            <div className="current-selection">
              <span className="estimate-label">Selected for Burning:</span>
              <span className="estimate-value selected">{selectedRentData.selectedRent.toFixed(4)} SOL</span>
            </div>
            <div className="selection-breakdown">
              <small>
                {selectedRentData.selectedTokenCount > 0 && `${selectedRentData.selectedTokenCount} tokens `}
                {selectedRentData.selectedNFTCount > 0 && `${selectedRentData.selectedNFTCount} NFTs `}
                {selectedRentData.selectedCNFTCount > 0 && `${selectedRentData.selectedCNFTCount} cNFTs `}
                selected ({selectedRentData.totalSelected} total)
                {selectedRentData.selectedCNFTCount > 0 && (
                  <span className="cnft-note"> • cNFTs don't return rent</span>
                )}
              </small>
            </div>
            
            {/* Batch Size Warnings */}
            {(selectedRentData.nftBatchWarning || selectedRentData.tokenBatchWarning) && (
              <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#4a1a1a', border: '1px solid #ff6b6b', borderRadius: '6px' }}>
                <div style={{ color: '#ff6b6b', fontWeight: 'bold', fontSize: '14px', marginBottom: '5px' }}>
                  Batch Size Limit Exceeded
                </div>
                {selectedRentData.nftBatchWarning && (
                  <div style={{ color: '#ffb3b3', fontSize: '12px' }}>
                    NFTs: {selectedRentData.selectedNFTCount}/{selectedRentData.maxNftsPerBatch} (max {selectedRentData.maxNftsPerBatch} per transaction)
                  </div>
                )}
                {selectedRentData.tokenBatchWarning && (
                  <div style={{ color: '#ffb3b3', fontSize: '12px' }}>
                    Tokens: {selectedRentData.selectedTokenCount}/{selectedRentData.maxTokensPerBatch} (max {selectedRentData.maxTokensPerBatch} per transaction)
                  </div>
                )}
                <div style={{ color: '#ffcccc', fontSize: '11px', marginTop: '5px' }}>
                  Please select fewer assets to burn them in a single transaction.
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="total-estimate">
            <span className="estimate-label">Total Potential Return:</span>
            <span className="estimate-value">
              {(() => {
                // Apply 1% fee to total rent estimate for accurate display
                const feeAmount = rentData.totalRentEstimate * 0.01;
                const netAmount = rentData.totalRentEstimate - feeAmount;
                return netAmount.toFixed(4);
              })()} SOL
            </span>
          </div>
        )}
        
        <div className="estimate-breakdown">
          <div className="breakdown-item">
            <span>From {rentData.nftAccounts} NFT accounts:</span>
            <span>{rentData.breakdown.nftRent.toFixed(4)} SOL</span>
          </div>
          <div className="breakdown-item">
            <span>From {rentData.tokenAccounts} token accounts:</span>
            <span>{rentData.breakdown.tokenRent.toFixed(4)} SOL</span>
          </div>
          {rentData.vacantAccounts > 0 && (
            <div className="breakdown-item">
              <span>From {rentData.vacantAccounts} vacant accounts:</span>
              <span>{rentData.breakdown.vacantRent.toFixed(4)} SOL</span>
            </div>
          )}

        </div>
        <div className="rent-details">
          <small>
            Tokens: {rentData.rentPerAccount.toFixed(4)} SOL • NFTs: {(rentData.nftRentPerAsset || rentData.rentPerAccount).toFixed(4)} SOL each
            {selectedRentData && selectedRentData.totalSelected > 0 && (
              <span className="selection-note"> • Select assets to see live estimate</span>
            )}
          </small>
        </div>
        
        {/* PROMINENT Vacant Account Burning Section */}
        {rentData && rentData.vacantAccounts > 0 && rentData.breakdown.vacantRent > 0 && (
          <div className="vacant-burn-section-prominent" style={{ 
            marginTop: '25px', 
            marginBottom: '20px',
            padding: '20px', 
            border: '3px solid #ff6600', 
            borderRadius: '15px', 
            background: 'linear-gradient(135deg, #2a1a0f, #1a1a1a)', 
            boxShadow: '0 4px 20px rgba(255, 102, 0, 0.4)',
            position: 'relative',
            overflow: 'hidden'
          }}>
            {/* Animated glow effect */}
            <div style={{
              position: 'absolute',
              top: '0',
              left: '0',
              right: '0',
              bottom: '0',
              background: 'linear-gradient(45deg, transparent, rgba(255, 102, 0, 0.1), transparent)',
              animation: 'glow-sweep 3s ease-in-out infinite',
              pointerEvents: 'none'
            }} />
            
            <div style={{ 
              marginBottom: '15px', 
              fontSize: '20px', 
              color: '#ff6600', 
              textAlign: 'center',
              fontWeight: 'bold',
              textShadow: '0 0 10px rgba(255, 102, 0, 0.8)',
              position: 'relative',
              zIndex: 1
            }}>
              💰 INSTANT SOL RECOVERY AVAILABLE! 💰
            </div>
            
            <div style={{ 
              marginBottom: '18px', 
              fontSize: '16px', 
              color: '#ffcc99',
              textAlign: 'center',
              padding: '12px',
              backgroundColor: 'rgba(255, 102, 0, 0.15)',
              borderRadius: '10px',
              border: '2px solid rgba(255, 102, 0, 0.4)',
              fontWeight: '600',
              position: 'relative',
              zIndex: 1
            }}>
              🔥 Found {rentData.vacantAccounts} Empty Accounts → Get {rentData.breakdown.vacantRent.toFixed(4)} SOL Now!
            </div>
            
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', position: 'relative', zIndex: 1 }}>
              <button 
                key={`vacant-burn-${processId}`}
                className="vacant-burn-button-mega"
                onClick={handleBurnVacantAccounts}
                onTouchStart={(e) => {
                  console.log('[RentEstimate] Touch start detected on vacant burn button');
                  e.preventDefault();
                }}
                onTouchEnd={(e) => {
                  console.log('[RentEstimate] Touch end detected, triggering burn');
                  e.preventDefault();
                  if (!isProcessing) {
                    handleBurnVacantAccounts();
                  }
                }}
                disabled={isProcessing}
                style={{
                  padding: '18px 35px',
                  background: isProcessing ? '#666' : 'linear-gradient(45deg, #ff4444, #ff6600, #ff8800)',
                  backgroundSize: '200% 200%',
                  animation: isProcessing ? 'none' : 'gradient-shift 2s ease infinite',
                  color: 'white',
                  border: 'none',
                  borderRadius: '12px',
                  cursor: isProcessing ? 'not-allowed' : 'pointer',
                  fontSize: '18px',
                  fontWeight: 'bold',
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                  boxShadow: isProcessing ? 'none' : '0 6px 25px rgba(255, 68, 68, 0.5)',
                  transform: 'scale(1)',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  flex: 1
                }}
                onMouseEnter={(e) => {
                  if (!isProcessing) {
                    const button = e.target as HTMLButtonElement;
                    button.style.transform = 'scale(1.05) translateY(-2px)';
                    button.style.boxShadow = '0 8px 30px rgba(255, 68, 68, 0.7)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isProcessing) {
                    const button = e.target as HTMLButtonElement;
                    button.style.transform = 'scale(1) translateY(0)';
                    button.style.boxShadow = '0 6px 25px rgba(255, 68, 68, 0.5)';
                  }
                }}
              >
                {isProcessing ? '⏳ PROCESSING...' : `🚀 RECOVER ${rentData.breakdown.vacantRent.toFixed(4)} SOL NOW! 🚀`}
              </button>
              {isProcessing && (
                <button
                  onClick={resetProcessingState}
                  style={{
                    padding: '8px 15px',
                    backgroundColor: '#666',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 'bold'
                  }}
                  title="Reset if button gets stuck"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RentEstimate;