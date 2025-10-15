/******/ (() => { // webpackBootstrap
var __webpack_exports__ = {};
/*!*******************************************!*\
  !*** ./static/js/self-contained-patch.js ***!
  \*******************************************/
/**
 * Self-contained Patch for CNFTHandler
 * This script patches the CNFTHandler class to use our self-contained implementation
 * that doesn't rely on external TransactionInstruction
 */

document.addEventListener('DOMContentLoaded', () => {
  console.log('[Self-Contained-Patch] Initializing...');
  
  // Wait for all scripts to load before applying patch
  window.addEventListener('load', () => {
    console.log('[Self-Contained-Patch] Window loaded, applying patch...');
    
    // The CNFTHandler is loaded differently based on webpack build
    // It might be available at window.CNFTHandler or window.cnftHandler.CNFTHandler
    setTimeout(() => {
      applyPatch();
    }, 500); // Wait for scripts to initialize
  });
  
  // Direct patch function
  function applyPatch() {
    // Determine where CNFTHandler is located
    let CNFTHandlerClass = null;
    let prototype = null;
    
    if (window.CNFTHandler) {
      console.log('[Self-Contained-Patch] Found CNFTHandler on window');
      CNFTHandlerClass = window.CNFTHandler;
      prototype = window.CNFTHandler.prototype;
    } else if (window.cnftHandler && window.cnftHandler.CNFTHandler) {
      console.log('[Self-Contained-Patch] Found CNFTHandler in cnftHandler module');
      CNFTHandlerClass = window.cnftHandler.CNFTHandler;
      prototype = window.cnftHandler.CNFTHandler.prototype;
    } else {
      console.error('[Self-Contained-Patch] Unable to find CNFTHandler class');
      return;
    }
    
    // Check if our self-contained transfer is available
    if (!window.selfContainedTransfer) {
      console.error('[Self-Contained-Patch] self-contained-transfer not found, cannot apply patch');
      return;
    }
    
    console.log('[Self-Contained-Patch] Found required components, applying patch');
    
    try {
      // Save original method
      const originalTransferCNFTWithProof = prototype.transferCNFTWithProof;
      
      // Override with our self-contained implementation
      prototype.transferCNFTWithProof = async function(assetId, providedProofData, destinationAddress = null) {
        console.log('[Self-Contained-Patch] Using self-contained implementation');
        
        // Basic validation
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
              console.log('[Self-Contained-Patch] Asset data fetched successfully');
            } else {
              throw new Error("Failed to fetch asset data");
            }
          } catch (assetError) {
            console.error('[Self-Contained-Patch] Error fetching asset data:', assetError);
            throw new Error("Failed to get asset data");
          }
          
          // Default to project wallet if no destination
          const finalDestination = destinationAddress || "EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK";
          console.log('[Self-Contained-Patch] Destination wallet:', finalDestination);
          
          // Show notification to user
          if (window.BurnAnimations?.showNotification) {
            window.BurnAnimations.showNotification(
              "Processing cNFT Transfer",
              "Creating transaction with self-contained implementation..."
            );
          }
          
          // Use our self-contained implementation
          console.log('[Self-Contained-Patch] Calling self-contained implementation');
          const result = await window.selfContainedTransfer.transferCNFT({
            connection: this.connection,
            wallet: this.wallet,
            assetId,
            destinationAddress: finalDestination,
            proofData: providedProofData,
            assetData
          });
          
          // Process result
          if (result.success) {
            console.log('[Self-Contained-Patch] Transfer successful!');
            
            // Add to hidden assets
            if (window.hiddenAssets) {
              window.hiddenAssets.addHiddenAsset(assetId);
            }
            
            // Show achievement notification
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
            
            // Return success
            return {
              ...result,
              assetId,
              assetData
            };
          } else {
            console.error('[Self-Contained-Patch] Transfer failed:', result.error);
            
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
          console.error('[Self-Contained-Patch] Transfer error:', error);
          
          // Show error notification
          if (window.BurnAnimations?.showNotification) {
            window.BurnAnimations.showNotification(
              "cNFT Trash Failed",
              `Error: ${error.message}`
            );
          }
          
          // Fallback to original method
          try {
            console.log('[Self-Contained-Patch] Trying original implementation as fallback');
            return await originalTransferCNFTWithProof.call(this, assetId, providedProofData, destinationAddress);
          } catch (fallbackError) {
            console.error('[Self-Contained-Patch] Fallback also failed:', fallbackError);
            return {
              success: false,
              error: error.message,
              fallbackError: fallbackError.message
            };
          }
        }
      };
      
      console.log('[Self-Contained-Patch] Successfully patched CNFTHandler.transferCNFTWithProof');
      
      // Also patch directly onto window for direct access
      if (window.cnftHandler) {
        window.cnftHandler.selfContainedTransferCNFT = async function(assetId, proofData, destination) {
          if (!window.selfContainedTransfer) {
            return { success: false, error: "Self-contained transfer not available" };
          }
          
          try {
            // Get connection and wallet from window
            const connection = window._solanaConnection;
            const wallet = window._solanaWallet;
            
            if (!connection || !wallet) {
              return { success: false, error: "Connection or wallet not available" };
            }
            
            // Fetch asset data
            let assetData;
            try {
              const assetResponse = await fetch(`/api/helius/asset/${assetId}`);
              const assetResult = await assetResponse.json();
              
              if (assetResult.success && assetResult.data) {
                assetData = assetResult.data;
              } else {
                throw new Error("Failed to fetch asset data");
              }
            } catch (assetError) {
              console.error("Error fetching asset data:", assetError);
              throw new Error("Failed to get asset data");
            }
            
            // Use final destination
            const finalDestination = destination || "EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK";
            
            // Use our self-contained implementation directly
            return await window.selfContainedTransfer.transferCNFT({
              connection,
              wallet,
              assetId,
              destinationAddress: finalDestination,
              proofData,
              assetData
            });
          } catch (error) {
            console.error("Global selfContainedTransferCNFT error:", error);
            return {
              success: false,
              error: error.message
            };
          }
        };
        
        console.log('[Self-Contained-Patch] Added direct access method to window.cnftHandler');
      }
    } catch (error) {
      console.error('[Self-Contained-Patch] Error applying patch:', error);
    }
  }
});
window["self-contained-patch"] = __webpack_exports__;
/******/ })()
;
//# sourceMappingURL=self-contained-patch.js.map