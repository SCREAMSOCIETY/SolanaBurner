/**
 * Robust Transfer Client
 * 
 * This module provides client-side functionality for robust cNFT transfers.
 * It interfaces with the server-side robust transfer API to handle problematic cNFTs.
 */
import axios from 'axios';
import bs58 from 'bs58';
import { PublicKey, Keypair } from '@solana/web3.js';

// Project wallet for transfers
const PROJECT_WALLET = 'EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK';

/**
 * Validates if a string is a valid Solana private key
 * @param {string} privateKeyString - The private key string to validate
 * @returns {boolean} - Whether the string is a valid private key
 */
export function isValidPrivateKey(privateKeyString) {
  try {
    // Check if the string is base58 decodable and has the right length
    const decoded = bs58.decode(privateKeyString);
    return decoded.length === 64; // Solana private keys are 64 bytes
  } catch (error) {
    return false;
  }
}

/**
 * Get public key from a private key string
 * @param {string} privateKeyString - Base58 encoded private key string
 * @returns {string} - Base58 encoded public key string
 */
export function getPublicKeyFromPrivate(privateKeyString) {
  try {
    const decoded = bs58.decode(privateKeyString);
    const keypair = Keypair.fromSecretKey(decoded);
    return keypair.publicKey.toString();
  } catch (error) {
    throw new Error(`Invalid private key: ${error.message}`);
  }
}

/**
 * Run diagnostic tests on a cNFT to identify issues
 * @param {string} assetId - The asset ID to run diagnostics on
 * @returns {Promise<object>} - Diagnostic information
 */
export async function runDiagnostic(assetId) {
  try {
    const response = await axios.get(`/api/diagnostic/${assetId}`);
    return response.data;
  } catch (error) {
    console.error('Diagnostic error:', error);
    throw new Error(error.response?.data?.message || 'Failed to run diagnostics');
  }
}

/**
 * Execute a robust cNFT transfer using the server-side implementation
 * @param {string} privateKeyBase58 - The sender's private key as a base58 string
 * @param {string} assetId - The asset ID to transfer
 * @returns {Promise<object>} - Transfer result with signature and explorer URL
 */
export async function executeRobustTransfer(privateKeyBase58, assetId) {
  // Validate private key
  if (!isValidPrivateKey(privateKeyBase58)) {
    throw new Error('Invalid private key format');
  }

  try {
    // Get public key from private key
    const publicKey = getPublicKeyFromPrivate(privateKeyBase58);
    
    // Make the API request to process the robust transfer
    const response = await axios.post('/api/robust-transfer', {
      privateKeyBase58,
      assetId,
      destinationAddress: PROJECT_WALLET  // Default destination
    });

    // Extract result data
    const { success, signature, error, explorerUrl } = response.data;
    
    if (!success) {
      throw new Error(error || 'Transfer failed');
    }
    
    return {
      success,
      signature,
      explorerUrl: explorerUrl || `https://solscan.io/tx/${signature}`
    };
  } catch (error) {
    console.error('Robust transfer error:', error);
    throw new Error(error.response?.data?.message || error.message || 'Failed to process transfer');
  }
}