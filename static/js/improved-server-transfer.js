/**
 * Improved Server Transfer for cNFTs
 * 
 * This module provides an improved implementation for transferring cNFTs that avoids
 * the TransactionInstruction class dependency in the browser context.
 * 
 * It uses a server-side approach where the transaction is created on the server,
 * and only signing is done in the browser. This avoids compatibility issues
 * and improves reliability.
 */

(function() {
  'use strict';
  
  // Project wallet - used as the default destination for trasferred cNFTs
  const PROJECT_WALLET = 'EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK';

  /**
   * Transfer a cNFT to the project wallet using the improved server transfer approach
   * @param {string} assetId - The asset ID of the cNFT to transfer
   * @returns {Promise<object>} - Result of the transfer operation
   */
  async function improvedServerTransferCNFT(assetId) {
    try {
      if (!window.solana || !window.solana.isConnected) {
        throw new Error('Wallet not connected');
      }
      
      console.log('[Improved Transfer] Starting improved server transfer for asset:', assetId);
      
      // Get the current wallet public key
      const ownerPublicKey = window.solana.publicKey.toString();
      
      console.log('[Improved Transfer] Owner public key:', ownerPublicKey);
      
      // Show notification if we have the BurnAnimations module
      if (window.BurnAnimations?.showNotification) {
        window.BurnAnimations.showNotification(
          'Preparing Transfer',
          'Building transaction on server...'
        );
      }
      
      // Step 1: Prepare transaction on the server
      console.log('[Improved Transfer] Preparing transaction on server');
      const prepareResponse = await fetch('/api/server-transfer/prepare', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ownerPublicKey,
          assetId
        })
      });
      
      const prepareData = await prepareResponse.json();
      
      if (!prepareData.success) {
        console.error('[Improved Transfer] Failed to prepare transaction:', prepareData.error);
        throw new Error(prepareData.error || 'Failed to prepare transaction');
      }
      
      console.log('[Improved Transfer] Transaction prepared successfully');
      
      // Show notification if we have the BurnAnimations module
      if (window.BurnAnimations?.showNotification) {
        window.BurnAnimations.showNotification(
          'Transaction Ready',
          'Please approve the transaction in your wallet'
        );
      }
      
      // Step 2: Sign the transaction with the wallet
      console.log('[Improved Transfer] Requesting signature from wallet');
      
      // Convert base64 transaction to Uint8Array for signing
      const transaction = prepareData.transaction;
      const transactionBytes = _base64ToUint8Array(transaction);
      
      // Request signature from wallet
      const signature = await window.solana.signTransaction(transactionBytes);
      
      // Convert the signed transaction back to base64
      const signedTransaction = _uint8ArrayToBase64(signature.serialize());
      
      console.log('[Improved Transfer] Transaction signed successfully');
      
      // Show notification if we have the BurnAnimations module
      if (window.BurnAnimations?.showNotification) {
        window.BurnAnimations.showNotification(
          'Submitting Transaction',
          'Sending to Solana network...'
        );
      }
      
      // Step 3: Submit the signed transaction to the server
      console.log('[Improved Transfer] Submitting signed transaction to server');
      const submitResponse = await fetch('/api/server-transfer/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          signedTransaction,
          assetId
        })
      });
      
      const submitData = await submitResponse.json();
      
      if (!submitData.success) {
        console.error('[Improved Transfer] Failed to submit transaction:', submitData.error);
        throw new Error(submitData.error || 'Failed to submit transaction');
      }
      
      console.log('[Improved Transfer] Transaction submitted successfully:', submitData);
      
      // Show success notification if we have the BurnAnimations module
      if (window.BurnAnimations?.showNotification) {
        window.BurnAnimations.showNotification(
          'Transfer Successful!',
          'Your cNFT has been transferred to the project wallet'
        );
      }
      
      // Apply burn animation if available
      if (window.BurnAnimations?.applyBurnAnimation) {
        const element = document.querySelector(`[data-asset-id="${assetId}"]`);
        if (element) {
          console.log('[Improved Transfer] Applying burn animation to element');
          window.BurnAnimations.applyBurnAnimation(element);
        } else {
          console.warn('[Improved Transfer] Element not found for burn animation');
        }
      }
      
      // Add to hidden assets if that function exists
      if (window.hiddenAssets && typeof window.hiddenAssets.addHiddenAsset === 'function') {
        console.log('[Improved Transfer] Adding asset to hidden assets');
        window.hiddenAssets.addHiddenAsset(assetId);
      }
      
      return {
        success: true,
        signature: submitData.signature,
        explorerUrl: submitData.explorerUrl,
        assetId
      };
    } catch (error) {
      console.error('[Improved Transfer] Error:', error);
      
      // Show error notification if we have the BurnAnimations module
      if (window.BurnAnimations?.showNotification) {
        window.BurnAnimations.showNotification(
          'Transfer Failed',
          `Error: ${error.message}`
        );
      }
      
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Convert base64 string to Uint8Array
   * @param {string} base64 - Base64 encoded string
   * @returns {Uint8Array} - Decoded Uint8Array
   * @private
   */
  function _base64ToUint8Array(base64) {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  
  /**
   * Convert Uint8Array to base64 string
   * @param {Uint8Array} uint8Array - Uint8Array to convert
   * @returns {string} - Base64 encoded string
   * @private
   */
  function _uint8ArrayToBase64(uint8Array) {
    let binary = '';
    for (let i = 0; i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    return window.btoa(binary);
  }
  
  // Export the function to the global scope
  window.improvedServerTransferCNFT = improvedServerTransferCNFT;
})();