/**
 * Direct Transfer Implementation
 * This is a completely standalone function for transferring cNFTs
 * without relying on the CNFTHandler class or TransactionInstruction
 */

// Immediately expose a global function for transferring cNFTs
window.directTransferCNFT = async function(assetId) {
  console.log(`[DirectTransfer] Starting transfer for ${assetId}`);
  
  try {
    // 1. Get wallet and connection information
    if (!window.solana || !window.solana.isConnected) {
      throw new Error("Wallet not connected");
    }
    
    const wallet = {
      publicKey: window.solana.publicKey,
      signTransaction: window.solana.signTransaction.bind(window.solana)
    };
    
    console.log(`[DirectTransfer] Using wallet: ${wallet.publicKey.toString()}`);
    
    // 2. Fetch asset proof data
    console.log(`[DirectTransfer] Fetching proof data for ${assetId}`);
    const proofResponse = await fetch(`/api/helius/asset-proof/${assetId}`);
    if (!proofResponse.ok) {
      throw new Error("Failed to fetch asset proof");
    }
    const proofResult = await proofResponse.json();
    if (!proofResult.success || !proofResult.data) {
      throw new Error("Invalid proof data received");
    }
    
    const proofData = proofResult.data;
    console.log(`[DirectTransfer] Got proof data with ${proofData.proof.length} proof nodes`);
    
    // 3. Use server-side endpoints for transfer
    console.log(`[DirectTransfer] Preparing transaction on server`);
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
    
    // Check response
    if (!prepareResponse.ok) {
      const errorData = await prepareResponse.json();
      throw new Error(`Server error: ${errorData.error || prepareResponse.statusText}`);
    }
    
    const prepareResult = await prepareResponse.json();
    if (!prepareResult.success || !prepareResult.transaction) {
      throw new Error(`Error preparing transaction: ${prepareResult.error || 'Unknown error'}`);
    }
    
    console.log(`[DirectTransfer] Transaction prepared, signing with wallet`);
    
    // 4. Convert base64 transaction and sign it
    // Import Transaction class from directly from the loaded web3.js library
    let Transaction;
    if (window.solanaWeb3) {
      Transaction = window.solanaWeb3.Transaction;
    } else if (window.solana && window.solana.Transaction) {
      Transaction = window.solana.Transaction;
    } else {
      // Fallback - import directly
      Transaction = window.solana.Web3.Transaction;
    }
    
    const transaction = Transaction.from(
      Buffer.from(prepareResult.transaction, 'base64')
    );
    
    // Sign transaction
    const signedTransaction = await wallet.signTransaction(transaction);
    
    // Serialize signed transaction
    const serializedTransaction = Buffer.from(
      signedTransaction.serialize()
    ).toString('base64');
    
    // 5. Submit the signed transaction
    console.log(`[DirectTransfer] Submitting signed transaction`);
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
    
    // Check response
    if (!submitResponse.ok) {
      const errorData = await submitResponse.json();
      throw new Error(`Server error: ${errorData.error || submitResponse.statusText}`);
    }
    
    const submitResult = await submitResponse.json();
    if (!submitResult.success) {
      throw new Error(`Error submitting transaction: ${submitResult.error || 'Unknown error'}`);
    }
    
    console.log(`[DirectTransfer] Transaction confirmed! ${submitResult.signature}`);
    
    // 6. Add to hidden assets
    if (window.hiddenAssets) {
      window.hiddenAssets.addHiddenAsset(assetId);
    }
    
    // 7. Show achievement notification
    if (window.BurnAnimations?.showAchievement) {
      window.BurnAnimations.showAchievement(
        "cNFT Trashed",
        `You've successfully trashed your cNFT to the project collection.`
      );
    }
    
    // 8. Track stats
    if (window.checkAchievements) {
      window.checkAchievements('cnft_trash', 1);
    }
    
    return {
      success: true,
      signature: submitResult.signature,
      message: "Successfully transferred cNFT to project collection",
      explorerUrl: `https://solscan.io/tx/${submitResult.signature}`
    };
  } catch (error) {
    console.error(`[DirectTransfer] Error:`, error);
    
    // Show error notification
    if (window.BurnAnimations?.showNotification) {
      window.BurnAnimations.showNotification(
        "cNFT Trash Failed",
        `Error: ${error.message}`
      );
    }
    
    return {
      success: false,
      error: error.message
    };
  }
};

// Add click handler to all bulk-burn buttons to use our direct implementation
document.addEventListener('DOMContentLoaded', () => {
  console.log("[DirectTransfer] Setting up direct transfer handlers");
  
  // Expose to window
  window.directTransfer = {
    transferCNFT: window.directTransferCNFT
  };
  
  // Wait for elements to be available
  setTimeout(() => {
    // Find and patch all trash/transfer buttons
    const trashButtons = document.querySelectorAll('.trash-button, .burn-button, [data-action="trash"], [data-action="burn-cnft"]');
    console.log(`[DirectTransfer] Found ${trashButtons.length} trash buttons to patch`);
    
    trashButtons.forEach(button => {
      const originalClick = button.onclick;
      button.onclick = async function(event) {
        const assetId = button.getAttribute('data-asset-id');
        if (assetId && button.classList.contains('cnft')) {
          event.preventDefault();
          event.stopPropagation();
          console.log(`[DirectTransfer] Intercepted click for cNFT ${assetId}`);
          
          // Show processing notification
          if (window.BurnAnimations?.showNotification) {
            window.BurnAnimations.showNotification(
              "Processing cNFT Transfer",
              "Preparing transaction..."
            );
          }
          
          // Use our direct transfer method
          await window.directTransferCNFT(assetId);
          return false;
        } else if (originalClick) {
          // If not a cNFT, proceed with original handler
          return originalClick.call(this, event);
        }
      };
    });
    
    console.log("[DirectTransfer] Direct transfer handlers set up completed");
  }, 2000);
});