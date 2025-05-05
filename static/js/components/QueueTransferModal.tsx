import React, { useState, useEffect, useRef } from 'react';
import '../queue-transfer-modal.css';

interface QueueTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedAssets: any[];
  wallet: any;
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
  wallet
}) => {
  const [status, setStatus] = useState<'idle' | 'queuing' | 'queued' | 'error'>('idle');
  const [batchId, setBatchId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [batchStatus, setBatchStatus] = useState<any>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  
  // Use useRef instead of useState for the interval to avoid TypeScript issues
  const intervalRef = useRef<number | null>(null);

  // Reset state when modal opens or assets change
  useEffect(() => {
    if (isOpen) {
      setStatus('idle');
      setBatchId(null);
      setStatusMessage('');
      setBatchStatus(null);
      setErrorDetails(null);
    }
  }, [isOpen, selectedAssets]);

  // Clean up polling interval when component unmounts
  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  // Start polling for batch status when we get a batchId
  useEffect(() => {
    // Clean up any existing interval first
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    if (batchId && status === 'queued') {
      // Start polling every 3 seconds
      intervalRef.current = window.setInterval(() => {
        fetchBatchStatus(batchId);
      }, 3000);
      
      // Initial fetch
      fetchBatchStatus(batchId);
      
      // Clean up on unmount or when dependencies change
      return () => {
        if (intervalRef.current !== null) {
          window.clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    }
  }, [batchId, status]);

  // Fetch status of a batch
  const fetchBatchStatus = async (id: string) => {
    try {
      const response = await fetch(`/api/queue/status/${id}`);
      const data = await response.json();
      
      if (data.success) {
        setBatchStatus(data);
        
        // Update status message based on progress
        if (data.status === 'completed') {
          // Clear the interval if the batch is complete
          if (intervalRef.current !== null) {
            window.clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          
          const successCount = data.stats.succeeded;
          const failedCount = data.stats.failed;
          const total = data.stats.total;
          
          if (successCount === total) {
            setStatusMessage(`All ${total} assets have been successfully processed!`);
          } else {
            setStatusMessage(`Processing complete: ${successCount} succeeded, ${failedCount} failed out of ${total} total assets.`);
          }
        } else {
          const processed = data.stats.processed;
          const total = data.stats.total;
          setStatusMessage(`Processing assets: ${processed} of ${total} complete...`);
        }
      } else {
        setStatusMessage(`Error checking status: ${data.error}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setStatusMessage(`Error fetching batch status: ${errorMessage}`);
    }
  };

  // Queue the selected assets for transfer
  const queueTransfer = async () => {
    if (!wallet?.publicKey || selectedAssets.length === 0) {
      setStatus('error');
      setStatusMessage('Wallet not connected or no assets selected.');
      return;
    }
    
    try {
      setStatus('queuing');
      setStatusMessage('Preparing assets for queue...');
      
      const assetIds = selectedAssets.map(asset => asset.id);
      
      const response = await fetch('/api/queue/transfer-batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ownerAddress: wallet.publicKey.toString(),
          assetIds
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        setStatus('queued');
        setBatchId(result.batchId);
        setStatusMessage(`Successfully queued ${selectedAssets.length} assets for transfer! Batch ID: ${result.batchId}`);
      } else {
        setStatus('error');
        setStatusMessage('Failed to queue transfer');
        setErrorDetails(result.error || result.message || 'Unknown error');
      }
    } catch (error) {
      setStatus('error');
      setStatusMessage('Error queuing transfer');
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setErrorDetails(errorMessage);
    }
  };

  // Get progress percentage for the progress bar
  const getProgressPercentage = () => {
    if (!batchStatus) return 0;
    
    const { processed, total } = batchStatus.stats;
    if (total === 0) return 0;
    
    return Math.round((processed / total) * 100);
  };

  // Calculate estimated time remaining
  const getEstimatedTimeRemaining = () => {
    if (!batchStatus) return 'Calculating...';
    
    const { processed, total, pending } = batchStatus.stats;
    
    if (processed === 0 || pending === 0) return 'Calculating...';
    
    // Estimate based on average time per item so far
    const startTime = batchStatus.startedAt;
    const currentTime = Date.now();
    const elapsedTime = currentTime - startTime;
    
    const timePerItem = elapsedTime / processed;
    const estimatedRemainingTime = timePerItem * pending;
    
    // Format as minutes and seconds
    const minutes = Math.floor(estimatedRemainingTime / 60000);
    const seconds = Math.floor((estimatedRemainingTime % 60000) / 1000);
    
    return `${minutes}m ${seconds}s remaining`;
  };

  if (!isOpen) return null;

  return (
    <div className="queue-transfer-modal-overlay">
      <div className="queue-transfer-modal">
        <div className="queue-transfer-modal-header">
          <h2>Queue Asset Transfer</h2>
          <button className="queue-transfer-modal-close" onClick={onClose}>×</button>
        </div>
        
        <div className="queue-transfer-modal-content">
          {status === 'idle' && (
            <>
              <p>You're about to queue <strong>{selectedAssets.length}</strong> assets for transfer to the project wallet.</p>
              <p>This queue-based approach processes transfers one at a time, which helps avoid validation errors.</p>
              <p><strong>Note:</strong> You can close this modal after queuing, and transfers will continue in the background.</p>
              
              <div className="selected-assets-preview">
                <h3>Selected Assets</h3>
                <div className="assets-grid">
                  {selectedAssets.slice(0, 10).map((asset) => (
                    <div key={asset.id} className="asset-preview">
                      <img 
                        src={asset.content?.links?.image || asset.content?.json?.image || '/default-nft-image.svg'} 
                        alt={asset.content?.metadata?.name || 'NFT'} 
                        onError={(e) => { e.currentTarget.src = '/default-nft-image.svg' }}
                      />
                      <span className="asset-name">{asset.content?.metadata?.name || 'Unnamed NFT'}</span>
                    </div>
                  ))}
                  {selectedAssets.length > 10 && (
                    <div className="more-assets">+{selectedAssets.length - 10} more</div>
                  )}
                </div>
              </div>
              
              <div className="action-buttons">
                <button 
                  className="queue-button primary" 
                  onClick={queueTransfer}
                >
                  Queue Transfer
                </button>
                <button 
                  className="cancel-button secondary" 
                  onClick={onClose}
                >
                  Cancel
                </button>
              </div>
            </>
          )}
          
          {status === 'queuing' && (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>{statusMessage}</p>
            </div>
          )}
          
          {status === 'queued' && (
            <div className="batch-status">
              <h3>Transfer Queue Status</h3>
              <p>{statusMessage}</p>
              
              {batchStatus && (
                <div className="progress-container">
                  <div className="progress-bar">
                    <div 
                      className="progress-fill" 
                      style={{ width: `${getProgressPercentage()}%` }}
                    ></div>
                  </div>
                  <div className="progress-stats">
                    <span>{batchStatus.stats.processed} of {batchStatus.stats.total} processed</span>
                    <span>{getEstimatedTimeRemaining()}</span>
                  </div>
                  
                  {batchStatus.stats.succeeded > 0 && (
                    <div className="success-count">
                      ✓ {batchStatus.stats.succeeded} transfers completed successfully
                    </div>
                  )}
                  
                  {batchStatus.stats.failed > 0 && (
                    <div className="failed-count">
                      ✗ {batchStatus.stats.failed} transfers failed
                    </div>
                  )}
                </div>
              )}
              
              <div className="action-buttons">
                <button 
                  className="close-button primary" 
                  onClick={onClose}
                >
                  Close (Processing Will Continue)
                </button>
              </div>
            </div>
          )}
          
          {status === 'error' && (
            <div className="error-state">
              <div className="error-icon">⚠️</div>
              <h3>Error</h3>
              <p>{statusMessage}</p>
              {errorDetails && (
                <div className="error-details">
                  <p>{errorDetails}</p>
                </div>
              )}
              <div className="action-buttons">
                <button 
                  className="retry-button primary" 
                  onClick={() => setStatus('idle')}
                >
                  Try Again
                </button>
                <button 
                  className="close-button secondary" 
                  onClick={onClose}
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default QueueTransferModal;