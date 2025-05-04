import React, { useState, useEffect } from 'react';
import { executeRobustTransfer, isValidPrivateKey, getPublicKeyFromPrivate } from '../robust-transfer';

// Import necessary CSS for the modal
import '../../robust-transfer-modal.css';

interface RobustTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  assetId: string;
  assetName: string;
  assetImage: string;
  onSuccess: (signature: string, explorerUrl: string) => void;
  onError: (error: string) => void;
}

/**
 * A modal component for robust cNFT transfers
 * This is used as a fallback when standard transfers fail and provides
 * a direct server-side approach for transferring problematic cNFTs
 */
const RobustTransferModal: React.FC<RobustTransferModalProps> = ({
  isOpen,
  onClose,
  assetId,
  assetName,
  assetImage,
  onSuccess,
  onError
}) => {
  const [privateKey, setPrivateKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusType, setStatusType] = useState<'error' | 'success' | 'processing'>('processing');
  const [explorerUrl, setExplorerUrl] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [isValid, setIsValid] = useState(false);
  
  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setPrivateKey('');
      setStatusMessage('');
      setIsLoading(false);
      setExplorerUrl('');
      setPublicKey('');
      setIsValid(false);
    }
  }, [isOpen]);
  
  // Validate private key as user types
  useEffect(() => {
    if (!privateKey) {
      setIsValid(false);
      setPublicKey('');
      return;
    }
    
    const valid = isValidPrivateKey(privateKey);
    setIsValid(valid);
    
    if (valid) {
      try {
        const pubKey = getPublicKeyFromPrivate(privateKey);
        setPublicKey(pubKey);
      } catch (error) {
        setPublicKey('');
      }
    } else {
      setPublicKey('');
    }
  }, [privateKey]);
  
  const handleTransfer = async () => {
    if (!isValid) return;
    
    setIsLoading(true);
    setStatusType('processing');
    setStatusMessage('Processing transfer...');
    
    try {
      const result = await executeRobustTransfer(privateKey, assetId);
      
      if (result && typeof result === 'object' && 'success' in result && result.success) {
        setStatusType('success');
        setStatusMessage('Successfully transferred cNFT to project wallet.');
        
        if ('explorerUrl' in result) {
          setExplorerUrl(result.explorerUrl as string);
        }
        
        // Notify parent of success
        if ('signature' in result && 'explorerUrl' in result) {
          onSuccess(result.signature as string, result.explorerUrl as string);
        }
      } else {
        setStatusType('error');
        const errorMsg = (result && typeof result === 'object' && 'error' in result) 
          ? (result.error as string) 
          : 'Failed to transfer cNFT.';
        setStatusMessage(errorMsg);
        onError(errorMsg);
      }
    } catch (error: any) {
      console.error('Transfer error:', error);
      setStatusType('error');
      const errorMsg = error && error.message ? error.message : 'An unexpected error occurred.';
      setStatusMessage(errorMsg);
      onError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="robust-transfer-modal">
      <div className="robust-transfer-container">
        <div className="robust-modal-header">
          <h2>Advanced cNFT Trash</h2>
          <button className="robust-modal-close" onClick={onClose} disabled={isLoading}>×</button>
        </div>
        
        <div className="robust-modal-content">
          <div className="robust-asset-info">
            <img
              src={assetImage || '../../default-nft-image.svg'}
              alt={assetName}
              className="robust-asset-image"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = '../../default-nft-image.svg';
              }}
            />
            <div className="robust-asset-details">
              <div className="robust-asset-name">{assetName || 'Unknown cNFT'}</div>
              <div className="robust-asset-id">{assetId}</div>
            </div>
          </div>
          
          <div className="robust-explanation">
            <p>
              This cNFT requires an advanced transfer method due to its structure. 
              To proceed, please enter your wallet's private key. This key will only be 
              used for this transaction and never stored.
            </p>
          </div>
          
          <div className="robust-input-group">
            <label htmlFor="privateKey">Enter your wallet's private key (Secret Key):</label>
            <input
              type="password"
              id="privateKey"
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              placeholder="Enter your private key (base58 encoded)"
              disabled={isLoading}
            />
          </div>
          
          {publicKey && (
            <div className="robust-input-group">
              <label>Wallet Address:</label>
              <div style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: '#46aaff', wordBreak: 'break-all' }}>
                {publicKey}
              </div>
            </div>
          )}
          
          {statusMessage && (
            <div className={`robust-status ${statusType}`}>
              {statusMessage}
              {statusType === 'success' && explorerUrl && (
                <a 
                  href={explorerUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="robust-explorer-link"
                >
                  View on explorer
                </a>
              )}
            </div>
          )}
        </div>
        
        <div className="robust-buttons">
          <button 
            className="robust-cancel-button"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            className="robust-transfer-button"
            onClick={handleTransfer}
            disabled={!isValid || isLoading}
          >
            {isLoading ? (
              <>
                <span className="robust-loader"></span>
                Processing...
              </>
            ) : (
              'Confirm Trash'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RobustTransferModal;