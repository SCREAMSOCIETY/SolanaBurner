/**
 * Server-side Transfer Implementation
 * 
 * This module provides server-side functions for creating and submitting
 * cNFT transfer transactions. It works with the improved client-side
 * transfer implementation to avoid TransactionInstruction dependencies
 * in the browser context.
 */

const { Connection, PublicKey, Transaction, ComputeBudgetProgram, TransactionInstruction } = require('@solana/web3.js');
const heliusApi = require('./helius-api');
const assetCache = require('./asset-cache');
const config = require('./config');

// Project wallet for receiving trasferred cNFTs
const PROJECT_WALLET = 'EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK';

// Get QuickNode RPC URL from environment
const QUICKNODE_RPC_URL = config.QUICKNODE_RPC_URL;

// Bubblegum program ID (constant on all networks)
const BUBBLEGUM_PROGRAM_ID = new PublicKey('BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY');

/**
 * Prepares a cNFT transfer transaction for a client to sign
 * 
 * @param {object} request - The API request object
 * @param {object} reply - The API reply object
 * @returns {object} - The prepared transaction data
 */
async function prepareTransferTransaction(request, reply) {
  try {
    const { ownerPublicKey, assetId } = request.body;
    
    if (!ownerPublicKey || !assetId) {
      return reply.code(400).send({
        success: false,
        error: 'Missing required parameters: ownerPublicKey and assetId are required'
      });
    }
    
    console.log(`[Server-Transfer] Preparing server-side transfer for asset: ${assetId} from owner: ${ownerPublicKey}`);
    
    // Get proof data - check cache first
    let proofData = assetCache.getProofData(assetId);
    
    if (!proofData) {
      console.log(`[Server-Transfer] Fetching proof data for asset: ${assetId}`);
      
      try {
        // Use heliusApi to fetch proof
        proofData = await heliusApi.fetchAssetProof(assetId, true);
        
        if (!proofData) {
          return reply.code(404).send({
            success: false,
            error: 'Asset proof not found'
          });
        }
        
        // Cache the proof data
        assetCache.cacheProofData(assetId, proofData);
      } catch (proofError) {
        console.error(`[Server-Transfer] Error fetching proof data: ${proofError.message}`);
        return reply.code(500).send({
          success: false,
          error: `Error fetching proof data: ${proofError.message}`
        });
      }
    } else {
      console.log(`[Server-Transfer] Using cached proof data for asset: ${assetId}`);
    }
    
    // Get asset details
    let assetData;
    try {
      assetData = await heliusApi.fetchAssetDetails(assetId);
      
      if (!assetData) {
        return reply.code(404).send({
          success: false,
          error: 'Asset details not found'
        });
      }
    } catch (assetError) {
      console.error(`[Server-Transfer] Error fetching asset details: ${assetError.message}`);
      return reply.code(500).send({
        success: false,
        error: `Error fetching asset details: ${assetError.message}`
      });
    }
    
    try {
      // Setup connection
      const connection = new Connection(QUICKNODE_RPC_URL, 'confirmed');
      
      // Create transaction
      const transaction = new Transaction();
      
      // Add compute budget instruction for complex operations
      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({ 
          units: 400000 // Higher compute units for cNFT operations
        })
      );
      
      // Create leaf owner and destination addresses
      const leafOwner = new PublicKey(ownerPublicKey);
      const destination = new PublicKey(PROJECT_WALLET);
      
      // Create tree from proof data
      const merkleTree = new PublicKey(proofData.tree_id || proofData.tree);
      
      // Create a manual transfer instruction
      // This is the simplest version of the instruction, using buffers directly
      const instructionData = Buffer.from([0x08]); // 8 = Transfer instruction discriminator
      
      // The required accounts
      const keys = [
        // tree authority
        { pubkey: new PublicKey(proofData.tree_authority), isSigner: false, isWritable: true },
        // leaf owner
        { pubkey: leafOwner, isSigner: true, isWritable: false },
        // leaf delegate (owner if no delegation)
        { pubkey: leafOwner, isSigner: true, isWritable: false },
        // new leaf owner
        { pubkey: destination, isSigner: false, isWritable: false },
        // merkle tree
        { pubkey: merkleTree, isSigner: false, isWritable: true },
        // log wrapper
        { pubkey: new PublicKey('noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV'), isSigner: false, isWritable: false },
        // compression program
        { pubkey: new PublicKey('cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK'), isSigner: false, isWritable: false },
        // system program
        { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false },
      ];
      
      // Create the instruction
      const transferInstruction = new TransactionInstruction({
        keys,
        programId: BUBBLEGUM_PROGRAM_ID,
        data: instructionData,
      });
      
      // Add the instruction to the transaction
      transaction.add(transferInstruction);
      
      // Get recent blockhash and set fee payer
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = leafOwner;
      
      // Serialize the transaction to send back to the client
      const serializedTransaction = transaction.serialize({
        requireAllSignatures: false, // Don't require signatures yet
        verifySignatures: false
      }).toString('base64');
      
      // Return the serialized transaction for the client to sign
      return {
        success: true,
        transaction: serializedTransaction,
        message: 'Transaction prepared successfully. Please sign and submit.',
        assetId,
        ownerPublicKey,
        destination: PROJECT_WALLET
      };
    } catch (error) {
      console.error(`[Server-Transfer] Error preparing transaction: ${error.message}`);
      
      if (error.stack) {
        console.error(`[Server-Transfer] Stack trace: ${error.stack}`);
      }
      
      return reply.code(500).send({
        success: false,
        error: `Error preparing transaction: ${error.message}`
      });
    }
  } catch (error) {
    console.error(`[Server-Transfer] Unexpected error: ${error.message}`);
    
    if (error.stack) {
      console.error(`[Server-Transfer] Stack trace: ${error.stack}`);
    }
    
    return reply.code(500).send({
      success: false,
      error: `Unexpected error: ${error.message}`
    });
  }
}

