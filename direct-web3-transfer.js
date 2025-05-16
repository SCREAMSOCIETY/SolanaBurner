/**
 * Direct Web3.js cNFT Transfer Implementation
 * 
 * This module provides a direct implementation for transferring cNFTs using
 * web3.js and the Solana compressed NFT (bubblegum) program directly.
 * It's designed to work as a fallback when the Helius API is not available
 * or experiencing issues.
 */

const { 
  Connection, 
  PublicKey, 
  Keypair, 
  Transaction, 
  TransactionInstruction,
  sendAndConfirmTransaction,
  TransactionMessage,
  VersionedTransaction 
} = require('@solana/web3.js');
const { 
  createTransferInstruction 
} = require('@metaplex-foundation/mpl-bubblegum');
const { 
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID, 
  SPL_NOOP_PROGRAM_ID, 
  getConcurrentMerkleTreeAccountSize 
} = require('@solana/spl-account-compression');
const { deserializeApplicationData } = require('@metaplex-foundation/mpl-bubblegum');

// Import crypto for verification
const nacl = require('tweetnacl');

// Import required API functions
const heliusApi = require('./helius-api');

// Solana programs and constants
const BUBBLEGUM_PROGRAM_ID = new PublicKey('BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY');
const PROJECT_WALLET = new PublicKey('EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK');

/**
 * Prepare a cNFT transfer transaction for a client to sign
 * 
 * @param {string} assetId - Asset ID of the cNFT
 * @param {string} ownerAddress - The owner's wallet address
 * @param {object} proofData - The asset proof data
 * @returns {Promise<object>} The prepared transaction
 */
async function prepareTransferTransaction(assetId, ownerAddress, proofData = null) {
  try {
    console.log(`[DIRECT] Preparing direct web3 transfer for ${assetId}`);
    
    // Create a connection to the Solana network
    const connection = new Connection(
      process.env.HELIUS_RPC_URL || "https://mainnet.helius-rpc.com/?api-key=" + process.env.HELIUS_API_KEY
    );
    
    // 1. Fetch asset details
    console.log('[DIRECT] Fetching asset details');
    const assetDetails = await heliusApi.fetchAssetDetails(assetId);
    
    if (!assetDetails) {
      throw new Error('Asset not found');
    }
    
    console.log('[DIRECT] Verifying asset compression status');
    if (!assetDetails.compression || !assetDetails.compression.compressed) {
      throw new Error('Asset is not a compressed NFT');
    }
    
    // 2. Fetch proof data if not provided
    if (!proofData) {
      console.log('[DIRECT] Fetching proof data');
      proofData = await heliusApi.fetchAssetProof(assetId);
      
      if (!proofData || !proofData.proof || !Array.isArray(proofData.proof)) {
        throw new Error('Failed to fetch valid proof data');
      }
    }
    
    // Extract the tree ID from the asset's data
    const treeId = new PublicKey(assetDetails.compression.tree);
    const leafIndex = proofData.leafIndex;
    
    // Extract creator hash, data hash, and root from the proof data
    const root = new PublicKey(proofData.root);
    const dataHash = Buffer.from(proofData.dataHash, 'hex');
    const creatorHash = Buffer.from(proofData.creatorHash, 'hex');
    
    // Source and destination
    const sourceOwner = new PublicKey(ownerAddress);
    const destinationOwner = PROJECT_WALLET;
    
    console.log('[DIRECT] Building transfer instruction');
    
    // 3. Create the transfer instruction
    const transferIx = createTransferInstruction(
      {
        merkleTree: treeId,
        treeAuthority: proofData.treeAuthority,
        leafOwner: sourceOwner,
        leafDelegate: sourceOwner,
        newLeafOwner: destinationOwner,
        logWrapper: SPL_NOOP_PROGRAM_ID,
        compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
        anchorRemainingAccounts: proofData.proof.map((node) => ({
          pubkey: new PublicKey(node),
          isSigner: false,
          isWritable: false,
        })),
      },
      {
        root,
        dataHash,
        creatorHash,
        nonce: proofData.leaf.nonce || 0,
        index: leafIndex,
      },
      BUBBLEGUM_PROGRAM_ID
    );
    
    // 4. Create a transaction
    const latestBlockhash = await connection.getLatestBlockhash();
    
    // Create a versioned transaction message
    const messageV0 = new TransactionMessage({
      payerKey: sourceOwner,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: [transferIx]
    }).compileToV0Message();
    
    // Create a versioned transaction
    const versionedTransaction = new VersionedTransaction(messageV0);
    
    // Serialize the transaction
    const serializedTransaction = Buffer.from(versionedTransaction.serialize()).toString('base64');
    
    console.log('[DIRECT] Successfully created direct transfer transaction');
    
    return {
      success: true,
      transaction: serializedTransaction,
      assetId,
      message: 'Transaction prepared successfully'
    };
  } catch (error) {
    console.error(`[DIRECT] Error preparing transaction: ${error.message}`);
    console.error(error.stack);
    return {
      success: false,
      error: `Error preparing transaction: ${error.message}`
    };
  }
}

