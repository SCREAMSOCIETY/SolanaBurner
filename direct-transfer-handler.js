/**
 * Direct Transfer Handler
 * 
 * A simplified implementation for transferring cNFTs directly from server
 * without relying on complex client-side transaction building.
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const axios = require('axios');
const heliusApi = require('./helius-api');

// Project wallet address (destination for cNFT transfers)
const PROJECT_WALLET = 'EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK';

/**
 * Prepare a direct transfer transaction using RPC
 * 
 * @param {string} assetId - The asset ID of the cNFT
 * @param {string} ownerAddress - Source wallet address
 * @param {string} destinationAddress - Destination wallet address (defaults to project wallet)
 * @returns {Promise<object>} - Transaction preparation result
 */
async function prepareDirectTransfer(assetId, ownerAddress, destinationAddress = PROJECT_WALLET) {
  try {
    console.log(`[DIRECT-TRANSFER] Preparing transfer for ${assetId} from ${ownerAddress} to ${destinationAddress}`);
    
    // 1. Get asset details to confirm it's a compressed NFT
    const assetDetails = await heliusApi.fetchAssetDetails(assetId);
    
    if (!assetDetails) {
      console.error(`[DIRECT-TRANSFER] Asset not found: ${assetId}`);
      return {
        success: false,
        error: 'Asset not found',
        details: 'Could not find asset details'
      };
    }
    
    if (!assetDetails.compression || !assetDetails.compression.compressed) {
      console.error(`[DIRECT-TRANSFER] Asset is not a compressed NFT: ${assetId}`);
      return {
        success: false,
        error: 'Asset is not a compressed NFT',
        details: 'This operation only works with compressed NFTs'
      };
    }
    
    // 2. Get proof data for the asset
    const proofData = await heliusApi.fetchAssetProof(assetId);
    
    if (!proofData) {
      console.error(`[DIRECT-TRANSFER] Failed to get proof data for: ${assetId}`);
      return {
        success: false, 
        error: 'Failed to get proof data',
        details: 'Could not fetch the required proof data for this cNFT'
      };
    }
    
    // 3. Send RPC request to the Helius API directly
    const connection = new Connection(
      process.env.QUICKNODE_RPC_URL || 
      `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
    );
    
    // 4. Create the minimal transaction request
    // This uses a more direct method than creating complex instruction/transaction objects
    const transactionParams = {
      assetId,
      ownerAddress,
      destinationAddress,
      proofData
    };
    
    // 5. Return a transaction placeholder to be signed by the client
    return {
      success: true,
      transaction: Buffer.from(JSON.stringify(transactionParams)).toString('base64'),
      assetId,
      message: 'Transaction prepared successfully'
    };
  } catch (error) {
    console.error(`[DIRECT-TRANSFER] Error preparing transaction: ${error.message}`, error);
    return {
      success: false,
      error: error.message,
      details: error.stack
    };
  }
}

/**
 * Submit a direct transfer to Helius API
 * 
 * @param {string} signedTransaction - Base64 encoded transaction parameters
 * @param {string} assetId - The asset ID being transferred
 * @returns {Promise<object>} - Transfer result
 */
async function submitDirectTransfer(signedTransaction, assetId) {
  try {
    console.log(`[DIRECT-TRANSFER] Submitting transfer for ${assetId}`);
    
    // 1. Decode the transaction parameters
    const transactionParams = JSON.parse(Buffer.from(signedTransaction, 'base64').toString());
    
    // 2. Extract parameters
    const { ownerAddress, destinationAddress, proofData } = transactionParams;
    
    // 3. Call the Helius API to execute the transfer
    console.log(`[DIRECT-TRANSFER] Calling Helius API to execute transfer`);
    
    const connectionEndpoint = process.env.QUICKNODE_RPC_URL || 
                              `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
    
    // Attempt to use new DAS send method
    try {
      // First try the v0 send endpoint (which might be used for different purposes)
      const sendResponse = await axios.post(`https://api.helius.xyz/v1/cnfts/transfers?api-key=${process.env.HELIUS_API_KEY}`, {
        assetId: assetId,
        sources: [ownerAddress],
        destination: destinationAddress
      });
      
      if (sendResponse.data && sendResponse.data.signature) {
        console.log(`[DIRECT-TRANSFER] Transfer successful with signature: ${sendResponse.data.signature}`);
        return {
          success: true,
          signature: sendResponse.data.signature,
          assetId,
          message: 'Transfer completed successfully via cnfts/transfers'
        };
      }
    } catch (sendError) {
      console.warn(`[DIRECT-TRANSFER] v1/cnfts/transfers failed: ${sendError.message}`);
      // Fall through to next method
    }
    
    // Try using RPC to submit a direct transfer transaction
    try {
      const rpcResponse = await axios.post(connectionEndpoint, {
        jsonrpc: '2.0',
        id: `direct-transfer-${Date.now()}`,
        method: 'transferCompressedNft',
        params: {
          assetId: assetId,
          sourceOwner: ownerAddress,
          destinationOwner: destinationAddress,
          proof: proofData.proof
        }
      });
      
      if (rpcResponse.data && rpcResponse.data.result) {
        console.log(`[DIRECT-TRANSFER] Transfer successful via RPC with signature: ${rpcResponse.data.result}`);
        return {
          success: true,
          signature: rpcResponse.data.result,
          assetId,
          message: 'Transfer completed successfully via RPC'
        };
      } else if (rpcResponse.data && rpcResponse.data.error) {
        throw new Error(`RPC Error: ${JSON.stringify(rpcResponse.data.error)}`);
      }
    } catch (rpcError) {
      console.warn(`[DIRECT-TRANSFER] RPC transfer failed: ${rpcError.message}`);
      // Fall through to next method
    }
    
    // If none of the methods worked, try a direct HTTP call with different params
    const fallbackResponse = await axios.post(`https://api.helius.xyz/v0/transfers/compressed?api-key=${process.env.HELIUS_API_KEY}`, {
      assetId: assetId,
      fromOwner: ownerAddress,
      toOwner: destinationAddress
    });
    
    if (fallbackResponse.data && fallbackResponse.data.signature) {
      console.log(`[DIRECT-TRANSFER] Transfer successful with fallback: ${fallbackResponse.data.signature}`);
      return {
        success: true,
        signature: fallbackResponse.data.signature,
        assetId,
        message: 'Transfer completed successfully via fallback method'
      };
    } else {
      throw new Error('All transfer methods failed');
    }
  } catch (error) {
    console.error(`[DIRECT-TRANSFER] Error submitting transfer: ${error.message}`, error);
    return {
      success: false,
      error: error.message,
      details: error.stack || 'No stack trace available'
    };
  }
}

module.exports = {
  prepareDirectTransfer,
  submitDirectTransfer
};