/**
 * Submits a signed cNFT transfer transaction to the network
 * 
 * @param {object} request - The API request object
 * @param {object} reply - The API reply object
 * @returns {object} - The transaction result
 */
async function submitSignedTransaction(request, reply) {
  try {
    const { signedTransaction, assetId } = request.body;
    
    if (!signedTransaction) {
      return reply.code(400).send({
        success: false,
        error: "Missing signed transaction"
      });
    }
    
    console.log(`[Server-Transfer] Submitting transfer for asset ${assetId}`);
    
    // Setup connection
    const connection = new Connection(QUICKNODE_RPC_URL, 'confirmed');
    
    // Convert the base64 transaction back to a buffer
    const transactionBuffer = Buffer.from(signedTransaction, 'base64');
    
    // Send the raw transaction
    const signature = await connection.sendRawTransaction(transactionBuffer, {
      skipPreflight: false,
      maxRetries: 3,
      preflightCommitment: 'confirmed'
    });
    
    console.log(`[Server-Transfer] Transaction submitted with signature: ${signature}`);
    
    // Construct Solana Explorer URL
    const network = 'mainnet-beta'; // Change to 'devnet' if using devnet
    const explorerUrl = `https://explorer.solana.com/tx/${signature}?cluster=${network}`;
    
    // Return the success response
    return {
      success: true,
      signature,
      message: 'Transaction submitted successfully',
      explorerUrl,
      assetId
    };
  } catch (error) {
    console.error(`[Server-Transfer] Error submitting transaction: ${error.message}`);
    
    if (error.stack) {
      console.error(`[Server-Transfer] Stack trace: ${error.stack}`);
    }
    
    return reply.code(500).send({
      success: false,
      error: `Error submitting transaction: ${error.message}`
    });
  }
}

module.exports = {
  prepareTransferTransaction,
  submitSignedTransaction
};