/**
 * Helius-based cNFT Transfer Implementation
 * 
 * This module provides a streamlined approach to transferring compressed NFTs
 * using the Helius API directly. It's particularly effective for delegation scenarios
 * where the traditional on-chain methods might be overly complex.
 */

import axios from 'axios';
import { getConfig } from './config-handler';

/**
 * Transfer a cNFT using Helius API
 * @param {object} params - Transfer parameters
 * @param {string} params.sender - Sender wallet address
 * @param {string} params.receiver - Receiver wallet address
 * @param {string} params.assetId - The asset ID (mint ID) of the cNFT
 * @param {string} params.delegateAuthority - Optional, if transferring as a delegated signer
 * @param {string} params.signedMessage - Optional, signature for authentication
 * @returns {Promise<object>} - Result of the transfer operation
 */
export async function transferCnftViaHelius({
  sender,
  receiver,
  assetId,
  delegateAuthority = null,
  signedMessage = null
}) {
  try {
    console.log(`[HeliusTransfer] Initiating transfer of ${assetId} from ${sender} to ${receiver}`);
    
    // Get API key from configuration
    const config = await getConfig();
    const apiKey = config.heliusApiKey;
    
    if (!apiKey) {
      throw new Error('Helius API key not found in configuration');
    }
    
    // Prepare request body
    const requestBody = {
      sender,
      receiver,
      assetId,
    };
    
    // Add optional parameters if provided
    if (delegateAuthority) {
      requestBody.delegateAuthority = delegateAuthority;
    }
    
    // Include authorization header with signed message if provided
    const headers = {
      'Content-Type': 'application/json'
    };
    
    if (signedMessage) {
      headers.Authorization = `Bearer ${signedMessage}`;
    }
    
    // Make API request to Helius
    const response = await axios.post(
      `https://api.helius.xyz/v0/transfer-asset?api-key=${apiKey}`,
      requestBody,
      { headers }
    );
    
    console.log('[HeliusTransfer] Transfer response:', response.data);
    
    // Process response
    if (response.data.success) {
      return {
        success: true,
        signature: response.data.signature || response.data.txid,
        message: 'Transfer completed successfully via Helius API',
        method: 'helius-api',
        details: response.data
      };
    } else {
      throw new Error(response.data.error || 'Unknown error from Helius API');
    }
  } catch (error) {
    console.error('[HeliusTransfer] Error transferring cNFT:', error);
    return {
      success: false,
      error: error.message || 'Unknown error during Helius transfer',
      details: error.response?.data || {}
    };
  }
}

/**
 * Transfer a cNFT with delegation using Helius API
 * This is a specialized version for delegation scenarios
 * @param {object} params - Transfer parameters
 * @returns {Promise<object>} - Result of the transfer operation
 */
export async function transferCnftWithDelegation(params) {
  // Add delegation-specific logic here
  return transferCnftViaHelius({
    ...params,
    // Set explicit delegation parameters
  });
}

/**
 * Check if a cNFT has a delegation authority set
 * @param {string} assetId - The asset ID to check
 * @returns {Promise<object>} - Delegation information
 */
export async function checkCnftDelegation(assetId) {
  try {
    const config = await getConfig();
    const apiKey = config.heliusApiKey;
    
    const response = await axios.get(
      `https://api.helius.xyz/v0/assets/${assetId}?api-key=${apiKey}`
    );
    
    // Extract delegation information
    const asset = response.data;
    const delegated = asset.ownership?.delegated || false;
    const delegate = asset.ownership?.delegate || null;
    
    return {
      success: true,
      delegated,
      delegate,
      owner: asset.ownership?.owner || null,
      details: asset
    };
  } catch (error) {
    console.error('[HeliusTransfer] Error checking cNFT delegation:', error);
    return {
      success: false,
      error: error.message,
      delegated: false,
      delegate: null
    };
  }
}