/**
 * Delegated cNFT Transfer Handler
 * 
 * This module provides functionality for transferring compressed NFTs via delegation.
 * It leverages the Helius API for more reliable transfers compared to traditional 
 * on-chain methods.
 */

// Import required packages and modules
const { Connection, PublicKey } = require('@solana/web3.js');
const axios = require('axios');
const bs58 = require('bs58');
const nacl = require('tweetnacl');
const { Buffer } = require('buffer');

// Load environment variables
require('dotenv').config();

// Constants
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const PROJECT_WALLET = new PublicKey('EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK');

// Create connection to Solana
const connection = new Connection(HELIUS_RPC_URL, 'confirmed');

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
    console.log(`Processing delegated transfer for asset: ${assetId}`);
    
    // If no destination address provided, use the project wallet
    if (!destinationAddress) {
      destinationAddress = PROJECT_WALLET.toString();
      console.log(`Using default project wallet as destination: ${destinationAddress}`);
    }
    
    // Verify the asset exists and get details
    const assetDetails = await fetchAssetDetails(assetId);
    if (!assetDetails) {
      return {
        success: false,
        error: 'Asset not found or details unavailable'
      };
    }
    
    // Verify ownership or delegation
    if (delegateAddress) {
      const isDelegateValid = await verifyDelegateAuthority(assetId, delegateAddress);
      if (!isDelegateValid) {
        return {
          success: false,
          error: 'Invalid delegate authority'
        };
      }
    } else if (assetDetails.ownership.owner !== ownerAddress) {
      return {
        success: false,
        error: 'Owner address does not match asset ownership'
      };
    }
    
    // Verify signed message
    const messageValid = verifySignedMessage(
      ownerAddress,
      `Authorize delegated transfer of asset ${assetId} to the project collection wallet`,
      signedMessage
    );
    
    if (!messageValid) {
      return {
        success: false,
        error: 'Invalid signature'
      };
    }
    
    // Perform the transfer via Helius RPC
    const transferResponse = await transferViaHelius(
      assetId,
      ownerAddress,
      destinationAddress,
      delegateAddress
    );
    
    if (transferResponse.success) {
      return {
        success: true,
        assetId,
        owner: ownerAddress,
        destination: destinationAddress,
        signature: transferResponse.signature,
        message: 'cNFT successfully transferred',
        explorerUrl: `https://solscan.io/tx/${transferResponse.signature}`
      };
    } else {
      return {
        success: false,
        error: transferResponse.error || 'Transfer failed',
        details: transferResponse.details || {}
      };
    }
  } catch (error) {
    console.error('Error in delegated transfer:', error);
    return {
      success: false,
      error: error.message || 'Unknown error during transfer',
      details: { stack: error.stack }
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
    const response = await axios.post(HELIUS_RPC_URL, {
      jsonrpc: '2.0',
      id: 'helius-js',
      method: 'getAsset',
      params: {
        id: assetId
      }
    });
    
    if (response.data && response.data.result) {
      return response.data.result;
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching asset details:', error);
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
    
    if (!assetDetails || !assetDetails.ownership) {
      return false;
    }
    
    // Check if delegation is enabled and the delegate matches
    return (
      assetDetails.ownership.delegated === true &&
      assetDetails.ownership.delegate === delegateAddress
    );
  } catch (error) {
    console.error('Error verifying delegate authority:', error);
    return false;
  }
}

/**
 * Verify a signed message from a wallet
 * @param {string} publicKey - The wallet's public key
 * @param {string} message - The original message that was signed
 * @param {string} signatureBase64 - Base64 encoded signature
 * @returns {boolean} - True if signature is valid
 */
function verifySignedMessage(publicKey, message, signatureBase64) {
  try {
    // Convert inputs to correct formats
    const publicKeyBytes = new PublicKey(publicKey).toBytes();
    const messageBytes = Buffer.from(message);
    const signatureBytes = Buffer.from(signatureBase64, 'base64');
    
    // Verify signature
    return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
  } catch (error) {
    console.error('Error verifying signed message:', error);
    return false;
  }
}

/**
 * Transfer a cNFT using Helius API
 * @param {string} assetId - The asset ID
 * @param {string} sourceOwner - The source wallet address
 * @param {string} destinationOwner - The destination wallet address
 * @param {string} delegateAuthority - Optional delegate authority
 * @returns {Promise<object>} - Transfer result
 */
async function transferViaHelius(assetId, sourceOwner, destinationOwner, delegateAuthority = null) {
  try {
    // Prepare the request parameters
    const params = {
      id: assetId,
      source: sourceOwner,
      destination: destinationOwner,
      skipSizeCheck: true  // Skip size check to avoid potential errors
    };
    
    // Add delegate authority if provided
    if (delegateAuthority) {
      params.delegate = delegateAuthority;
    }
    
    console.log('Submitting transfer via Helius:', params);
    
    // Make the API call
    const response = await axios.post(HELIUS_RPC_URL, {
      jsonrpc: '2.0',
      id: 'helius-delegated-transfer',
      method: 'transferAsset',
      params
    });
    
    console.log('Helius transfer response:', response.data);
    
    if (response.data && response.data.result) {
      return {
        success: true,
        signature: response.data.result,
        details: response.data
      };
    } else if (response.data && response.data.error) {
      return {
        success: false,
        error: response.data.error.message || 'Transfer failed with Helius API error',
        details: response.data.error
      };
    }
    
    return {
      success: false,
      error: 'Unknown error during Helius transfer',
      details: response.data
    };
  } catch (error) {
    console.error('Error in Helius transfer:', error);
    return {
      success: false,
      error: error.message || 'Transfer request to Helius failed',
      details: { stack: error.stack }
    };
  }
}

// Export functions for use in other modules
module.exports = {
  processDelegatedTransfer,
  fetchAssetDetails,
  verifyDelegateAuthority
};