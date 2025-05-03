/**
 * Improved Server-Side cNFT Transfer
 *
 * This implementation uses a server-side approach to handle all the complex buffer 
 * conversions and generate the transaction. The client only needs to sign it.
 * 
 * Key improvements:
 * - Fully server-side transaction generation
 * - No browser-side TransactionInstruction dependency
 * - Improved error handling and reporting
 * - Proper buffer conversions for Merkle proofs
 */

(function() {
  // Store debug info
  window.improvedServerTransfer = {
    errors: [],
    logs: [],
    lastAttempt: null
  };
  
  // Log wrapper
  function log(message, data) {
    console.log(`[ImprovedServer] ${message}`, data);
    window.improvedServerTransfer.logs.push({
      time: new Date().toISOString(),
      message,
      data
    });
  }
  
  // Error handler
  function handleError(stage, error) {
    console.error(`[ImprovedServer] Error in ${stage}:`, error);
    window.improvedServerTransfer.errors.push({
      time: new Date().toISOString(),
      stage,
      message: error.message,
      stack: error.stack,
      error
    });
    throw error;
  }
  
  /**
   * Transfer a cNFT using the improved server-side approach
   */
  async function improvedServerTransferCNFT(assetId) {
    try {
      log('Starting improved server-side transfer', { assetId });
      
      if (!window.solana || !window.solana.isConnected) {
        throw new Error("Wallet not connected");
      }
      
      const ownerPublicKey = window.solana.publicKey.toString();
      log('Owner public key', { ownerPublicKey });
      
      // Step 1: Prepare the transaction on server-side
      log('Preparing transaction on server', { assetId, ownerPublicKey });
      const prepareResponse = await fetch('/api/server-transfer/prepare', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ownerPublicKey,
          assetId
        })
      });
      
      if (!prepareResponse.ok) {
        const errorData = await prepareResponse.json();
        throw new Error(`Server preparation failed: ${errorData.error}`);
      }
      
      const prepareData = await prepareResponse.json();
      log('Server prepared transaction', prepareData);
      
      if (!prepareData.success) {
        throw new Error(`Server preparation error: ${prepareData.error}`);
      }
      
      // Transaction is already serialized, deserialize for signing
      const serializedTransaction = prepareData.transaction;
      
      if (!serializedTransaction) {
        throw new Error('No transaction returned from server');
      }
      
      // Step 2: Sign the transaction
      log('Signing transaction');
      
      // Convert the serialized transaction back to a Transaction object
      // This uses the Transaction class from the wallet adapter
      const transactionBuffer = Buffer.from(serializedTransaction, 'base64');
      
      // We need to use a different approach depending on wallet type
      // First try the standard approach with deserializeTransaction
      let transaction;
      let signedTransaction;
      
      try {
        log('Attempting to deserialize with solana.deserializeTransaction');
        
        if (typeof window.solana.deserializeTransaction === 'function') {
          // Phantom and similar wallets
          transaction = window.solana.deserializeTransaction(transactionBuffer);
        } else {
          throw new Error('deserializeTransaction not available');
        }
      } catch (deserializeError) {
        log('First deserialization method failed, trying alternatives', deserializeError);
        
        try {
          // Some wallets have Transaction class available
          if (window.solana.Transaction) {
            log('Using solana.Transaction.from');
            transaction = window.solana.Transaction.from(transactionBuffer);
          } else if (window.Transaction) {
            log('Using global Transaction.from');
            transaction = window.Transaction.from(transactionBuffer);
          } else {
            throw new Error('No Transaction class found');
          }
        } catch (transactionError) {
          log('All deserialization attempts failed', transactionError);
          
          // Last resort: Ask the wallet to sign a versioned transaction
          // without deserializing first (some wallets support this)
          try {
            log('Attempting direct signing of serialized transaction');
            
            // Some wallets support signTransaction with a base64 string
            signedTransaction = await window.solana.signTransaction(transactionBuffer);
            
            if (!signedTransaction) {
              throw new Error('Wallet returned null for signed transaction');
            }
          } catch (directSignError) {
            log('Direct signing failed as well', directSignError);
            throw new Error('Unable to sign transaction: No compatible method found');
          }
        }
      }
      
      // If we got a transaction but not yet a signed transaction, sign it now
      if (transaction && !signedTransaction) {
        try {
          log('Signing deserialized transaction');
          signedTransaction = await window.solana.signTransaction(transaction);
          
          if (!signedTransaction) {
            throw new Error('Wallet returned null for signed transaction');
          }
        } catch (signError) {
          log('Error signing transaction', signError);
          throw new Error(`Unable to sign transaction: ${signError.message}`);
        }
      }
      
      // Step 3: Serialize the signed transaction
      let serializedSignedTransaction;
      
      try {
        if (typeof signedTransaction.serialize === 'function') {
          // If we have a Transaction object with serialize
          serializedSignedTransaction = Buffer.from(
            signedTransaction.serialize()
          ).toString('base64');
        } else if (signedTransaction.buffer) {
          // If we got back a buffer or array directly
          serializedSignedTransaction = Buffer.from(
            signedTransaction.buffer
          ).toString('base64');
        } else if (typeof signedTransaction === 'string') {
          // If the wallet returned a base64 string directly
          serializedSignedTransaction = signedTransaction;
        } else {
          // Try using the wallet's serialization if available
          if (typeof window.solana.serializeTransaction === 'function') {
            serializedSignedTransaction = window.solana.serializeTransaction(signedTransaction);
          } else {
            // Last resort - try to coerce to base64 string
            serializedSignedTransaction = Buffer.from(
              signedTransaction
            ).toString('base64');
          }
        }
      } catch (serializeError) {
        log('Error serializing signed transaction', serializeError);
        throw new Error(`Unable to serialize signed transaction: ${serializeError.message}`);
      }
      
      if (!serializedSignedTransaction) {
        throw new Error('Failed to serialize signed transaction');
      }
      
      log('Successfully serialized signed transaction');
      
      // Step 4: Submit the signed transaction to the server
      log('Submitting signed transaction to server');
      const submitResponse = await fetch('/api/server-transfer/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          signedTransaction: serializedSignedTransaction,
          assetId
        })
      });
      
      if (!submitResponse.ok) {
        const errorData = await submitResponse.json();
        throw new Error(`Server submission failed: ${errorData.error}`);
      }
      
      const submitData = await submitResponse.json();
      log('Server submission complete', submitData);
      
      if (!submitData.success) {
        throw new Error(`Server submit error: ${submitData.error}`);
      }
      
      // Step 5: Success - return the result
      const { signature, explorerUrl } = submitData;
      
      // Add to hidden assets if that function exists
      if (window.hiddenAssets && window.hiddenAssets.addHiddenAsset) {
        window.hiddenAssets.addHiddenAsset(assetId);
      }
      
      // Save successful attempt info
      window.improvedServerTransfer.lastAttempt = {
        time: new Date().toISOString(),
        status: 'success',
        assetId,
        signature,
        explorerUrl
      };
      
      // Return success result
      return {
        success: true,
        message: "Transfer completed successfully",
        signature,
        explorerUrl
      };
    } catch (error) {
      // Handle any errors
      handleError('transfer', error);
      
      // Save failed attempt info
      window.improvedServerTransfer.lastAttempt = {
        time: new Date().toISOString(),
        status: 'failed',
        assetId,
        error: error.message
      };
      
      // Return error result
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // Export the transfer function to the global scope
  window.improvedServerTransferCNFT = improvedServerTransferCNFT;
  
  // Also patch it onto any existing CNFTHandler
  if (window.CNFTHandler && window.CNFTHandler.prototype) {
    log('Patching CNFTHandler.prototype.serverBurnCNFT with improved implementation');
    
    // Store original for fallback
    const originalServerBurn = window.CNFTHandler.prototype.serverBurnCNFT;
    
    // Replace with our improved version
    window.CNFTHandler.prototype.serverBurnCNFT = async function(assetId) {
      try {
        log('CNFTHandler.serverBurnCNFT called with improved implementation', { assetId });
        return await improvedServerTransferCNFT(assetId);
      } catch (error) {
        log('Improved implementation failed, falling back to original', error);
        
        // Fall back to original if available
        if (originalServerBurn) {
          return await originalServerBurn.call(this, assetId);
        }
        
        // Otherwise re-throw
        throw error;
      }
    };
  }
  
  // Initialize
  log('Improved server-side transfer module initialized');
})();