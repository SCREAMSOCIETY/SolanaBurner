/**
 * Server-Side Transfer Implementation for CNFTs
 * 
 * This implementation moves the TransactionInstruction creation to the server
 * to avoid browser compatibility issues with the Solana web3.js library.
 */

import { Connection, Transaction } from '@solana/web3.js';

/**
 * Transfer a cNFT using the server-side endpoints
 * This approach avoids the client-side TransactionInstruction dependency issues
 */
export async function serverSideTransferCNFT(options) {
  try {
    const { connection, wallet, assetId, destinationAddress, proofData } = options;
    
    console.log(`[ServerSideTransfer] Starting transfer of ${assetId} to ${destinationAddress}`);
    
    // Step 1: Prepare the transaction on the server
    console.log(`[ServerSideTransfer] Requesting transaction from server`);
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
    
    // Check for server response
    if (!prepareResponse.ok) {
      const errorData = await prepareResponse.json();
      throw new Error(`Server error: ${errorData.error || prepareResponse.statusText}`);
    }
    
    // Parse the server response
    const prepareResult = await prepareResponse.json();
    
    if (!prepareResult.success || !prepareResult.transaction) {
      throw new Error(`Error preparing transaction: ${prepareResult.error || 'Unknown error'}`);
    }
    
    console.log(`[ServerSideTransfer] Successfully received transaction from server`);
    
    // Step 2: Convert base64 transaction to Transaction object and sign it
    const transactionBuffer = Buffer.from(prepareResult.transaction, 'base64');
    const transaction = Transaction.from(transactionBuffer);
    
    // Sign the transaction
    console.log(`[ServerSideTransfer] Signing transaction`);
    const signedTransaction = await wallet.signTransaction(transaction);
    
    // Convert signed transaction back to base64
    const serializedTransaction = signedTransaction.serialize().toString('base64');
    
    // Step 3: Submit the signed transaction back to the server
    console.log(`[ServerSideTransfer] Submitting signed transaction to server`);
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
    
    // Check for server response
    if (!submitResponse.ok) {
      const errorData = await submitResponse.json();
      throw new Error(`Server error: ${errorData.error || submitResponse.statusText}`);
    }
    
    // Parse the submission result
    const submitResult = await submitResponse.json();
    
    if (!submitResult.success) {
      throw new Error(`Error submitting transaction: ${submitResult.error || 'Unknown error'}`);
    }
    
    console.log(`[ServerSideTransfer] Transaction confirmed: ${submitResult.signature}`);
    
    // Return success response
    return {
      success: true,
      signature: submitResult.signature,
      message: submitResult.message || "Successfully transferred cNFT to project collection",
      explorerUrl: `https://solscan.io/tx/${submitResult.signature}`
    };
  } catch (error) {
    // Log and return error
    console.error(`[ServerSideTransfer] Error: ${error.message}`, error);
    return {
      success: false,
      error: error.message || "Unknown error in server-side transfer"
    };
  }
}

// Make available to the window
if (typeof window !== 'undefined') {
  window.serverSideTransfer = {
    transferCNFT: serverSideTransferCNFT
  };
}