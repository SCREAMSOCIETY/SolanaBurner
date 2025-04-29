/**
 * Bubblegum Transfer Implementation for Compressed NFTs
 * 
 * This implementation follows the standard Metaplex Bubblegum protocol for transferring
 * compressed NFTs (cNFTs) on Solana. It properly handles the Merkle proofs and uses
 * the Bubblegum program to create the transfer instruction.
 * 
 * NEW FEATURE:
 * Includes support for batch transfers of multiple cNFTs in a single transaction
 * which significantly reduces wallet approval friction and blockchain fees.
 */

import {
  PROGRAM_ID as BUBBLEGUM_PROGRAM_ID,
  createTransferInstruction,
} from '@metaplex-foundation/mpl-bubblegum';
import { PublicKey, Transaction } from '@solana/web3.js';

/**
 * Transfer a compressed NFT to a new owner using the Bubblegum protocol
 * 
 * @param {Object} params Transfer parameters
 * @param {Connection} params.connection - Solana connection
 * @param {Object} params.wallet - User's wallet with signTransaction method
 * @param {string} params.assetId - The asset ID (mint) of the cNFT
 * @param {string} params.destinationAddress - The address to transfer the cNFT to
 * @param {Object} params.proofData - The Merkle proof data for the cNFT
 * @param {Object} params.assetData - Asset data with compression information
 * @returns {Promise<Object>} Transfer result with transaction signature
 */
export async function transferCompressedNFT(params) {
  const {
    connection,
    wallet,
    assetId,
    destinationAddress,
    proofData,
    assetData,
  } = params;

  try {
    console.log('[bubblegum-transfer] Starting cNFT transfer using Bubblegum protocol');
    console.log('[bubblegum-transfer] Asset ID:', assetId);
    console.log('[bubblegum-transfer] Destination:', destinationAddress);

    if (!wallet || !wallet.publicKey || !wallet.signTransaction) {
      throw new Error('Wallet with signTransaction capability required');
    }

    if (!proofData || !proofData.proof || !proofData.root) {
      throw new Error('Valid proof data required for Bubblegum transfer');
    }

    if (!assetData || !assetData.compression || !assetData.compression.tree) {
      throw new Error('Asset compression data required for Bubblegum transfer');
    }

    // Extract proof data
    const {
      root,
      proof,
      leaf_id,
      leaf,
      data_hash,
      creator_hash,
    } = proofData;

    // Get necessary addresses and data
    const ownerAddress = wallet.publicKey;
    const merkleTreeAddress = new PublicKey(assetData.compression.tree);
    const destinationPublicKey = new PublicKey(destinationAddress);
    const leafOwner = ownerAddress;
    const leafDelegate = ownerAddress; // Assuming owner is also delegate
    const nonce = assetData.compression.leaf_id || leaf_id;
    const index = assetData.compression.leaf_id || leaf_id;

    console.log('[bubblegum-transfer] Creating Bubblegum transfer instruction');
    console.log('[bubblegum-transfer] Merkle tree:', merkleTreeAddress.toString());
    console.log('[bubblegum-transfer] Owner:', ownerAddress.toString());
    console.log('[bubblegum-transfer] Destination:', destinationPublicKey.toString());

    // Convert proof to right format if needed
    const bubblegumProof = proof.map(node => {
      if (typeof node === 'string') {
        return Buffer.from(node.replace('0x', ''), 'hex');
      }
      return node;
    });

    // Set up root and hashes in the right format
    const rootArray = typeof root === 'string' 
      ? Buffer.from(root.replace('0x', ''), 'hex') 
      : root;
      
    const dataHashArray = typeof data_hash === 'string'
      ? Buffer.from(data_hash.replace('0x', ''), 'hex')
      : data_hash;
      
    const creatorHashArray = typeof creator_hash === 'string'
      ? Buffer.from(creator_hash.replace('0x', ''), 'hex')
      : creator_hash;

    // Create the transfer instruction (simplified to only require what's necessary)
    const [treeAuthority] = PublicKey.findProgramAddressSync(
      [merkleTreeAddress.toBuffer()],
      BUBBLEGUM_PROGRAM_ID
    );
    
    const transferInstruction = createTransferInstruction(
      {
        merkleTree: merkleTreeAddress,
        treeAuthority: treeAuthority, // Required parameter but no signature needed
        leafOwner: leafOwner,
        leafDelegate: leafDelegate,
        newLeafOwner: destinationPublicKey,
        logWrapper: new PublicKey('nooooooooooooooooooooooooooooooooooooooo'),
        compressionProgram: new PublicKey('cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK'),
        anchorRemainingAccounts: [], // No additional accounts needed
      },
      {
        root: rootArray,
        dataHash: dataHashArray,
        creatorHash: creatorHashArray,
        nonce: BigInt(nonce),
        index: Number(index),
        proof: bubblegumProof,
      },
      BUBBLEGUM_PROGRAM_ID
    );

    // Create and sign the transaction
    console.log('[bubblegum-transfer] Creating transaction');
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    
    const transaction = new Transaction({
      feePayer: ownerAddress,
      blockhash,
      lastValidBlockHeight,
    });

    transaction.add(transferInstruction);

    console.log('[bubblegum-transfer] Signing transaction');
    const signedTransaction = await wallet.signTransaction(transaction);

    console.log('[bubblegum-transfer] Sending transaction');
    const signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    console.log('[bubblegum-transfer] Waiting for confirmation');
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    });

    console.log('[bubblegum-transfer] Transaction confirmed!', signature);
    
    // If we got this far, transfer was successful
    return {
      success: true,
      signature,
      method: 'bubblegum',
      assetId,
      destination: destinationAddress,
    };
  } catch (error) {
    console.error('[bubblegum-transfer] Error transferring cNFT:', error);
    throw error;
  }
}

