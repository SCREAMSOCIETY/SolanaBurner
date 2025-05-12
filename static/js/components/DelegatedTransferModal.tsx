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
      
      // Create a timeout to handle API request failures
      const timeoutPromise = new Promise<null>((_, reject) => {
        setTimeout(() => reject(new Error('Proof data request timed out')), 15000); // Extended timeout
      });
      
      // Method 1: Try direct Helius endpoint first - most reliable
      try {
        console.log(`[DelegatedTransferModal] Method 1: Using direct Helius endpoint`);
        const heliusResponse = await axios.get(`/api/helius/asset-proof/${assetId}`);
        
        if (heliusResponse.data && (heliusResponse.data.proof || (heliusResponse.data.compression && heliusResponse.data.compression.proof))) {
          console.log('[DelegatedTransferModal] Successfully fetched proof data from Helius endpoint');
          setProofData(heliusResponse.data);
          return; // Exit early if successful
        } else {
          console.warn('[DelegatedTransferModal] Helius endpoint returned invalid proof data structure');
          console.log('[DelegatedTransferModal] Helius response:', JSON.stringify(heliusResponse.data, null, 2));
        }
      } catch (method1Error) {
        console.warn(`[DelegatedTransferModal] Method 1 failed: ${method1Error.message}`);
      }
      
      // Method 2: Try delegate endpoint
      try {
        console.log(`[DelegatedTransferModal] Method 2: Using delegate endpoint`);
        // Main API request
        const fetchPromise = axios.get(`/api/delegate/proof/${assetId}`);
        
        // Race the fetch against the timeout
        const response = await Promise.race([fetchPromise, timeoutPromise]) as any;
        
        if (response && response.data && response.data.success) {
          console.log('[DelegatedTransferModal] Successfully fetched proof data from delegate endpoint:', 
            JSON.stringify(response.data.proofData, null, 2));
          setProofData(response.data.proofData);
          return; // Exit early if successful
        } else {
          console.warn('[DelegatedTransferModal] Delegate endpoint failed to return valid proof data');
        }
      } catch (method2Error) {
        console.warn(`[DelegatedTransferModal] Method 2 failed: ${method2Error.message}`);
      }
      
      // Method 3: Try diagnostic endpoint for detailed inspection
      try {
        console.log(`[DelegatedTransferModal] Method 3: Using diagnostic endpoint`);
        const diagnosticResponse = await axios.get(`/api/asset/diagnostic/${assetId}`);
        
        if (diagnosticResponse.data && diagnosticResponse.data.success) {
          console.log('[DelegatedTransferModal] Got diagnostic data:', 
            JSON.stringify(diagnosticResponse.data.diagnostics, null, 2));
          
          if (diagnosticResponse.data.details && diagnosticResponse.data.details.proof) {
            console.log('[DelegatedTransferModal] Extracting proof data from diagnostic response');
            setProofData(diagnosticResponse.data.details.proof);
            return; // Exit if we have valid proof data
          }
        }
      } catch (method3Error) {
        console.warn(`[DelegatedTransferModal] Method 3 failed: ${method3Error.message}`);
      }
      
      // If we reach here, all methods failed
      throw new Error('All proof data fetching methods failed');
    } catch (err) {
      console.error('[DelegatedTransferModal] Critical error fetching proof data:', err);
      setError(`Failed to fetch required proof data for the cNFT. Cannot complete transfer and no wallet transaction will be made.`);
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
      if (!proofData) {
        // If proof data is missing, attempt to fetch it again
        console.log('Proof data not available. Attempting to fetch it now...');
        await fetchProofData();
      }

      // Send the transfer request with proof data if available
      const response = await axios.post('/api/delegated-transfer', {
        sender: publicKey.toString(),
        assetId,
        signedMessage: signatureBase64,
        proofData: proofData || null
      });

      if (response.data && response.data.success) {
        setStatus('success');
        setExplorerUrl(response.data.explorerUrl || null);
        
        // Call onSuccess callback if provided
        if (onSuccess) {
          onSuccess(response.data);
        }
      } else {
        setStatus('error');
        setError(response.data && response.data.error ? response.data.error : 'Transfer failed');
      }
    } catch (err) {
      console.error('Error during delegated transfer:', err);
      setStatus('error');
      setError('Transfer failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
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