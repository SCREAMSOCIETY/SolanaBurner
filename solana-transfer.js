/**
 * Direct Solana Transfer Implementation
 * 
 * This module provides direct functions for interacting with Solana and transferring
 * cNFTs using web3.js. It's a fallback implementation when Helius API endpoints
 * are not working as expected.
 */

const { Connection, PublicKey, TransactionMessage, VersionedTransaction } = require('@solana/web3.js');
// Fix imports for the bubblegum and compression libraries
const BubblegumProgram = require('@metaplex-foundation/mpl-bubblegum');
const { createTransferInstruction } = BubblegumProgram;

// Constants for required program IDs
const SPL_NOOP_PROGRAM_ID = new PublicKey('noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV');
const SPL_ACCOUNT_COMPRESSION_PROGRAM_ID = new PublicKey('cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK');

// Import required API functions
const heliusApi = require('./helius-api');

/**
 * Get connection to Solana
 * @returns {Connection} A Solana connection
 */
function getConnection() {
  return new Connection(
    process.env.QUICKNODE_RPC_URL || 
    "https://mainnet.helius-rpc.com/?api-key=" + process.env.HELIUS_API_KEY
  );
}

/**
 * Direct web3.js implementation to prepare a cNFT transfer transaction
 * 
 * @param {string} assetId - The asset ID of the cNFT 
 * @param {string} sourceAddress - The sender's wallet address
 * @param {string} destinationAddress - The destination wallet address
 * @returns {Promise<object>} The transaction preparation result
 */
async function prepareTransferTransaction(assetId, sourceAddress, destinationAddress) {
  try {
    console.log(`[SOLANA-TRANSFER] Preparing direct transfer for ${assetId}`);
    
    // 1. Get connections and addresses
    const connection = getConnection();
    const sourceOwner = new PublicKey(sourceAddress);
    const destinationOwner = new PublicKey(destinationAddress);
    
    // 2. Fetch asset details and proof data
    console.log(`[SOLANA-TRANSFER] Fetching asset details and proof`);
    const assetDetails = await heliusApi.fetchAssetDetails(assetId);
    
    if (!assetDetails) {
      throw new Error('Asset not found');
    }
    
    if (!assetDetails.compression || !assetDetails.compression.compressed) {
      throw new Error('Asset is not a compressed NFT');
    }
    
    const proofData = await heliusApi.fetchAssetProof(assetId);
    
    if (!proofData || !proofData.proof || !Array.isArray(proofData.proof)) {
      throw new Error('Failed to fetch valid proof data');
    }
    
    // 3. Create transfer instruction
    console.log(`[SOLANA-TRANSFER] Creating transfer instruction`);
    
    // Debug proof data structure
    console.log(`[SOLANA-TRANSFER] Proof data:`, JSON.stringify(proofData, null, 2));
    
    // Extract required data
    const treeId = new PublicKey(assetDetails.compression.tree);
    
    // Handle different proof data formats from Helius API
    if (!proofData.treeAuthority && !proofData.treeId) {
      console.log(`[SOLANA-TRANSFER] No treeAuthority or treeId in proof data, deriving from tree ID`);
      // Derive tree authority from tree ID (this is a common pattern)
      const [treeAuthorityPda] = PublicKey.findProgramAddressSync(
        [treeId.toBuffer()],
        new PublicKey('BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY') // Bubblegum program
      );
      var treeAuthority = treeAuthorityPda;
    } else {
      var treeAuthority = new PublicKey(proofData.treeAuthority || proofData.treeId);
    }
    
    const root = new PublicKey(proofData.root);
    const dataHash = Buffer.from(proofData.dataHash, 'hex');
    const creatorHash = Buffer.from(proofData.creatorHash, 'hex');
    const leafIndex = proofData.leafIndex;
    const BUBBLEGUM_PROGRAM_ID = new PublicKey('BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY');
    
    // Create the transfer instruction
    const transferIx = createTransferInstruction(
      {
        merkleTree: treeId,
        treeAuthority: treeAuthority,
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
    console.log(`[SOLANA-TRANSFER] Creating transaction`);
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
    
    console.log(`[SOLANA-TRANSFER] Transaction prepared successfully`);
    
    // 5. Return the transaction data
    return {
      success: true,
      transaction: serializedTransaction,
      assetId,
      message: 'Transaction prepared successfully'
    };
  } catch (error) {
    console.error(`[SOLANA-TRANSFER] Error preparing transaction:`, error);
    return {
      success: false,
      error: error.message,
      details: error.stack
    };
  }
}

/**
 * Submit a signed cNFT transfer transaction
 * 
 * @param {string} signedTransaction - The signed transaction as a base64 string
 * @param {string} assetId - The asset ID being transferred
 * @returns {Promise<object>} The transaction submission result
 */
async function submitSignedTransaction(signedTransaction, assetId) {
  try {
    console.log(`[SOLANA-TRANSFER] Submitting transaction for ${assetId}`);
    
    // 1. Get connections
    const connection = getConnection();
    
    // 2. Decode the signed transaction
    const transactionBytes = Buffer.from(signedTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(transactionBytes);
    
    // 3. Submit the transaction
    console.log(`[SOLANA-TRANSFER] Sending transaction to network`);
    const signature = await connection.sendRawTransaction(transactionBytes, {
      skipPreflight: false,
      preflightCommitment: 'processed'
    });
    
    console.log(`[SOLANA-TRANSFER] Transaction sent with signature: ${signature}`);
    
    // 4. Wait for confirmation (with timeout)
    try {
      console.log(`[SOLANA-TRANSFER] Waiting for confirmation`);
      
      // Set a timeout for confirmation waiting
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Confirmation timeout')), 30000)
      );
      
      // Wait for confirmation with timeout
      const confirmation = await Promise.race([
        connection.confirmTransaction({
          signature,
          blockhash: transaction.message.recentBlockhash,
          lastValidBlockHeight: 150
        }, 'processed'),
        timeoutPromise
      ]);
      
      console.log(`[SOLANA-TRANSFER] Transaction confirmed: ${signature}`);
    } catch (confirmError) {
      // Just log the error but continue since the transaction was submitted
      console.warn(`[SOLANA-TRANSFER] Confirmation check failed: ${confirmError.message}`);
    }
    
    // 5. Return the transaction result
    return {
      success: true,
      signature,
      assetId,
      message: 'Transaction submitted successfully'
    };
  } catch (error) {
    console.error(`[SOLANA-TRANSFER] Error submitting transaction:`, error);
    return {
      success: false,
      error: error.message,
      details: error.stack
    };
  }
}

module.exports = {
  getConnection,
  prepareTransferTransaction,
  submitSignedTransaction
};