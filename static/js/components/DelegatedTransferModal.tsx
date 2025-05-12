import React, { useState, useCallback, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { 
  transferCnftViaHelius, 
  signTransferMessage 
} from '../helius-cnft-transfer';
import '../delegated-transfer-modal.css';

interface DelegatedTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  assetId: string;
  assetName: string;
  assetImage?: string;
  onSuccess?: (result: any) => void;
}

/**
 * DelegatedTransferModal
 * 
 * A modal for transferring cNFTs using the delegated transfer approach
 * with direct Helius API integration
 */
const DelegatedTransferModal: React.FC<DelegatedTransferModalProps> = ({
  isOpen,
  onClose,
  assetId,
  assetName,
  assetImage,
  onSuccess
}) => {
  const { publicKey, signMessage } = useWallet();
  const [status, setStatus] = useState<'idle' | 'signing' | 'processing' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [signature, setSignature] = useState<string | null>(null);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setStatus('idle');
      setError(null);
      setResult(null);
      setSignature(null);
    }
  }, [isOpen]);

  // Handle successful transfer
  useEffect(() => {
    if (result && result.success && onSuccess) {
      onSuccess(result);
    }
  }, [result, onSuccess]);

  const handleTransfer = useCallback(async () => {
    if (!publicKey || !signMessage) {
      setError('Wallet connection required');
      return;
    }

    try {
      setStatus('signing');
      
      // Sign the message
      const signedMessage = await signTransferMessage({
        publicKey,
        signMessage
      }, assetId);
      
      setSignature(signedMessage);
      setStatus('processing');
      
      // Perform the transfer
      const transferResult = await transferCnftViaHelius({
        sender: publicKey.toString(),
        assetId,
        signedMessage
      });
      
      setResult(transferResult);
      
      if (transferResult.success) {
        setStatus('success');
      } else {
        setStatus('error');
        setError(transferResult.error || 'Transfer failed');
      }
    } catch (err: any) {
      console.error('Error in delegated transfer:', err);
      setStatus('error');
      setError(err.message || 'Unknown error during transfer');
    }
  }, [publicKey, signMessage, assetId]);

  // Don't render anything if modal is closed
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="delegated-transfer-modal">
        <div className="modal-header">
          <h2>Trash cNFT: {assetName}</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-content">
          {assetImage && (
            <div className="asset-preview">
              <img 
                src={assetImage} 
                alt={assetName} 
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/static/default-nft-image.svg';
                }} 
              />
            </div>
          )}
          
          <div className="transfer-info">
            <p>
              This will move your cNFT to a trash collection wallet. 
              This operation cannot be undone.
            </p>
            
            <div className="status-container">
              {status === 'idle' && (
                <button 
                  className="primary-button" 
                  onClick={handleTransfer}
                  disabled={!publicKey}
                >
                  Trash cNFT
                </button>
              )}
              
              {status === 'signing' && (
                <div className="status-message">
                  <div className="spinner"></div>
                  <p>Please sign the message with your wallet...</p>
                </div>
              )}
              
              {status === 'processing' && (
                <div className="status-message">
                  <div className="spinner"></div>
                  <p>Processing transfer...</p>
                </div>
              )}
              
              {status === 'success' && (
                <div className="status-message success">
                  <div className="success-icon">✓</div>
                  <p>cNFT successfully trashed!</p>
                  {result && result.signature && (
                    <a
                      href={`https://solscan.io/tx/${result.signature}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="explorer-link"
                    >
                      View on Solscan
                    </a>
                  )}
                </div>
              )}
              
              {status === 'error' && (
                <div className="status-message error">
                  <div className="error-icon">✗</div>
                  <p>Error: {error || 'Unknown error'}</p>
                  <button
                    className="secondary-button"
                    onClick={() => {
                      setStatus('idle');
                      setError(null);
                    }}
                  >
                    Try Again
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          {status !== 'success' && (
            <button 
              className="secondary-button"
              onClick={onClose}
            >
              Cancel
            </button>
          )}
          
          {status === 'success' && (
            <button 
              className="primary-button"
              onClick={onClose}
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DelegatedTransferModal;