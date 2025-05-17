/**
 * Helius Send API Integration
 * 
 * Simplified implementation for transferring cNFTs using Helius' /v0/send endpoint.
 */

// Use axios instead of node-fetch to avoid ESM issues
const axios = require('axios');
const heliusApi = require('./helius-api');

/**
 * Transfer a cNFT using Helius Send API
 * 
 * @param {string} assetId - The asset ID of the cNFT
 * @param {string} sourceOwner - The source wallet address
 * @param {string} destinationOwner - The destination wallet address
 * @returns {Promise<object>} The transfer result
 */
async function transferCompressedNFT(assetId, sourceOwner, destinationOwner) {
  try {
    console.log(`[HELIUS-SEND] Preparing to transfer cNFT ${assetId}`);
    
    // Verify asset details
    const assetDetails = await heliusApi.fetchAssetDetails(assetId);
    if (!assetDetails) {
      throw new Error('Asset not found');
    }
    
    // Prepare the payload for the Helius Send API
    const payload = {
      assetId,
      sources: [sourceOwner],
      destination: destinationOwner
    };
    
    console.log(`[HELIUS-SEND] Sending request to Helius API`);
    
    // Call the Helius Send API
    const response = await axios.post(
      `https://api.helius.xyz/v0/send?api-key=${process.env.HELIUS_API_KEY}`,
      payload
    );
    
    console.log(`[HELIUS-SEND] Response:`, JSON.stringify(response.data));
    
    // Check if the transaction was successful
    if (!response.data.signature) {
      throw new Error('No transaction signature in response');
    }
    
    return {
      success: true,
      signature: response.data.signature,
      assetId,
      message: 'Transaction submitted successfully'
    };
  } catch (error) {
    console.error(`[HELIUS-SEND] Error:`, error);
    return {
      success: false,
      error: error.message,
      details: error.stack
    };
  }
}

/**
 * Prepare a cNFT transfer transaction for client-side signing
 * 
 * @param {string} assetId - The asset ID of the cNFT
 * @param {string} sourceOwner - The source wallet address
 * @param {string} destinationOwner - The destination wallet address
 * @returns {Promise<object>} The transaction preparation result
 */
async function prepareTransferTransaction(assetId, sourceOwner, destinationOwner) {
  try {
    console.log(`[HELIUS-SEND] Preparing transaction for cNFT ${assetId}`);
    
    // Prepare the payload for the Helius Send API
    const payload = {
      assetId,
      sources: [sourceOwner],
      destination: destinationOwner,
      prepareTransaction: true
    };
    
    console.log(`[HELIUS-SEND] Requesting transaction preparation from Helius API`);
    
    // Call the Helius Send API
    const response = await axios.post(
      `https://api.helius.xyz/v0/send?api-key=${process.env.HELIUS_API_KEY}`,
      payload
    );
    
    console.log(`[HELIUS-SEND] Preparation response received`);
    
    // Check if the transaction was prepared successfully
    if (!response.data.transaction) {
      throw new Error('No transaction data in response');
    }
    
    return {
      success: true,
      transaction: response.data.transaction,
      assetId,
      message: 'Transaction prepared successfully'
    };
  } catch (error) {
    console.error(`[HELIUS-SEND] Error:`, error);
    return {
      success: false,
      error: error.message,
      details: error.stack
    };
  }
}

/**
 * Submit a signed cNFT transfer transaction
 * 
 * @param {string} signedTransaction - The signed transaction as a base64 string
 * @param {string} assetId - The asset ID of the cNFT
 * @returns {Promise<object>} The transaction submission result
 */
async function submitSignedTransaction(signedTransaction, assetId) {
  try {
    console.log(`[HELIUS-SEND] Submitting signed transaction for cNFT ${assetId}`);
    
    // Prepare the payload for the Helius Send API
    const payload = {
      signedTransaction
    };
    
    console.log(`[HELIUS-SEND] Sending transaction to Helius API`);
    
    // Call the Helius Send API
    const response = await axios.post(
      `https://api.helius.xyz/v0/send?api-key=${process.env.HELIUS_API_KEY}`,
      payload
    );
    
    console.log(`[HELIUS-SEND] Response:`, JSON.stringify(response.data));
    
    // Check if the transaction was successful
    if (!response.data.signature) {
      throw new Error('No transaction signature in response');
    }
    
    return {
      success: true,
      signature: response.data.signature,
      assetId,
      message: 'Transaction submitted successfully'
    };
  } catch (error) {
    console.error(`[HELIUS-SEND] Error:`, error);
    return {
      success: false,
      error: error.message,
      details: error.stack
    };
  }
}

module.exports = {
  transferCompressedNFT,
  prepareTransferTransaction,
  submitSignedTransaction
};