/**
 * Batch transfer multiple compressed NFTs in a single transaction
 * This reduces wallet approval friction and saves on transaction fees
 * 
 * @param {Object} params - Batch transfer parameters
 * @param {Connection} params.connection - Solana connection
 * @param {Object} params.wallet - User's wallet with signTransaction method
 * @param {Array} params.assets - Array of assets to transfer, each containing:
 *   - assetId: The asset ID (mint) of the cNFT
 *   - assetData: The asset data with compression info
 *   - proofData: The merkle proof data
 * @param {string} params.destinationAddress - The destination wallet address
 * @returns {Promise<Object>} - Result with transaction signature and success status
 */
export async function batchTransferCompressedNFTs(params) {
  const {
    connection,
    wallet,
    assets,
    destinationAddress
  } = params;

  try {
    console.log('[bubblegum-transfer] Starting batch cNFT transfer using Bubblegum protocol');
    console.log('[bubblegum-transfer] Number of assets:', assets.length);
    console.log('[bubblegum-transfer] Destination:', destinationAddress);

    if (!wallet || !wallet.publicKey || !wallet.signTransaction) {
      throw new Error('Wallet with signTransaction capability required');
    }

    if (!assets || !Array.isArray(assets) || assets.length === 0) {
      throw new Error('At least one valid asset is required for batch transfer');
    }

    // Validate maximum batch size (too many will exceed transaction size limits)
    const MAX_BATCH_SIZE = 5;
    if (assets.length > MAX_BATCH_SIZE) {
      console.warn(`[bubblegum-transfer] Batch size exceeds maximum (${MAX_BATCH_SIZE}). Only processing first ${MAX_BATCH_SIZE} assets.`);
    }

    const assetsToProcess = assets.slice(0, MAX_BATCH_SIZE);
    
    // Create a new transaction
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    
    const transaction = new Transaction({
      feePayer: wallet.publicKey,
      blockhash,
      lastValidBlockHeight,
    });

    // Prepare each cNFT transfer instruction
    const processedAssets = [];
    const failedAssets = [];

    // Common destination address
    const destinationPublicKey = new PublicKey(destinationAddress);
    
    // Create transfer instruction for each asset
    for (const asset of assetsToProcess) {
      try {
        const { assetId, assetData, proofData } = asset;
        
        // Validate required data
        if (!canUseCompressedTransfer(assetData, proofData)) {
          console.warn(`[bubblegum-transfer] Asset ${assetId} missing required data for Bubblegum transfer`);
          failedAssets.push({ assetId, error: 'Missing required data' });
          continue;
        }
        
        // Get merkle tree address
        const merkleTreeAddress = new PublicKey(assetData.compression.tree);
        
        // Extract proof data
        const {
          root,
          proof,
          data_hash,
          creator_hash,
        } = proofData;
        
        const leafId = assetData.compression.leaf_id || proofData.leaf_id;
        
        // Owner and delegate are the same (current wallet)
        const ownerAddress = wallet.publicKey;
        const leafOwner = ownerAddress;
        const leafDelegate = ownerAddress;
        
        // Convert proof to correct format
        const bubblegumProof = proof.map(node => {
          // Convert string proofs to Buffer
          if (typeof node === 'string') {
            try {
              // Remove '0x' prefix if present
              const cleanNode = node.replace('0x', '');
              // Create Buffer from hex string
              return Buffer.from(cleanNode, 'hex');
            } catch (err) {
              console.error(`[bubblegum-transfer] Error converting proof node to Buffer:`, err);
              // Return a safe default if conversion fails
              return Buffer.from([]);
            }
          } else if (Buffer.isBuffer(node)) {
            // If already a Buffer, return as is
            return node;
          } else if (Array.isArray(node)) {
            // If it's an array (like Uint8Array), convert to Buffer
            return Buffer.from(node);
          } else if (node && typeof node === 'object' && node.type === 'Buffer' && Array.isArray(node.data)) {
            // Handle special case of serialized Buffer objects
            return Buffer.from(node.data);
          } else {
            console.warn(`[bubblegum-transfer] Unknown proof node type:`, typeof node);
            // Return an empty buffer as fallback
            return Buffer.from([]);
          }
        });
        
        // Safely convert root and hashes to Buffer format
        let rootArray, dataHashArray, creatorHashArray;
        
        try {
          // Handle root conversion
          if (typeof root === 'string') {
            rootArray = Buffer.from(root.replace('0x', ''), 'hex');
          } else if (Buffer.isBuffer(root)) {
            rootArray = root;
          } else if (Array.isArray(root)) {
            rootArray = Buffer.from(root);
          } else if (root && typeof root === 'object' && root.type === 'Buffer' && Array.isArray(root.data)) {
            rootArray = Buffer.from(root.data);
          } else {
            console.warn(`[bubblegum-transfer] Unexpected root type: ${typeof root}`);
            rootArray = Buffer.from([]);
          }
          
          // Handle data_hash conversion
          if (typeof data_hash === 'string') {
            dataHashArray = Buffer.from(data_hash.replace('0x', ''), 'hex');
          } else if (Buffer.isBuffer(data_hash)) {
            dataHashArray = data_hash;
          } else if (Array.isArray(data_hash)) {
            dataHashArray = Buffer.from(data_hash);
          } else if (data_hash && typeof data_hash === 'object' && data_hash.type === 'Buffer' && Array.isArray(data_hash.data)) {
            dataHashArray = Buffer.from(data_hash.data);
          } else {
            console.warn(`[bubblegum-transfer] Unexpected data_hash type: ${typeof data_hash}`);
            dataHashArray = Buffer.from([]);
          }
          
          // Handle creator_hash conversion
          if (typeof creator_hash === 'string') {
            creatorHashArray = Buffer.from(creator_hash.replace('0x', ''), 'hex');
          } else if (Buffer.isBuffer(creator_hash)) {
            creatorHashArray = creator_hash;
          } else if (Array.isArray(creator_hash)) {
            creatorHashArray = Buffer.from(creator_hash);
          } else if (creator_hash && typeof creator_hash === 'object' && creator_hash.type === 'Buffer' && Array.isArray(creator_hash.data)) {
            creatorHashArray = Buffer.from(creator_hash.data);
          } else {
            console.warn(`[bubblegum-transfer] Unexpected creator_hash type: ${typeof creator_hash}`);
            creatorHashArray = Buffer.from([]);
          }
        } catch (error) {
          console.error(`[bubblegum-transfer] Error converting hash data:`, error);
          throw new Error(`Failed to convert hash data: ${error.message}`);
        }
        
        // Derive tree authority
        const [treeAuthority] = PublicKey.findProgramAddressSync(
          [merkleTreeAddress.toBuffer()],
          BUBBLEGUM_PROGRAM_ID
        );
        
        // Create transfer instruction
        const transferInstruction = createTransferInstruction(
          {
            merkleTree: merkleTreeAddress,
            treeAuthority: treeAuthority,
            leafOwner: leafOwner,
            leafDelegate: leafDelegate,
            newLeafOwner: destinationPublicKey,
            logWrapper: new PublicKey('nooooooooooooooooooooooooooooooooooooooo'),
            compressionProgram: new PublicKey('cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK'),
            anchorRemainingAccounts: [],
          },
          {
            root: rootArray,
            dataHash: dataHashArray,
            creatorHash: creatorHashArray,
            nonce: BigInt(leafId),
            index: Number(leafId),
            proof: bubblegumProof,
          },
          BUBBLEGUM_PROGRAM_ID
        );
        
        // Add the instruction to the transaction
        transaction.add(transferInstruction);
        
        // Track this asset as processed
        processedAssets.push({ assetId, assetData });
        
        console.log(`[bubblegum-transfer] Added transfer instruction for asset ${assetId}`);
      } catch (error) {
        console.error(`[bubblegum-transfer] Error adding asset ${asset.assetId} to batch:`, error);
        failedAssets.push({ assetId: asset.assetId, error: error.message });
      }
    }
    
    // If no assets were successfully added to the transaction, return failure
    if (processedAssets.length === 0) {
      return {
        success: false,
        error: 'Could not add any assets to the batch transaction',
        failedAssets
      };
    }
    
    // Sign and send the transaction
    console.log(`[bubblegum-transfer] Signing batch transaction with ${processedAssets.length} assets`);
    const signedTransaction = await wallet.signTransaction(transaction);
    
    console.log('[bubblegum-transfer] Sending batch transaction');
    const signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });
    
    console.log('[bubblegum-transfer] Waiting for batch transaction confirmation');
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    });
    
    if (confirmation.value.err) {
      console.error('[bubblegum-transfer] Batch transaction error:', confirmation.value.err);
      return {
        success: false,
        error: `Transaction failed: ${confirmation.value.err}`,
        signature,
        processedAssets,
        failedAssets
      };
    }
    
    console.log('[bubblegum-transfer] Batch transaction confirmed!', signature);
    
    // Return success with details
    return {
      success: true,
      signature,
      method: 'bubblegum-batch',
      processedAssets: processedAssets.map(a => a.assetId),
      failedAssets: failedAssets.map(a => a.assetId),
      explorerUrl: `https://solscan.io/tx/${signature}`,
      destination: destinationAddress
    };
  } catch (error) {
    console.error('[bubblegum-transfer] Error in batch transfer:', error);
    return {
      success: false,
      error: error.message || 'Unknown error in batch transfer',
      cancelled: error.message && (
        error.message.includes('User rejected') ||
        error.message.includes('cancelled') ||
        error.message.includes('declined')
      )
    };
  }
}

