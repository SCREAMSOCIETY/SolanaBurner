import React, { useState } from 'react';
import axios from 'axios';

interface DirectTrashModalProps {
  isOpen: boolean;
  onClose: () => void;
  assetId: string;
  assetName: string;
  onSuccess: (signature: string) => void;
  onError: (error: string) => void;
}

const DirectTrashModal: React.FC<DirectTrashModalProps> = ({
  isOpen,
  onClose,
  assetId,
  assetName,
  onSuccess,
  onError
}) => {
  const [privateKey, setPrivateKey] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  
  if (!isOpen) return null;
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!privateKey.trim()) {
      setStatusMessage('Please enter your private key');
      return;
    }
    
    setIsSubmitting(true);
    setStatusMessage('Processing transfer...');
    
    try {
      // Call the direct transfer API
      const response = await axios.post('/api/cnft/direct-transfer', {
        encoded_private_key: privateKey.trim(),
        asset_id: assetId
      });
      
      if (response.data.success) {
        setStatusMessage('Transfer successful!');
        onSuccess(response.data.signature || 'Unknown');
      } else {
        setStatusMessage(`Transfer failed: ${response.data.error || 'Unknown error'}`);
        onError(response.data.error || 'Unknown error');
      }
    } catch (err: unknown) {
      console.error('Error in direct transfer:', err);
      let errorMessage = 'Unknown error occurred';
      
      if (err && typeof err === 'object') {
        const error = err as any;
        if (error.response?.data?.error) {
          errorMessage = error.response.data.error;
        } else if (error.message) {
          errorMessage = error.message;
        }
      }
      
      setStatusMessage(`Error: ${errorMessage}`);
      onError(errorMessage);
    } finally {
      setIsSubmitting(false);
      // Clear private key for security
      setPrivateKey('');
    }
  };
  
  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h3>Trash cNFT using Direct Method</h3>
          <button className="close-button" onClick={onClose}>&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="info-text">
            <p>To trash <strong>{assetName || assetId}</strong>, enter your wallet's private key (in base58 format).</p>
            <p><strong>Security note:</strong> Your private key is only used for this transaction and is never stored.</p>
          </div>
          
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="private-key">Private Key (Base58 format)</label>
              <input
                type="password"
                id="private-key"
                className="form-control"
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                disabled={isSubmitting}
                placeholder="Enter your wallet's private key"
                required
              />
            </div>
            
            {statusMessage && (
              <div className={`status-message ${
                statusMessage.includes('successful') ? 'success' : 
                statusMessage.includes('Error') || statusMessage.includes('failed') ? 'error' : 'info'
              }`}>
                {statusMessage}
              </div>
            )}
            
            <div className="modal-footer">
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="btn btn-primary" 
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <span className="spinner"></span>
                    Processing...
                  </>
                ) : (
                  'Trash cNFT'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default DirectTrashModal;