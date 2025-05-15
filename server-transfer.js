/**
 * Server-side Transfer Implementation
 * 
 * This module provides server-side functions for creating and submitting
 * cNFT transfer transactions. It works with the improved client-side
 * transfer implementation to avoid TransactionInstruction dependencies
 * in the browser context.
 */

const { Connection, PublicKey, Transaction, VersionedTransaction } = require('@solana/web3.js');
const { TreeConfig } = require('@solana/spl-account-compression');
const { SPL_ACCOUNT_COMPRESSION_PROGRAM_ID, SPL_NOOP_PROGRAM_ID } = require('@solana/spl-account-compression');
const { deserializeChangeLogEvent } = require('@solana/spl-account-compression');
const { BorshAccountsCoder, BorshInstructionCoder } = require('@project-serum/anchor');
const { ConcurrentMerkleTreeAccount } = require('@solana/spl-account-compression');
const bs58 = require('bs58');

const heliusApi = require('./helius-api');
const config = require('./config');

/**
 * Prepares a cNFT transfer transaction for a client to sign
 * 
 * @param {object} request - The API request object
 * @param {object} reply - The API reply object
 * @returns {object} - The prepared transaction data
 */
async function prepareTransferTransaction(request, reply) {
  const { assetId, ownerAddress, source } = request.body;
  
  if (!assetId || !ownerAddress) {
    return reply.code(400).send({
      success: false,
      error: 'Missing required parameters: assetId and ownerAddress'
    });
  }
  
  try {
    console.log(`[SERVER] Preparing transfer transaction for ${assetId}`);

    // Get the destinationAddress (project wallet)
    const destinationAddress = "EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK"; // Hard-coded project wallet
    
    // 1. Fetch asset details and proof data
    console.log(`[SERVER] Fetching asset details for ${assetId}`);
    const assetDetails = await heliusApi.fetchAssetDetails(assetId);
    
    if (!assetDetails) {
      return reply.code(404).send({
        success: false,
        error: 'Asset not found'
      });
    }
    
    // Skip ownership verification during development/testing
    // In production, uncomment this check
    /*
    if (assetDetails.ownership.owner !== ownerAddress) {
      return reply.code(403).send({
        success: false,
        error: 'You do not own this asset'
      });
    }
    */
    
    console.log(`[SERVER] Fetching proof data for ${assetId}`);
    const proofData = await heliusApi.fetchAssetProof(assetId);
    
    if (!proofData || !proofData.proof) {
      return reply.code(404).send({
        success: false,
        error: 'Proof data not available'
      });
    }
    
    // 2. Create the transfer transaction using Helius DAS API
    const connection = new Connection("https://mainnet.helius-rpc.com/?api-key=" + process.env.HELIUS_API_KEY);
    
    // Use Helius DAS API to create the serialized transaction
    const transferParams = {
      assetId,
      sourceOwner: ownerAddress,
      destinationOwner: destinationAddress,
      proof: proofData.proof,
      computeUnits: 200000, // Max compute units for compression transactions
    };
    
    try {
      console.log('[SERVER] Calling Helius DAS API to create transfer transaction');
      console.log(`[SERVER] Transfer params: ${JSON.stringify({...transferParams, proof: "..." })}`);
      
      // Check if the asset is actually a cNFT
      if (!assetDetails.compression || !assetDetails.compression.compressed) {
        return reply.code(400).send({
          success: false,
          error: 'This asset is not a compressed NFT'
        });
      }
      
      // Update to use the newer v1 endpoint
      const response = await fetch(
        `https://api.helius.xyz/v1/compression/create-transfer-tx?api-key=${process.env.HELIUS_API_KEY}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(transferParams)
        }
      );
      
      if (!response.ok) {
        console.error(`[SERVER] HTTP error from Helius: ${response.status} ${response.statusText}`);
        
        try {
          // Try to get more detailed error from response
          const errorResponseText = await response.text();
          console.error(`[SERVER] Helius error details: ${errorResponseText}`);
          
          return reply.code(500).send({
            success: false,
            error: `Helius API error: ${response.status} ${response.statusText}`,
            details: errorResponseText
          });
        } catch (parseError) {
          return reply.code(500).send({
            success: false,
            error: `Helius API error: ${response.status} ${response.statusText}`
          });
        }
      }
      
      const responseData = await response.json();
      console.log(`[SERVER] Helius response:`, JSON.stringify(responseData));
      
      // Handle different API response formats (v0 vs v1)
      let transactionBase64 = null;
      
      if (responseData.transaction) {
        // v0 API response format
        transactionBase64 = responseData.transaction;
      } else if (responseData.txs && responseData.txs.length > 0) {
        // v1 API response format
        transactionBase64 = responseData.txs[0].signedTransaction;
      } else if (responseData.signedTransaction) {
        // Alternative response format
        transactionBase64 = responseData.signedTransaction;
      }
      
      if (!transactionBase64) {
        console.error(`[SERVER] Error creating transaction:`, responseData);
        return reply.code(500).send({
          success: false,
          error: 'Failed to create transfer transaction - no transaction data in response',
          details: responseData
        });
      }
      
      console.log(`[SERVER] Successfully created transfer transaction for ${assetId}`);
      
      // Return the transaction for the client to sign
      return {
        success: true,
        transaction: transactionBase64,
        assetId,
        message: 'Transaction prepared successfully'
      };
    } catch (error) {
      console.error(`[SERVER] Error calling Helius API: ${error.message}`);
      return reply.code(500).send({
        success: false,
        error: `Error calling Helius API: ${error.message}`
      });
    }
  } catch (error) {
    console.error(`[SERVER] Error preparing transaction: ${error.message}`);
    return reply.code(500).send({
      success: false,
      error: `Error preparing transaction: ${error.message}`
    });
  }
}

/**
 * Submits a signed cNFT transfer transaction to the network
 * 
 * @param {object} request - The API request object
 * @param {object} reply - The API reply object
 * @returns {object} - The transaction result
 */
async function submitSignedTransaction(request, reply) {
  const { signedTransaction, assetId } = request.body;
  
  if (!signedTransaction) {
    return reply.code(400).send({
      success: false,
      error: 'Missing required parameter: signedTransaction'
    });
  }
  
  try {
    console.log(`[SERVER] Submitting signed transaction for ${assetId}`);
    
    // Create connection with explicit API key
    const connection = new Connection("https://mainnet.helius-rpc.com/?api-key=" + process.env.HELIUS_API_KEY);
    
    try {
      // Decode the base64 transaction
      const transaction = Buffer.from(signedTransaction, 'base64');
      
      console.log(`[SERVER] Decoded transaction, sending to network`);
      
      // Submit the transaction
      const txid = await connection.sendRawTransaction(transaction, {
        skipPreflight: false,
        preflightCommitment: 'confirmed'
      });
      
      console.log(`[SERVER] Transaction submitted with txid: ${txid}`);
      
      try {
        // Wait for confirmation
        const confirmation = await connection.confirmTransaction(txid, 'processed');
        console.log(`[SERVER] Transaction confirmed for ${assetId}: ${txid}`);
      } catch (confirmError) {
        console.warn(`[SERVER] Confirmation check failed but transaction was submitted: ${confirmError.message}`);
        // Continue anyway since the transaction was submitted
      }
      
      return {
        success: true,
        signature: txid,
        assetId: assetId,
        message: 'Transaction submitted successfully'
      };
    } catch (sendError) {
      console.error(`[SERVER] Error sending transaction: ${sendError.message}`);
      return reply.code(500).send({
        success: false,
        error: `Error sending transaction: ${sendError.message}`
      });
    }
  } catch (error) {
    console.error(`[SERVER] Error submitting transaction: ${error.message}`);
    return reply.code(500).send({
      success: false,
      error: `Error submitting transaction: ${error.message}`
    });
  }
}

module.exports = {
  prepareTransferTransaction,
  submitSignedTransaction
};