// Export a helper function to determine if this transfer method can be used
export function canUseCompressedTransfer(assetData, proofData) {
  // Detailed validation with specific error logging to help troubleshoot
  
  // First validate asset data is properly structured
  if (!assetData) {
    console.warn('[bubblegum-transfer] Missing asset data for compressed transfer');
    return false;
  }
  
  if (!assetData.compression) {
    console.warn('[bubblegum-transfer] Asset is not compressed (missing compression field)');
    return false;
  }
  
  if (!assetData.compression.tree) {
    console.warn('[bubblegum-transfer] Asset missing merkle tree address');
    return false;
  }
  
  if (assetData.compression.leaf_id === undefined || assetData.compression.leaf_id === null) {
    console.warn('[bubblegum-transfer] Asset missing leaf ID in compression data');
    // Not returning false here because we can sometimes get leaf ID from proof data
  }
  
  // Then validate proof data structure
  if (!proofData) {
    console.warn('[bubblegum-transfer] Missing proof data for compressed transfer');
    return false;
  }
  
  if (!proofData.proof || !Array.isArray(proofData.proof)) {
    console.warn('[bubblegum-transfer] Missing or invalid proof array in proof data');
    return false;
  }
  
  if (!proofData.root) {
    console.warn('[bubblegum-transfer] Missing root in proof data');
    return false;
  }
  
  if (!proofData.data_hash) {
    console.warn('[bubblegum-transfer] Missing data_hash in proof data');
    return false;
  }
  
  if (!proofData.creator_hash) {
    console.warn('[bubblegum-transfer] Missing creator_hash in proof data');
    return false;
  }
  
  // All validation passed
  return true;
}