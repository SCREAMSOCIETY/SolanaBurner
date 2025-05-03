/******/ (() => { // webpackBootstrap
var __webpack_exports__ = {};
/*!****************************************!*\
  !*** ./static/js/server-side-patch.js ***!
  \****************************************/
/**
 * Server-Side Transfer Patch for CNFTHandler
 * 
 * This script patches the CNFTHandler to use our server-side implementation
 * which avoids client-side TransactionInstruction class issues completely.
 */

document.addEventListener('DOMContentLoaded', () => {
  console.log('[Server-Side-Patch] Initializing...');
  
  // Wait for all scripts to load before applying patch
  window.addEventListener('load', () => {
    console.log('[Server-Side-Patch] Window loaded, applying patch...');
    
    // Try to apply the patch after a short delay
    setTimeout(() => {
      applyServerSidePatch();
    }, 1000);
  });
  
  // Direct patch function
  function applyServerSidePatch() {
    // Determine where CNFTHandler is located
    let CNFTHandlerClass = null;
    let prototype = null;
    
    if (window.CNFTHandler) {
      console.log('[Server-Side-Patch] Found CNFTHandler on window');
      CNFTHandlerClass = window.CNFTHandler;
      prototype = window.CNFTHandler.prototype;
    } else if (window.cnftHandler && window.cnftHandler.CNFTHandler) {
      console.log('[Server-Side-Patch] Found CNFTHandler in cnftHandler module');
      CNFTHandlerClass = window.cnftHandler.CNFTHandler;
      prototype = window.cnftHandler.CNFTHandler.prototype;
    }
    
    if (!prototype) {
      console.error('[Server-Side-Patch] Unable to find CNFTHandler class');
      
      // As a last resort, create a global handler function
      window.serverSideTransferCNFT = async function(assetId, proofData, destination) {
        if (!window.serverSideTransfer) {
          return { success: false, error: "Server-side transfer not available" };
        }
        
        try {
          // Get connection and wallet from window
          const connection = window._solanaConnection;
          const wallet = window._solanaWallet;
          
          if (!connection || !wallet) {
            return { success: false, error: "Connection or wallet not available" };
          }
          
          // Use the destination or default to the project wallet
          const finalDestination = destination || "EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK";
          
          // Use our server-side implementation directly
          return await window.serverSideTransfer.transferCNFT({
            connection,
            wallet,
            assetId,
            destinationAddress: finalDestination,
            proofData
          });
        } catch (error) {
          console.error("Global serverSideTransferCNFT error:", error);
          return {
            success: false,
            error: error.message
          };
        }
      };
      
      console.log('[Server-Side-Patch] Added global serverSideTransferCNFT function as fallback');
      return;
    }
    
    // Check if our server-side transfer is available
    if (!window.serverSideTransfer) {
      console.error('[Server-Side-Patch] server-side-transfer not found, cannot apply patch');
      return;
    }
    
    console.log('[Server-Side-Patch] Found required components, applying patch');
    
    try {
      // Save original method
      const originalTransferCNFTWithProof = prototype.transferCNFTWithProof;
      
      // Override with our server-side implementation
      prototype.transferCNFTWithProof = async function(assetId, providedProofData, destinationAddress = null) {
        console.log('[Server-Side-Patch] Using server-side implementation');
        
        // Basic validation
        if (!assetId) {
          return { success: false, error: "Asset ID is required" };
        }
        
        if (!providedProofData) {
          return { success: false, error: "Proof data is required" };
        }
        
        try {
          // Get asset data - we still need this for UI display
          let assetData = null;
          try {
            const assetResponse = await fetch(`/api/helius/asset/${assetId}`);
            const assetResult = await assetResponse.json();
            
            if (assetResult.success && assetResult.data) {
              assetData = assetResult.data;
              console.log('[Server-Side-Patch] Asset data fetched successfully');
            } else {
              throw new Error("Failed to fetch asset data");
            }
          } catch (assetError) {
            console.error('[Server-Side-Patch] Error fetching asset data:', assetError);
            throw new Error("Failed to get asset data");
          }
          
          // Default to project wallet if no destination
          const finalDestination = destinationAddress || "EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK";
          console.log('[Server-Side-Patch] Destination wallet:', finalDestination);
          
          // Show notification to user
          if (window.BurnAnimations?.showNotification) {
            window.BurnAnimations.showNotification(
              "Processing cNFT Transfer",
              "Creating transaction with server-side implementation..."
            );
          }
          
          // Use our server-side implementation
          console.log('[Server-Side-Patch] Calling server-side implementation');
          const result = await window.serverSideTransfer.transferCNFT({
            connection: this.connection,
            wallet: this.wallet,
            assetId,
            destinationAddress: finalDestination,
            proofData: providedProofData
          });
          
          // Process result
          if (result.success) {
            console.log('[Server-Side-Patch] Transfer successful!');
            
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
            console.error('[Server-Side-Patch] Transfer failed:', result.error);
            
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
          console.error('[Server-Side-Patch] Transfer error:', error);
          
          // Show error notification
          if (window.BurnAnimations?.showNotification) {
            window.BurnAnimations.showNotification(
              "cNFT Trash Failed",
              `Error: ${error.message}`
            );
          }
          
          // Fallback to original method
          try {
            console.log('[Server-Side-Patch] Trying original implementation as fallback');
            return await originalTransferCNFTWithProof.call(this, assetId, providedProofData, destinationAddress);
          } catch (fallbackError) {
            console.error('[Server-Side-Patch] Fallback also failed:', fallbackError);
            return {
              success: false,
              error: error.message,
              fallbackError: fallbackError.message
            };
          }
        }
      };
      
      console.log('[Server-Side-Patch] Successfully patched CNFTHandler.transferCNFTWithProof');
      
      // Provide a direct access function on window
      window.serverSideTransferCNFT = async function(assetId, proofData, destination) {
        try {
          // Get connection and wallet from window
          const connection = window._solanaConnection;
          const wallet = window._solanaWallet;
          
          if (!connection || !wallet) {
            return { success: false, error: "Connection or wallet not available" };
          }
          
          // Use the destination or default to the project wallet
          const finalDestination = destination || "EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK";
          
          console.log(`[Global] Using server-side transfer for ${assetId}`);
          
          // Use our server-side implementation
          return await window.serverSideTransfer.transferCNFT({
            connection,
            wallet,
            assetId,
            destinationAddress: finalDestination,
            proofData
          });
        } catch (error) {
          console.error("Global serverSideTransferCNFT error:", error);
          return {
            success: false,
            error: error.message
          };
        }
      };
      
      console.log('[Server-Side-Patch] Added global serverSideTransferCNFT function');
    } catch (error) {
      console.error('[Server-Side-Patch] Error applying patch:', error);
    }
  }
});
window["server-side-patch"] = __webpack_exports__;
/******/ })()
;
//# sourceMappingURL=server-side-patch.js.map