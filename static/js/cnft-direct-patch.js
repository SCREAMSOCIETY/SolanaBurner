/**
 * Direct Patch for CNFTHandler
 * 
 * This script directly patches the CNFTHandler prototype to override the 
 * transferCNFTWithProof method with a working implementation.
 */

// Execute when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('[CNFT-Direct-Patch] Initializing...');
  
  // Wait for all scripts to load before applying patch
  window.addEventListener('load', () => {
    console.log('[CNFT-Direct-Patch] Window loaded, applying patch...');
    
    // Direct patch function
    function applyTransferPatch() {
      // Check if we have both the CNFTHandler and our implementation available
      if (!window.CNFTHandler) {
        console.error('[CNFT-Direct-Patch] CNFTHandler not found, cannot apply patch');
        return;
      }
      
      if (!window.fixedBubblegumTransfer) {
        console.error('[CNFT-Direct-Patch] fixedBubblegumTransfer not found, cannot apply patch');
        return;
      }
      
      console.log('[CNFT-Direct-Patch] Found required components, applying patch');
      
      try {
        // Create a reference to the old method we're going to override
        const oldTransferMethod = window.CNFTHandler.prototype.transferCNFTWithProof;
        
        // Override the method with our fixed implementation
        window.CNFTHandler.prototype.transferCNFTWithProof = async function(assetId, providedProofData, destinationAddress = null) {
          console.log('[CNFT-Direct-Patch] Using patched transferCNFTWithProof');
          
          // Input validation remains the same
          if (!assetId) {
            return { success: false, error: "Asset ID is required" };
          }
          
          if (!providedProofData) {
            return { success: false, error: "Proof data is required" };
          }
          
          try {
            // Get asset data
            let assetData;
            try {
              const assetResponse = await fetch(`/api/helius/asset/${assetId}`);
              const assetResult = await assetResponse.json();
              
              if (assetResult.success && assetResult.data) {
                assetData = assetResult.data;
                console.log('[CNFT-Direct-Patch] Asset data fetched successfully');
              } else {
                throw new Error("Failed to fetch asset data");
              }
            } catch (assetError) {
              console.error('[CNFT-Direct-Patch] Error fetching asset data:', assetError);
              throw new Error("Failed to get asset data");
            }
            
            // Use the project wallet if no destination specified
            const finalDestination = destinationAddress || "EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK";
            console.log('[CNFT-Direct-Patch] Destination wallet:', finalDestination);
            
            // Show a notification to the user
            if (window.BurnAnimations?.showNotification) {
              window.BurnAnimations.showNotification(
                "Processing cNFT Transfer",
                "Creating transaction using fixed implementation..."
              );
            }
            
            // Use our fixed implementation to do the transfer
            console.log('[CNFT-Direct-Patch] Calling fixed implementation');
            const result = await window.fixedBubblegumTransfer.transferCNFT({
              connection: this.connection,
              wallet: this.wallet,
              assetId,
              destinationAddress: finalDestination,
              proofData: providedProofData,
              assetData
            });
            
            // Process result
            if (result.success) {
              console.log('[CNFT-Direct-Patch] Transfer successful!');
              
              // Add to hidden assets
              if (window.hiddenAssets) {
                window.hiddenAssets.addHiddenAsset(assetId);
              }
              
              // Show achievement
              if (window.BurnAnimations?.showAchievement) {
                const assetName = assetData?.content?.metadata?.name || "cNFT";
                window.BurnAnimations.showAchievement(
                  "cNFT Trashed",
                  `You've successfully trashed ${assetName} to the project collection.`
                );
              }
              
              // Track stats
              if (window.checkAchievements) {
                window.checkAchievements('cnft_trash', 1);
              }
              
              // Return success result
              return {
                ...result,
                assetId,
                assetData
              };
            } else {
              console.error('[CNFT-Direct-Patch] Transfer failed:', result.error);
              
              // Show error notification
              if (window.BurnAnimations?.showNotification) {
                window.BurnAnimations.showNotification(
                  "cNFT Trash Failed",
                  `Error: ${result.error}`
                );
              }
              
              return result;
            }
          } catch (error) {
            console.error('[CNFT-Direct-Patch] Transfer error:', error);
            
            // Show error notification
            if (window.BurnAnimations?.showNotification) {
              window.BurnAnimations.showNotification(
                "cNFT Trash Failed",
                `Error: ${error.message}`
              );
            }
            
            // Fall back to original method as last resort
            try {
              console.log('[CNFT-Direct-Patch] Trying original implementation as fallback');
              return await oldTransferMethod.call(this, assetId, providedProofData, destinationAddress);
            } catch (fallbackError) {
              console.error('[CNFT-Direct-Patch] Fallback also failed:', fallbackError);
              return {
                success: false,
                error: error.message,
                fallbackError: fallbackError.message
              };
            }
          }
        };
        
        console.log('[CNFT-Direct-Patch] Successfully patched CNFTHandler.transferCNFTWithProof');
      } catch (error) {
        console.error('[CNFT-Direct-Patch] Error applying patch:', error);
      }
    }
    
    // Try to apply patch immediately, or wait for CNFTHandler to be available
    if (window.CNFTHandler) {
      applyTransferPatch();
    } else {
      // If not found immediately, try again after a short delay 
      // (this can happen when scripts load in different orders)
      console.log('[CNFT-Direct-Patch] CNFTHandler not found yet, will retry shortly');
      setTimeout(() => {
        if (window.CNFTHandler) {
          applyTransferPatch();
        } else {
          console.error('[CNFT-Direct-Patch] CNFTHandler not available after timeout');
        }
      }, 1000);
    }
  });
});