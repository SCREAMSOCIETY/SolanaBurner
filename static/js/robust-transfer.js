/**
 * Client-side Robust cNFT Transfer Implementation
 * 
 * This implementation provides a more resilient approach to transferring cNFTs
 * when standard methods fail due to incomplete proof data. It works with the
 * server-side robust transfer endpoint to handle problematic cNFTs.
 */

import axios from 'axios';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

/**
 * Default project wallet to use as destination if none is provided
 */
const PROJECT_WALLET = 'EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK';

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
    console.log(`Starting robust transfer for asset: ${assetId}`);
    
    // Make sure we have the required parameters
    if (!privateKeyBase58 || !assetId) {
      throw new Error('Missing required parameters: privateKey and assetId are required');
    }
    
    // Step 1: Request diagnostic info for this asset (optional but helpful for debugging)
    const diagnosticResponse = await axios.get(`/api/cnft/diagnostic/${assetId}`);
    console.log('Diagnostic data:', diagnosticResponse.data);
    
    // Step 2: Send the transfer request to our robust endpoint
    const response = await axios.post('/api/cnft/robust-transfer', {
      assetId,
      senderPrivateKey: privateKeyBase58,
      destinationAddress: destinationAddress || PROJECT_WALLET
    });
    
    // Check the response and format it
    if (response.data.success) {
      console.log('Robust transfer successful:', response.data);
      
      // Build a Solana explorer URL for the transaction
      const signature = response.data.signature;
      const explorerUrl = `https://solscan.io/tx/${signature}`;
      
      return {
        success: true,
        signature,
        explorerUrl,
        message: response.data.message || 'Transfer completed successfully',
        method: 'robust'
      };
    } else {
      console.error('Robust transfer failed:', response.data);
      throw new Error(response.data.error || 'Transfer failed');
    }
  } catch (error) {
    console.error('Error in robust transfer:', error);
    return {
      success: false,
      error: error.message || 'Unknown error during robust transfer',
      method: 'robust'
    };
  }
}

/**
 * Validate an asset ID (mint address) format
 * @param {string} assetId - The asset ID to validate
 * @returns {boolean} - Whether the asset ID format is valid
 */
export function isValidAssetId(assetId) {
  // Basic validation: base58 addresses in Solana are at least 32 characters
  return typeof assetId === 'string' && assetId.length >= 32 && assetId.length <= 44;
}

/**
 * Validates that a private key is properly formatted
 * @param {string} privateKey - The private key to validate
 * @returns {boolean} - Whether the private key format is valid
 */
export function isValidPrivateKey(privateKey) {
  try {
    // Try to decode the key from base58
    const secretKey = bs58.decode(privateKey);
    
    // Valid Solana keypairs have 64-byte private keys
    if (secretKey.length !== 64) {
      return false;
    }
    
    // Try to create a keypair from the secret key
    Keypair.fromSecretKey(secretKey);
    
    // If we got here, the key is valid
    return true;
  } catch (error) {
    console.error('Invalid private key format:', error.message);
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
    console.error('Error deriving public key:', error);
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
    const response = await axios.get(`/api/cnft/diagnostic/${assetId}`);
    return response.data;
  } catch (error) {
    console.error('Error running diagnostic:', error);
    return {
      success: false,
      error: error.message || 'Failed to run diagnostic'
    };
  }
}