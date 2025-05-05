import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import axios from 'axios';

// Define the props interface
interface QueueTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedAssets: any[];
  wallet: any;
  onSuccess?: () => void;  // Optional callback for when transfer is successful
}

/**
 * QueueTransferModal component uses the server-side queue approach for reliable cNFT transfers
 * This completely new approach avoids proof validation issues by relying on the server's 
 * sequential processing queue
 */
const QueueTransferModal: React.FC<QueueTransferModalProps> = ({ 
  isOpen, 
  onClose, 
  selectedAssets,
  wallet,
  onSuccess
}) => {
  // State hooks for tracking transfer progress
  const [isProcessing, setIsProcessing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [currentStep, setCurrentStep] = useState<string>('initial');
  const [queueId, setQueueId] = useState<string | null>(null);
  const [queueStatus, setQueueStatus] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusPollingInterval, setStatusPollingInterval] = useState<any>(null);
  const [processingCount, setProcessingCount] = useState<number>(0);
  const [successCount, setSuccessCount] = useState<number>(0);
  const [failureCount, setFailureCount] = useState<number>(0);
  const [totalAssets] = useState<number>(selectedAssets.length);
  
  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (statusPollingInterval) {
        clearInterval(statusPollingInterval);
      }
    };
  }, [statusPollingInterval]);
  
  // Start the transfer process
  const initiateTransfer = async () => {
    if (!wallet.publicKey) {
      setError('Wallet not connected');
      return;
    }
    
    if (selectedAssets.length === 0) {
      setError('No assets selected for transfer');
      return;
    }
    
    try {
      setIsProcessing(true);
      setCurrentStep('creating_queue');
      
      // Create asset list for the server
      const assetList = selectedAssets.map(asset => ({
        assetId: asset.mint,
        name: asset.name,
        image: asset.image
      }));
      
      console.log('[QueueTransfer] Initiating queue-based transfer for assets:', assetList);
      
      // Create a new queue on the server
      const createResponse = await axios.post('/api/queue/create', {
        ownerAddress: wallet.publicKey.toString(),
        assets: assetList
      });
      
      if (!createResponse.data.success) {
        throw new Error(createResponse.data.error || 'Failed to create transfer queue');
      }
      
      const { queueId } = createResponse.data;
      setQueueId(queueId);
      console.log('[QueueTransfer] Queue created with ID:', queueId);
      
      // Start polling for status updates
      setCurrentStep('processing');
      startStatusPolling(queueId);
      
      // Get a message signature for authorization
      // We'll sign a message containing the queue ID to prove wallet ownership
      const message = `Authorize cNFT queue transfer: ${queueId}`;
      
      try {
        // Sign the message with the wallet
        const signMessageMethod = wallet.signMessage || wallet.adapter?.signMessage;
        
        if (!signMessageMethod) {
          console.error('[QueueTransfer] Wallet does not support signMessage');
          throw new Error('Your wallet does not support the required signing method');
        }
        
        // Convert message to Uint8Array for signing
        const messageBytes = new TextEncoder().encode(message);
        const signature = await signMessageMethod(messageBytes);
        
        // Convert signature to base64 for sending to server
        let signatureBase64;
        if (signature instanceof Uint8Array) {
          signatureBase64 = btoa(String.fromCharCode(...signature));
        } else {
          // Some wallets might return the signature in a different format
          signatureBase64 = signature;
        }
        
        // Now that we have the signature, authorize the queue
        const authorizeResponse = await axios.post('/api/queue/authorize', {
          queueId,
          ownerAddress: wallet.publicKey.toString(),
          signature: signatureBase64
        });
        
        if (!authorizeResponse.data.success) {
          throw new Error(authorizeResponse.data.error || 'Failed to authorize transfer queue');
        }
        
        console.log('[QueueTransfer] Queue authorized successfully');
      } catch (signError: any) {
        console.error('[QueueTransfer] Error during message signing:', signError);
        setError(`Signing failed: ${signError.message || 'Unknown error during signing'}`);
        setIsProcessing(false);
      }
    } catch (error: any) {
      console.error('[QueueTransfer] Error initiating transfer:', error);
      setError(error.message || 'An error occurred while initiating the transfer');
      setIsProcessing(false);
    }
  };
  
  // Poll for queue status updates
  const startStatusPolling = (queueId: string) => {
    // Clear any existing polling interval
    if (statusPollingInterval) {
      clearInterval(statusPollingInterval);
    }
    
    // Function to fetch queue status
    const fetchQueueStatus = async () => {
      try {
        const statusResponse = await axios.get(`/api/queue/status/${queueId}`);
        
        if (!statusResponse.data.success) {
          throw new Error(statusResponse.data.error || 'Failed to fetch queue status');
        }
        
        const status = statusResponse.data.status;
        setQueueStatus(status);
        console.log('[QueueTransfer] Queue status update:', status);
        
        // Update counts
        setProcessingCount(status.processing);
        setSuccessCount(status.completed);
        setFailureCount(status.failed);
        
        // Check if all assets have been processed
        if (status.isComplete) {
          clearInterval(statusPollingInterval);
          setIsComplete(true);
          setIsProcessing(false);
          setCurrentStep('complete');
          
          // Update window debug object with results
          if (typeof window !== 'undefined' && window.debugInfo) {
            window.debugInfo.lastCnftSuccess = status.completed > 0;
            window.debugInfo.lastCnftSignature = status.lastSignature || '';
            window.debugInfo.lastCnftAssumedSuccess = true;
            window.debugInfo.transferMethod = 'Server-side queue transfer';
          }
          
          // Create a confetti celebration if some transfers succeeded
          if (status.completed > 0 && typeof window !== 'undefined' && window.BurnAnimations) {
            window.BurnAnimations.createConfetti();
            window.BurnAnimations.showNotification(
              'cNFTs Trashed! 🎉',
              `Successfully trashed ${status.completed} cNFTs to the project wallet.`
            );
          }
          
          // Call the onSuccess callback if provided
          if (onSuccess && status.completed > 0) {
            setTimeout(() => {
              onSuccess();
            }, 2000); // Allow time for the UI to update before closing
          }
        }
      } catch (error: any) {
        console.error('[QueueTransfer] Error fetching queue status:', error);
        setError(error.message || 'An error occurred while checking transfer status');
      }
    };
    
    // Immediately fetch status once
    fetchQueueStatus();
    
    // Then set up polling every 2 seconds
    const interval = setInterval(fetchQueueStatus, 2000);
    setStatusPollingInterval(interval);
  };
  
  // Cancel the transfer process
  const cancelTransfer = async () => {
    if (queueId) {
      try {
        // Send cancel request to server
        await axios.post(`/api/queue/cancel/${queueId}`);
        
        // Clear polling
        if (statusPollingInterval) {
          clearInterval(statusPollingInterval);
        }
        
        console.log('[QueueTransfer] Transfer cancelled for queue:', queueId);
      } catch (error) {
        console.error('[QueueTransfer] Error cancelling transfer:', error);
      }
    }
    
    // Reset state and close modal
    setIsProcessing(false);
    setIsComplete(false);
    setQueueId(null);
    setQueueStatus(null);
    setError(null);
    onClose();
  };
  
  // Only render when modal is open
  if (!isOpen) return null;
  
  return (
    <div className="modal-overlay">
      <div className="modal-container">
        <div className="modal-header">
          <h2>Queued cNFT Trash Operation</h2>
          {!isProcessing && (
            <button className="close-button" onClick={onClose}>×</button>
          )}
        </div>
        
        <div className="modal-content">
          {error && (
            <div className="error-message">
              <p>Error: {error}</p>
              <button onClick={cancelTransfer}>Close</button>
            </div>
          )}
          
          {!error && (
            <div className="transfer-status">
              <div className="status-message">
                {currentStep === 'initial' && (
                  <>
                    <p>Ready to trash {selectedAssets.length} cNFTs to the project wallet.</p>
                    <p>This uses our new server-side queue system for increased reliability.</p>
                    <div className="modal-actions">
                      <button 
                        className="primary-button"
                        onClick={initiateTransfer}
                        disabled={isProcessing}
                      >
                        Start Transfer
                      </button>
                      <button 
                        className="secondary-button"
                        onClick={onClose}
                        disabled={isProcessing}
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                )}
                
                {currentStep === 'creating_queue' && (
                  <>
                    <p>Creating transfer queue...</p>
                    <div className="loading-spinner"></div>
                  </>
                )}
                
                {currentStep === 'processing' && (
                  <>
                    <p>Processing cNFT transfers sequentially...</p>
                    <div className="progress-bar">
                      <div 
                        className="progress-bar-fill"
                        style={{
                          width: `${((successCount + failureCount) / totalAssets) * 100}%`
                        }}
                      ></div>
                    </div>
                    <div className="status-counts">
                      <div className="status-count">
                        <span className="count-label">Pending:</span>
                        <span className="count-value">
                          {totalAssets - (successCount + failureCount + processingCount)}
                        </span>
                      </div>
                      <div className="status-count">
                        <span className="count-label">Processing:</span>
                        <span className="count-value">{processingCount}</span>
                      </div>
                      <div className="status-count">
                        <span className="count-label">Successful:</span>
                        <span className="count-value success">{successCount}</span>
                      </div>
                      <div className="status-count">
                        <span className="count-label">Failed:</span>
                        <span className="count-value error">{failureCount}</span>
                      </div>
                    </div>
                    
                    <button 
                      className="secondary-button"
                      onClick={cancelTransfer}
                    >
                      Cancel Transfer
                    </button>
                  </>
                )}
                
                {currentStep === 'complete' && (
                  <>
                    <h3>Transfer Complete!</h3>
                    <p>
                      Successfully trashed {successCount} out of {totalAssets} cNFTs.
                      {failureCount > 0 && ` (${failureCount} failed)`}
                    </p>
                    
                    {queueStatus && queueStatus.completedAssets && queueStatus.completedAssets.length > 0 && (
                      <div className="asset-list">
                        <h4>Successfully Trashed:</h4>
                        <ul>
                          {queueStatus.completedAssets.map((asset: any, index: number) => (
                            <li key={index}>
                              {asset.name || asset.assetId.substring(0, 8) + '...'}
                              {asset.signature && (
                                <a 
                                  href={`https://explorer.solana.com/tx/${asset.signature}`} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="explorer-link"
                                >
                                  View
                                </a>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {queueStatus && queueStatus.failedAssets && queueStatus.failedAssets.length > 0 && (
                      <div className="asset-list">
                        <h4>Failed Transfers:</h4>
                        <ul>
                          {queueStatus.failedAssets.map((asset: any, index: number) => (
                            <li key={index}>
                              {asset.name || asset.assetId.substring(0, 8) + '...'}
                              {asset.error && <span className="error-reason">({asset.error})</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    <button className="primary-button" onClick={onClose}>
                      Close
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default QueueTransferModal;