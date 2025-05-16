/**
 * Helius Send API Integration for cNFT Transfers
 * 
 * This module provides a direct implementation for transferring cNFTs using
 * Helius' /v0/send endpoint, which is the recommended way to transfer cNFTs.
 */

const fetch = require('node-fetch');
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
    
    // Fetch asset details to verify it's a compressed NFT
    const assetDetails = await heliusApi.fetchAssetDetails(assetId);
    
    if (!assetDetails) {
      throw new Error('Asset not found');
    }
    
    if (!assetDetails.compression || !assetDetails.compression.compressed) {
      throw new Error('Asset is not a compressed NFT');
    }
    
    console.log(`[HELIUS-SEND] Asset verified as compressed NFT`);
    
    // Prepare the payload for the Helius Send API
    const payload = {
      assetId,
      sources: [sourceOwner],
      destination: destinationOwner, 
      rpcUrl: process.env.QUICKNODE_RPC_URL || null
    };
    
    console.log(`[HELIUS-SEND] Sending request to Helius API`, JSON.stringify(payload));
    
    // Call the Helius Send API
    const response = await fetch(
      `https://api.helius.xyz/v0/send?api-key=${process.env.HELIUS_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    );
    
    // Check if the request was successful
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[HELIUS-SEND] Error response: ${response.status} ${response.statusText}`, errorText);
      throw new Error(`Helius Send API error: ${response.status} ${response.statusText}`);
    }
    
    // Parse the response
    const responseData = await response.json();
    console.log(`[HELIUS-SEND] Response:`, JSON.stringify(responseData));
    
    // Check if the transaction was successful
    if (!responseData.signature) {
      throw new Error('No transaction signature in response');
    }
    
    return {
      success: true,
      signature: responseData.signature,
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
    
    // Fetch asset details to verify it's a compressed NFT
    const assetDetails = await heliusApi.fetchAssetDetails(assetId);
    
    if (!assetDetails) {
      throw new Error('Asset not found');
    }
    
    if (!assetDetails.compression || !assetDetails.compression.compressed) {
      throw new Error('Asset is not a compressed NFT');
    }
    
    console.log(`[HELIUS-SEND] Asset verified as compressed NFT`);
    
    // Prepare the payload for the Helius Send API (prepareTransaction mode)
    const payload = {
      assetId,
      sources: [sourceOwner],
      destination: destinationOwner,
      prepareTransaction: true,  // This tells Helius to return an unsigned transaction
      rpcUrl: process.env.QUICKNODE_RPC_URL || null
    };
    
    console.log(`[HELIUS-SEND] Requesting transaction preparation from Helius API`);
    
    // Call the Helius Send API
    const response = await fetch(
      `https://api.helius.xyz/v0/send?api-key=${process.env.HELIUS_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    );
    
    // Check if the request was successful
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[HELIUS-SEND] Error response: ${response.status} ${response.statusText}`, errorText);
      throw new Error(`Helius Send API error: ${response.status} ${response.statusText}`);
    }
    
    // Parse the response
    const responseData = await response.json();
    console.log(`[HELIUS-SEND] Preparation response received`);
    
    // Check if the transaction was prepared successfully
    if (!responseData.transaction) {
      throw new Error('No transaction data in response');
    }
    
    return {
      success: true,
      transaction: responseData.transaction,
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
    
    // Prepare the payload for the Helius Send API (submit transaction mode)
    const payload = {
      signedTransaction,
      rpcUrl: process.env.QUICKNODE_RPC_URL || null
    };
    
    console.log(`[HELIUS-SEND] Sending transaction to Helius API`);
    
    // Call the Helius Send API
    const response = await fetch(
      `https://api.helius.xyz/v0/send?api-key=${process.env.HELIUS_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    );
    
    // Check if the request was successful
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[HELIUS-SEND] Error response: ${response.status} ${response.statusText}`, errorText);
      throw new Error(`Helius Send API error: ${response.status} ${response.statusText}`);
    }
    
    // Parse the response
    const responseData = await response.json();
    console.log(`[HELIUS-SEND] Response:`, JSON.stringify(responseData));
    
    // Check if the transaction was successful
    if (!responseData.signature) {
      throw new Error('No transaction signature in response');
    }
    
    return {
      success: true,
      signature: responseData.signature,
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