/**
 * Submit a signed cNFT transfer transaction to the network
 * 
 * @param {string} signedTransaction - The signed transaction in base64 format
 * @param {string} assetId - The asset ID of the cNFT
 * @returns {Promise<object>} The transaction result
 */
async function submitSignedTransaction(signedTransaction, assetId) {
  try {
    console.log(`[DIRECT] Submitting signed transaction for ${assetId}`);
    
    // Create a connection to the Solana network
    const connection = new Connection(
      process.env.HELIUS_RPC_URL || "https://mainnet.helius-rpc.com/?api-key=" + process.env.HELIUS_API_KEY
    );
    
    // Decode the base64 transaction
    const transactionBytes = Buffer.from(signedTransaction, 'base64');
    
    // Deserialize the transaction
    const versionedTransaction = VersionedTransaction.deserialize(transactionBytes);
    
    console.log('[DIRECT] Deserialize transaction, sending to network');
    
    // Submit the transaction
    const signature = await connection.sendRawTransaction(transactionBytes, {
      skipPreflight: false,
      preflightCommitment: 'processed'
    });
    
    console.log(`[DIRECT] Transaction submitted with signature: ${signature}`);
    
    // Wait for confirmation
    try {
      const confirmation = await connection.confirmTransaction(signature, 'processed');
      console.log(`[DIRECT] Transaction confirmed: ${signature}`);
    } catch (confirmError) {
      // Log but continue anyway since the transaction was submitted
      console.warn(`[DIRECT] Confirmation check failed: ${confirmError.message}`);
    }
    
    return {
      success: true,
      signature,
      assetId,
      message: 'Transaction submitted successfully'
    };
  } catch (error) {
    console.error(`[DIRECT] Error submitting transaction: ${error.message}`);
    console.error(error.stack);
    return {
      success: false,
      error: `Error submitting transaction: ${error.message}`
    };
  }
}

/**
 * Verify a signed message
 * 
 * @param {string} publicKey - The public key as a base58 string
 * @param {string} message - The original message
 * @param {string} signatureBase64 - The signature as a base64 string
 * @returns {boolean} Whether the signature is valid
 */
function verifySignature(publicKey, message, signatureBase64) {
  try {
    const publicKeyBytes = new PublicKey(publicKey).toBytes();
    const signatureBytes = Buffer.from(signatureBase64, 'base64');
    const messageBytes = Buffer.from(message, 'utf8');
    
    return nacl.sign.detached.verify(
      messageBytes,
      signatureBytes,
      publicKeyBytes
    );
  } catch (error) {
    console.error(`[DIRECT] Error verifying signature: ${error.message}`);
    return false;
  }
}

module.exports = {
  prepareTransferTransaction,
  submitSignedTransaction,
  verifySignature
};