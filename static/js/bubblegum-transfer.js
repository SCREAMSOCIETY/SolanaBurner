/**
 * Bubblegum Transfer Implementation for Compressed NFTs
 * 
 * This implementation follows the standard Metaplex Bubblegum protocol for transferring
 * compressed NFTs (cNFTs) on Solana. It properly handles the Merkle proofs and uses
 * the Bubblegum program to create the transfer instruction.
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

// Export a helper function to determine if this transfer method can be used
export function canUseCompressedTransfer(assetData, proofData) {
  if (!assetData || !assetData.compression || !assetData.compression.tree) {
    return false;
  }
  
  if (!proofData || !proofData.proof || !proofData.root) {
    return false;
  }
  
  return true;
}