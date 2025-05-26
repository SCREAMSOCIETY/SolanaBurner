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
  const { publicKey, signMessage } = useWallet();
  const [rentData, setRentData] = useState<RentEstimateData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const fetchRentEstimate = async () => {
      if (!publicKey) return;

      try {
        setLoading(true);
        setError(null);

        const response = await axios.get(`/api/rent-estimate/${publicKey.toString()}`);
        
        if (response.data && response.data.success) {
          setRentData(response.data.data);
        } else {
          setError('Failed to calculate rent estimate');
        }
      } catch (err: any) {
        console.error('Error fetching rent estimate:', err);
        setError('Unable to fetch rent estimate');
      } finally {
        setLoading(false);
      }
    };

    fetchRentEstimate();
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
            <button 
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
          </div>
        )}
      </div>
    </div>
  );
  
  const handleBurnVacantAccounts = async () => {
    if (!publicKey || !signMessage) {
      alert('Please connect your wallet first');
      return;
    }
    
    setIsProcessing(true);
    try {
      // Sign a message to authorize the vacant account burning
      const message = "Burn vacant accounts to recover rent";
      const messageBytes = new TextEncoder().encode(message);
      const signature = await signMessage(messageBytes);
      const signedMessage = Buffer.from(signature).toString('base64');
      
      // Call the server endpoint to identify vacant accounts
      const response = await fetch('/api/burn-vacant-accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ownerAddress: publicKey.toString(),
          signedMessage: signedMessage
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        if (result.accountCount > 0) {
          alert(`Found ${result.accountCount} vacant accounts that can recover ${result.potentialRentRecovery.toFixed(4)} SOL.\n\nNote: You'll need to use your wallet (like Phantom or Solflare) to close these empty token accounts to actually recover the rent.`);
          // Optionally refresh the rent data after processing
          window.location.reload();
        } else {
          alert('No vacant accounts found to burn.');
        }
      } else {
        alert(`Error: ${result.error || 'Failed to process vacant accounts'}`);
      }
    } catch (error) {
      console.error('Error processing vacant accounts:', error);
      alert('Failed to process vacant accounts. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };
};

export default RentEstimate;