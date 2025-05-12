/**
 * CNFT Fix for Transfer Issues
 * 
 * This module provides a direct fix for the cNFT transfer issues by
 * patching the CNFTHandler methods responsible for processing transfers.
 */

document.addEventListener('DOMContentLoaded', function() {
  // Wait for the CNFTHandler to be available
  const checkInterval = setInterval(() => {
    if (window.CNFTHandler) {
      clearInterval(checkInterval);
      console.log('[CNFT-Fix] CNFTHandler found, applying fixes...');
      applyFixes();
    }
  }, 500);

  // Maximum wait time of 10 seconds
  setTimeout(() => {
    clearInterval(checkInterval);
    console.log('[CNFT-Fix] Timed out waiting for CNFTHandler');
  }, 10000);

  // Apply the fixes to the CNFTHandler methods
  function applyFixes() {
    try {
      // Keep references to the original methods for fallback
      const originalProcessCNFTs = window.CNFTHandler.prototype.processCNFTs;
      const originalTransferCNFT = window.CNFTHandler.prototype.transferCNFT;
      const originalTransferCNFTWithProof = window.CNFTHandler.prototype.transferCNFTWithProof;

      // 1. Fix the transferCNFTWithProof method (one of the most critical issues)
      window.CNFTHandler.prototype.transferCNFTWithProof = async function(assetId, providedProofData, destinationAddress = null) {
        console.log('[CNFT-Fix] Enhanced transferCNFTWithProof called for asset:', assetId);
        
        try {
          // Log the proof data structure for debugging
          if (providedProofData) {
            console.log('[CNFT-Fix] Using provided proof data', { 
              proof_array_exists: !!providedProofData.proof,
              proof_array_length: providedProofData.proof ? providedProofData.proof.length : 0,
              tree_id_exists: !!providedProofData.tree_id
            });
          } else {
            console.log('[CNFT-Fix] No proof data provided, will fetch it');
          }
          
          // Step 1: Ensure we have valid proof data or get it
          let proofData = providedProofData;
          
          if (!proofData || !proofData.proof || !Array.isArray(proofData.proof)) {
            console.log('[CNFT-Fix] Invalid or missing proof data, fetching directly...');
            
            // Try multiple methods to get proof data
            try {
              // Method 1: Direct from server endpoint with enhanced fetch modes
              console.log('[CNFT-Fix] Trying direct server endpoint');
              const directResponse = await fetch(`/api/asset/diagnostic/${assetId}`);
              const directData = await directResponse.json();
              
              if (directData.success && directData.details && directData.details.proof) {
                proofData = directData.details.proof;
                console.log('[CNFT-Fix] Successfully got proof data from diagnostic endpoint');
              } else {
                // Method 2: Try alternate endpoint
                console.log('[CNFT-Fix] Diagnostic endpoint failed, trying helius endpoint');
                const heliusResponse = await fetch(`/api/helius/asset-proof/${assetId}`);
                const heliusData = await heliusResponse.json();
                
                if (heliusData && (heliusData.proof || (heliusData.compression && heliusData.compression.proof))) {
                  proofData = heliusData;
                  console.log('[CNFT-Fix] Successfully got proof data from helius endpoint');
                } else {
                  throw new Error('Failed to get valid proof data from any source');
                }
              }
            } catch (proofError) {
              console.error('[CNFT-Fix] All proof data fetch attempts failed:', proofError);
              throw new Error('Failed to get required proof data for the cNFT. Cannot complete transfer');
            }
          }
          
          // Step 2: Ensure we have all required fields in the proof data
          if (!proofData.tree_id && proofData.compression && proofData.compression.tree) {
            proofData.tree_id = proofData.compression.tree;
            console.log('[CNFT-Fix] Using compression.tree as tree_id');
          }
          
          // Step 3: Process the transfer with the enhanced proof data
          console.log('[CNFT-Fix] Proceeding with transfer using proof data with fields:', Object.keys(proofData));
          
          // Default to project wallet if no destination is provided
          if (!destinationAddress) {
            destinationAddress = "EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK";
            console.log('[CNFT-Fix] Using default project wallet as destination');
          }
          
          // Prepare the transfer request
          const wallet = this.wallet || window.solanaWallet;
          const publicKey = wallet?.publicKey?.toString();
          
          if (!publicKey) {
            throw new Error('Wallet not connected');
          }
          
          // Build signature for authorization
          const message = new TextEncoder().encode(`Authorize transfer of cNFT ${assetId} to project collection wallet`);
          const signatureBytes = await wallet.signMessage(message);
          const signatureBase64 = btoa(String.fromCharCode.apply(null, [...new Uint8Array(signatureBytes)]));
          
          console.log('[CNFT-Fix] Signed message for authorization');
          
          // Call the delegated transfer API with all available data
          const response = await fetch('/api/delegated-transfer', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              sender: publicKey,
              assetId: assetId,
              signedMessage: signatureBase64,
              proofData: proofData,
              destination: destinationAddress
            })
          });
          
          // Process the response
          const result = await response.json();
          
          if (result.success) {
            console.log('[CNFT-Fix] Transfer successful:', result);
            
            // Show notification if the animations system is available
            if (typeof window !== "undefined" && window.BurnAnimations?.showNotification) {
              const shortSig = result.signature.substring(0, 8) + "...";
              window.BurnAnimations.showNotification(
                "cNFT Successfully Trashed", 
                `Your cNFT has been sent to the trash collection.\nTransaction signature: ${shortSig}`
              );
            }
            
            // Check for achievements system
            if (typeof window !== "undefined" && window.checkAchievements) {
              window.checkAchievements('cnft_trash', 1);
            }
            
            return {
              success: true,
              signature: result.signature,
              explorerUrl: `https://solscan.io/tx/${result.signature}`,
              assetId
            };
          } else {
            console.error('[CNFT-Fix] Transfer failed:', result.error || 'Unknown error');
            
            // Show error notification
            if (typeof window !== "undefined" && window.BurnAnimations?.showNotification) {
              window.BurnAnimations.showNotification(
                "cNFT Trash Failed", 
                `Error: ${result.error || 'Unknown error'}`
              );
            }
            
            return {
              success: false,
              error: result.error || 'Transfer failed'
            };
          }
        } catch (error) {
          console.error('[CNFT-Fix] Critical error in transferCNFTWithProof:', error);
          
          // Show error notification
          if (typeof window !== "undefined" && window.BurnAnimations?.showNotification) {
            window.BurnAnimations.showNotification(
              "cNFT Trash Failed", 
              `Error: ${error.message}`
            );
          }
          
          // As a last resort, try the original method
          try {
            console.log('[CNFT-Fix] Attempting original method as fallback');
            return await originalTransferCNFTWithProof.call(this, assetId, providedProofData, destinationAddress);
          } catch (fallbackError) {
            console.error('[CNFT-Fix] Fallback also failed:', fallbackError);
            return {
              success: false,
              error: 'All transfer attempts failed: ' + error.message
            };
          }
        }
      };
      
      // 2. Enhance the primary processCNFTs method which is the entry point
      window.CNFTHandler.prototype.processCNFTs = async function(assetIds, destination = null) {
        console.log('[CNFT-Fix] Enhanced processCNFTs called with', assetIds.length, 'asset(s)');
        
        try {
          // Special case for single cNFT - this is the most common scenario
          if (assetIds.length === 1) {
            console.log('[CNFT-Fix] Single cNFT case, using direct transfer with diagnostic endpoint');
            
            try {
              // Get diagnostic data for the asset to ensure we have complete information
              const diagnosticResponse = await fetch(`/api/asset/diagnostic/${assetIds[0]}`);
              const diagnosticData = await diagnosticResponse.json();
              
              if (diagnosticData.success && diagnosticData.details && diagnosticData.details.proof) {
                console.log('[CNFT-Fix] Successfully got diagnostic data, proceeding with transfer');
                
                // Use enhanced method with proof data
                const result = await this.transferCNFTWithProof(
                  assetIds[0],
                  diagnosticData.details.proof,
                  destination
                );
                
                if (result.success) {
                  return {
                    success: true,
                    signature: result.signature,
                    explorerUrl: `https://solscan.io/tx/${result.signature}`,
                    method: "enhanced-single-transfer",
                    processedAssets: [assetIds[0]],
                    failedAssets: []
                  };
                } else {
                  throw new Error(result.error || 'Enhanced transfer failed');
                }
              } else {
                throw new Error('Failed to get diagnostic data');
              }
            } catch (error) {
              console.error('[CNFT-Fix] Enhanced single transfer failed:', error);
              
              // Try the original method as fallback
              try {
                console.log('[CNFT-Fix] Falling back to original processCNFTs for single asset');
                return await originalProcessCNFTs.call(this, assetIds, destination);
              } catch (fallbackError) {
                console.error('[CNFT-Fix] Original method also failed:', fallbackError);
                return {
                  success: false,
                  error: 'All transfer methods failed',
                  processedAssets: [],
                  failedAssets: assetIds
                };
              }
            }
          } else {
            // For multiple assets, use the original method
            console.log('[CNFT-Fix] Multiple cNFTs, using original batch method');
            return await originalProcessCNFTs.call(this, assetIds, destination);
          }
        } catch (error) {
          console.error('[CNFT-Fix] Critical error in processCNFTs:', error);
          return {
            success: false,
            error: error.message,
            processedAssets: [],
            failedAssets: assetIds
          };
        }
      };
      
      console.log('[CNFT-Fix] Successfully applied fixes to CNFTHandler');
      
      // Make the fix available globally
      window.CNFT_FIX_APPLIED = true;
    } catch (error) {
      console.error('[CNFT-Fix] Error applying fixes:', error);
    }
  }
});