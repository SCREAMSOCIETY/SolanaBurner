/**
 * Helius-based cNFT Transfer Implementation
 * 
 * This module provides a streamlined approach to transferring compressed NFTs
 * using the Helius API directly. It's particularly effective for delegation scenarios
 * where the traditional on-chain methods might be overly complex.
 */

import axios from 'axios';
import { getConfig, getProjectWallet } from './config-handler';

/**
 * Transfer a cNFT using Helius API
 * @param {object} params - Transfer parameters
 * @param {string} params.sender - Sender wallet address
 * @param {string} params.receiver - Receiver wallet address (optional, defaults to project wallet)
 * @param {string} params.assetId - The asset ID (mint ID) of the cNFT
 * @param {string} params.delegateAuthority - Optional, if transferring as a delegated signer
 * @param {string} params.signedMessage - Optional, signature for authentication
 * @returns {Promise<object>} - Result of the transfer operation
 */
export async function transferCnftViaHelius({
  sender,
  receiver = null,
  assetId,
  delegateAuthority = null,
  signedMessage = null
}) {
  try {
    // If no receiver is specified, use the project wallet
    if (!receiver) {
      receiver = await getProjectWallet();
    }

    // Prepare the request body
    const requestBody = {
      assetId,
      ownerAddress: sender,
      destinationAddress: receiver
    };

    // Add optional parameters if provided
    if (delegateAuthority) {
      requestBody.delegateAddress = delegateAuthority;
    }

    if (signedMessage) {
      requestBody.signedMessage = signedMessage;
    }

    console.log('Submitting delegated transfer request:', requestBody);

    // Make the API call to our backend
    const response = await axios.post('/api/delegate/transfer', requestBody);
    console.log('Delegated transfer response:', response.data);

    return response.data;
  } catch (error) {
    console.error('Error in Helius cNFT transfer:', error);
    return {
      success: false,
      error: error.response?.data?.error || error.message || 'Transfer request failed',
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
  // This is a wrapper around the main function with delegation flag set
  return transferCnftViaHelius({
    ...params,
    delegateAuthority: params.delegateAuthority || params.delegate
  });
}

/**
 * Check if a cNFT has a delegation authority set
 * @param {string} assetId - The asset ID to check
 * @returns {Promise<object>} - Delegation information
 */
export async function checkCnftDelegation(assetId) {
  try {
    if (!assetId) {
      throw new Error('Asset ID is required');
    }

    const response = await axios.get(`/api/delegate/info/${assetId}`);
    return response.data;
  } catch (error) {
    console.error('Error checking cNFT delegation:', error);
    return {
      success: false,
      error: error.response?.data?.error || error.message || 'Failed to check delegation',
      delegationInfo: null
    };
  }
}

/**
 * Verify if a wallet address has delegate authority for a specific cNFT
 * @param {string} assetId - The asset ID to check
 * @param {string} delegateAddress - The delegate address to verify
 * @returns {Promise<boolean>} - Whether the address has valid delegate authority
 */
export async function verifyDelegateAuthority(assetId, delegateAddress) {
  try {
    if (!assetId || !delegateAddress) {
      throw new Error('Asset ID and delegate address are required');
    }

    const response = await axios.get(`/api/delegate/verify/${assetId}/${delegateAddress}`);
    return response.data.isValidDelegate === true;
  } catch (error) {
    console.error('Error verifying delegate authority:', error);
    return false;
  }
}

/**
 * Sign a message for cNFT transfer using the wallet adapter
 * @param {object} wallet - The wallet adapter instance
 * @param {string} assetId - The asset ID being transferred
 * @returns {Promise<string>} - Base64 encoded signature
 */
export async function signTransferMessage(wallet, assetId) {
  try {
    if (!wallet || !wallet.signMessage) {
      throw new Error('Wallet adapter with signMessage capability is required');
    }

    const message = `Transfer cNFT with ID: ${assetId}`;
    const encodedMessage = new TextEncoder().encode(message);
    const signature = await wallet.signMessage(encodedMessage);
    
    return Buffer.from(signature).toString('base64');
  } catch (error) {
    console.error('Error signing transfer message:', error);
    throw new Error('Failed to sign message: ' + error.message);
  }
}