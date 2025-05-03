/**
 * CNFT Handler Patch
 * 
 * This script patches the CNFTHandler class with a fixed implementation for transferring cNFTs.
 * The original implementation in cnft-handler.js has issues with the Anchor instruction format
 * that cause "InstructionFallbackNotFound" errors. This patch replaces the problematic method
 * with a working implementation that uses the official Metaplex Bubblegum approach.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Wait for the page to fully load before patching
  window.addEventListener('load', () => {
    console.log('[CNFT Handler Patch] Initializing...');
    
    // Check if CNFTHandler and our fixed implementation are available
    if (window.cnftHandler && window.cnftHandler.CNFTHandler && window.fixedBubblegumTransfer) {
      console.log('[CNFT Handler Patch] CNFTHandler and fixedBubblegumTransfer found, applying patch');
      
      try {
        // Save a reference to the original prototype
        const originalPrototype = window.cnftHandler.CNFTHandler.prototype;
        
        // Save a reference to the original methods we want to preserve
        const originalTransferCNFT = originalPrototype.transferCNFT;
        const originalTransferCNFTWithProof = originalPrototype.transferCNFTWithProof;
        
        // Replace the transferCNFTWithProof method with our fixed implementation
        originalPrototype.transferCNFTWithProof = async function(assetId, providedProofData, destinationAddress = null) {
          console.log('[CNFT Handler Patch] Using patched transferCNFTWithProof method');
          
          if (!assetId) {
            return {
              success: false,
              error: "Asset ID is required",
            };
          }
          
          if (!providedProofData) {
            return {
              success: false,
              error: "Proof data is required for transferCNFTWithProof method",
            };
          }
          
          try {
            // Get asset data - we still need this for metadata
            let assetData = null;
            try {
              // Fetch asset data from API
              const assetResponse = await fetch(`/api/helius/asset/${assetId}`);
              const assetResult = await assetResponse.json();
              
              if (assetResult.success && assetResult.data) {
                assetData = assetResult.data;
                console.log("[CNFT Handler Patch] Successfully fetched asset data for cNFT");
              } else {
                throw new Error("Failed to fetch asset data");
              }
            } catch (assetError) {
              console.error("[CNFT Handler Patch] Error fetching asset data:", assetError);
              throw new Error("Failed to get cNFT asset data. Cannot complete transfer");
            }
            
            // Validate the destination address
            const finalDestination = destinationAddress || "EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK";
            
            console.log("[CNFT Handler Patch] Destination wallet:", finalDestination);
            console.log("[CNFT Handler Patch] Using fixed bubblegum transfer implementation");
            
            // Show processing notification
            if (typeof window !== "undefined" && window.BurnAnimations?.showNotification) {
              window.BurnAnimations.showNotification(
                "Processing cNFT Transfer", 
                "Creating transfer transaction..."
              );
            }
            
            // Use our fixed implementation
            const result = await window.fixedBubblegumTransfer.transferCNFT({
              connection: this.connection,
              wallet: this.wallet,
              assetId,
              destinationAddress: finalDestination,
              proofData: providedProofData,
              assetData
            });
            
            // Check if transfer was successful
            if (result.success) {
              console.log("[CNFT Handler Patch] cNFT transfer successful!");
              
              // Add to hidden assets in localStorage
              if (typeof window !== 'undefined' && window.hiddenAssets) {
                window.hiddenAssets.addHiddenAsset(assetId);
              }
              
              // Show achievement notification
              if (typeof window !== 'undefined' && window.BurnAnimations?.showAchievement) {
                const assetName = assetData?.content?.metadata?.name || "cNFT";
                window.BurnAnimations.showAchievement(
                  "cNFT Trashed", 
                  `You've successfully trashed ${assetName} to our collection.`
                );
              }
              
              // Send to burn success event to track stats
              if (typeof window !== 'undefined' && window.checkAchievements) {
                window.checkAchievements('cnft_trash', 1);
              }
              
              return {
                ...result,
                assetId,
                assetData
              };
            } else {
              console.error("[CNFT Handler Patch] cNFT transfer failed:", result.error);
              
              // Show error notification
              if (typeof window !== 'undefined' && window.BurnAnimations?.showNotification) {
                window.BurnAnimations.showNotification(
                  "cNFT Trash Failed", 
                  `Error: ${result.error}`
                );
              }
              
              return result;
            }
          } catch (error) {
            console.error("[CNFT Handler Patch] Error in transferCNFTWithProof:", error);
            
            // Show error notification
            if (typeof window !== 'undefined' && window.BurnAnimations?.showNotification) {
              window.BurnAnimations.showNotification(
                "cNFT Trash Failed", 
                `Error: ${error.message}`
              );
            }
            
            // Try to fall back to the original implementation as a last resort
            console.log("[CNFT Handler Patch] Trying original implementation as fallback");
            try {
              return await originalTransferCNFTWithProof.call(this, assetId, providedProofData, destinationAddress);
            } catch (fallbackError) {
              console.error("[CNFT Handler Patch] Fallback also failed:", fallbackError);
              return {
                success: false,
                error: error.message,
                fallbackError: fallbackError.message
              };
            }
          }
        };
        
        console.log('[CNFT Handler Patch] Successfully patched CNFTHandler.transferCNFTWithProof');
      } catch (error) {
        console.error('[CNFT Handler Patch] Error patching CNFTHandler:', error);
      }
    } else {
      console.error('[CNFT Handler Patch] CNFTHandler or fixedBubblegumTransfer not found');
    }
  });
});