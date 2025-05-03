/**
 * Solo Transfer - Completely standalone cNFT transfer implementation
 * This file provides a completely self-contained implementation of cNFT transfers
 * that doesn't depend on the CNFTHandler class or any other external code.
 */

// Create a standalone namespace to avoid global pollution
(function() {
  // Expose our function globally
  window.soloTransferCNFT = async function(assetId) {
    console.log(`[Solo] Starting transfer for cNFT: ${assetId}`);
    
    // Check if we have any errors to report and help with debugging
    window.soloTransferErrors = window.soloTransferErrors || [];
    
    try {
      // Only proceed if we have a connected wallet
      if (!window.solana || !window.solana.isConnected) {
        throw new Error("Wallet not connected");
      }
      
      // Simple object with just what we need from the wallet
      const wallet = {
        publicKey: window.solana.publicKey,
        signTransaction: (tx) => window.solana.signTransaction(tx)
      };
      
      console.log(`[Solo] Using wallet: ${wallet.publicKey.toString()}`);
      
      // Notify the user we're processing
      if (window.BurnAnimations?.showNotification) {
        window.BurnAnimations.showNotification(
          "Processing cNFT",
          "Fetching asset data..."
        );
      }
      
      // Fetch both proof data and asset details in parallel
      console.log(`[Solo] Fetching proof and asset data for ${assetId}`);
      const [proofResp, assetResp] = await Promise.all([
        fetch(`/api/helius/asset-proof/${assetId}`),
        fetch(`/api/helius/asset/${assetId}`)
      ]);
      
      if (!proofResp.ok || !assetResp.ok) {
        throw new Error("Failed to fetch asset data from server");
      }
      
      const proofData = await proofResp.json();
      const assetData = await assetResp.json();
      
      if (!proofData.success || !assetData.success) {
        throw new Error("Invalid asset data received from server");
      }
      
      console.log(`[Solo] Asset and proof data retrieved successfully`);
      
      // Notify the user we're preparing the transaction
      if (window.BurnAnimations?.showNotification) {
        window.BurnAnimations.showNotification(
          "Processing cNFT",
          "Preparing transaction..."
        );
      }
      
      // Call the server to prepare the transaction for us
      console.log("[Solo] Calling server to prepare transaction");
      const prepareResp = await fetch('/api/server-transfer/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerPublicKey: wallet.publicKey.toString(),
          assetId,
          proofData: proofData.data
        })
      });
      
      if (!prepareResp.ok) {
        const errorText = await prepareResp.text();
        throw new Error(`Server error: ${errorText}`);
      }
      
      const prepared = await prepareResp.json();
      if (!prepared.success) {
        throw new Error(`Transaction preparation failed: ${prepared.error}`);
      }
      
      console.log("[Solo] Transaction prepared successfully");
      
      // Notify the user we're signing
      if (window.BurnAnimations?.showNotification) {
        window.BurnAnimations.showNotification(
          "Processing cNFT",
          "Signing transaction..."
        );
      }
      
      // Handle serialized transaction data
      const txBuffer = Buffer.from(prepared.transaction, 'base64');
      
      // We need to determine which Transaction implementation to use
      let Transaction;
      let tx;
      
      try {
        // Try different ways to get the Transaction constructor
        if (window.solanaWeb3?.Transaction) {
          console.log("[Solo] Using window.solanaWeb3.Transaction");
          Transaction = window.solanaWeb3.Transaction;
        } else if (window.solana?.Transaction) {
          console.log("[Solo] Using window.solana.Transaction");
          Transaction = window.solana.Transaction;
        } else if (window.solana?.Web3?.Transaction) {
          console.log("[Solo] Using window.solana.Web3.Transaction");
          Transaction = window.solana.Web3.Transaction;
        } else {
          // Last resort - check for any global Transaction
          console.log("[Solo] Using global Transaction object");
          Transaction = window.Transaction;
        }
        
        // Create the transaction object from the serialized data
        if (Transaction) {
          tx = Transaction.from(txBuffer);
        } else {
          throw new Error("Cannot find Transaction constructor");
        }
      } catch (txError) {
        // Log the error for debugging
        console.error("[Solo] Error creating transaction:", txError);
        window.soloTransferErrors.push({
          stage: "transaction-creation",
          error: txError,
          message: txError.message,
          stack: txError.stack
        });
        
        // Try a different approach - create a simple object
        console.log("[Solo] Falling back to manual transaction object");
        tx = {
          serialize: function() { return txBuffer; },
          serializeMessage: function() { return txBuffer; }
        };
      }
      
      let signedTx;
      try {
        // Sign the transaction with the wallet
        console.log("[Solo] Signing transaction with wallet");
        signedTx = await wallet.signTransaction(tx);
      } catch (signError) {
        console.error("[Solo] Error signing transaction:", signError);
        window.soloTransferErrors.push({
          stage: "transaction-signing",
          error: signError,
          message: signError.message,
          stack: signError.stack
        });
        throw new Error(`Failed to sign transaction: ${signError.message}`);
      }
      
      console.log("[Solo] Transaction signed successfully");
      
      // Notify the user we're submitting
      if (window.BurnAnimations?.showNotification) {
        window.BurnAnimations.showNotification(
          "Processing cNFT",
          "Submitting to network..."
        );
      }
      
      // Serialize and submit the signed transaction
      let serializedTx;
      try {
        if (signedTx.serialize) {
          console.log("[Solo] Using transaction.serialize()");
          serializedTx = Buffer.from(signedTx.serialize()).toString('base64');
        } else {
          console.log("[Solo] Using txBuffer directly");
          serializedTx = Buffer.from(txBuffer).toString('base64');
        }
      } catch (serError) {
        console.error("[Solo] Error serializing transaction:", serError);
        window.soloTransferErrors.push({
          stage: "transaction-serialization", 
          error: serError,
          message: serError.message,
          stack: serError.stack
        });
        throw new Error(`Failed to serialize transaction: ${serError.message}`);
      }
      
      // Submit the signed transaction to the server
      console.log("[Solo] Submitting signed transaction to server");
      const submitResp = await fetch('/api/server-transfer/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signedTransaction: serializedTx,
          assetId
        })
      });
      
      if (!submitResp.ok) {
        const errorText = await submitResp.text();
        throw new Error(`Server submission error: ${errorText}`);
      }
      
      const result = await submitResp.json();
      if (!result.success) {
        throw new Error(`Transaction submission failed: ${result.error}`);
      }
      
      console.log(`[Solo] Transaction successful! Signature: ${result.signature}`);
      
      // Add to hidden assets to update UI immediately
      if (window.hiddenAssets) {
        window.hiddenAssets.addHiddenAsset(assetId);
      }
      
      // Show success notification
      if (window.BurnAnimations?.showAchievement) {
        window.BurnAnimations.showAchievement(
          "cNFT Trashed",
          "Successfully transferred cNFT to project collection"
        );
      }
      
      // Track achievements if available
      if (window.checkAchievements) {
        window.checkAchievements('cnft_trash', 1);
      }
      
      // Return success result
      return {
        success: true,
        signature: result.signature,
        message: "Successfully trashed cNFT to project collection",
        explorerUrl: `https://solscan.io/tx/${result.signature}`
      };
    } catch (error) {
      console.error("[Solo] Error:", error);
      window.soloTransferErrors.push({
        stage: "general-execution",
        error: error,
        message: error.message,
        stack: error.stack,
        time: new Date().toISOString()
      });
      
      // Show error notification
      if (window.BurnAnimations?.showNotification) {
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
  
  // Utility to patch buttons with our implementation
  function patchButtons() {
    console.log("[Solo] Patching cNFT buttons with solo implementation");
    
    // Find all trash/burn buttons for cNFTs
    const buttons = document.querySelectorAll('.trash-button, .burn-button, [data-action="trash"], [data-action="burn-cnft"]');
    console.log(`[Solo] Found ${buttons.length} buttons to patch`);
    
    buttons.forEach(button => {
      // Store original handler
      const originalHandler = button.onclick;
      
      // Replace with our handler
      button.onclick = async function(event) {
        const assetId = button.getAttribute('data-asset-id');
        if (assetId && button.classList.contains('cnft')) {
          // This is a cNFT button, handle it
          event.preventDefault();
          event.stopPropagation();
          
          console.log(`[Solo] Intercepted click for cNFT ${assetId}`);
          
          // Show processing notification
          if (window.BurnAnimations?.showNotification) {
            window.BurnAnimations.showNotification(
              "Processing cNFT",
              "Starting transfer process..."
            );
          }
          
          // Use our implementation
          const result = await window.soloTransferCNFT(assetId);
          
          // Update UI based on result
          if (result.success) {
            console.log(`[Solo] Transfer successful for ${assetId}`);
            // You might want to refresh the UI here
          } else {
            console.error(`[Solo] Transfer failed for ${assetId}:`, result.error);
          }
          
          return false;
        } else if (originalHandler) {
          // Not a cNFT button, use original handler
          return originalHandler.call(this, event);
        }
      };
    });
    
    console.log("[Solo] Button patching completed");
  }
  
  // Wait for DOM to be fully loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      // Wait a bit for other components to initialize
      setTimeout(patchButtons, 2000);
    });
  } else {
    // DOM already loaded, wait a bit for React components
    setTimeout(patchButtons, 2000);
  }
  
  // Also patch on a regular interval to catch dynamically added buttons
  setInterval(patchButtons, 5000);
  
  console.log("[Solo] Transfer module initialized");
})();