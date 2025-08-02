import React, { useState, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import axios from 'axios';

interface CNFTBurnModalProps {
  isOpen: boolean;
  onClose: () => void;
  assetId: string;
  assetName: string;
  assetImage: string;
  onSuccess: (result: any) => void;
  onError: (error: string) => void;
}

/**
 * CNFTBurnModal - Real cNFT burning interface
 * Uses the actual cnft-burn-server for proper on-chain burning (when tree authority is available)
 * or simulation mode (when tree authority is not available)
 */
const CNFTBurnModal: React.FC<CNFTBurnModalProps> = ({
  isOpen,
  onClose,
  assetId,
  assetName,
  assetImage,
  onSuccess,
  onError
}) => {
  const { publicKey, signMessage } = useWallet();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [processingStatus, setProcessingStatus] = useState('');
  const [burnResult, setBurnResult] = useState<any>(null);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setIsLoading(false);
      setError('');
      setProcessingStatus('');
      setBurnResult(null);
    }
  }, [isOpen]);

  const handleBurn = async () => {
    try {
      setIsLoading(true);
      setError('');
      setProcessingStatus('Preparing cNFT burn...');

      if (!publicKey || !signMessage) {
        throw new Error('Wallet not connected or does not support message signing');
      }

      // Create authorization message
      const message = `I authorize the burning of my cNFT with ID ${assetId}`;
      setProcessingStatus('Please sign the authorization message...');

      // Sign the message
      const messageBytes = new TextEncoder().encode(message);
      const signature = await signMessage(messageBytes);
      const signedMessage = Array.from(signature);

      setProcessingStatus('Processing burn request...');

      // Call the real cNFT burning endpoint
      const response = await axios.post('/api/cnft/burn-request', {
        ownerAddress: publicKey.toString(),
        assetId: assetId,
        signedMessage: signedMessage
      });

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to burn cNFT');
      }

      const result = response.data;
      setBurnResult(result);

      if (result.isSimulated) {
        setProcessingStatus('✨ Burn simulation completed successfully');
        setError(`Note: This was a simulation because tree authority permissions are required for actual cNFT burning. In production, only collection creators can burn cNFTs.`);
      } else {
        setProcessingStatus('🔥 cNFT successfully burned on-chain!');
      }

      // Call success callback
      onSuccess(result);

    } catch (err: any) {
      console.error('Error burning cNFT:', err);
      const errorMessage = err.response?.data?.error || err.message || 'Failed to burn cNFT';
      setError(errorMessage);
      onError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setBurnResult(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content cnft-burn-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>🔥 Burn Compressed NFT</h3>
          <button className="close-button" onClick={handleClose} disabled={isLoading}>×</button>
        </div>

        <div className="modal-body">
          {/* Asset Preview */}
          <div className="asset-preview">
            <img 
              src={assetImage || '/default-nft-image.svg'} 
              alt={assetName} 
              className="asset-image"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/default-nft-image.svg';
              }}
            />
            <div className="asset-info">
              <h4>{assetName || 'Compressed NFT'}</h4>
              <p className="asset-id">ID: {assetId?.slice(0, 8)}...{assetId?.slice(-8)}</p>
            </div>
          </div>

          {/* Warning Notice */}
          <div className="burn-notice">
            <h4>⚠️ Important Information</h4>
            <ul>
              <li><strong>No Rent Recovery:</strong> cNFTs don't have token accounts, so no SOL will be recovered</li>
              <li><strong>Permanent Action:</strong> Burned cNFTs cannot be recovered</li>
              <li><strong>Tree Authority:</strong> Actual burning requires collection creator permissions</li>
            </ul>
          </div>

          {/* Status Display */}
          {processingStatus && (
            <div className="processing-status">
              <p>{processingStatus}</p>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="error-message">
              <p>{error}</p>
            </div>
          )}

          {/* Success Result */}
          {burnResult && (
            <div className="burn-result">
              {burnResult.isSimulated ? (
                <div className="simulation-result">
                  <h4>✨ Simulation Complete</h4>
                  <p>Simulation ID: {burnResult.simulationId}</p>
                  <p>This demonstrates what would happen with proper tree authority permissions.</p>
                </div>
              ) : (
                <div className="success-result">
                  <h4>🔥 Burn Successful!</h4>
                  <p>Transaction: <a href={burnResult.explorerUrl} target="_blank" rel="noopener noreferrer">
                    {burnResult.signature?.slice(0, 8)}...{burnResult.signature?.slice(-8)}
                  </a></p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          {!burnResult ? (
            <>
              <button 
                className="btn btn-secondary" 
                onClick={handleClose}
                disabled={isLoading}
              >
                Cancel
              </button>
              <button 
                className="btn btn-danger" 
                onClick={handleBurn}
                disabled={isLoading || !publicKey}
              >
                {isLoading ? 'Processing...' : '🔥 Burn cNFT'}
              </button>
            </>
          ) : (
            <button 
              className="btn btn-primary" 
              onClick={handleClose}
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CNFTBurnModal;