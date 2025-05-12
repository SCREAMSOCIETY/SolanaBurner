/**
 * Delegated cNFT Transfer Handler
 * 
 * This module provides server-side functionality for handling delegated
 * compressed NFT transfers using the Helius API. It's designed to work with
 * the Fastify server routes defined in fastifyServer.js.
 */

// Required dependencies
const axios = require('axios');
const { Connection, PublicKey } = require('@solana/web3.js');
require('dotenv').config();

// Environment variables
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const PROJECT_WALLET = process.env.PROJECT_WALLET || 'EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK';

/**
 * Process a delegated transfer request
 * @param {string} assetId - The cNFT asset ID
 * @param {string} ownerAddress - The owner's wallet address
 * @param {string} signedMessage - Base64 encoded signed message for verification
 * @param {string} delegateAddress - The delegate address (optional)
 * @param {string} destinationAddress - Where to send the cNFT (defaults to project wallet)
 * @returns {Promise<object>} - Result of the transfer operation
 */
async function processDelegatedTransfer(
  assetId,
  ownerAddress,
  signedMessage,
  delegateAddress = null,
  destinationAddress = null
) {
  try {
    console.log(`[DelegatedTransfer] Processing transfer for asset ${assetId}`);
    
    // Validate parameters
    if (!assetId) {
      throw new Error('Asset ID is required');
    }
    
    if (!ownerAddress) {
      throw new Error('Owner address is required');
    }
    
    if (!signedMessage) {
      throw new Error('Signed message is required for authorization');
    }
    
    // Set default destination to project wallet if not specified
    const targetAddress = destinationAddress || PROJECT_WALLET;
    
    // Fetch asset details to verify ownership and delegation
    const assetDetails = await fetchAssetDetails(assetId);
    
    // Verify asset exists and is owned by the specified owner
    if (!assetDetails) {
      throw new Error('Asset not found or details unavailable');
    }
    
    if (assetDetails.ownership?.owner !== ownerAddress) {
      throw new Error('Asset is not owned by the specified address');
    }
    
    // Check if delegate is set and matches provided delegate (if any)
    if (delegateAddress && assetDetails.ownership?.delegate !== delegateAddress) {
      throw new Error('Specified delegate does not match asset delegation');
    }
    
    // Prepare request payload for Helius API
    const transferPayload = {
      sender: ownerAddress,
      receiver: targetAddress,
      assetId: assetId
    };
    
    // Add delegate if available
    if (delegateAddress) {
      transferPayload.delegateAuthority = delegateAddress;
    }
    
    // Call Helius API to process the transfer
    const transferResult = await axios.post(
      `https://api.helius.xyz/v0/transfer-asset?api-key=${HELIUS_API_KEY}`,
      transferPayload,
      {
        headers: {
          'Content-Type': 'application/json',
          // Could include additional authorization as needed
          'Authorization': `Bearer ${signedMessage}`
        }
      }
    );
    
    // Process the response
    if (transferResult.data.success) {
      return {
        success: true,
        signature: transferResult.data.signature || transferResult.data.txid,
        message: 'cNFT transferred successfully via delegation',
        assetId: assetId,
        destination: targetAddress,
        explorerUrl: `https://solscan.io/tx/${transferResult.data.signature || transferResult.data.txid}`
      };
    } else {
      throw new Error(transferResult.data.error || 'Transfer failed');
    }
  } catch (error) {
    console.error('[DelegatedTransfer] Error:', error);
    return {
      success: false,
      error: error.message || 'Unknown error during delegated transfer',
      assetId: assetId
    };
  }
}

/**
 * Fetch asset details from Helius API
 * @param {string} assetId - The cNFT asset ID
 * @returns {Promise<object|null>} - Asset details or null if not found
 */
async function fetchAssetDetails(assetId) {
  try {
    const response = await axios.get(
      `https://api.helius.xyz/v0/assets/${assetId}?api-key=${HELIUS_API_KEY}`
    );
    
    if (response.data) {
      return response.data;
    } else {
      console.error('[DelegatedTransfer] Asset details not found in response');
      return null;
    }
  } catch (error) {
    console.error(`[DelegatedTransfer] Error fetching asset details for ${assetId}:`, error);
    return null;
  }
}

/**
 * Verify if a wallet has delegate authority for an asset
 * @param {string} assetId - The cNFT asset ID
 * @param {string} delegateAddress - The delegate address to verify
 * @returns {Promise<boolean>} - True if delegate authority is valid
 */
async function verifyDelegateAuthority(assetId, delegateAddress) {
  try {
    const assetDetails = await fetchAssetDetails(assetId);
    
    if (!assetDetails) {
      return false;
    }
    
    const isDelegated = assetDetails.ownership?.delegated || false;
    const currentDelegate = assetDetails.ownership?.delegate || null;
    
    return isDelegated && currentDelegate === delegateAddress;
  } catch (error) {
    console.error('[DelegatedTransfer] Error verifying delegate authority:', error);
    return false;
  }
}

module.exports = {
  processDelegatedTransfer,
  fetchAssetDetails,
  verifyDelegateAuthority
};