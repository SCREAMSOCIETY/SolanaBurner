import React, { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import axios from 'axios';

interface RentEstimateData {
  totalAccounts: number;
  nftAccounts: number;
  tokenAccounts: number;
  vacantAccounts: number;
  rentPerAccount: number;
  totalRentEstimate: number;
  breakdown: {
    nftRent: number;
    tokenRent: number;
    vacantRent: number;
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
  const { publicKey, signMessage, signTransaction } = useWallet();
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
    try {
      // First, get the list of vacant accounts from the server
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
      
      if (!result.success) {
        alert(`Error: ${result.error || 'Failed to fetch vacant accounts'}`);
        return;
      }
      
      if (result.accountCount === 0) {
        alert('No vacant accounts found to burn.');
        return;
      }
      
      // Ask user for confirmation before proceeding
      const confirmed = confirm(
        `Found ${result.accountCount} vacant accounts that can recover ${result.potentialRentRecovery.toFixed(4)} SOL.\n\n` +
        `Do you want to proceed with burning these accounts? This will:\n` +
        `- Close ${result.accountCount} empty token accounts\n` +
        `- Recover approximately ${result.potentialRentRecovery.toFixed(4)} SOL in rent\n` +
        `- Require wallet signature for the transaction\n\n` +
        `Click OK to proceed or Cancel to abort.`
      );
      
      if (!confirmed) {
        return;
      }
      
      // Prepare burn transactions on the server
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
      
      if (!burnResult.success) {
        alert(`Error preparing transactions: ${burnResult.error || 'Failed to prepare burn transactions'}`);
        return;
      }
      
      // Import necessary Solana web3 components
      const { Transaction } = await import('@solana/web3.js');
      
      // Deserialize the transaction from the server
      const transaction = Transaction.from(Buffer.from(burnResult.transaction, 'base64'));
      
      // Sign the transaction with the user's wallet
      let signedTransaction;
      try {
        signedTransaction = await signTransaction(transaction);
      } catch (signError: any) {
        // User cancelled the transaction
        if (signError?.message?.includes('User rejected') || signError?.code === 4001) {
          alert('Transaction was cancelled by user.');
          return;
        }
        throw signError;
      }
      
      // Submit the signed transaction
      const submitResponse = await fetch('/api/submit-burn-transaction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          signedTransaction: signedTransaction.serialize().toString('base64'),
          accountCount: result.accountCount
        })
      });
      
      const submitResult = await submitResponse.json();
      
      if (submitResult.success) {
        alert(
          `🎉 Successfully burned ${result.accountCount} vacant accounts!\n\n` +
          `💰 Recovered ${result.potentialRentRecovery.toFixed(4)} SOL in rent\n` +
          `📊 Transaction: ${submitResult.signature}\n\n` +
          `The rent has been returned to your wallet. Refreshing your balance...`
        );
        // Refresh the page to show updated balances
        window.location.reload();
      } else {
        alert(`Transaction failed: ${submitResult.error || 'Unknown error occurred'}`);
      }
      
    } catch (error: any) {
      console.error('Error burning vacant accounts:', error);
      
      // Handle different types of errors
      if (error?.message?.includes('User rejected') || error?.code === 4001) {
        alert('Transaction was cancelled by user.');
      } else if (error?.message?.includes('insufficient funds')) {
        alert('Insufficient SOL to pay for transaction fees.');
      } else if (error?.message?.includes('blockhash')) {
        alert('Transaction expired. Please try again.');
      } else {
        alert(`Failed to burn vacant accounts: ${error?.message || 'Please try again.'}`);
      }
    } finally {
      // Always reset the processing state
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

        // Add timeout to prevent long waits
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

        const response = await axios.get(`/api/rent-estimate/${publicKey.toString()}`, {
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
          setError('Request timed out - please reconnect your wallet and try again');
        } else if (err.response?.status === 404) {
          setError('Wallet address not found - please reconnect your wallet');
        } else {
          setError('Unable to fetch rent estimate - please reconnect your wallet');
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
    
    // Only tokens and NFTs return rent, not cNFTs (they don't have token accounts)
    const rentReturningAssets = selectedTokenCount + selectedNFTCount;
    const totalSelected = selectedTokenCount + selectedNFTCount + selectedCNFTCount;
    
    const selectedRent = rentReturningAssets * rentData.rentPerAccount;
    
    return {
      totalSelected,
      selectedTokenCount,
      selectedNFTCount,
      selectedCNFTCount,
      selectedRent,
      rentReturningAssets
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
          </div>
        ) : (
          <div className="total-estimate">
            <span className="estimate-label">Total Potential Return:</span>
            <span className="estimate-value">{rentData.totalRentEstimate.toFixed(4)} SOL</span>
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
            Each account returns {rentData.rentPerAccount.toFixed(4)} SOL when closed
            {selectedRentData && selectedRentData.totalSelected > 0 && (
              <span className="selection-note"> • Select assets to see live estimate</span>
            )}
          </small>
        </div>
        
        {/* Vacant Account Burning Section */}
        {rentData && rentData.vacantAccounts > 0 && (
          <div className="vacant-burn-section" style={{ marginTop: '15px', padding: '15px', border: '1px solid #444', borderRadius: '8px', backgroundColor: '#1a1a1a' }}>
            <div style={{ marginBottom: '10px' }}>
              <strong>🔥 Recover Rent from Vacant Accounts</strong>
            </div>
            <div style={{ marginBottom: '10px', fontSize: '14px', color: '#ccc' }}>
              Found {rentData.vacantAccounts} empty token accounts that can be closed to recover {rentData.breakdown.vacantRent.toFixed(4)} SOL
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button 
                key={`vacant-burn-${processId}`}
                className="vacant-burn-button"
                onClick={handleBurnVacantAccounts}
                disabled={isProcessing}
                style={{
                  padding: '10px 20px',
                  backgroundColor: isProcessing ? '#666' : '#ff6b35',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: isProcessing ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold'
                }}
              >
                {isProcessing ? 'Processing...' : `Burn ${rentData.vacantAccounts} Vacant Accounts`}
              </button>
              {isProcessing && (
                <button
                  onClick={resetProcessingState}
                  style={{
                    padding: '5px 10px',
                    backgroundColor: '#666',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px'
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