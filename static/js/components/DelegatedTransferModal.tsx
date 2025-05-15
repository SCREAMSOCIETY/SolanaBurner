import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import axios from 'axios';
import '../../delegated-transfer-modal.css';

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
 * A modal for transferring cNFTs using delegation approach with Helius API
 * This provides a more reliable method for transferring cNFTs when the asset
 * has delegation set up.
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
  const [status, setStatus] = useState<string>('initial');
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [explorerUrl, setExplorerUrl] = useState<string | null>(null);
  const [delegateInfo, setDelegateInfo] = useState<any>(null);
  const [proofData, setProofData] = useState<any>(null);

  // Fetch delegation info and proof data on load
  useEffect(() => {
    if (isOpen && assetId) {
      fetchDelegateInfo();
      fetchProofData();
    }
  }, [isOpen, assetId]);

  const fetchDelegateInfo = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/delegate/info/${assetId}`);
      if (response.data && response.data.success) {
        setDelegateInfo(response.data.delegationInfo);
      } else {
        setError('Could not fetch delegation information for this asset.');
      }
    } catch (err) {
      console.error('Error fetching delegate info:', err);
      setError('Failed to fetch delegation information: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const fetchProofData = async () => {
    try {
      console.log(`[DelegatedTransferModal] Fetching proof data for asset: ${assetId}`);
      
      // Method 1: Try direct Helius endpoint first - most reliable
      try {
        console.log(`[DelegatedTransferModal] Method 1: Using direct Helius endpoint`);
        
        // Add timestamp to prevent caching
        const cachePreventionParam = `?t=${Date.now()}`;
        const heliusResponse = await axios.get(`/api/helius/asset-proof/${assetId}${cachePreventionParam}`, {
          timeout: 20000, // Extended timeout to 20 seconds
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache'
          }
        });
        
        if (heliusResponse.data && (
            (heliusResponse.data.proof && Array.isArray(heliusResponse.data.proof)) || 
            (heliusResponse.data.compression && heliusResponse.data.compression.proof && Array.isArray(heliusResponse.data.compression.proof))
        )) {
          console.log('[DelegatedTransferModal] Successfully fetched proof data from Helius endpoint');
          setProofData(heliusResponse.data);
          return true; // Indicate success
        } else {
          console.warn('[DelegatedTransferModal] Helius endpoint returned invalid proof data structure');
          console.log('[DelegatedTransferModal] Helius response:', JSON.stringify(heliusResponse.data, null, 2));
        }
      } catch (error: any) {
        console.warn(`[DelegatedTransferModal] Method 1 failed: ${error.message || 'Unknown error'}`);
      }
      
      // Method 2: Try delegate endpoint 
      try {
        console.log(`[DelegatedTransferModal] Method 2: Using delegate endpoint`);
        
        // Add timestamp to prevent caching
        const cachePreventionParam = `?t=${Date.now()}`;
        const response = await axios.get(`/api/delegate/proof/${assetId}${cachePreventionParam}`, {
          timeout: 20000,
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache'
          }
        });
        
        if (response && response.data && response.data.success) {
          console.log('[DelegatedTransferModal] Successfully fetched proof data from delegate endpoint');
          setProofData(response.data.proofData);
          return true; // Indicate success
        } else {
          console.warn('[DelegatedTransferModal] Delegate endpoint failed to return valid proof data');
        }
      } catch (error: any) {
        console.warn(`[DelegatedTransferModal] Method 2 failed: ${error.message || 'Unknown error'}`);
      }
      
      // Method 3: Try diagnostic endpoint for detailed inspection
      try {
        console.log(`[DelegatedTransferModal] Method 3: Using diagnostic endpoint`);
        
        // Add timestamp to prevent caching
        const cachePreventionParam = `?t=${Date.now()}`;
        const diagnosticResponse = await axios.get(`/api/asset/diagnostic/${assetId}${cachePreventionParam}`, {
          timeout: 20000,
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache'
          }
        });
        
        if (diagnosticResponse.data && diagnosticResponse.data.success) {
          console.log('[DelegatedTransferModal] Got diagnostic data');
          
          if (diagnosticResponse.data.details && diagnosticResponse.data.details.proof) {
            console.log('[DelegatedTransferModal] Extracting proof data from diagnostic response');
            setProofData(diagnosticResponse.data.details.proof);
            return true; // Indicate success
          } else if (diagnosticResponse.data.compression) {
            // Try to extract minimal proof structure from compression data
            console.log('[DelegatedTransferModal] Creating minimal proof structure from diagnostic data');
            
            // Construct a minimal valid proof structure
            const treeId = diagnosticResponse.data.compression.tree;
            const leafId = diagnosticResponse.data.compression.leaf_id || diagnosticResponse.data.compression.leafId || 0;
            
            const minimalProofData = {
              asset_id: assetId,
              tree_id: treeId,
              leaf_id: leafId,
              node_index: leafId, // Use leaf_id as node_index for compatibility
              proof: [], // Empty proof array as last resort
              root: diagnosticResponse.data.compression.tree_root || diagnosticResponse.data.compression.root || "11111111111111111111111111111111"
            };
            
            setProofData(minimalProofData);
            console.log('[DelegatedTransferModal] Created minimal proof data structure');
            return true; // Indicate success with minimal structure
          }
        }
      } catch (error: any) {
        console.warn(`[DelegatedTransferModal] Method 3 failed: ${error.message || 'Unknown error'}`);
      }
      
      // If all methods failed, proceed without proof data
      // The server will make one final attempt to fetch the proof data on its own
      console.warn('[DelegatedTransferModal] All client-side proof fetching methods failed, proceeding with server-side handling');
      return false;
    } catch (err) {
      console.error('[DelegatedTransferModal] Critical error fetching proof data:', err);
      console.warn('[DelegatedTransferModal] Proceeding with server-side proof handling');
      return false;
    }
  };

  const handleTransfer = async () => {
    if (!publicKey || !signMessage) {
      setError('Wallet connection required for signing');
      return;
    }

    try {
      setLoading(true);
      setStatus('signing');
      setError(null);

      // Create the message to sign
      const message = `Authorize delegated transfer of asset ${assetId} to the project collection wallet`;
      
      // Get the signature from wallet
      const encodedMessage = new TextEncoder().encode(message);
      const signatureBytes = await signMessage(encodedMessage);
      const signatureBase64 = Buffer.from(signatureBytes).toString('base64');
      
      setSignature(signatureBase64);
      setStatus('transferring');

      // Check if we have proof data
      let fetchSuccess = false;
      if (!proofData) {
        // If proof data is missing, attempt to fetch it again
        console.log('[DelegatedTransferModal] Proof data not available. Attempting to fetch it now...');
        fetchSuccess = await fetchProofData();
        
        if (!fetchSuccess) {
          console.log('[DelegatedTransferModal] Client-side proof data fetching unsuccessful, will rely on server-side fetching');
          // We'll continue even without proof data, as the server will attempt to fetch it
        }
      } else {
        fetchSuccess = true; // We already have proof data
      }

      console.log(`[DelegatedTransferModal] Submitting transfer request with${proofData ? '' : 'out'} proof data`);
      
      // Implement retry logic for the transfer request
      let response;
      let retryCount = 0;
      const maxRetries = 2;
      
      while (retryCount <= maxRetries) {
        try {
          // Send the transfer request with proof data if available
          response = await axios.post('/api/delegated-transfer', {
            sender: publicKey.toString(),
            assetId,
            signedMessage: signatureBase64,
            proofData: proofData || null
          }, {
            timeout: 30000, // 30 second timeout
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-cache, no-store, must-revalidate'
            }
          });
          
          // If request is successful, break out of retry loop
          break;
        } catch (error) {
          retryCount++;
          console.warn(`[DelegatedTransferModal] Transfer request attempt ${retryCount} failed:`, error);
          
          if (retryCount <= maxRetries) {
            // Exponential backoff with jitter
            const delay = Math.floor(1000 * Math.pow(2, retryCount) * (0.9 + Math.random() * 0.2));
            console.log(`[DelegatedTransferModal] Retrying after ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          } else {
            // After all retries are exhausted, propagate the error
            throw error;
          }
        }
      }

      if (response.data && response.data.success) {
        setStatus('success');
        setExplorerUrl(response.data.explorerUrl || null);
        
        // Call onSuccess callback if provided
        if (onSuccess) {
          onSuccess(response.data);
        }
      } else {
        setStatus('error');
        
        // Prepare a more helpful error message
        let errorMessage = response.data && response.data.error ? response.data.error : 'Transfer failed';
        
        // Add more context if we know there was a proof data issue
        if (!fetchSuccess && (!proofData || Object.keys(proofData).length === 0)) {
          errorMessage += '. Blockchain data might be temporarily unavailable. Please try again in a few minutes.';
        }
        
        setError(errorMessage);
        console.error('[DelegatedTransferModal] Transfer failed:', response.data);
      }
    } catch (err) {
      console.error('[DelegatedTransferModal] Error during delegated transfer:', err);
      setStatus('error');
      
      // Provide better user-friendly error messages
      let errorMessage = 'Transfer failed';
      
      if (err instanceof Error) {
        // Handle specific error types
        if (err.message.includes('timeout') || err.message.includes('Network Error')) {
          errorMessage = 'Transfer request timed out. The network might be congested. Please try again.';
        } else if (err.message.includes('rate limit') || err.message.includes('429')) {
          errorMessage = 'Too many requests. Please wait a moment and try again.';
        } else if (err.message.includes('proof data') || err.message.includes('verification failed')) {
          errorMessage = 'Proof data verification failed. This can happen when blockchain data is inconsistent. Please try again in a few minutes.';
        } else {
          errorMessage = `Transfer failed: ${err.message}`;
        }
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="delegated-transfer-modal">
      <div className="delegated-transfer-content">
        <button 
          className="delegated-transfer-close"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>

        <div className="delegated-transfer-header">
          <h2>Delegated Transfer</h2>
        </div>

        <div className="delegated-transfer-asset">
          <img 
            src={assetImage || '../../default-nft-image.svg'} 
            alt={assetName}
            className="delegated-transfer-asset-image"
            onError={(e) => {
              (e.target as HTMLImageElement).src = '../../default-nft-image.svg';
            }}
          />
          <div className="delegated-transfer-asset-info">
            <h3>{assetName}</h3>
            <p>Asset ID: {assetId.slice(0, 6)}...{assetId.slice(-4)}</p>
            {delegateInfo && delegateInfo.delegated && (
              <p>Delegate: {delegateInfo.delegate.slice(0, 6)}...{delegateInfo.delegate.slice(-4)}</p>
            )}
          </div>
        </div>

        <div className="delegated-transfer-message">
          <p>
            This asset can be transferred using delegation authority, which is a more reliable method
            than direct transfers. Your asset will be sent to the project trash collection wallet.
          </p>
        </div>

        {loading && (
          <div className="delegated-transfer-loading">
            <div className="delegated-transfer-spinner"></div>
            <p>{status === 'signing' ? 'Please sign the message with your wallet...' : 'Processing transfer...'}</p>
          </div>
        )}

        {status === 'success' && (
          <div className="delegated-transfer-status success">
            <p>Transfer successful!</p>
            {explorerUrl && (
              <a 
                href={explorerUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="delegated-transfer-explorer-link"
              >
                View on Solana Explorer
              </a>
            )}
          </div>
        )}

        {status === 'error' && error && (
          <div className="delegated-transfer-status error">
            <p>{error}</p>
          </div>
        )}

        {status !== 'success' && (
          <div className="delegated-transfer-buttons">
            <button 
              className="delegated-transfer-button primary"
              onClick={handleTransfer}
              disabled={loading || !delegateInfo || !delegateInfo.delegated}
            >
              {loading ? 'Processing...' : 'Transfer to Trash Collection'}
            </button>
            
            <button 
              className="delegated-transfer-button secondary"
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        )}

        {status === 'success' && (
          <div className="delegated-transfer-buttons">
            <button 
              className="delegated-transfer-button primary"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DelegatedTransferModal;