/**
 * Server-side Transfer Implementation
 * 
 * This module provides server-side functions for creating and submitting
 * cNFT transfer transactions. It works with the improved client-side
 * transfer implementation to avoid TransactionInstruction dependencies
 * in the browser context.
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const bs58 = require('bs58');

const heliusApi = require('./helius-api');
const solanaTransfer = require('./solana-transfer');
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
    
    // Use direct Solana web3.js implementation
    console.log(`[SERVER] Using direct Solana web3.js for transfer preparation`);
    const result = await solanaTransfer.prepareTransferTransaction(
      assetId, 
      ownerAddress, 
      destinationAddress
    );
    
    // Check if the preparation was successful
    if (!result.success) {
      console.error(`[SERVER] Error preparing transaction:`, result.error);
      return reply.code(500).send({
        success: false,
        error: result.error,
        details: result.details
      });
    }
    
    console.log(`[SERVER] Successfully prepared transaction for ${assetId}`);
    
    // Return the transaction data
    return {
      success: true,
      transaction: result.transaction,
      assetId,
      message: 'Transaction prepared successfully'
    };
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
    
    // Use direct Solana web3.js implementation
    console.log(`[SERVER] Using direct Solana web3.js for transaction submission`);
    const result = await solanaTransfer.submitSignedTransaction(signedTransaction, assetId);
    
    // Check if the submission was successful
    if (!result.success) {
      console.error(`[SERVER] Error submitting transaction:`, result.error);
      return reply.code(500).send({
        success: false,
        error: result.error,
        details: result.details
      });
    }
    
    console.log(`[SERVER] Transaction submitted successfully with signature: ${result.signature}`);
    
    // Return the transaction result
    return {
      success: true,
      signature: result.signature,
      assetId: assetId,
      message: 'Transaction submitted successfully'
    };
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