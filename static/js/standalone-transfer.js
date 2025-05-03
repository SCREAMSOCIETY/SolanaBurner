/**
 * Standalone Transfer for cNFTs
 * 
 * This is a completely self-contained implementation that doesn't
 * depend on any external modules or the CNFTHandler class.
 */

// Define a standalone function to bypass TransactionInstruction issues
// We'll implement this right away without waiting for DOMContentLoaded
(function() {
  // Make the function available globally
  window.standaloneTransferCNFT = async function(assetId) {
    console.log(`[Standalone] Starting transfer for ${assetId}`);
    
    try {
      // Make sure wallet is connected
      if (!window.solana || !window.solana.isConnected) {
        throw new Error("Wallet not connected");
      }
      
      // Simplify the wallet interface to what we need
      const wallet = {
        publicKey: window.solana.publicKey,
        signTransaction: function(tx) {
          return window.solana.signTransaction(tx);
        }
      };
      
      // Log wallet information
      console.log(`[Standalone] Using wallet: ${wallet.publicKey.toString()}`);
      
      // Get proof data for the asset
      console.log(`[Standalone] Fetching proof data`);
      const proofResponse = await fetch(`/api/helius/asset-proof/${assetId}`);
      if (!proofResponse.ok) {
        throw new Error("Failed to fetch asset proof");
      }
      
      const proofResult = await proofResponse.json();
      if (!proofResult.success || !proofResult.data) {
        throw new Error("Invalid proof data received");
      }
      
      const proofData = proofResult.data;
      console.log(`[Standalone] Proof data retrieved successfully`);
      
      // Show notification to user
      if (window.BurnAnimations && window.BurnAnimations.showNotification) {
        window.BurnAnimations.showNotification(
          "Processing Transfer",
          "Preparing transaction on server..."
        );
      }
      
      // Call server to build the transaction
      console.log(`[Standalone] Requesting transaction from server`);
      const prepareResponse = await fetch('/api/server-transfer/prepare', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ownerPublicKey: wallet.publicKey.toString(),
          assetId,
          proofData
        })
      });
      
      // Check for errors
      if (!prepareResponse.ok) {
        const errorData = await prepareResponse.json();
        throw new Error(`Server error: ${errorData.error || prepareResponse.statusText}`);
      }
      
      const prepareResult = await prepareResponse.json();
      if (!prepareResult.success || !prepareResult.transaction) {
        throw new Error(`Error preparing transaction: ${prepareResult.error || 'Unknown error'}`);
      }
      
      console.log(`[Standalone] Transaction prepared, signing...`);
      
      // Convert the base64 transaction buffer to a Transaction object
      const transactionBuffer = Buffer.from(prepareResult.transaction, 'base64');
      
      // Create the transaction object, handling different web3.js imports
      let transaction;
      if (window.solana && window.solana.Transaction) {
        // Use the wallet's Transaction constructor if available
        transaction = solana.Transaction.from(transactionBuffer);
      } else {
        // If Transaction isn't available in expected places, notify the user
        console.error("[Standalone] Cannot find Transaction constructor");
        throw new Error("Cannot access Solana Transaction class. Please try again or refresh the page.");
      }
      
      // Sign the transaction
      console.log(`[Standalone] Signing transaction`);
      const signedTransaction = await wallet.signTransaction(transaction);
      
      // Serialize for sending to server
      const serializedTransaction = Buffer.from(
        signedTransaction.serialize()
      ).toString('base64');
      
      // Show notification
      if (window.BurnAnimations && window.BurnAnimations.showNotification) {
        window.BurnAnimations.showNotification(
          "Processing Transfer",
          "Submitting transaction to network..."
        );
      }
      
      // Submit to server
      console.log(`[Standalone] Submitting signed transaction`);
      const submitResponse = await fetch('/api/server-transfer/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          signedTransaction: serializedTransaction,
          assetId
        })
      });
      
      // Check for errors
      if (!submitResponse.ok) {
        const errorData = await submitResponse.json();
        throw new Error(`Server error: ${errorData.error || submitResponse.statusText}`);
      }
      
      const submitResult = await submitResponse.json();
      if (!submitResult.success) {
        throw new Error(`Error submitting transaction: ${submitResult.error || 'Unknown error'}`);
      }
      
      console.log(`[Standalone] Transaction confirmed: ${submitResult.signature}`);
      
      // Add to hidden assets to update UI immediately
      if (window.hiddenAssets) {
        window.hiddenAssets.addHiddenAsset(assetId);
      }
      
      // Show achievement notification
      if (window.BurnAnimations && window.BurnAnimations.showAchievement) {
        window.BurnAnimations.showAchievement(
          "cNFT Trashed",
          `Successfully transferred cNFT to project collection`
        );
      }
      
      // Update achievements
      if (window.checkAchievements) {
        window.checkAchievements('cnft_trash', 1);
      }
      
      // Return success result
      return {
        success: true,
        signature: submitResult.signature,
        message: "Successfully transferred cNFT to project collection",
        explorerUrl: `https://solscan.io/tx/${submitResult.signature}`
      };
    } catch (error) {
      console.error(`[Standalone] Error:`, error);
      
      // Show error notification
      if (window.BurnAnimations && window.BurnAnimations.showNotification) {
        window.BurnAnimations.showNotification(
          "cNFT Trash Failed",
          `Error: ${error.message}`
        );
      }
      
      // Return error result
      return {
        success: false,
        error: error.message
      };
    }
  };
  
  // Add a utility function to patch buttons
  window.patchCNFTButtons = function() {
    console.log("[Standalone] Patching cNFT buttons");
    
    // Find all trash/burn buttons for cNFTs
    const buttons = document.querySelectorAll('.trash-button, .burn-button, [data-action="trash"], [data-action="burn-cnft"]');
    console.log(`[Standalone] Found ${buttons.length} buttons to patch`);
    
    buttons.forEach(button => {
      // Save the original click handler
      const originalClick = button.onclick;
      
      // Replace with our handler
      button.onclick = async function(event) {
        // Get the asset ID from the button
        const assetId = button.getAttribute('data-asset-id');
        
        // Check if this is a cNFT button
        if (assetId && button.classList.contains('cnft')) {
          // Stop the default behavior
          event.preventDefault();
          event.stopPropagation();
          
          console.log(`[Standalone] Intercepted click for cNFT ${assetId}`);
          
          // Show processing notification
          if (window.BurnAnimations && window.BurnAnimations.showNotification) {
            window.BurnAnimations.showNotification(
              "Processing cNFT Transfer",
              "Preparing transaction..."
            );
          }
          
          // Use our standalone transfer function
          await window.standaloneTransferCNFT(assetId);
          return false;
        } else if (originalClick) {
          // Use the original handler for non-cNFT buttons
          return originalClick.call(this, event);
        }
      };
    });
    
    console.log("[Standalone] Button patching completed");
  };
  
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(window.patchCNFTButtons, 2000);
    });
  } else {
    // DOM already loaded, wait a bit for React components
    setTimeout(window.patchCNFTButtons, 2000);
  }
  
  console.log("[Standalone] Transfer module initialized");
})();