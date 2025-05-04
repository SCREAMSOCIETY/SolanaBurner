/**
 * Client-side Robust cNFT Transfer Implementation
 * 
 * This implementation provides a more resilient approach to transferring cNFTs
 * when standard methods fail due to incomplete proof data. It works with the
 * server-side robust transfer endpoint to handle problematic cNFTs.
 */

import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import axios from 'axios';

/**
 * Default project wallet to use as destination if none is provided
 */
export const PROJECT_WALLET = 'EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK';

/**
 * Execute a robust transfer for a cNFT using the server endpoint
 * This handles problematic cNFTs by using a more comprehensive approach
 * 
 * @param {string} privateKeyBase58 - The sender's private key in base58 format
 * @param {string} assetId - The asset ID of the cNFT to transfer
 * @param {string} destinationAddress - Optional destination address (defaults to project wallet)
 * @returns {Promise<object>} - The result of the transfer
 */
export async function executeRobustTransfer(privateKeyBase58, assetId, destinationAddress = PROJECT_WALLET) {
  try {
    // Validate the inputs
    if (!isValidPrivateKey(privateKeyBase58)) {
      throw new Error('Invalid private key format');
    }
    
    if (!isValidAssetId(assetId)) {
      throw new Error('Invalid asset ID format');
    }
    
    // Send the request to the server
    const response = await axios.post('/api/robust-transfer', {
      senderPrivateKey: privateKeyBase58,
      assetId,
      destinationAddress
    });
    
    // Return the result from the server
    if (response.data && response.data.success) {
      return {
        success: true,
        signature: response.data.signature,
        explorerUrl: response.data.explorerUrl,
        message: response.data.message || 'cNFT transferred successfully'
      };
    } else {
      throw new Error(response.data?.error || 'Transfer failed with unknown error');
    }
  } catch (error) {
    // Handle axios errors
    if (error.response) {
      // The request was made and the server responded with an error
      const errorMessage = error.response.data?.error || 'Server returned an error';
      console.error('Robust transfer server error:', errorMessage);
      return {
        success: false,
        error: errorMessage
      };
    } else if (error.request) {
      // The request was made but no response was received
      console.error('No response received from the server', error.request);
      return {
        success: false,
        error: 'No response from server. Please check your connection.'
      };
    } else {
      // Something happened in setting up the request
      console.error('Error in robust transfer request:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

/**
 * Validate an asset ID (mint address) format
 * @param {string} assetId - The asset ID to validate
 * @returns {boolean} - Whether the asset ID format is valid
 */
export function isValidAssetId(assetId) {
  if (!assetId || typeof assetId !== 'string') {
    return false;
  }
  
  // Simple validation for Solana public key format
  // A Solana public key is a base58 encoded string, typically 32-44 characters
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(assetId);
}

/**
 * Validates that a private key is properly formatted
 * @param {string} privateKey - The private key to validate
 * @returns {boolean} - Whether the private key format is valid
 */
export function isValidPrivateKey(privateKey) {
  try {
    if (!privateKey || typeof privateKey !== 'string') {
      return false;
    }
    
    // Attempt to decode the base58 private key
    const decoded = bs58.decode(privateKey);
    
    // A Solana private key is 64 bytes (32 for private key, 32 for public key)
    return decoded.length === 64;
  } catch (error) {
    console.error('Error validating private key:', error.message);
    return false;
  }
}

/**
 * Get the public key corresponding to a private key
 * @param {string} privateKeyBase58 - The private key in base58 format
 * @returns {string} - The corresponding public key
 */
export function getPublicKeyFromPrivate(privateKeyBase58) {
  try {
    const secretKey = bs58.decode(privateKeyBase58);
    const keypair = Keypair.fromSecretKey(secretKey);
    return keypair.publicKey.toString();
  } catch (error) {
    console.error('Error getting public key:', error.message);
    return null;
  }
}

/**
 * Run a diagnostic test on a specific cNFT to identify issues
 * @param {string} assetId - The asset ID to diagnose
 * @returns {Promise<object>} - Diagnostic information
 */
export async function runDiagnostic(assetId) {
  try {
    // Validate the asset ID
    if (!isValidAssetId(assetId)) {
      throw new Error('Invalid asset ID format');
    }
    
    // Send the request to the server
    const response = await axios.get(`/api/diagnostic/${assetId}`);
    
    // Return the diagnostic results
    if (response.data && response.data.success) {
      return {
        success: true,
        diagnostics: response.data.diagnostics
      };
    } else {
      throw new Error(response.data?.error || 'Diagnostic failed with unknown error');
    }
  } catch (error) {
    // Handle errors in a similar way to executeRobustTransfer
    if (error.response) {
      return {
        success: false,
        error: error.response.data?.error || 'Server returned an error'
      };
    } else if (error.request) {
      return {
        success: false,
        error: 'No response from server. Please check your connection.'
      };
    } else {
      return {
        success: false,
        error: error.message
      };
    }
  }
}