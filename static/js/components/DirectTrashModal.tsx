import React, { useState, useEffect } from 'react';
import * as web3 from '@solana/web3.js';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import RobustTransferModal from './RobustTransferModal';

interface DirectTrashModalProps {
  isOpen: boolean;
  onClose: () => void;
  assetId: string;
  assetName: string;
  assetImage: string;
  onSuccess: (signature: string, explorerUrl: string) => void;
  onError: (error: string) => void;
}

/**
 * Modal component that offers multiple options for trashing a cNFT
 * Includes standard method and robust fallback method for problematic cNFTs
 */
const DirectTrashModal: React.FC<DirectTrashModalProps> = ({
  isOpen,
  onClose,
  assetId,
  assetName,
  assetImage,
  onSuccess,
  onError
}) => {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [processingStatus, setProcessingStatus] = useState('');
  const [isRobustModalOpen, setIsRobustModalOpen] = useState(false);
  const [method, setMethod] = useState<'standard' | 'robust'>('standard');
  
  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setIsLoading(false);
      setError('');
      setProcessingStatus('');
      setMethod('standard');
      setIsRobustModalOpen(false);
    }
  }, [isOpen]);
  
  // Standard cNFT trash method
  const handleStandardTrash = async () => {
    try {
      setMethod('standard');
      setIsLoading(true);
      setProcessingStatus('Preparing transfer...');
      
      // Check if wallet is connected
      if (!publicKey || !signTransaction) {
        throw new Error('Wallet not connected or does not support signing');
      }
      
      setProcessingStatus('Fetching asset details...');
      
      // Get asset details and proof
      const response = await fetch(`/api/burn-cnft/${assetId}`);
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch asset details');
      }
      
      setProcessingStatus('Creating transfer transaction...');
      
      // Use browser-side transfer (working-cnft-transfer.js)
      const WorkingCnftTransfer = (window as any).WorkingCnftTransfer;
      if (WorkingCnftTransfer && typeof WorkingCnftTransfer.transferCnft === 'function') {
        setProcessingStatus('Sending asset to trash...');
        
        const result = await WorkingCnftTransfer.transferCnft(assetId);
        
        if (result.success) {
          setProcessingStatus('Transfer complete!');
          onSuccess(result.signature, result.explorerUrl);
        } else {
          throw new Error(result.error || 'Transfer failed');
        }
      } else {
        throw new Error('Working CNFT transfer module not available');
      }
    } catch (err: any) {
      console.error('Standard trash error:', err);
      setError(err.message || 'Unknown error during transfer');
      onError(err.message || 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Open the robust modal for problematic cNFTs
  const handleRobustTrash = () => {
    setMethod('robust');
    setIsRobustModalOpen(true);
  };
  
  // Handle success from robust modal
  const handleRobustSuccess = (signature: string, explorerUrl: string) => {
    setIsRobustModalOpen(false);
    onSuccess(signature, explorerUrl);
  };
  
  // Handle error from robust modal
  const handleRobustError = (error: string) => {
    setIsRobustModalOpen(false);
    setError(error);
    onError(error);
  };
  
  // Close the robust modal
  const handleRobustClose = () => {
    setIsRobustModalOpen(false);
  };
  
  if (!isOpen) return null;
  
  return (
    <>
      <div className="modal-overlay">
        <div className="modal-container direct-trash-modal">
          <div className="modal-header">
            <h2>Send cNFT to Trash</h2>
            <button className="close-button" onClick={onClose}>×</button>
          </div>
          
          <div className="modal-content">
            <div className="asset-info-card">
              <div className="asset-image-container">
                <img 
                  src={assetImage || '/static/default-nft-image.svg'} 
                  alt={assetName || 'NFT'} 
                  className="asset-image"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = '/static/default-nft-image.svg';
                  }}
                />
              </div>
              <div className="asset-details">
                <h3>{assetName || 'Unnamed NFT'}</h3>
                <p className="asset-id">{assetId}</p>
              </div>
            </div>
            
            {error && (
              <div className="error-message">
                <p>{error}</p>
                <p className="error-suggestion">
                  If the standard method fails, please try the robust method.
                </p>
              </div>
            )}
            
            {isLoading && (
              <div className="loading-indicator">
                <div className="spinner"></div>
                <p>{processingStatus}</p>
              </div>
            )}
            
            <div className="method-selection">
              <div className={`method-card ${method === 'standard' ? 'selected' : ''}`} onClick={() => setMethod('standard')}>
                <h3>Standard Method</h3>
                <p>Fast and efficient for most cNFTs.</p>
                <div className="method-badge">Recommended</div>
              </div>
              
              <div className={`method-card ${method === 'robust' ? 'selected' : ''}`} onClick={() => setMethod('robust')}>
                <h3>Robust Method</h3>
                <p>Try this if the standard method fails.</p>
                <div className="method-badge alternative">Alternative</div>
              </div>
            </div>
            
            <div className="info-box">
              <p>
                This will send the cNFT to our project wallet instead of burning it.
                The transfer is irreversible, so please make sure you want to discard this NFT.
              </p>
            </div>
          </div>
          
          <div className="modal-footer">
            <button
              className="primary-button"
              onClick={method === 'standard' ? handleStandardTrash : handleRobustTrash}
              disabled={isLoading}
            >
              {method === 'standard' ? 'Send to Trash' : 'Try Robust Method'}
            </button>
            
            <button
              className="secondary-button"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
      
      {isRobustModalOpen && (
        <RobustTransferModal
          isOpen={isRobustModalOpen}
          onClose={handleRobustClose}
          assetId={assetId}
          assetName={assetName}
          onSuccess={handleRobustSuccess}
          onError={handleRobustError}
        />
      )}
    </>
  );
};

export default DirectTrashModal;