/**
 * Robust Transfer Implementation for cNFTs
 * 
 * This script provides a more resilient way to transfer cNFTs 
 * by using the server-side robust-cnft-transfer.js implementation.
 * This can handle cases where Helius API returns incomplete proof data.
 */

// Create a namespace for our robust transfer functions
const RobustCnftTransfer = (function() {
  
  // Default project wallet to send NFTs to
  const PROJECT_WALLET = "EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK";
  
  /**
   * Run a diagnostic check on a cNFT to detect potential issues
   * @param {string} assetId - The asset ID of the cNFT to diagnose
   * @returns {Promise<object>} - Result of the diagnostic check
   */
  async function runDiagnostics(assetId) {
    try {
      console.log(`[Robust] Running diagnostics for asset: ${assetId}`);
      
      const response = await fetch(`/api/cnft/diagnostic/${assetId}`);
      const data = await response.json();
      
      if (!data.success) {
        console.error(`[Robust] Diagnostic failed:`, data.error);
        return {
          success: false,
          error: data.error || 'Diagnostic check failed',
          assetId
        };
      }
      
      console.log(`[Robust] Diagnostic results:`, data.diagnostics);
      return {
        success: true,
        diagnostics: data.diagnostics,
        details: data.details
      };
    } catch (error) {
      console.error(`[Robust] Error running diagnostics:`, error);
      return {
        success: false,
        error: error.message || 'Error running diagnostics',
        assetId
      };
    }
  }
  
  /**
   * Transfer a cNFT using our robust server-side implementation
   * @param {string} assetId - The asset ID of the cNFT to transfer
   * @param {Keypair} senderKeypair - The sender's keypair
   * @param {string} destinationAddress - (Optional) Where to send the cNFT, defaults to project wallet
   * @returns {Promise<object>} - Result of the transfer operation
   */
  async function transferCnft(assetId, senderKeypair, destinationAddress = PROJECT_WALLET) {
    try {
      console.log(`[Robust] Starting robust transfer for: ${assetId}`);
      console.log(`[Robust] From: ${senderKeypair.publicKey.toString()}`);
      console.log(`[Robust] To: ${destinationAddress}`);
      
      // Export private key as base58
      const privateKeyBase58 = bs58.encode(senderKeypair.secretKey);
      
      // Call the robust transfer endpoint
      const response = await fetch('/api/cnft/robust-transfer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          assetId,
          senderPrivateKey: privateKeyBase58,
          destinationAddress
        })
      });
      
      const data = await response.json();
      
      if (!data.success) {
        console.error(`[Robust] Transfer failed:`, data.error);
        return {
          success: false,
          error: data.error || 'Transfer failed on server',
          assetId
        };
      }
      
      console.log(`[Robust] Transfer succeeded with signature: ${data.data.signature}`);
      return {
        success: true,
        signature: data.data.signature,
        explorerUrl: data.data.explorerUrl,
        message: data.message || 'Asset transferred successfully'
      };
    } catch (error) {
      console.error(`[Robust] Error during transfer:`, error);
      return {
        success: false,
        error: error.message || 'Transfer request failed',
        assetId
      };
    }
  }
  
  /**
   * Verify that an asset is ready for transfer by running diagnostics first
   * @param {string} assetId - The asset ID of the cNFT to check
   * @returns {Promise<object>} - Result of the verification
   */
  async function verifyAssetForTransfer(assetId) {
    try {
      // Run diagnostics first
      const diagnosticResult = await runDiagnostics(assetId);
      
      if (!diagnosticResult.success) {
        return {
          success: false,
          error: diagnosticResult.error,
          assetId
        };
      }
      
      // Check critical fields for transfer
      const diagnostics = diagnosticResult.diagnostics;
      
      if (!diagnostics.asset_found) {
        return {
          success: false,
          error: 'Asset not found in Helius API',
          assetId
        };
      }
      
      if (!diagnostics.proof_found) {
        return {
          success: false,
          error: 'Proof data not found in Helius API',
          assetId
        };
      }
      
      if (!diagnostics.proof_array_valid || diagnostics.proof_array_length === 0) {
        return {
          success: false,
          error: 'Invalid proof array in asset data',
          assetId
        };
      }
      
      // If we reach here, the asset appears to be valid for transfer
      return {
        success: true,
        diagnostics: diagnostics,
        validForTransfer: true,
        assetId
      };
    } catch (error) {
      console.error(`[Robust] Verification error:`, error);
      return {
        success: false,
        error: error.message || 'Error verifying asset',
        assetId
      };
    }
  }
  
  /**
   * Transfer multiple cNFTs using our robust approach
   * @param {Array<string>} assetIds - Array of asset IDs to transfer
   * @param {Keypair} senderKeypair - The sender's keypair
   * @param {string} destinationAddress - (Optional) Where to send the cNFTs
   * @returns {Promise<object>} - Results of the batch transfer
   */
  async function transferMultiple(assetIds, senderKeypair, destinationAddress = PROJECT_WALLET) {
    console.log(`[Robust] Starting batch transfer of ${assetIds.length} assets`);
    
    const results = {
      success: true,
      processedAssets: [],
      failedAssets: [],
      totalCount: assetIds.length,
      successCount: 0
    };
    
    // Process each asset sequentially to avoid rate limits
    for (const assetId of assetIds) {
      try {
        // Verify the asset first
        const verifyResult = await verifyAssetForTransfer(assetId);
        
        if (!verifyResult.success || !verifyResult.validForTransfer) {
          console.warn(`[Robust] Asset ${assetId} failed verification: ${verifyResult.error}`);
          results.failedAssets.push({
            assetId,
            error: verifyResult.error || 'Failed verification'
          });
          continue;
        }
        
        // Attempt to transfer the asset
        const transferResult = await transferCnft(assetId, senderKeypair, destinationAddress);
        
        if (transferResult.success) {
          results.processedAssets.push({
            assetId,
            signature: transferResult.signature,
            explorerUrl: transferResult.explorerUrl
          });
          results.successCount++;
        } else {
          results.failedAssets.push({
            assetId,
            error: transferResult.error || 'Transfer failed'
          });
        }
      } catch (error) {
        console.error(`[Robust] Error processing asset ${assetId}:`, error);
        results.failedAssets.push({
          assetId,
          error: error.message || 'Unknown error during processing'
        });
      }
      
      // Add a small delay between operations to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Update overall success flag
    results.success = results.successCount > 0;
    
    return results;
  }
  
  return {
    runDiagnostics,
    transferCnft,
    verifyAssetForTransfer,
    transferMultiple,
    PROJECT_WALLET
  };
})();

// If we're in a browser environment, add to window
if (typeof window !== 'undefined') {
  window.RobustCnftTransfer = RobustCnftTransfer;
  console.log('[Robust] Robust CNFT Transfer module loaded');
}

// Allow importing in Node.js environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RobustCnftTransfer;
}