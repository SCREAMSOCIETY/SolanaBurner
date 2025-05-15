/**
 * Standalone cNFT Transfer Implementation
 * This module contains functions for transferring cNFTs using a simple standalone approach
 * that doesn't rely on external libraries
 */

(function() {
  // Import Solana Web3.js objects if needed later
  // These will be accessed via the global solanaWeb3 object when needed
  // Check if we're running in the browser
  if (typeof window === 'undefined') {
    console.log('This script is meant to run in a browser environment');
    return;
  }
  
  // Configuration
  const PROJECT_WALLET = 'EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK';
  
  // Global references
  let walletAdapter = null;
  let connection = null;
  
  // Initialization
  function init() {
    console.log('Initializing cNFT Standalone Transfer Handler');
    
    // Try to find buttons every second
    setInterval(patchTransferButtons, 1000);
    
    // Setup connection if solana is available
    if (window.solana) {
      setupConnection();
    } else {
      // Wait for Solana to be available
      const checkSolana = setInterval(() => {
        if (window.solana) {
          clearInterval(checkSolana);
          setupConnection();
        }
      }, 500);
    }
  }
  
  // Setup Solana connection
  function setupConnection() {
    try {
      console.log('Setting up Solana connection');
      
      // Set up connection to cluster and wallet adapter
      walletAdapter = window.solana;
      
      // Check if wallet is connected
      if (walletAdapter.isConnected) {
        console.log('Wallet is already connected:', walletAdapter.publicKey.toString());
      }
      
      // Listen for connect events
      walletAdapter.on('connect', () => {
        console.log('Wallet connected:', walletAdapter.publicKey.toString());
      });
    } catch (error) {
      console.error('Error setting up connection:', error);
    }
  }
  
  // Find and patch all cNFT transfer buttons
  function patchTransferButtons() {
    try {
      // Find all buttons with data-asset-id attribute
      const assetContainers = document.querySelectorAll('[data-asset-id]');
      
      if (assetContainers.length === 0) {
        console.log('[Standalone]', 'Found 0 buttons to replace');
        return;
      }
      
      console.log('[Standalone]', `Found ${assetContainers.length} buttons to replace`);
      
      // For each container, attach click handler
      assetContainers.forEach(container => {
        const assetId = container.getAttribute('data-asset-id');
        
        // Don't add listeners multiple times
        if (container.hasAttribute('data-handler-attached')) {
          return;
        }
        
        // Find the child button if the container isn't the button itself
        let button = container.classList.contains('cnft-transfer-button') ? 
          container : 
          container.querySelector('.cnft-transfer-button');
          
        if (!button) {
          button = container.querySelector('.burn-button');
        }
        
        if (!button) {
          console.warn(`No button found for asset ${assetId}`);
          return;
        }
        
        // Mark as processed
        container.setAttribute('data-handler-attached', 'true');
        
        // Add direct handler
        button.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          try {
            console.log(`[Standalone] Initiating transfer for ${assetId}`);
            await handleTransfer(assetId);
          } catch (error) {
            console.error(`[Standalone] Error handling transfer: ${error.message}`);
            if (window.BurnAnimations?.showNotification) {
              window.BurnAnimations.showNotification(
                'Transfer Error',
                `Could not complete the transfer: ${error.message}`
              );
            }
          }
        });
        
        console.log(`[Standalone] Successfully patched button for ${assetId}`);
      });
    } catch (error) {
      console.error('Error patching transfer buttons:', error);
    }
  }
  
  // Handle cNFT transfer
  async function handleTransfer(assetId) {
    if (!assetId) {
      throw new Error('Asset ID is required');
    }
    
    if (!walletAdapter || !walletAdapter.isConnected) {
      if (window.BurnAnimations?.showNotification) {
        window.BurnAnimations.showNotification(
          'Wallet Required',
          'Please connect your wallet first'
        );
      }
      
      throw new Error('Wallet not connected');
    }
    
    try {
      // Show notification
      if (window.BurnAnimations?.showNotification) {
        window.BurnAnimations.showNotification(
          'Preparing Transfer',
          'Fetching asset details...'
        );
      }
      
      // First, fetch proof data and asset details
      const response = await fetch(`/api/burn-cnft/${assetId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          cachedProofData: window.cachedProofData && window.cachedProofData[assetId] ?
            window.cachedProofData[assetId] : null
        })
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch asset details');
      }
      
      // Show notification
      if (window.BurnAnimations?.showNotification) {
        window.BurnAnimations.showNotification(
          'Processing Transfer',
          'Creating and signing transaction...'
        );
      }
      
      // Get the asset and proof from the response
      const { asset, proof } = data.data;
      
      // Use delegated-cnft-transfer module if available
      // This is automatically included in the app
      const { processDelegatedTransfer } = window.DelegatedTransfer || {};
      
      if (!processDelegatedTransfer) {
        throw new Error('Transfer module not available');
      }
      
      // Use delegated transfer with the owner's signature
      const transferResult = await processDelegatedTransfer(
        assetId,
        walletAdapter.publicKey.toString(),
        null,
        null,
        PROJECT_WALLET,
        proof
      );
      
      if (!transferResult.success) {
        throw new Error(transferResult.error || 'Transfer failed');
      }
      
      console.log('[Standalone] Transfer successful!', transferResult);
      
      // Show success notification
      if (window.BurnAnimations?.showNotification) {
        window.BurnAnimations.showNotification(
          'Transfer Successful!',
          'Your cNFT has been transferred to the project wallet'
        );
      }
      
      // Apply burn animation
      if (window.BurnAnimations?.applyBurnAnimation) {
        const element = document.querySelector(`[data-asset-id="${assetId}"]`);
        if (element) {
          window.BurnAnimations.applyBurnAnimation(element);
        }
      }
      
      // Remove asset from UI
      setTimeout(() => {
        const element = document.querySelector(`[data-asset-id="${assetId}"]`);
        if (element) {
          element.remove();
        }
      }, 2000);
      
      return transferResult;
    } catch (error) {
      console.error('[Standalone] Transfer error:', error);
      
      if (window.BurnAnimations?.showNotification) {
        window.BurnAnimations.showNotification(
          'Transfer Failed',
          `Error: ${error.message}`
        );
      }
      
      throw error;
    }
  }
  
  // Expose the functionality
  window.StandaloneTransfer = {
    init,
    patchTransferButtons,
    handleTransfer
  };
  
  // Auto-initialize when loaded
  init();
})();