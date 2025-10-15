/******/ (() => { // webpackBootstrap
var __webpack_exports__ = {};
/*!***********************************************!*\
  !*** ./static/js/improved-server-transfer.js ***!
  \***********************************************/
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

// Self-invoking function to avoid polluting global namespace
(function() {
  // Make the transfer function available globally
  window.ImprovedServerTransfer = {
    transferCNFT
  };

  /**
   * Transfer a cNFT to the project wallet using the improved server transfer approach
   * @param {string} assetId - The asset ID of the cNFT to transfer
   * @returns {Promise<object>} - Result of the transfer operation
   */
  async function transferCNFT(assetId) {
    try {
      console.log('[ImprovedServer] Starting improved server-side transfer for', assetId);
      
      // Get the wallet adapter
      const wallet = window.solana;
      
      if (!wallet || !wallet.isConnected) {
        throw new Error('Wallet not connected');
      }
      
      // Get the owner address
      const ownerAddress = wallet.publicKey.toString();
      
      console.log('[ImprovedServer] Using wallet address:', ownerAddress);
      
      // 1. Prepare the transaction on the server
      console.log('[ImprovedServer] Preparing transaction on server');
      
      try {
        const prepareResponse = await fetch('/api/server-transfer/prepare', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            assetId,
            ownerAddress
          })
        });
        
        if (!prepareResponse.ok) {
          const errorText = await prepareResponse.text();
          console.error('[ImprovedServer] Error response from server:', errorText);
          throw new Error(`Server returned ${prepareResponse.status}: ${errorText}`);
        }
        
        const prepareData = await prepareResponse.json();
        
        if (!prepareData.success) {
          throw new Error(`Server failed to prepare transaction: ${prepareData.error}`);
        }
        
        console.log('[ImprovedServer] Transaction prepared successfully', prepareData);
        
        // 2. Sign the transaction using the wallet
        console.log('[ImprovedServer] Requesting signature from wallet');
        
        // Convert base64 transaction to Uint8Array
        const transaction = _base64ToUint8Array(prepareData.transaction);
        
        // Request signing
        const signedTransaction = await wallet.signTransaction(transaction);
        
        // Wait for the prompt to be dismissed
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Convert the signed transaction to base64
        const signedBase64 = _uint8ArrayToBase64(signedTransaction);
        
        console.log('[ImprovedServer] Transaction signed successfully');
        
        // 3. Submit the signed transaction to the server
        console.log('[ImprovedServer] Submitting signed transaction to server');
        const submitResponse = await fetch('/api/server-transfer/submit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            signedTransaction: signedBase64,
            assetId
          })
        });
        
        if (!submitResponse.ok) {
          const errorText = await submitResponse.text();
          console.error('[ImprovedServer] Error response from server when submitting:', errorText);
          throw new Error(`Server returned ${submitResponse.status} when submitting: ${errorText}`);
        }
        
        const submitData = await submitResponse.json();
        
        if (!submitData.success) {
          throw new Error(`Server failed to submit transaction: ${submitData.error}`);
        }
        
        console.log('[ImprovedServer] Transaction submitted successfully', submitData);
        
        return {
          success: true,
          signature: submitData.signature,
          assetId,
          message: 'cNFT transferred successfully'
        };
      } catch (innerError) {
        console.error('[ImprovedServer] Inner error in cNFT transfer:', innerError);
        throw innerError;
      }
    } catch (error) {
      console.error('[ImprovedServer] Error in cNFT transfer:', error);
      return {
        success: false,
        error: error.message,
        assetId
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
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
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
    const len = uint8Array.length;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    return window.btoa(binary);
  }
})();

// Initialize the component when the DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  console.log('[ImprovedServer] Improved server transfer component initialized');
});
window["improved-server-transfer"] = __webpack_exports__;
/******/ })()
;
//# sourceMappingURL=improved-server-transfer.js.map