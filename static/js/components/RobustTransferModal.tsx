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
  const [privateKey, setPrivateKey] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [showPrivateKey, setShowPrivateKey] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');

  // Clear state when modal opens or closes
  useEffect(() => {
    if (isOpen) {
      setPrivateKey('');
      setError(null);
      setIsLoading(false);
      setPublicKey(null);
      setShowPrivateKey(false);
      setStatusMessage('');
    }
  }, [isOpen]);

  // Update public key when private key changes
  useEffect(() => {
    if (privateKey && isValidPrivateKey(privateKey)) {
      const pubKey = getPublicKeyFromPrivate(privateKey);
      setPublicKey(pubKey);
      setError(null);
    } else if (privateKey) {
      setPublicKey(null);
      setError('Invalid private key format');
    }
  }, [privateKey]);

  // Handle private key input change
  const handlePrivateKeyChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrivateKey(e.target.value.trim());
  };

  // Toggle private key visibility
  const togglePrivateKeyVisibility = () => {
    setShowPrivateKey(prev => !prev);
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate private key
    if (!privateKey || !isValidPrivateKey(privateKey)) {
      setError('Please enter a valid private key');
      return;
    }
    
    // Reset error state
    setError(null);
    setIsLoading(true);
    setStatusMessage('Initiating robust transfer...');
    
    try {
      // Execute the robust transfer
      const result = await executeRobustTransfer(privateKey, assetId);
      
      if (result.success) {
        setStatusMessage('Transfer successful! Redirecting...');
        // Notify parent component of success
        onSuccess(result.signature, result.explorerUrl);
        
        // Close modal after a short delay
        setTimeout(() => {
          onClose();
        }, 2000);
      } else {
        setError(result.error || 'Transfer failed');
        setIsLoading(false);
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
      setIsLoading(false);
    }
  };

  // If modal is not open, don't render anything
  if (!isOpen) return null;

  return (
    <div className="robust-transfer-modal-overlay">
      <div className="robust-transfer-modal">
        <div className="robust-transfer-modal-header">
          <h2>Robust Transfer Mode</h2>
          <button className="close-button" onClick={onClose} disabled={isLoading}>✕</button>
        </div>
        
        <div className="robust-transfer-modal-content">
          <div className="asset-info">
            <div className="asset-image-container">
              <img src={assetImage || '/default-nft-image.svg'} alt={assetName} className="asset-image" />
            </div>
            <div className="asset-details">
              <h3>{assetName || 'Unnamed NFT'}</h3>
              <p className="asset-id">{assetId}</p>
            </div>
          </div>
          
          <div className="robust-transfer-description">
            <p>
              This is a fallback transfer method for problematic cNFTs that have incomplete
              proof data. It uses a server-side approach to handle the transfer more reliably.
            </p>
            <p>
              <strong>Note:</strong> For security reasons, this method requires you to
              manually enter your wallet's private key. Your key is only used for this
              specific transfer and is never stored or saved.
            </p>
          </div>
          
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="privateKey">Your Wallet's Private Key:</label>
              <div className="private-key-input-container">
                <textarea
                  id="privateKey"
                  value={privateKey}
                  onChange={handlePrivateKeyChange}
                  placeholder="Enter your wallet's private key"
                  className={`private-key-input ${showPrivateKey ? "" : "password-field"}`}
                  style={{WebkitTextSecurity: showPrivateKey ? 'none' : 'disc'}}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  className="toggle-visibility-button"
                  onClick={togglePrivateKeyVisibility}
                  disabled={isLoading}
                >
                  {showPrivateKey ? "Hide" : "Show"}
                </button>
              </div>
              {publicKey && (
                <div className="public-key-display">
                  <span>Wallet: {publicKey}</span>
                </div>
              )}
            </div>
            
            {error && <div className="error-message">{error}</div>}
            
            {statusMessage && <div className="status-message">{statusMessage}</div>}
            
            <div className="modal-footer">
              <button
                type="button"
                className="cancel-button"
                onClick={onClose}
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="submit-button"
                disabled={isLoading || !isValidPrivateKey(privateKey)}
              >
                {isLoading ? "Processing..." : "Transfer to Project Wallet"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default RobustTransferModal;