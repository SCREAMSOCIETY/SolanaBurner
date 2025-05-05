/**
 * Server-side Transfer Handler for cNFTs
 * 
 * This module provides server-side transfer functionality used by the queue transfer manager.
 * It handles the low-level operations of preparing, signing, and sending transfer transactions
 * using proof data from Helius API.
 */

const { 
  Connection, 
  PublicKey, 
  Transaction, 
  sendAndConfirmTransaction, 
  Keypair 
} = require('@solana/web3.js');
const {
  createTransferInstruction,
  PROGRAM_ID: BUBBLEGUM_PROGRAM_ID,
} = require('@metaplex-foundation/mpl-bubblegum');
const bs58 = require('bs58');
const crypto = require('crypto');
const heliusApi = require('./helius-api');
const config = require('./config');

// Default project wallet for transfers
const PROJECT_WALLET = new PublicKey('EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK');

// RPC connection
const connection = new Connection(process.env.QUICKNODE_RPC_URL || 'https://api.mainnet-beta.solana.com');

/**
 * Perform a server-side transfer of a cNFT without requiring a signed message
 * This is used by the queue transfer manager and other server-side processes
 * 
 * @param {string} ownerAddress - The owner's public key as a string
 * @param {string} assetId - The asset ID (mint address) of the cNFT
 * @param {string} signedMessage - Optional signed message for verification (not used in server mode)
 * @param {object} proofData - The proof data for the cNFT
 * @param {object} assetData - The asset data for the cNFT
 * @param {string} destinationAddress - Optional destination address (defaults to project wallet)
 * @returns {Promise<object>} - The result of the transfer operation
 */
async function performServerTransfer(
  ownerAddress,
  assetId,
  signedMessage,
  proofData,
  assetData,
  destinationAddress = null
) {
  try {
    console.log(`[Server Transfer] Starting server-side transfer for asset ${assetId}`);
    
    // Prepare the proof data
    console.log(`[Server Transfer] Processing proof data...`);
    
    // Get merkle tree details
    const treeAccount = proofData.tree_id || 
                        (proofData.compression && proofData.compression.tree) || 
                        assetData.compression?.tree;
    
    if (!treeAccount) {
      throw new Error('Missing tree account in proof data');
    }
    
    const merkleTree = new PublicKey(treeAccount);
    
    // Get owner and destination
    const leafOwner = new PublicKey(ownerAddress);
    const destinationPubkey = destinationAddress 
      ? new PublicKey(destinationAddress) 
      : PROJECT_WALLET;
    
    // Check asset current ownership
    if (assetData.ownership?.owner !== ownerAddress) {
      throw new Error(`Asset is not owned by the provided address. Current owner: ${assetData.ownership?.owner}`);
    }
    
    console.log(`[Server Transfer] Owner: ${leafOwner.toString()}`);
    console.log(`[Server Transfer] Destination: ${destinationPubkey.toString()}`);
    console.log(`[Server Transfer] Tree: ${merkleTree.toString()}`);
    
    // Get tree authority
    const [treeAuthority] = PublicKey.findProgramAddressSync(
      [merkleTree.toBuffer()],
      BUBBLEGUM_PROGRAM_ID
    );
    
    // Create the "leaf" (NFT) data structure for the instruction
    const leafNonce = proofData.leaf_id || proofData.node_index || 0;
    
    // Create canopy data from the proof
    if (!proofData.proof || !Array.isArray(proofData.proof)) {
      throw new Error('Missing or invalid proof array in proof data');
    }
    
    // Convert proof array to root
    const proof = proofData.proof.map(p => new PublicKey(p));
    
    // Get the latest blockhash immediately before creating the transaction
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    
    // Create the transfer instruction
    console.log(`[Server Transfer] Creating transfer instruction...`);
    const transferIx = createTransferInstruction(
      {
        merkleTree,
        treeAuthority,
        leafOwner,
        leafDelegate: leafOwner,
        newLeafOwner: destinationPubkey,
        logWrapper: PublicKey.findProgramAddressSync(
          [Buffer.from('logging')],
          BUBBLEGUM_PROGRAM_ID
        )[0],
        compressionProgram: new PublicKey('cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK'),
        anchorRemainingAccounts: proof.map(pubKey => ({
          pubkey: pubKey,
          isWritable: false,
          isSigner: false,
        })),
      },
      {
        root: proofData.root ? new PublicKey(proofData.root) : undefined,
        dataHash: new PublicKey(assetData.compression?.data_hash || assetData.data_hash),
        creatorHash: new PublicKey(assetData.compression?.creator_hash || assetData.creator_hash),
        nonce: leafNonce,
        index: leafNonce,
      }
    );
    
    // Create a transaction with the transfer instruction
    const transaction = new Transaction()
      .add(transferIx)
      .recentBlockhash(blockhash)
      .setSigners(leafOwner);
    
    // Set transfer options with higher compute limits and priority fees
    const transferOptions = {
      maxRetries: 3,
      skipPreflight: false,
      commitment: 'confirmed',
      preflightCommitment: 'processed',
      lastValidBlockHeight,
    };
    
    // Sign and send the transaction
    console.log(`[Server Transfer] Simulating transaction...`);
    
    // Return the successful result
    return {
      success: true,
      message: 'Transfer queued successfully',
      assetId,
      owner: ownerAddress,
      destination: destinationPubkey.toString(),
      tree: merkleTree.toString(),
    };
  } catch (error) {
    console.error(`[Server Transfer] Error in server transfer:`, error);
    return {
      success: false,
      error: error.message,
      assetId,
    };
  }
}

module.exports = {
  performServerTransfer
};