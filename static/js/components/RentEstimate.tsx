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

const RentEstimate: React.FC = () => {
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
        <div className="total-estimate">
          <span className="estimate-label">Total Potential Return:</span>
          <span className="estimate-value">{rentData.totalRentEstimate.toFixed(4)} SOL</span>
        </div>
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
            Each token account returns {rentData.rentPerAccount.toFixed(4)} SOL when closed
          </small>
        </div>
      </div>
    </div>
  );
};

export default RentEstimate;