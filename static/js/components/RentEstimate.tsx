import React, { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import axios from 'axios';

interface RentEstimateData {
  totalAccounts: number;
  nftAccounts: number;
  tokenAccounts: number;
  rentPerAccount: number;
  totalRentEstimate: number;
  breakdown: {
    nftRent: number;
    tokenRent: number;
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
  const { publicKey } = useWallet();
  const [rentData, setRentData] = useState<RentEstimateData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        </div>
        <div className="rent-details">
          <small>
            Each account returns {rentData.rentPerAccount.toFixed(4)} SOL when closed
            {selectedRentData && selectedRentData.totalSelected > 0 && (
              <span className="selection-note"> • Select assets to see live estimate</span>
            )}
          </small>
        </div>
      </div>
    </div>
  );
};

export default RentEstimate;